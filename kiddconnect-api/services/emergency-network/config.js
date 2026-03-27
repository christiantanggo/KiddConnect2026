/**
 * Emergency Network config: phone numbers, VAPI assistant id, intake_fields (what the AI collects).
 * Used to route calls/SMS to EmergencyNetworkAgent without touching existing agent.
 */
import { supabaseClient } from '../../config/database.js';

const CONFIG_KEY = 'settings';
let cachedConfig = null;
let cacheTime = 0;
const CACHE_MS = 30 * 1000; // 30s

/** Default first thing the AI says when the call is answered. */
export const DEFAULT_OPENING_GREETING = "Thanks for calling the 24/7 Emergency Plumbing line. I can help connect you with a licensed plumber. What's going on—is it a leak, a clog, or something else?";

/** Default service line name used in the system prompt (e.g. "24/7 Emergency Plumbing"). */
export const DEFAULT_SERVICE_LINE_NAME = "24/7 Emergency Plumbing";

/** Default message spoken when we call the customer back after a provider accepts. Placeholders: {{caller_name}}, {{service_line_name}}, {{business_name}}, {{provider_phone}} */
export const DEFAULT_CUSTOMER_CALLBACK_MESSAGE = "Hi {{caller_name}}, this is {{service_line_name}}. Good news—we've assigned a plumber to your request. The company is {{business_name}}. You can reach them at {{provider_phone}}. If you have any questions, call us back. Goodbye.";

/** Default intake fields for "what the AI collects". Plumbing-only focus; do not list other trades. */
export const DEFAULT_INTAKE_FIELDS = [
  { key: 'caller_name', label: "Caller's name", required: false, enabled: true },
  { key: 'callback_phone', label: 'Callback phone number', required: true, enabled: true },
  { key: 'service_category', label: 'Confirm: plumbing (pipe, drain, water heater, leak, etc.)', required: false, enabled: true },
  { key: 'urgency_level', label: 'Urgency (Immediate Emergency, Same Day, Schedule)', required: false, enabled: true },
  { key: 'location', label: 'Address or postal code', required: false, enabled: true },
  { key: 'issue_summary', label: 'Brief description of the issue', required: false, enabled: true },
];

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
  const empty = {
    emergency_phone_numbers: [],
    emergency_vapi_assistant_id: null,
    max_dispatch_attempts: 5,
    notification_email: null,
    notification_sms_number: null,
    email_enabled: true,
    sms_enabled: false,
    escalation_email_enabled: true,
    escalation_sms_enabled: true,
    customer_sms_enabled: false,
    customer_sms_message: '',
    customer_sms_legal: '',
    terms_of_service_url: '',
    intake_fields: [...DEFAULT_INTAKE_FIELDS],
    opening_greeting: DEFAULT_OPENING_GREETING,
    service_line_name: DEFAULT_SERVICE_LINE_NAME,
    custom_instructions: '',
    billing: {
      price_basic_cents: 500,
      price_priority_cents: 750,
      price_premium_cents: 1000,
      sms_fee_cents: 50,
    },
  };
  try {
    const { data, error } = await supabaseClient
      .from('emergency_network_config')
      .select('value')
      .eq('key', CONFIG_KEY)
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        cachedConfig = empty;
      } else {
        console.warn('[EmergencyNetwork] getEmergencyConfig DB error:', error.code, error.message);
        cachedConfig = empty;
      }
      cacheTime = now;
      return cachedConfig;
    }
    const value = data?.value || {};
    const fromEnv = process.env.EMERGENCY_DISPATCH_NOTIFICATION_EMAIL || null;
    const intakeFields = Array.isArray(value.intake_fields) && value.intake_fields.length > 0
      ? value.intake_fields
      : [...DEFAULT_INTAKE_FIELDS];
    cachedConfig = {
      emergency_phone_numbers: Array.isArray(value.emergency_phone_numbers) ? value.emergency_phone_numbers : [],
      emergency_vapi_assistant_id: value.emergency_vapi_assistant_id || null,
      max_dispatch_attempts: typeof value.max_dispatch_attempts === 'number' ? value.max_dispatch_attempts : 5,
      notification_email: (value.notification_email && String(value.notification_email).trim()) || fromEnv || null,
      notification_sms_number: (value.notification_sms_number && String(value.notification_sms_number).trim()) || null,
      email_enabled: value.email_enabled !== false,
      sms_enabled: value.sms_enabled === true,
      escalation_email_enabled: value.escalation_email_enabled !== false,
      escalation_sms_enabled: value.escalation_sms_enabled !== false,
      customer_sms_enabled: value.customer_sms_enabled === true,
      customer_sms_message: (value.customer_sms_message && String(value.customer_sms_message).trim()) || '',
      customer_sms_legal: (value.customer_sms_legal && String(value.customer_sms_legal).trim()) || '',
      terms_of_service_url: (value.terms_of_service_url && String(value.terms_of_service_url).trim()) || '',
      intake_fields: intakeFields,
      opening_greeting: (value.opening_greeting && String(value.opening_greeting).trim()) || DEFAULT_OPENING_GREETING,
      service_line_name: (value.service_line_name && String(value.service_line_name).trim()) || DEFAULT_SERVICE_LINE_NAME,
      custom_instructions: (value.custom_instructions && String(value.custom_instructions).trim()) || '',
      customer_callback_message: (value.customer_callback_message && String(value.customer_callback_message).trim()) || DEFAULT_CUSTOMER_CALLBACK_MESSAGE,
      billing: (value.billing && typeof value.billing === 'object')
        ? {
            price_basic_cents: typeof value.billing.price_basic_cents === 'number' ? value.billing.price_basic_cents : 500,
            price_priority_cents: typeof value.billing.price_priority_cents === 'number' ? value.billing.price_priority_cents : 750,
            price_premium_cents: typeof value.billing.price_premium_cents === 'number' ? value.billing.price_premium_cents : 1000,
            sms_fee_cents: typeof value.billing.sms_fee_cents === 'number' ? value.billing.sms_fee_cents : 50,
          }
        : { price_basic_cents: 500, price_priority_cents: 750, price_premium_cents: 1000, sms_fee_cents: 50 },
    };
    cacheTime = now;
    return cachedConfig;
  } catch (e) {
    console.warn('[EmergencyNetwork] getEmergencyConfig error:', e?.message || e);
    cachedConfig = empty;
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
