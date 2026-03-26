/**
 * Delivery Network SMS + web chat intake: collect callback phone + delivery address, then create request and dispatch.
 * SMS path: Telnyx webhook → bulkSMS → handleSmsIntake (when `to` is a delivery line).
 *
 * SMS uses the same session step pattern as handleWebIntake (delivery dispatch public chat): start → awaiting_details,
 * with SMS-specific parsing (callback defaults to the sender’s number; address can be sent alone on a follow-up).
 */
import { supabaseClient } from '../../config/database.js';
import { createDeliveryRequest } from './intake.js';
import { startDispatch } from './dispatch.js';
import { getBusinessIdByCallerPhone, getDeliveryConfigFull, normalizePhone } from './config.js';

const WEB_FROM = 'web';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_ADDRESS_LEN = 8;

function getSessionKey(sessionId) {
  return String(sessionId || '').trim() || null;
}

export async function getSession(fromPhone, toPhone) {
  const from = String(fromPhone || '').trim();
  const to = String(toPhone || '').trim();
  if (!from || !to) return null;
  const { data, error } = await supabaseClient
    .from('delivery_sms_intake_sessions')
    .select('id, step, data, updated_at')
    .eq('from_phone', from)
    .eq('to_phone', to)
    .maybeSingle();
  if (error || !data) return null;
  const updated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - updated > SESSION_TTL_MS) {
    await supabaseClient.from('delivery_sms_intake_sessions').delete().eq('id', data.id);
    return null;
  }
  return { id: data.id, step: data.step || 'start', data: data.data || {} };
}

export async function upsertSession(fromPhone, toPhone, step, data) {
  const from = String(fromPhone || '').trim();
  const to = String(toPhone || '').trim();
  if (!from || !to) return null;
  const payload = { step, data: data || {}, updated_at: new Date().toISOString() };
  const { data: row, error } = await supabaseClient
    .from('delivery_sms_intake_sessions')
    .upsert(
      { from_phone: from, to_phone: to, ...payload },
      { onConflict: 'from_phone,to_phone' },
    )
    .select('id, step')
    .single();
  if (error) return null;
  return row;
}

export async function deleteSession(fromPhone, toPhone) {
  const from = String(fromPhone || '').trim();
  const to = String(toPhone || '').trim();
  if (!from || !to) return;
  await supabaseClient
    .from('delivery_sms_intake_sessions')
    .delete()
    .eq('from_phone', from)
    .eq('to_phone', to);
}

function extractPhone(text) {
  if (!text || typeof text !== 'string') return null;
  const m =
    text.match(/(?:\+?1[-.\s]*)?\(?([2-9]\d{2})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})\b/) ||
    text.match(/\b([2-9]\d{2})[-.\s]*(\d{3})[-.\s]*(\d{4})\b/);
  if (!m) return null;
  const digits = m.slice(1).join('').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Callback from text if present; otherwise use SMS sender. Rest of message = delivery address. */
