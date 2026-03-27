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

/** Extract E.164 from a Telnyx API record (handles both flat and JSON:API-style attributes). */
function getPhoneFromTelnyxRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const raw =
    record.phone_number ??
    record.number ??
    record.attributes?.phone_number ??
    record.attributes?.number ??
    null;
  return raw != null ? String(raw).trim() : null;
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
          timeout: 15000,
          validateStatus: (status) => status < 500,
        });

        if (telnyxResponse.status !== 200) {
          console.warn(
            '[TavariPhoneNumbers] Telnyx API returned',
            telnyxResponse.status,
            telnyxResponse.data?.errors?.[0]?.detail || telnyxResponse.statusText
          );
          break;
        }

        // Telnyx v2 returns { data: [...] }; some wrappers use data.data
        const rawData = telnyxResponse.data?.data ?? telnyxResponse.data;
        const allTelnyxNumbers = Array.isArray(rawData) ? rawData : [];

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
      console.warn('[TavariPhoneNumbers] Telnyx returned no numbers; falling back to VAPI');
    } catch (err) {
      console.warn(
        '[TavariPhoneNumbers] Telnyx failed, falling back to VAPI:',
        err?.response?.status,
        err?.message || err
      );
    }
  } else {
    console.warn('[TavariPhoneNumbers] TELNYX_API_KEY not set; using VAPI only. Set TELNYX_API_KEY in .env so Telnyx numbers appear in admin.');
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
  if (result.length > 0) {
    console.log(`[TavariPhoneNumbers] Loaded ${result.length} number(s) from VAPI fallback`);
  }
  return result;
}
