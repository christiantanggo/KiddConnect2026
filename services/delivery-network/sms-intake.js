/**
 * Delivery Network SMS + web chat intake: collect callback phone + delivery address, then create request and dispatch.
 * SMS path: Telnyx webhook → bulkSMS → handleSmsIntake (when `to` is a delivery line).
 */
import { supabaseClient } from '../../config/database.js';
import { createDeliveryRequest } from './intake.js';
import { startDispatch } from './dispatch.js';
import { getBusinessIdByCallerPhone, getDeliveryConfigFull } from './config.js';

const WEB_FROM = 'web';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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
      { onConflict: 'from_phone,to_phone' }
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
  const m = text.match(/(?:\+?1[-.\s]*)?\(?([2-9]\d{2})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})\b/) ||
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
  let address = t.replace(/(?:\+?1[-.\s]*)?\(?[2-9]\d{2}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g, '').replace(/\n/g, ' ').trim();
  if (address.length > 500) address = address.slice(0, 500);
  return { callback_phone: phone, delivery_address: address || null };
}

const MIN_ADDRESS_LEN = 8;

function deliveryServiceName(config) {
  return (config?.service_line_name && String(config.service_line_name).trim()) || 'Last-Mile Delivery';
}

function deliverySmsPrompt(serviceName) {
  return `${serviceName}: Send your full delivery address (street, city, province/postal). We will use this phone as your callback. To use a different number, start your message with it, e.g. 555-123-4567, 123 Main St, Toronto ON`;
}

/**
 * Inbound SMS to a delivery line: prompt, then parse address (and optional alternate callback) and dispatch.
 * @param {string} fromPhone - Customer E.164
 * @param {string} toPhone - Tavari delivery line E.164
 * @param {string} messageText
 * @returns {Promise<{ reply: string, requestId?: string }>}
 */
export async function handleSmsIntake(fromPhone, toPhone, messageText) {
  const config = await getDeliveryConfigFull();
  const serviceName = deliveryServiceName(config);
  const rawText = (messageText || '').trim();
  const callbackDefault = String(fromPhone || '').trim();

  const session = await getSession(fromPhone, toPhone);

  if (!rawText) {
    await upsertSession(fromPhone, toPhone, 'awaiting_details', {});
    return { reply: deliverySmsPrompt(serviceName) };
  }

  async function tryCreate(text) {
    const parsed = parseSmsDeliveryMessage(text, callbackDefault);
    const addr = parsed.delivery_address && String(parsed.delivery_address).trim();
    if (!addr || addr.length < MIN_ADDRESS_LEN) return null;
    const callback_phone = parsed.callback_phone || callbackDefault;
    if (!callback_phone) return null;
    const business_id = await getBusinessIdByCallerPhone(fromPhone);
    return createDeliveryRequest({
      business_id,
      callback_phone,
      delivery_address: addr,
      intake_channel: 'sms',
      priority: 'Immediate',
    });
  }

  const oneShot = await tryCreate(rawText);
  if (oneShot && !session) {
    await deleteSession(fromPhone, toPhone);
    startDispatch(oneShot.id).catch((err) =>
      console.error('[Delivery SMS Intake] startDispatch error:', err?.message || err),
    );
    return {
      reply: `${serviceName}: Got it. Ref ${oneShot.reference_number}. We are scheduling your pickup—watch for a confirmation text.`,
      requestId: oneShot.id,
    };
  }

  if (!session || session.step !== 'awaiting_details') {
    await upsertSession(fromPhone, toPhone, 'awaiting_details', {});
    return { reply: deliverySmsPrompt(serviceName) };
  }

  const request = await tryCreate(rawText);
  if (!request) {
    return {
      reply: `${serviceName}: Please send a full street address with city and province or postal code. You can add a different callback number at the start: 555-123-4567, 123 Main St…`,
    };
  }

  await deleteSession(fromPhone, toPhone);
  startDispatch(request.id).catch((err) =>
    console.error('[Delivery SMS Intake] startDispatch error:', err?.message || err),
  );
  return {
    reply: `${serviceName}: Got it. Ref ${request.reference_number}. We are scheduling your pickup—watch for a confirmation text.`,
    requestId: request.id,
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
      reply: "Hi! To schedule a delivery, please send your callback phone number and the delivery address in one message (e.g. 555-123-4567, 123 Main St).",
      session_id: sid,
    };
  }

  if (!session || session.step === 'start') {
    const parsed = parseMessage(rawText);
    if (!parsed.callback_phone || !parsed.delivery_address) {
      await upsertSession(fromPhone, toPhone, 'start', {});
      return {
        reply: "We need both a callback phone number and a delivery address. Please send them in one message (e.g. 555-123-4567, 123 Main St).",
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
      console.error('[Delivery SMS Intake] startDispatch error:', err?.message || err)
    );
    return {
      reply: `Thanks! Your delivery request has been created (reference ${request.reference_number}). We'll arrange pickup and delivery—you'll get a confirmation shortly.`,
      requestId: request.id,
      session_id: sid,
    };
  }

  await upsertSession(fromPhone, toPhone, 'start', {});
  return {
    reply: "Please send your callback phone number and delivery address in one message.",
    session_id: sid,
  };
}
