import { BusinessPhoneNumber } from '../models/BusinessPhoneNumber.js';

/**
 * Returns phone numbers assigned to a business for use in dashboard dropdowns.
 * Used by emergency-network and delivery-network so businesses only see their own numbers,
 * not the full Tavari/Telnyx pool (which is admin-only).
 *
 * @param {Object} business - Business object with id, vapi_phone_number?, telnyx_number?
 * @returns {Promise<Array<{ number: string, e164: string }>>}
 */
export async function getPhoneNumbersForBusiness(business) {
  if (!business || !business.id) return [];

  const seen = new Set();
  const result = [];

  function normalizeE164(value) {
    if (!value || typeof value !== 'string') return '';
    const d = value.replace(/[^0-9+]/g, '').trim();
    return d.startsWith('+') ? d : d ? `+${d}` : '';
  }

  function add(num) {
    const e164 = normalizeE164(num);
    if (!e164 || seen.has(e164)) return;
    seen.add(e164);
    result.push({ number: e164, e164 });
  }

  try {
    const fromTable = await BusinessPhoneNumber.findActiveByBusinessId(business.id);
    for (const row of fromTable || []) {
      if (row.phone_number) add(row.phone_number);
    }
    if (business.vapi_phone_number) add(business.vapi_phone_number);
    if (business.telnyx_number) add(business.telnyx_number);
  } catch (err) {
    console.warn('[businessPhoneNumbersForDropdown] Error:', err?.message || err);
  }

  return result;
}
