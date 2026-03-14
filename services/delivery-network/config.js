/**
 * Delivery Network config: global (line numbers, VAPI assistant id) and caller→business lookup.
 * Used to route calls to the delivery assistant and resolve business from caller.
 */
import { supabaseClient } from '../../config/database.js';

const CONFIG_KEY = 'settings';
let cachedConfig = null;
let cacheTime = 0;
const CACHE_MS = 30 * 1000; // 30s

function normalizePhone(phone) {
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
