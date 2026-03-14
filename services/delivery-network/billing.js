/**
 * Emergency Network provider billing: charge records per accepted lead, Stripe customers, and payment requests (invoices).
 */
import { supabaseClient } from '../../config/database.js';
import { getEmergencyConfig } from './config.js';
import { getStripeInstance } from '../stripe.js';

/**
 * Get price in cents for a tier and whether SMS was requested.
 * @param {string} tier - 'basic' | 'priority' | 'premium'
 * @param {boolean} smsRequested
 * @returns {Promise<number>} amount_cents
 */
export async function getChargeAmountCents(tier, smsRequested = false) {
  const config = await getEmergencyConfig();
  const b = config.billing || {};
  const tierPrice =
    tier === 'premium' ? (b.price_premium_cents ?? 1000) :
    tier === 'priority' ? (b.price_priority_cents ?? 750) :
    (b.price_basic_cents ?? 500);
  const smsFee = smsRequested ? (b.sms_fee_cents ?? 50) : 0;
  return Math.max(0, tierPrice + smsFee);
}

/**
 * Create a charge when a provider accepts a lead.
 * @param {Object} params - { provider_id, service_request_id, dispatch_log_id, priority_tier }
 */
export async function createChargeOnAccept(params) {
  const { provider_id, service_request_id, dispatch_log_id, priority_tier } = params;
  const amount_cents = await getChargeAmountCents(priority_tier, false);
  const { data, error } = await supabaseClient
    .from('emergency_provider_charges')
    .insert({
      provider_id,
      service_request_id,
      dispatch_log_id,
      priority_tier: ['premium', 'priority', 'basic'].includes(priority_tier) ? priority_tier : 'basic',
      sms_requested: false,
      amount_cents,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return null; // unique on dispatch_log_id - already charged
    throw error;
  }
  return data?.id;
}

/**
 * Update charge when provider receives SMS (add SMS fee).
 * @param {string} dispatch_log_id
 */
export async function updateChargeWhenSmsSent(dispatch_log_id) {
  const { data: charge } = await supabaseClient
    .from('emergency_provider_charges')
    .select('id, amount_cents, sms_requested')
    .eq('dispatch_log_id', dispatch_log_id)
    .single();
  if (!charge || charge.sms_requested) return;
  const config = await getEmergencyConfig();
  const smsFee = config.billing?.sms_fee_cents ?? 50;
  const newAmount = Math.max(0, (charge.amount_cents || 0) + smsFee);
  await supabaseClient
    .from('emergency_provider_charges')
    .update({ sms_requested: true, amount_cents: newAmount })
    .eq('id', charge.id);
}

/**
 * Get or create Stripe Customer for a provider. Saves stripe_customer_id on provider.
 * @param {Object} provider - { id, business_name, email, phone }
 * @returns {Promise<string>} Stripe customer ID
 */
export async function getOrCreateStripeCustomerForProvider(provider) {
  if (provider.stripe_customer_id) return provider.stripe_customer_id;
  const stripe = getStripeInstance();
  const email = (provider.email && String(provider.email).trim()) || null;
  if (!email) {
    throw new Error('Provider must have an email to receive payment requests. Add email in the provider directory.');
  }
  const customer = await stripe.customers.create({
    email,
    name: provider.business_name || undefined,
    phone: provider.phone || undefined,
    metadata: {
      emergency_provider_id: provider.id,
      source: 'emergency_network',
    },
  });
  await supabaseClient
    .from('emergency_providers')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('id', provider.id);
  return customer.id;
}

/**
 * Create a Stripe invoice for a provider with their unbilled charges, finalize and send.
 * @param {string} providerId - emergency_providers.id
 * @returns {Promise<{ invoiceId: string, url?: string }>}
 */
export async function createAndSendInvoiceToProvider(providerId) {
  const { data: provider, error: provErr } = await supabaseClient
    .from('emergency_providers')
    .select('id, business_name, email, phone, stripe_customer_id')
    .eq('id', providerId)
    .single();
  if (provErr || !provider) throw new Error('Provider not found');
  const customerId = await getOrCreateStripeCustomerForProvider(provider);

  const { data: charges, error: chErr } = await supabaseClient
    .from('emergency_provider_charges')
    .select('id, service_request_id, amount_cents, priority_tier, sms_requested, created_at')
    .eq('provider_id', providerId)
    .is('stripe_invoice_id', null)
    .order('created_at', { ascending: true });
  if (chErr) throw chErr;
  if (!charges || charges.length === 0) {
    throw new Error('No unbilled charges for this provider.');
  }

  const stripe = getStripeInstance();
  const currency = 'cad';
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 30,
    metadata: {
      emergency_provider_id: providerId,
      source: 'emergency_network',
    },
  });

  for (const c of charges) {
    const description = `Lead ${c.service_request_id?.slice(0, 8) || '—'} (${c.priority_tier}${c.sms_requested ? ', SMS' : ''})`;
    const item = await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: c.amount_cents,
      currency,
      description,
      metadata: {
        charge_id: c.id,
        service_request_id: c.service_request_id || '',
      },
    });
    await supabaseClient
      .from('emergency_provider_charges')
      .update({
        stripe_invoice_id: invoice.id,
        stripe_invoice_item_id: item.id,
      })
      .eq('id', c.id);
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  return {
    invoiceId: invoice.id,
    url: finalized.hosted_invoice_url || undefined,
  };
}

/**
 * Get unbilled charges summary per provider.
 * @returns {Promise<Array<{ provider_id, business_name, email, count, total_cents }>>}
 */
export async function getUnbilledChargesByProvider() {
  const { data: charges, error: chErr } = await supabaseClient
    .from('emergency_provider_charges')
    .select('id, provider_id, amount_cents')
    .is('stripe_invoice_id', null);
  if (chErr) throw chErr;
  const byProvider = {};
  for (const c of charges || []) {
    if (!byProvider[c.provider_id]) {
      byProvider[c.provider_id] = { count: 0, total_cents: 0 };
    }
    byProvider[c.provider_id].count += 1;
    byProvider[c.provider_id].total_cents += c.amount_cents || 0;
  }
  const providerIds = Object.keys(byProvider);
  if (providerIds.length === 0) return [];
  const { data: providers } = await supabaseClient
    .from('emergency_providers')
    .select('id, business_name, email')
    .in('id', providerIds);
  return (providers || []).map((p) => ({
    provider_id: p.id,
    business_name: p.business_name,
    email: p.email || null,
    count: byProvider[p.id]?.count ?? 0,
    total_cents: byProvider[p.id]?.total_cents ?? 0,
  }));
}
