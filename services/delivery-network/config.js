/**
 * Delivery Network config: global (line numbers, VAPI assistant id) and caller→business lookup.
 * Used to route calls to the delivery assistant and resolve business from caller.
 */
import { supabaseClient } from '../../config/database.js';

const CONFIG_KEY = 'settings';
let cachedConfig = null;
let cacheTime = 0;
const CACHE_MS = 30 * 1000; // 30s

export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let digits = String(phone).replace(/[^0-9+]/g, '').trim();
  if (!digits) return '';
  if (!digits.startsWith('+')) digits = `+${digits}`;
  if (/^\+\d{10}$/.test(digits) && digits.startsWith('+1')) return digits;
  if (/^\d{10}$/.test(digits.replace(/^\+/, '')) && digits.replace(/^\+/, '').match(/^[2-9]/))
    return `+1${digits.replace(/^\+/, '')}`;
  return digits;
}

/**
 * Get global delivery network config (delivery_phone_numbers, delivery_vapi_assistant_id).
 */
export async function getDeliveryConfig() {
  const now = Date.now();
  if (cachedConfig && (now - cacheTime) < CACHE_MS) return cachedConfig;
  const empty = {
    delivery_phone_numbers: [],
    delivery_vapi_assistant_id: null,
  };
  try {
    const { data, error } = await supabaseClient
      .from('delivery_network_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (error) {
      if (error.code === 'PGRST116') cachedConfig = empty;
      else {
        console.warn('[DeliveryNetwork] getDeliveryConfig DB error:', error.code, error.message);
        cachedConfig = empty;
      }
      cacheTime = now;
      return cachedConfig;
    }
    const value = data?.value || {};
    cachedConfig = {
      delivery_phone_numbers: Array.isArray(value.delivery_phone_numbers) ? value.delivery_phone_numbers : [],
      delivery_vapi_assistant_id: value.delivery_vapi_assistant_id || null,
    };
    cacheTime = now;
    return cachedConfig;
  } catch (e) {
    console.warn('[DeliveryNetwork] getDeliveryConfig error:', e?.message || e);
    cachedConfig = empty;
    cacheTime = now;
    return cachedConfig;
  }
}

/**
 * Returns true if the given phone number (destination) is a delivery line number.
 */
export async function isDeliveryLineNumber(phone) {
  const config = await getDeliveryConfig();
  const numbers = config.delivery_phone_numbers || [];
  if (numbers.length === 0) return false;
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const list = numbers.map(normalizePhone).filter(Boolean);
  return list.some(
    (n) => n === normalized || n === normalized.replace(/^\+/, '') || `+${n}` === normalized
  );
}

/**
 * Get VAPI assistant id for Delivery Network, or null if not configured.
 */
export async function getDeliveryAssistantId() {
  const config = await getDeliveryConfig();
  return config.delivery_vapi_assistant_id || null;
}

/**
 * Resolve business_id from caller phone (approved numbers). Returns first match.
 * @param {string} callerPhone - E.164 or any format
 * @returns {Promise<string|null>} business_id or null
 */
export async function getBusinessIdByCallerPhone(callerPhone) {
  const normalized = normalizePhone(callerPhone);
  if (!normalized) return null;
  const withPlus = normalized.startsWith('+') ? normalized : `+${normalized}`;
  const withoutPlus = withPlus.replace(/^\+/, '');
  const { data, error } = await supabaseClient
    .from('delivery_approved_numbers')
    .select('business_id')
    .or(`phone_number.eq.${withPlus},phone_number.eq.${withoutPlus}`)
    .limit(1)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[DeliveryNetwork] getBusinessIdByCallerPhone error:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].business_id;
}

export function invalidateDeliveryConfigCache() {
  cachedConfig = null;
  cacheTime = 0;
}

/**
 * Get full config value from DB (all keys). For admin UI.
 */
export async function getDeliveryConfigFull() {
  try {
    const { data, error } = await supabaseClient
      .from('delivery_network_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.warn('[DeliveryNetwork] getDeliveryConfigFull error:', error.message);
      return {};
    }
    const value = data?.value;
    return value && typeof value === 'object' ? value : {};
  } catch (e) {
    console.warn('[DeliveryNetwork] getDeliveryConfigFull error:', e?.message || e);
    return {};
  }
}

/** True when Shipday on-demand should run (JSON/legacy may store non-boolean). */
export function isShipdayOnDemandEnabledFlag(raw) {
  if (raw === true || raw === 1) return true;
  if (typeof raw === 'string' && /^true$/i.test(raw.trim())) return true;
  return false;
}

/** When true, assign on-demand carrier immediately after Shipday order create (no dashboard picker). */
export function isShipdayOnDemandAutoAssignFlag(raw) {
  if (raw === true || raw === 1) return true;
  if (typeof raw === 'string' && /^true$/i.test(raw.trim())) return true;
  return false;
}

