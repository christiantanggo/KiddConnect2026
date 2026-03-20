/**
 * Tavari Delivery Module — Pricing Engine
 *
 * Formula: Final Price (CAD) = CEIL( MAX( (Shipday Cost USD × Exchange Rate × Margin Multiplier), Minimum Price ) )
 * - Cost from Shipday in USD → convert to CAD → apply margin → apply minimum (if enabled) → round UP to whole dollar.
 *
 * Config: global (delivery_network_config.value.billing) + per-customer (delivery_business_config.value.delivery_pricing).
 *
 * Future-proofing (structure only; not implemented):
 * - Flat rate pricing: add flat_rate_cad to config and branch in calculateDeliveryPrice.
 * - Distance-based: accept distance_km, apply per-km component before margin.
 * - Surge: accept surge_multiplier, apply to withMargin before minimum.
 * - Multi-stop: accept stop_count, add per-stop fee before margin.
 * - Package-based: accept weight/size, apply adjustment to base cost before margin.
 */
import { getDeliveryConfigFull } from './config.js';
import { supabaseClient } from '../../config/database.js';

/** Standard disclaimer for all calculated prices. */
export const PRICE_DISCLAIMER = 'Final price may vary slightly depending on courier availability.';

const DEFAULT_MARGIN_MULTIPLIER = 1.4;
const DEFAULT_MINIMUM_DELIVERY_PRICE_CAD = 15;
const DEFAULT_MANUAL_EXCHANGE_RATE = 1.35;

/**
 * Resolve effective pricing config (global + per-customer overrides).
 * @param {string|null} businessId - Optional; when provided, merges delivery_business_config.value.delivery_pricing.
 * @returns {Promise<{
 *   margin_multiplier: number,
 *   minimum_delivery_price_cad: number,
 *   minimum_enabled: boolean,
 *   bypass_minimum: boolean,
 *   exchange_rate_source: 'manual'|'automatic',
 *   manual_exchange_rate_cad_per_usd: number
 * }>}
 */
export async function getDeliveryPricingConfig(businessId = null) {
  const empty = {
    margin_multiplier: DEFAULT_MARGIN_MULTIPLIER,
    minimum_delivery_price_cad: DEFAULT_MINIMUM_DELIVERY_PRICE_CAD,
    minimum_enabled: true,
    bypass_minimum: false,
    exchange_rate_source: 'manual',
    manual_exchange_rate_cad_per_usd: DEFAULT_MANUAL_EXCHANGE_RATE,
  };
  try {
    const config = await getDeliveryConfigFull();
    const billing = config?.billing && typeof config.billing === 'object' ? config.billing : {};
    const global = {
      margin_multiplier:
        typeof billing.margin_multiplier === 'number' && billing.margin_multiplier > 0
          ? billing.margin_multiplier
          : empty.margin_multiplier,
      minimum_delivery_price_cad:
        typeof billing.minimum_delivery_price_cad === 'number' && billing.minimum_delivery_price_cad >= 0
          ? billing.minimum_delivery_price_cad
          : empty.minimum_delivery_price_cad,
      minimum_enabled: billing.minimum_enabled !== false,
      bypass_minimum: false,
      exchange_rate_source:
        billing.exchange_rate_source === 'automatic' ? 'automatic' : 'manual',
      manual_exchange_rate_cad_per_usd:
        typeof billing.manual_exchange_rate_cad_per_usd === 'number' && billing.manual_exchange_rate_cad_per_usd > 0
          ? billing.manual_exchange_rate_cad_per_usd
          : empty.manual_exchange_rate_cad_per_usd,
    };
    if (!businessId) return { ...empty, ...global };

    const { data: row } = await supabaseClient
      .from('delivery_business_config')
      .select('value')
      .eq('business_id', businessId)
      .single();
    const deliveryPricing =
      row?.value?.delivery_pricing && typeof row.value.delivery_pricing === 'object'
        ? row.value.delivery_pricing
        : {};
    const overrides = {};
    if (typeof deliveryPricing.margin_multiplier === 'number' && deliveryPricing.margin_multiplier > 0) {
      overrides.margin_multiplier = deliveryPricing.margin_multiplier;
    }
    if (typeof deliveryPricing.minimum_delivery_price_cad === 'number' && deliveryPricing.minimum_delivery_price_cad >= 0) {
      overrides.minimum_delivery_price_cad = deliveryPricing.minimum_delivery_price_cad;
    }
    if (deliveryPricing.bypass_minimum === true) overrides.bypass_minimum = true;
    return { ...empty, ...global, ...overrides };
  } catch (e) {
    return empty;
  }
}

/**
 * Get exchange rate CAD per 1 USD. Manual uses config; automatic uses env or external (placeholder).
 * @param {{ exchange_rate_source: string, manual_exchange_rate_cad_per_usd: number }} config
 * @returns {Promise<number>}
 */
export async function getExchangeRate(config) {
  if (config.exchange_rate_source === 'automatic') {
    const envRate = process.env.DELIVERY_USD_TO_CAD_RATE;
    const num = envRate != null && envRate !== '' ? parseFloat(envRate, 10) : NaN;
    if (Number.isFinite(num) && num > 0) return num;
    // Placeholder: future integration (e.g. Bank of Canada, exchangerate-api). For now fall back to manual.
    return config.manual_exchange_rate_cad_per_usd;
  }
  return config.manual_exchange_rate_cad_per_usd;
}

/**
 * Calculate customer delivery price from Shipday cost (USD).
 * Formula: Final = CEIL( MAX( (cost_usd * exchange_rate * margin_multiplier), minimum ) ) in CAD.
 *
 * @param {Object} params
 * @param {number} params.cost_usd - Shipday delivery cost in USD (e.g. from on-demand fee or costing).
 * @param {string|null} [params.business_id] - Optional; for per-customer overrides.
 * @returns {Promise<{
 *   final_price_cad: number,
 *   amount_cents: number,
 *   base_cost_cad: number,
 *   margin_amount_cad: number,
 *   applied_minimum: boolean,
 *   exchange_rate_used: number,
 *   disclaimer: string,
 *   currency: string,
 *   source?: string
 * }>}
 */
export async function calculateDeliveryPrice(params) {
  const { cost_usd, business_id: businessId = null } = params || {};
  const config = await getDeliveryPricingConfig(businessId);
  const rate = await getExchangeRate(config);

  const costUsd = Number(cost_usd);
  const baseCostCad = Number.isFinite(costUsd) && costUsd >= 0 ? costUsd * rate : 0;
  const withMargin = baseCostCad * config.margin_multiplier;
  const useMinimum =
    config.minimum_enabled && !config.bypass_minimum && config.minimum_delivery_price_cad > 0;
  const preRound = useMinimum
    ? Math.max(withMargin, config.minimum_delivery_price_cad)
    : withMargin;
  const finalPriceCad = Math.ceil(preRound);
  const appliedMinimum =
    useMinimum && withMargin < config.minimum_delivery_price_cad;
  const marginAmountCad = finalPriceCad - baseCostCad;

  return {
    final_price_cad: finalPriceCad,
    amount_cents: finalPriceCad * 100,
    base_cost_cad: Math.round(baseCostCad * 100) / 100,
    margin_amount_cad: Math.round(marginAmountCad * 100) / 100,
    margin_multiplier: config.margin_multiplier,
    applied_minimum: appliedMinimum,
    exchange_rate_used: rate,
    disclaimer: PRICE_DISCLAIMER,
    currency: 'CAD',
    // Optional: for compatibility and future modifiers (flat, distance, surge, multi-stop, package).
    _pricing_model: 'shipday_cost_plus_margin',
  };
}