function parseSmsDeliveryMessage(text, defaultCallbackE164) {
  const t = (text || '').trim();
  const phoneExtracted = extractPhone(t);
  const callback_phone = phoneExtracted || defaultCallbackE164 || null;
  let address = t
    .replace(/(?:\+?1[-.\s]*)?\(?[2-9]\d{2}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (address.length > 500) address = address.slice(0, 500);
  return { callback_phone, delivery_address: address || null };
}

/** Web/chat: require explicit phone + address in one message (no default callback). */
function parseMessage(text) {
  const t = (text || '').trim();
  const phone = extractPhone(t);
  let address = t
    .replace(/(?:\+?1[-.\s]*)?\(?[2-9]\d{2}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g, '')
    .replace(/\n/g, ' ')
    .trim();
  if (address.length > 500) address = address.slice(0, 500);
  return { callback_phone: phone, delivery_address: address || null };
}

/**
 * Block vague SMS (“need a pickup”) from creating a delivery when only implicit callback is used.
 * Web-style messages with phone+address skip this (same bar as public chat).
 */
function looksLikePhysicalAddress(text) {
  const t = String(text || '').trim();
  if (t.length < 14) return false;
  const lower = t.toLowerCase();
  const upper = t.toUpperCase();
  if (/\b(need to|want to|schedule|scheduling|pick\s*up|pickup|delivery|deliver|hello|hi|help|asap|urgent)\b/i.test(lower)) {
    const hasStreetNumber = /\b\d{1,5}\s+[a-z0-9]/i.test(t);
    const hasPostalEarly = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/.test(upper) || /\b\d{5}(-\d{4})?\b/.test(t);
    if (!hasStreetNumber && !hasPostalEarly && !/\b(p\.?o\.?\s*box|postal box)\b/i.test(t)) return false;
  }
  const hasNumber = /\d/.test(t);
  const poBox = /\b(p\.?o\.?\s*box|postal box)\b/i.test(t);
  if (!hasNumber && !poBox) return false;
  const hasPostal = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/.test(upper) || /\b\d{5}(-\d{4})?\b/.test(t);
  const hasComma = t.includes(',');
  if (!hasPostal && !hasComma && t.length < 28) return false;
  if (/to be confirmed|tbd\b|^n\/a$/i.test(lower)) return false;
  return true;
}

function deliveryServiceName(config) {
  return (config?.service_line_name && String(config.service_line_name).trim()) || 'Last-Mile Delivery';
}

/** Opening prompt aligned with handleWebIntake, adapted for SMS (callback defaults to this number). */
function smsIntakeOpeningPrompt(serviceName) {
  return `${serviceName}: To schedule a delivery, send your full drop-off address (street, city, province/postal). We use this phone as your callback. If you want a different callback number, start your message with it, e.g. 555-123-4567, 123 Main St, Toronto ON`;
}

/**
 * Try to build params for createDeliveryRequest from one SMS body.
 * 1) Same as web chat: phone + address in one message (parseMessage).
 * 2) SMS style: optional alt phone at start, else sender as callback; address must look like a real street line.
 */
async function tryParseSmsIntakePayload(rawText, callbackDefaultE164, fromPhone) {
  const webParsed = parseMessage(rawText);
  if (webParsed.callback_phone && webParsed.delivery_address) {
    const addr = String(webParsed.delivery_address).trim();
    if (addr.length >= MIN_ADDRESS_LEN) {
      const cb = normalizePhone(String(webParsed.callback_phone).trim()) || String(webParsed.callback_phone).trim();
      const business_id = await getBusinessIdByCallerPhone(fromPhone);
      return {
        business_id,
        callback_phone: cb,
        delivery_address: addr,
      };
    }
  }

  const smsParsed = parseSmsDeliveryMessage(rawText, callbackDefaultE164);
  const addr = smsParsed.delivery_address && String(smsParsed.delivery_address).trim();
  if (!addr || addr.length < MIN_ADDRESS_LEN) return null;
  const callback_phone = smsParsed.callback_phone || callbackDefaultE164;
  if (!callback_phone) return null;
  if (!looksLikePhysicalAddress(addr)) return null;

  const cb = normalizePhone(String(callback_phone).trim()) || String(callback_phone).trim();
  const business_id = await getBusinessIdByCallerPhone(fromPhone);
  return {
    business_id,
    callback_phone: cb,
    delivery_address: addr,
  };
}

/**
 * Inbound SMS to a delivery line: same step flow as public web chat (start → awaiting_details), SMS parsing rules.
 */
export async function handleSmsIntake(fromPhone, toPhone, messageText) {
  const config = await getDeliveryConfigFull();
  const serviceName = deliveryServiceName(config);
  const rawText = (messageText || '').trim();
  const callbackDefault = normalizePhone(String(fromPhone || '').trim()) || String(fromPhone || '').trim();

  const session = await getSession(fromPhone, toPhone);
  const step = session?.step || '';
  const inIntakeFlow =
    !session || step === 'start' || step === 'awaiting_details' || step === 'collecting';

  if (!rawText) {
    await upsertSession(fromPhone, toPhone, 'start', {});
    return { reply: smsIntakeOpeningPrompt(serviceName) };
  }

  const payload = await tryParseSmsIntakePayload(rawText, callbackDefault, fromPhone);

  if (payload && inIntakeFlow) {
    await deleteSession(fromPhone, toPhone);
    const request = await createDeliveryRequest({
      business_id: payload.business_id,
      callback_phone: payload.callback_phone,
      delivery_address: payload.delivery_address,
      intake_channel: 'sms',
      priority: 'Immediate',
    });
    startDispatch(request.id).catch((err) =>
      console.error('[Delivery SMS Intake] startDispatch error:', err?.message || err),
    );
    return {
      reply: `${serviceName}: Got it. Ref ${request.reference_number}. We're scheduling your pickup—watch for updates here.`,
      requestId: request.id,
    };
  }

  const awaitingFollowUp = session && (step === 'awaiting_details' || step === 'collecting');
  if (!session || !awaitingFollowUp) {
    await upsertSession(fromPhone, toPhone, 'awaiting_details', {});
    return { reply: smsIntakeOpeningPrompt(serviceName) };
  }

  return {
    reply: `${serviceName}: We need a full street address with city and province or postal code. You can start with a different callback: 555-123-4567, 123 Main St, City ON`,
  };
}

/**
 * Web chat intake: first message returns prompt; second message parses phone + address and creates delivery request.
 * @returns { Promise<{ reply: string, requestId?: string }> }
 */
export async function handleWebIntake(sessionId, messageText) {
  const sid = getSessionKey(sessionId);
  if (!sid) throw new Error('sessionId required');
  const fromPhone = WEB_FROM;
  const toPhone = sid;

  const session = await getSession(fromPhone, toPhone);
  const rawText = (messageText || '').trim();

  if (!rawText) {
    await upsertSession(fromPhone, toPhone, 'start', {});
    return {
      reply:
        'Hi! To schedule a delivery, please send your callback phone number and the delivery address in one message (e.g. 555-123-4567, 123 Main St).',
      session_id: sid,
    };
  }

  if (!session || session.step === 'start') {
    const parsed = parseMessage(rawText);
    if (!parsed.callback_phone || !parsed.delivery_address) {
      await upsertSession(fromPhone, toPhone, 'start', {});
      return {
        reply:
          'We need both a callback phone number and a delivery address. Please send them in one message (e.g. 555-123-4567, 123 Main St).',
        session_id: sid,
      };
    }
    await deleteSession(fromPhone, toPhone);
    const request = await createDeliveryRequest({
      business_id: null,
      callback_phone: parsed.callback_phone,
      delivery_address: parsed.delivery_address,
      intake_channel: 'chat',
    });
    startDispatch(request.id).catch((err) =>
      console.error('[Delivery SMS Intake] startDispatch error:', err?.message || err),
    );
    return {
      reply: `Thanks! Your delivery request has been created (reference ${request.reference_number}). We'll arrange pickup and delivery—you'll get a confirmation shortly.`,
      requestId: request.id,
      session_id: sid,
    };
  }

  await upsertSession(fromPhone, toPhone, 'start', {});
  return {
    reply: 'Please send your callback phone number and delivery address in one message.',
    session_id: sid,
  };
}
