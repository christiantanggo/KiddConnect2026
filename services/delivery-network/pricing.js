/**
 * Delivery pricing: quote before dispatch. Supports flat rate (MVP), optional min price and platform fee.
 * Config in delivery_network_config (global) or delivery_business_config (per-business).
 */
import { supabaseClient } from '../../config/database.js';

const DEFAULT_FLAT_CENTS = 2000; // $20
const DEFAULT_MIN_CENTS = 1000;  // $10
const DEFAULT_PLATFORM_FEE_CENTS = 300; // $3
const DISCLAIMER = 'Final cost may vary up to ±5% depending on courier network cost.';

/**
 * Get pricing config (global default). Can be extended to merge with delivery_business_config(business_id).
 */
export async function getPricingConfig(businessId = null) {
  const empty = {
    model: 'flat',
    flat_cents: DEFAULT_FLAT_CENTS,
    min_cents: DEFAULT_MIN_CENTS,
    platform_fee_cents: DEFAULT_PLATFORM_FEE_CENTS,
    disclaimer: DISCLAIMER,
  };
  try {
    const { data: row } = await supabaseClient
      .from('delivery_network_config')
      .select('value')
      .eq('key', 'settings')
      .single();
    const global = (row?.value?.pricing && typeof row.value.pricing === 'object') ? row.value.pricing : {};
    if (businessId) {
      const { data: bizRow } = await supabaseClient
        .from('delivery_business_config')
        .select('value')
        .eq('business_id', businessId)
        .single();
      const biz = (bizRow?.value?.pricing && typeof bizRow.value.pricing === 'object') ? bizRow.value.pricing : {};
      return { ...empty, ...global, ...biz };
    }
    return { ...empty, ...global };
  } catch (e) {
    return empty;
  }
}

/**
 * Return quote in cents and disclaimer for a delivery (MVP: flat rate + optional platform fee).
 */
export async function getQuote(businessId = null, _options = {}) {
  const config = await getPricingConfig(businessId);
  let cents = config.flat_cents || DEFAULT_FLAT_CENTS;
  if (config.platform_fee_cents) cents += config.platform_fee_cents;
  const min = config.min_cents != null ? config.min_cents : DEFAULT_MIN_CENTS;
  cents = Math.max(min, cents);
  return {
    amount_cents: cents,
    disclaimer: config.disclaimer || DISCLAIMER,
    currency: 'CAD',
  };
}
