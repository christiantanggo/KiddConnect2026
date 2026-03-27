/**
 * Link delivery VAPI assistant to phone numbers (provision from Telnyx to VAPI if needed, then link).
 * Used by delivery-network routes and admin delivery-operator.
 */
import { getAllVapiPhoneNumbers, checkIfNumberProvisionedInVAPI, linkAssistantToNumber, provisionPhoneNumber, getVapiPhoneNumberId } from '../vapi.js';

function normalizeE164(value) {
  if (!value || typeof value !== 'string') return '';
  const d = value.replace(/[^0-9+]/g, '').trim();
  return d.startsWith('+') ? d : d ? `+${d}` : '';
}

/**
 * @param {string} assistantId - delivery_vapi_assistant_id
 * @param {string[]} phoneNumbers - delivery_phone_numbers (E.164 or any format)
 * @returns {{ linked: string[], notInVapi: string[], errors: string[] }}
 */
export async function linkDeliveryAssistantToNumbers(assistantId, phoneNumbers) {
  const result = { linked: [], notInVapi: [], errors: [] };
  if (!assistantId || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return result;
  for (const raw of phoneNumbers) {
    const e164 = normalizeE164(raw);
    if (!e164) continue;
    try {
      let vapiNumber = await checkIfNumberProvisionedInVAPI(e164);
      if (!vapiNumber) {
        try {
          vapiNumber = await provisionPhoneNumber(e164, null);
          console.log('[DeliveryNetwork] Provisioned number to VAPI:', e164);
        } catch (provisionErr) {
          result.notInVapi.push(e164);
          result.errors.push(`${e164}: provision to VAPI failed — ${provisionErr?.message || provisionErr}`);
          continue;
        }
      }
      const phoneNumberId = getVapiPhoneNumberId(vapiNumber);
      if (!phoneNumberId) {
        result.errors.push(`${e164}: no VAPI phone number id`);
        continue;
      }
      await linkAssistantToNumber(assistantId, phoneNumberId);
      result.linked.push(e164);
    } catch (err) {
      result.errors.push(`${e164}: ${err?.message || err}`);
    }
  }
  return result;
}
