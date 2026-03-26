/**
 * AI-assisted delivery SMS intake: interpret multi-turn chat, ask for missing fields, only book with a real address.
 */
import OpenAI from 'openai';
import { normalizePhone } from './config.js';

const MODEL = 'gpt-4o-mini';

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/**
 * True only for messages that plausibly describe a shippable street location (not "schedule a pickup" alone).
 */
export function looksLikePhysicalAddress(text) {
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
  const hasPostal = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(upper) || /\b\d{5}(-\d{4})?\b/.test(t);
  const hasComma = t.includes(',');
  if (!hasPostal && !hasComma && t.length < 28) return false;
  if (/to be confirmed|tbd\b|^n\/a$/i.test(lower)) return false;
  return true;
}

function transcriptFromThread(thread) {
  return (thread || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${String(m.content).trim()}`)
    .join('\n');
}

function safeParseAnalysis(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ready_to_book: Boolean(o.ready_to_book),
      callback_phone_e164: o.callback_phone_e164 != null ? String(o.callback_phone_e164).trim() || null : null,
      delivery_address_full: o.delivery_address_full != null ? String(o.delivery_address_full).trim() || null : null,
      missing_items: Array.isArray(o.missing_items) ? o.missing_items.map((x) => String(x || '').trim()).filter(Boolean) : [],
      reply_sms: o.reply_sms != null ? String(o.reply_sms).trim() : '',
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ serviceLineName: string, defaultCallbackE164: string, thread: {role: string, content: string}[] }} params
 */
export async function analyzeDeliverySmsConversation({ serviceLineName, defaultCallbackE164, thread }) {
  const openai = getOpenAI();
  if (!openai) return null;

  const system = `You are an SMS assistant for a last-mile delivery / pickup service (${serviceLineName}).

Rules:
- Customers text in casually across multiple messages. Infer what they want and what is still missing.
- Default callback phone is the customer's number (${defaultCallbackE164}) unless they clearly give a different number to call.
- ready_to_book may ONLY be true if delivery_address_full contains a real drop-off location: street number (or PO Box) AND city/area AND province/state OR postal/ZIP. Vague phrases like "need a pickup", "schedule delivery", "come get it" are NOT addresses.
- If they only describe pickup location but you have no drop-off, put pickup hint in missing_items and keep ready_to_book false unless they also give where to deliver.
- reply_sms: plain text, friendly, concise. Prefer under 300 characters. Use a short numbered list (1. 2. 3.) for missing info when helpful. No markdown, no emojis.
- If off-topic, politely redirect to scheduling and list what you need.
- Output MUST be a single JSON object with keys: ready_to_book (boolean), callback_phone_e164 (string or null), delivery_address_full (string or null), missing_items (array of short strings), reply_sms (string).`;

  const user = `Service line name: ${serviceLineName}
Default callback (E.164 if known): ${defaultCallbackE164}

Conversation so far:
${transcriptFromThread(thread)}

Return JSON only.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      max_tokens: 450,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    const parsed = safeParseAnalysis(raw);
    if (!parsed) return null;
    if (parsed.callback_phone_e164) {
      const n = normalizePhone(parsed.callback_phone_e164);
      if (n) parsed.callback_phone_e164 = n;
    }
    return parsed;
  } catch (e) {
    console.warn('[DeliverySmsAI] OpenAI error:', e?.message || e);
    return null;
  }
}

export function buildStructuredFallbackReply(serviceLineName, missingItems) {
  const items = Array.isArray(missingItems) && missingItems.length
    ? missingItems
    : [
        'Full drop-off address (street number, city, province or state, postal/ZIP)',
        'Different callback number only if we should not use this phone',
      ];
  const body = items.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `${serviceLineName}: Thanks for reaching out. To schedule delivery, please reply with:\n${body}`;
}

export function clampSmsLength(text, max = 480) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
