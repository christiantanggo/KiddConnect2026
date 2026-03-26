/**
 * Delivery Network SMS + web chat intake: collect callback phone + delivery address, then create request and dispatch.
 * SMS path: Telnyx webhook → bulkSMS → handleSmsIntake (when `to` is a delivery line).
 * SMS uses OpenAI (when OPENAI_API_KEY is set) for multi-turn understanding + structured asks; otherwise a safe heuristic fallback.
 */
import { supabaseClient } from '../../config/database.js';
import { createDeliveryRequest } from './intake.js';
import { startDispatch } from './dispatch.js';
import { getBusinessIdByCallerPhone, getDeliveryConfigFull, normalizePhone } from './config.js';
import {
  analyzeDeliverySmsConversation,
  looksLikePhysicalAddress,
  buildStructuredFallbackReply,
  clampSmsLength,
} from './sms-intake-ai.js';

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

const THREAD_MAX = 14;

function deliveryServiceName(config) {
  return (config?.service_line_name && String(config.service_line_name).trim()) || 'Last-Mile Delivery';
}

function trimThread(thread) {
  const t = Array.isArray(thread)
    ? thread.filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          String(m.content || '').trim(),
      )
    : [];
  if (t.length <= THREAD_MAX) return t;
  return t.slice(-THREAD_MAX);
}

function mergeReplyAndMissing(replySms, missingItems, serviceName) {
  const r = String(replySms || '').trim();
  if (r.length >= 30) return clampSmsLength(r);
  return clampSmsLength(buildStructuredFallbackReply(serviceName, missingItems));
}

/**
 * Heuristic analysis when OpenAI is unavailable.
 */
function fallbackSmsAnalysis(serviceName, defaultCallbackE164, rawText) {
  const parsed = parseSmsDeliveryMessage(rawText, defaultCallbackE164);
  const addr = parsed.delivery_address?.trim() || '';
  const cbRaw = parsed.callback_phone || defaultCallbackE164;
  const cb = cbRaw ? normalizePhone(String(cbRaw).trim()) || String(cbRaw).trim() : null;
  if (looksLikePhysicalAddress(addr) && cb) {
    return {
      ready_to_book: true,
      callback_phone_e164: cb,
      delivery_address_full: addr,
      missing_items: [],
      reply_sms: '',
    };
  }
  const missing = [];
  if (!looksLikePhysicalAddress(addr)) {
    missing.push('Full drop-off address (street #, city, province/state, postal or ZIP)');
  }
  missing.push('Briefly what we are picking up (if not clear yet)');
  return {
    ready_to_book: false,
    callback_phone_e164: cb,
    delivery_address_full: looksLikePhysicalAddress(addr) ? addr : null,
    missing_items: missing,
    reply_sms: buildStructuredFallbackReply(serviceName, missing),
  };
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
  const callbackDefault = normalizePhone(String(fromPhone || '').trim()) || String(fromPhone || '').trim();

  const session = await getSession(fromPhone, toPhone);
  const prevData = session?.data && typeof session.data === 'object' ? session.data : {};
  let thread = Array.isArray(prevData.thread)
    ? prevData.thread.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    : [];

  if (!rawText) {
    const welcome = buildStructuredFallbackReply(serviceName, [
      'What you need picked up / delivered (one short line)',
      'Full drop-off address (street #, city, province/state, postal or ZIP)',
      'Different callback # only if it is not this phone',
    ]);
    thread.push({ role: 'assistant', content: welcome });
    await upsertSession(fromPhone, toPhone, 'collecting', { thread: trimThread(thread) });
    return { reply: welcome };
  }

  thread.push({ role: 'user', content: rawText });

  let analysis = await analyzeDeliverySmsConversation({
    serviceLineName: serviceName,
    defaultCallbackE164: callbackDefault,
    thread,
  });
  if (!analysis) {
    const userBlob = thread
      .filter((m) => m.role === 'user')
      .map((m) => String(m.content || '').trim())
      .filter(Boolean)
      .join('\n');
    analysis = fallbackSmsAnalysis(serviceName, callbackDefault, userBlob || rawText);
  }

  let addr = (analysis.delivery_address_full && String(analysis.delivery_address_full).trim()) || '';
  let callback =
    (analysis.callback_phone_e164 && String(analysis.callback_phone_e164).trim()) || callbackDefault;
  callback = normalizePhone(callback) || callback;

  if (analysis.ready_to_book && (!looksLikePhysicalAddress(addr) || !callback)) {
    const mergedMissing = [
      ...(analysis.missing_items || []),
      'A complete street address with city and postal/ZIP (your last message did not look like a full address yet)',
    ];
    const priorReply = String(analysis.reply_sms || '').trim();
    analysis = {
      ...analysis,
      ready_to_book: false,
      missing_items: mergedMissing,
      reply_sms:
        priorReply.length >= 30 ? priorReply : buildStructuredFallbackReply(serviceName, mergedMissing),
    };
  }

  if (analysis.ready_to_book && looksLikePhysicalAddress(addr) && callback) {
    const business_id = await getBusinessIdByCallerPhone(fromPhone);
    const request = await createDeliveryRequest({
      business_id,
      callback_phone: callback,
      delivery_address: addr,
      intake_channel: 'sms',
      priority: 'Immediate',
    });
    await deleteSession(fromPhone, toPhone);
    startDispatch(request.id).catch((err) =>
      console.error('[Delivery SMS Intake] startDispatch error:', err?.message || err),
    );
    const confirm = `${serviceName}: Got it. Ref ${request.reference_number}. We're scheduling your pickup—watch for updates here.`;
    return { reply: confirm, requestId: request.id };
  }

  const reply = mergeReplyAndMissing(analysis.reply_sms, analysis.missing_items, serviceName);
  thread.push({ role: 'assistant', content: reply });
  await upsertSession(fromPhone, toPhone, 'collecting', { thread: trimThread(thread) });
  return { reply };
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
