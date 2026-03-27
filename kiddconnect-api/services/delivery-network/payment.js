/**
 * Delivery Network: payment link for individual (no-business) requests.
 * Email link by default; optional SMS with per-SMS charge (config).
 */
import { getStripeInstance } from '../stripe.js';
import { supabaseClient } from '../../config/database.js';

const DEFAULT_AMOUNT_CENTS = 2000; // $20 fallback when no pricing engine

/**
 * Create a Stripe Payment Link for an individual delivery request.
 * @param {string} deliveryRequestId - delivery_requests.id
 * @param {number} amountCents - amount in cents
 * @param {string} successUrl - redirect after payment
 * @param {string} cancelUrl - redirect if user cancels
 * @param {string} [customerEmail] - prefill email
 * @returns {Promise<{ url: string, paymentLinkId: string }>}
 */
export async function createPaymentLinkForDelivery(deliveryRequestId, amountCents, successUrl, cancelUrl, customerEmail = null) {
  const stripe = getStripeInstance();
  const amount = Math.max(50, Math.round(amountCents)); // Stripe minimum 50 cents

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'cad',
        product_data: {
          name: 'Delivery request',
          description: `Delivery reference will be sent after payment.`,
          metadata: { delivery_request_id: deliveryRequestId },
        },
        unit_amount: amount,
      },
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail || undefined,
    metadata: {
      type: 'delivery_individual',
      delivery_request_id: deliveryRequestId,
    },
  });

  // Persist session id on request for idempotency / lookup
  await supabaseClient
    .from('delivery_requests')
    .update({
      stripe_payment_link_id: session.id,
      payment_status: 'pending_payment',
      amount_quoted_cents: amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryRequestId);

  return { url: session.url, sessionId: session.id };
}

/**
 * Mark request as paid and return amount (for webhook).
 */
export async function markDeliveryRequestPaid(deliveryRequestId, amountPaidCents) {
  const { error } = await supabaseClient
    .from('delivery_requests')
    .update({
      payment_status: 'paid',
      amount_quoted_cents: amountPaidCents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryRequestId);
  if (error) throw error;
}

export { DEFAULT_AMOUNT_CENTS };