/**
 * Update global delivery config (admin or backend). Merges updates into current value.
 * @param {Object} updates - Same shape as PUT /config body
 */
export async function updateDeliveryConfig(updates) {
  const {
    delivery_phone_numbers,
    delivery_vapi_assistant_id,
    max_dispatch_attempts,
    notification_email,
    notification_sms_number,
    email_enabled,
    sms_enabled,
    escalation_email_enabled,
    escalation_sms_enabled,
    customer_sms_enabled,
    customer_sms_message,
    customer_sms_legal,
    terms_of_service_url,
    intake_fields,
    opening_greeting,
    service_line_name,
    custom_instructions,
    customer_callback_message,
    dispatch_broker,
    billing,
    brokers,
  } = updates || {};
  const merged = {};
  if (Array.isArray(delivery_phone_numbers)) {
    merged.delivery_phone_numbers = delivery_phone_numbers.map((n) => normalizePhone(n)).filter(Boolean);
  }
  if (delivery_vapi_assistant_id !== undefined) merged.delivery_vapi_assistant_id = delivery_vapi_assistant_id || null;
  if (typeof max_dispatch_attempts === 'number') merged.max_dispatch_attempts = max_dispatch_attempts;
  if (notification_email !== undefined) merged.notification_email = notification_email ? String(notification_email).trim() || null : null;
  if (notification_sms_number !== undefined) merged.notification_sms_number = notification_sms_number ? String(notification_sms_number).trim() || null : null;
  if (email_enabled !== undefined) merged.email_enabled = !!email_enabled;
  if (sms_enabled !== undefined) merged.sms_enabled = !!sms_enabled;
  if (escalation_email_enabled !== undefined) merged.escalation_email_enabled = !!escalation_email_enabled;
  if (escalation_sms_enabled !== undefined) merged.escalation_sms_enabled = !!escalation_sms_enabled;
  if (customer_sms_enabled !== undefined) merged.customer_sms_enabled = !!customer_sms_enabled;
  if (customer_sms_message !== undefined) merged.customer_sms_message = customer_sms_message ? String(customer_sms_message).trim() || null : null;
  if (customer_sms_legal !== undefined) merged.customer_sms_legal = customer_sms_legal ? String(customer_sms_legal).trim() || null : null;
  if (terms_of_service_url !== undefined) merged.terms_of_service_url = terms_of_service_url ? String(terms_of_service_url).trim() || null : null;
  if (opening_greeting !== undefined) merged.opening_greeting = opening_greeting ? String(opening_greeting).trim() || null : null;
  if (service_line_name !== undefined) merged.service_line_name = service_line_name ? String(service_line_name).trim() || null : null;
  if (custom_instructions !== undefined) merged.custom_instructions = custom_instructions ? String(custom_instructions).trim() || null : null;
  if (customer_callback_message !== undefined) merged.customer_callback_message = customer_callback_message ? String(customer_callback_message).trim() || null : null;
  if (dispatch_broker !== undefined) {
    const v = String(dispatch_broker || 'shipday').toLowerCase();
    merged.dispatch_broker = v === 'doordash' ? 'doordash' : 'shipday';
  }
  if (billing !== undefined && billing !== null && typeof billing === 'object') {
    merged.billing = {
      price_basic_cents: typeof billing.price_basic_cents === 'number' ? billing.price_basic_cents : undefined,
      price_priority_cents: typeof billing.price_priority_cents === 'number' ? billing.price_priority_cents : undefined,
      price_premium_cents: typeof billing.price_premium_cents === 'number' ? billing.price_premium_cents : undefined,
      sms_fee_cents: typeof billing.sms_fee_cents === 'number' ? billing.sms_fee_cents : undefined,
      quote_margin_cents: typeof billing.quote_margin_cents === 'number' ? billing.quote_margin_cents : undefined,
      // Pricing engine: Shipday cost USD → CAD → margin → minimum → CEIL
      margin_multiplier: typeof billing.margin_multiplier === 'number' && billing.margin_multiplier > 0 ? billing.margin_multiplier : undefined,
      minimum_delivery_price_cad: typeof billing.minimum_delivery_price_cad === 'number' && billing.minimum_delivery_price_cad >= 0 ? billing.minimum_delivery_price_cad : undefined,
      minimum_enabled: billing.minimum_enabled === true ? true : billing.minimum_enabled === false ? false : undefined,
      exchange_rate_source: billing.exchange_rate_source === 'automatic' || billing.exchange_rate_source === 'manual' ? billing.exchange_rate_source : undefined,
      manual_exchange_rate_cad_per_usd: typeof billing.manual_exchange_rate_cad_per_usd === 'number' && billing.manual_exchange_rate_cad_per_usd > 0 ? billing.manual_exchange_rate_cad_per_usd : undefined,
    };
    Object.keys(merged.billing).forEach((k) => { if (merged.billing[k] === undefined) delete merged.billing[k]; });
  }
  if (intake_fields !== undefined && Array.isArray(intake_fields)) {
    merged.intake_fields = intake_fields.map((f) => ({
      key: String(f.key || '').trim() || undefined,
      label: String(f.label || '').trim() || undefined,
      required: !!f.required,
      enabled: f.enabled !== false,
    })).filter((f) => f.key);
  }
  if (brokers !== undefined && brokers !== null && typeof brokers === 'object') {
    merged.brokers = {};
    for (const [id, entry] of Object.entries(brokers)) {
      if (!id || typeof entry !== 'object') continue;
      if (id === 'doordash') {
        merged.brokers[id] = {
          enabled: entry.enabled !== false,
          developer_id: typeof entry.developer_id === 'string' ? entry.developer_id.trim() || null : null,
          key_id: typeof entry.key_id === 'string' ? entry.key_id.trim() || null : null,
          environment: entry.environment === 'production' ? 'production' : 'sandbox',
          base_url: typeof entry.base_url === 'string' ? entry.base_url.trim() || null : null,
        };
        const secret = typeof entry.signing_secret === 'string' ? entry.signing_secret.trim() : '';
        if (secret) merged.brokers[id].signing_secret = secret;
        continue;
      }
      merged.brokers[id] = {
        enabled: entry.enabled !== false,
        api_key: typeof entry.api_key === 'string' ? entry.api_key.trim() || null : null,
        base_url: typeof entry.base_url === 'string' ? entry.base_url.trim() || null : null,
      };
      if (Array.isArray(entry.preferred_carrier_ids)) {
        // Keep numeric IDs; JSON may deserialize as strings — old code used Number.isInteger only and dropped them.
        const ids = entry.preferred_carrier_ids
          .map((n) => {
            if (typeof n === 'number' && Number.isInteger(n) && n > 0) return n;
            if (typeof n === 'string' && n.trim()) {
              const p = parseInt(n.trim(), 10);
              if (!Number.isNaN(p) && p > 0 && String(p) === n.trim()) return p;
            }
            return null;
          })
          .filter((x) => x != null);
        if (ids.length) merged.brokers[id].preferred_carrier_ids = ids;
      } else if (entry.preferred_carrier_ids !== undefined && entry.preferred_carrier_ids !== null) {
        const raw = String(entry.preferred_carrier_ids).split(/[\s,]+/).map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n) && n > 0);
        if (raw.length) merged.brokers[id].preferred_carrier_ids = raw;
      }
      if (id === 'shipday') {
        merged.brokers[id].on_demand_enabled = isShipdayOnDemandEnabledFlag(entry.on_demand_enabled);
        merged.brokers[id].on_demand_auto_assign = isShipdayOnDemandAutoAssignFlag(entry.on_demand_auto_assign);
        const provider = typeof entry.preferred_on_demand_provider === 'string' ? entry.preferred_on_demand_provider.trim() || null : null;
        merged.brokers[id].preferred_on_demand_provider = provider || null;
        if (entry.on_demand_contactless === true) merged.brokers[id].on_demand_contactless = true;
        else if (entry.on_demand_contactless === false) merged.brokers[id].on_demand_contactless = false;
        if (entry.on_demand_tip != null && entry.on_demand_tip !== '') {
          const t = Number(entry.on_demand_tip);
          if (Number.isFinite(t) && t >= 0) merged.brokers[id].on_demand_tip = t;
        }
      }
    }
  }
  if (Object.keys(merged).length === 0) return await getDeliveryConfigFull();
  const current = await getDeliveryConfigFull();
  const newValue = { ...current, ...merged };
  if (merged.billing) newValue.billing = { ...(current.billing || {}), ...merged.billing };
  if (merged.brokers) {
    newValue.brokers = { ...(current.brokers || {}), ...merged.brokers };
    const prevDd = current.brokers?.doordash;
    const nextDd = newValue.brokers.doordash;
    if (prevDd && typeof prevDd === 'object' && prevDd.signing_secret && nextDd && typeof nextDd === 'object' && !nextDd.signing_secret) {
      newValue.brokers.doordash = { ...nextDd, signing_secret: prevDd.signing_secret };
    }
  }
  const { error: upsertErr } = await supabaseClient
    .from('delivery_network_config')
    .upsert({ key: CONFIG_KEY, value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (upsertErr) throw new Error(upsertErr.message);
  invalidateDeliveryConfigCache();
  return newValue;
}
