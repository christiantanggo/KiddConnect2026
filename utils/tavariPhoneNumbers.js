/**
 * Get all phone numbers Tavari owns (Telnyx first, fallback to VAPI).
 * Used for admin delivery/emergency config dropdowns.
 */
import { getAllVapiPhoneNumbers } from '../services/vapi.js';

function normalizeE164(value) {
  if (!value || typeof value !== 'string') return '';
  const d = value.replace(/[^0-9+]/g, '').trim();
  return d.startsWith('+') ? d : d ? `+${d}` : '';
}

function getPhoneFromTelnyxRecord(record) {
  return record?.phone_number ?? record?.number ?? record?.attributes?.phone_number ?? record?.attributes?.number ?? null;
}

export async function getTavariOwnedPhoneNumbers() {
  const seen = new Set();
  const result = [];
  const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
  const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';

  if (TELNYX_API_KEY) {
    try {
      const axios = (await import('axios')).default;
      let pageNumber = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const telnyxResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
          headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
          params: { 'page[size]': pageSize, 'page[number]': pageNumber },
        });
        const allTelnyxNumbers = telnyxResponse.data?.data || [];
        for (const telnyxNum of allTelnyxNumbers) {
          const raw = getPhoneFromTelnyxRecord(telnyxNum);
          const e164 = normalizeE164(raw);
          if (e164 && !seen.has(e164)) {
            seen.add(e164);
            result.push({ number: e164, e164 });
          }
        }
        hasMore = allTelnyxNumbers.length === pageSize;
        pageNumber += 1;
      }

      if (result.length > 0) {
        console.log(`[TavariPhoneNumbers] Loaded ${result.length} number(s) from Telnyx`);
        return result;
      }
    } catch (err) {
      console.warn('[TavariPhoneNumbers] Telnyx failed, falling back to VAPI:', err?.message || err);
    }
  } else {
    console.warn('[TavariPhoneNumbers] TELNYX_API_KEY not set, using VAPI only');
  }

  const vapiNumbers = await getAllVapiPhoneNumbers();
  for (const n of vapiNumbers) {
    const raw = n.phoneNumber || n.phone_number || n.number;
    const e164 = normalizeE164(raw);
    if (e164 && !seen.has(e164)) {
      seen.add(e164);
      result.push({ number: e164, e164 });
    }
  }
  return result;
}
