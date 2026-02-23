/**
 * Emergency Network config: phone numbers and VAPI assistant id.
 * Used to route calls/SMS to EmergencyNetworkAgent without touching existing agent.
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
  if (digits.startsWith('+')) {
    digits = digits.replace(/^\+/, '');
  }
  // US/Canada: 10 digits -> E.164 +1
  if (/^\d{10}$/.test(digits) && /^[2-9]/.test(digits)) {
    return `+1${digits}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * Get emergency network config (emergency_phone_numbers, emergency_vapi_assistant_id, max_dispatch_attempts).
 */
export async function getEmergencyConfig() {
  const now = Date.now();
  if (cachedConfig && (now - cacheTime) < CACHE_MS) return cachedConfig;
  try {
    const { data, error } = await supabaseClient
      .from('emergency_network_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    const value = data?.value || {};
    cachedConfig = {
      emergency_phone_numbers: Array.isArray(value.emergency_phone_numbers) ? value.emergency_phone_numbers : [],
      emergency_vapi_assistant_id: value.emergency_vapi_assistant_id || null,
      max_dispatch_attempts: typeof value.max_dispatch_attempts === 'number' ? value.max_dispatch_attempts : 5,
    };
    cacheTime = now;
    return cachedConfig;
  } catch (e) {
    console.warn('[EmergencyNetwork] getEmergencyConfig error:', e?.message || e);
    cachedConfig = { emergency_phone_numbers: [], emergency_vapi_assistant_id: null, max_dispatch_attempts: 5 };
    cacheTime = now;
    return cachedConfig;
  }
}

/**
 * Returns true if the given phone number (inbound or destination) is an Emergency Network number.
 */
export async function isEmergencyNumber(phone) {
  const config = await getEmergencyConfig();
  const numbers = config.emergency_phone_numbers || [];
  if (numbers.length === 0) return false;
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const normalizedList = numbers.map(normalizePhone).filter(Boolean);
  return normalizedList.some(
    (n) => n === normalized || n === normalized.replace(/^\+/, '') || `+${n}` === normalized
  );
}

/**
 * Get VAPI assistant id for Emergency Network, or null if not configured.
 */
export async function getEmergencyAssistantId() {
  const config = await getEmergencyConfig();
  return config.emergency_vapi_assistant_id || null;
}

/**
 * Invalidate config cache (call after admin updates config).
 */
export function invalidateEmergencyConfigCache() {
  cachedConfig = null;
  cacheTime = 0;
}
