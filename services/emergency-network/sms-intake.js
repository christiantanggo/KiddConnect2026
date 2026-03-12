/**
 * Emergency Network SMS intake: collect same info as phone in one exchange.
 * One message asks for all details; we parse their single reply and create the request.
 */
import { supabaseClient } from '../../config/database.js';
import { getEmergencyConfig } from './config.js';
import { createServiceRequest } from './intake.js';
import { startDispatch } from './dispatch.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function getSession(fromPhone, toPhone) {
  const from = String(fromPhone || '').trim();
  const to = String(toPhone || '').trim();
  if (!from || !to) return null;
  const { data, error } = await supabaseClient
    .from('emergency_sms_intake_sessions')
    .select('id, step, data, updated_at')
    .eq('from_phone', from)
    .eq('to_phone', to)
    .maybeSingle();
  if (error || !data) return null;
  const updated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - updated > SESSION_TTL_MS) {
    await supabaseClient.from('emergency_sms_intake_sessions').delete().eq('id', data.id);
    return null;
  }
  return { id: data.id, step: data.step || 'awaiting_details', data: data.data || {} };
}

export async function upsertSession(fromPhone, toPhone, step, data) {
  const from = String(fromPhone || '').trim();
  const to = String(toPhone || '').trim();
  if (!from || !to) return null;
  const payload = { step, data: data || {}, updated_at: new Date().toISOString() };
  const { data: row, error } = await supabaseClient
    .from('emergency_sms_intake_sessions')
    .upsert(
      { from_phone: from, to_phone: to, ...payload },
      { onConflict: 'from_phone,to_phone' }
    )
    .select('id, step')
    .single();
  if (error) {
    console.error('[Emergency SMS Intake] upsertSession error:', error?.message || error);
    return null;
  }
  return row;
}

export async function deleteSession(fromPhone, toPhone) {
  const from = String(fromPhone || '').trim();
  const to = String(toPhone || '').trim();
  if (!from || !to) return;
  await supabaseClient
    .from('emergency_sms_intake_sessions')
    .delete()
    .eq('from_phone', from)
    .eq('to_phone', to);
}

/** Words that suggest they described an actual issue (not just "plumbing" or "emergency"). */
const ISSUE_KEYWORDS = /\b(leak|leaking|burst|pipe|flood|clog|blocked|drain|no\s*heat|no\s*water|broken|overflow|smell|gas\s*leak|frozen|flooding|emergency|urgent|toilet|faucet|heater|furnace|ac\b|hvac)\b/i;

/** Extract a phone number from freeform text (for web chat). Returns E.164-like string or null. */
function extractPhoneFromMessage(text) {
  if (!text || typeof text !== 'string') return null;
  const raw = text.trim();
  const match = raw.match(/(?:\+?1[-.\s]*)?\(?([2-9]\d{2})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})\b/) ||
    raw.match(/\b([2-9]\d{2})[-.\s]*(\d{3})[-.\s]*(\d{4})\b/) ||
    raw.match(/\b(\d{3})[-.\s]*(\d{4})\b/);
  if (!match) return null;
  const digits = match.slice(1).join('').replace(/\D/g, '');
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Standalone urgency words to strip from issue line so we don't repeat them. */
const URGENCY_WORDS = /\b(emergency|urgent|asap|same\s*day|schedule|immediate)\b/gi;

/**
 * Derive issue_summary only: strip caller name, service, urgency, location from raw so we don't repeat them to providers.
 */
function issueSummaryOnly(raw, parsed) {
  if (!raw || typeof raw !== 'string') return 'See request';
  let rest = raw.trim();
  const toRemove = [
    parsed.caller_name,
    parsed.service_category,
    parsed.urgency_level,
    parsed.location,
  ].filter(Boolean);
  for (const part of toRemove) {
    const re = new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
    rest = rest.replace(re, ' ').replace(/\s+/g, ' ').trim();
  }
  rest = rest.replace(URGENCY_WORDS, ' ').replace(/\s+/g, ' ').trim();
  rest = rest.replace(/,+\s*|\s*,/g, ' ').replace(/\s+/g, ' ').trim();
  if (rest.length >= 3 && rest.length <= 2000) return rest;
  if (rest.length > 2000) return rest.slice(0, 2000);
  return ISSUE_KEYWORDS.test(raw) ? raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : 'See request';
}

/**
 * Parse a single freeform message for name, service type, urgency, location, and issue.
 */
function parseSingleMessage(text, callbackPhone) {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();
  const result = {
    caller_name: null,
    callback_phone: callbackPhone,
    service_category: 'Other',
    urgency_level: 'Immediate Emergency',
    location: null,
    issue_summary: 'See request',
  };

  if (/plumb|pipe|drain|leak|water\s*heater|toilet|faucet|burst\s*pipe/i.test(lower)) result.service_category = 'Plumbing';
  else if (/hvac|heat|furnace|ac\s*unit|air\s*cond|no\s*heat|no\s*ac/i.test(lower)) result.service_category = 'HVAC';
  else if (/\bgas\b|gas\s*line|gas\s*leak|smell\s*gas/i.test(lower)) result.service_category = 'Gas';

  if (/emergency|urgent|asap|as\s*ap|right\s*away|immediate|now\s*please/i.test(lower)) result.urgency_level = 'Immediate Emergency';
  else if (/same\s*day|today|this\s*afternoon|this\s*evening/i.test(lower)) result.urgency_level = 'Same Day';
  else if (/schedule|later|tomorrow|next\s*week/i.test(lower)) result.urgency_level = 'Schedule';

  const addrMatch = raw.match(/(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|way|place|pl|court|ct)\b[\w\s]*)/i)
    || raw.match(/([A-Z]\d[A-Z]\s*\d[A-Z]\d)/i);
  if (addrMatch && addrMatch[1]) result.location = addrMatch[1].trim().slice(0, 500);

  const nameBlocklist = /^(hi|hello|help|please|thanks|the|a|an|plumbing|hvac|gas|emergency|immediate|same|schedule|other|today|tomorrow|flooded|basement|leak|leaking|broken|clogged|drain|pipe|burst|water|heat|need|have)$/i;
  const namePatterns = [
    /(?:my\s+name\s+is|i'm|i\s+am|this\s+is|call\s+me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*[,.\-]/,
    /^([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)\s+(?=\d|[\s\S]{3,})/,
  ];
  for (const re of namePatterns) {
    const m = raw.match(re);
    if (m && m[1]) {
      const name = m[1].trim();
      const firstWord = name.split(/\s+/)[0] || '';
      if (name.length >= 2 && name.length <= 50 && !nameBlocklist.test(name) && !nameBlocklist.test(firstWord)) {
        result.caller_name = name;
        break;
      }
    }
  }

  result.issue_summary = issueSummaryOnly(raw, result);
  return result;
}

/**
 * Return list of missing items: 'issue', 'location', and optionally 'phone' (for web).
 */
function getMissingItems(parsed, rawText, isWeb = false) {
  const missing = [];
  const raw = (rawText || '').trim();
  const hasIssueDescription = raw.length >= 25 || (ISSUE_KEYWORDS.test(raw) && raw.length >= 10);
  if (!hasIssueDescription) missing.push('issue');
  if (!parsed.location) missing.push('location');
  if (isWeb && (!parsed.callback_phone || String(parsed.callback_phone).startsWith('web:'))) missing.push('phone');
  return missing;
}

function buildFollowUpMessage(serviceName, missing) {
  const hasPhone = missing.includes('phone');
  const hasIssue = missing.includes('issue');
  const hasLocation = missing.includes('location');
  if (hasPhone && hasIssue && hasLocation) {
    return `${serviceName}: We still need your callback phone number, your address, and a brief description of the issue. Please reply with those.`;
  }
  if (hasPhone && hasIssue) {
    return `${serviceName}: We still need your callback phone number and a brief description of the issue. Please reply with those.`;
  }
  if (hasPhone && hasLocation) {
    return `${serviceName}: We still need your callback phone number and your service address. Please reply with those.`;
  }
  if (hasPhone) {
    return `${serviceName}: Please include your callback phone number so we can reach you.`;
  }
  if (hasIssue && hasLocation) {
    return `${serviceName}: We still need a brief description of the issue (e.g. burst pipe, no heat) and your address. Please reply with those.`;
  }
  if (hasIssue) {
    return `${serviceName}: Please describe the issue (e.g. burst pipe, no heat, clogged drain).`;
  }
  if (hasLocation) {
    return `${serviceName}: Please send your service address or area.`;
  }
  return null;
}

function getInitialPrompt(serviceName, isWeb = false) {
  const lines = [
    `Thanks for contacting ${serviceName}!`,
    'Please answer all questions below so we can help as soon as possible',
    '1. Your Name:',
    '2. Your address:',
    '3. The service that you require (Plumbing/HVAC/Gas/etc.)',
    '4. Urgency Level: Immediate / Same Day / Schedule for future',
    '5. Details of the issue:',
  ];
  if (isWeb) lines.push('6. Your callback phone number:');
  lines.push('Please respond in one message and we will dispatch a trades professional.');
  return lines.join('\n');
}

/**
 * Handle one incoming SMS: prompt, or parse reply, or follow up once if info missing, then create request.
 * @returns { Promise<{ reply: string, requestId?: string }> }
 */
export async function handleSmsIntake(fromPhone, toPhone, messageText) {
  const config = await getEmergencyConfig();
  const serviceName = (config.service_line_name && config.service_line_name.trim()) || 'Emergency Dispatch';
  const rawText = (messageText || '').trim();
  const callbackPhone = String(fromPhone).trim();

  const session = await getSession(fromPhone, toPhone);

  // No session or first contact: send the single prompt (numbered list format)
  if (!session || session.step !== 'awaiting_details' && session.step !== 'awaiting_more') {
    await upsertSession(fromPhone, toPhone, 'awaiting_details', {});
    return { reply: getInitialPrompt(serviceName, false) };
  }

  // They replied after the initial prompt
  if (session.step === 'awaiting_details') {
    const parsed = parseSingleMessage(rawText, callbackPhone);
    const missing = getMissingItems(parsed, rawText, false);

    if (missing.length > 0) {
      const followUp = buildFollowUpMessage(serviceName, missing);
      if (followUp) {
        await upsertSession(fromPhone, toPhone, 'awaiting_more', parsed);
        return { reply: followUp };
      }
    }

    await deleteSession(fromPhone, toPhone);
    const request = await createServiceRequest({
      caller_name: parsed.caller_name || null,
      callback_phone: parsed.callback_phone,
      service_category: parsed.service_category,
      urgency_level: parsed.urgency_level,
      location: parsed.location || null,
      issue_summary: parsed.issue_summary || 'See request',
      intake_channel: 'sms',
    });
    startDispatch(request.id).catch((err) =>
      console.error('[Emergency SMS Intake] startDispatch error:', err?.message || err)
    );
    const reply = `${serviceName}: Thanks. We're contacting providers now. You may get a call or text shortly.`;
    return { reply, requestId: request.id };
  }

  // step === 'awaiting_more': they replied to our follow-up — merge and create request
  const first = session.data || {};
  const second = parseSingleMessage(rawText, callbackPhone);
  const merged = {
    caller_name: second.caller_name || first.caller_name || null,
    callback_phone: callbackPhone,
    service_category: second.service_category !== 'Other' ? second.service_category : (first.service_category || 'Other'),
    urgency_level: first.urgency_level || second.urgency_level || 'Immediate Emergency',
    location: second.location || first.location || null,
    issue_summary: rawText.length >= 10 ? issueSummaryOnly(rawText, second) : (first.issue_summary || second.issue_summary || 'See request'),
  };

  await deleteSession(fromPhone, toPhone);
  const request = await createServiceRequest({
    caller_name: merged.caller_name || null,
    callback_phone: merged.callback_phone,
    service_category: merged.service_category,
    urgency_level: merged.urgency_level,
    location: merged.location || null,
    issue_summary: merged.issue_summary || 'See request',
    intake_channel: 'sms',
  });
  startDispatch(request.id).catch((err) =>
    console.error('[Emergency SMS Intake] startDispatch error:', err?.message || err)
  );
  const reply = `${serviceName}: Thanks. We're contacting providers now. You may get a call or text shortly.`;
  return { reply, requestId: request.id };
}

const WEB_PREFIX = 'web:';

/**
 * Web chat intake: same conversation flow as SMS (prompt, parse, follow-up if missing, then create request + dispatch).
 * Does NOT send any SMS. SMS is only used elsewhere: (1) texting details to a trades professional when they request it,
 * (2) texting details to the customer when they request it on the callback call.
 * @param {string} sessionId - Client-provided session id (e.g. uuid)
 * @param {string} messageText - User's message
 * @returns { Promise<{ reply: string, requestId?: string }> }
 */
export async function handleWebIntake(sessionId, messageText) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('sessionId required');
  const fromPhone = WEB_PREFIX + sid;
  const toPhone = 'web';

  const config = await getEmergencyConfig();
  const serviceName = (config.service_line_name && config.service_line_name.trim()) || 'Emergency Dispatch';
  const rawText = (messageText || '').trim();

  const session = await getSession(fromPhone, toPhone);

  if (!rawText) {
    if (!session || session.step !== 'awaiting_details' && session.step !== 'awaiting_more') {
      await upsertSession(fromPhone, toPhone, 'awaiting_details', {});
    }
    return { reply: getInitialPrompt(serviceName, true) };
  }

  if (!session || session.step !== 'awaiting_details' && session.step !== 'awaiting_more') {
    await upsertSession(fromPhone, toPhone, 'awaiting_details', {});
    return { reply: getInitialPrompt(serviceName, true) };
  }

  const callbackPhone = extractPhoneFromMessage(rawText) || fromPhone;
  const parsed = parseSingleMessage(rawText, callbackPhone);

  if (session.step === 'awaiting_details') {
    const missing = getMissingItems(parsed, rawText, true);
    if (missing.length > 0) {
      const followUp = buildFollowUpMessage(serviceName, missing);
      if (followUp) {
        await upsertSession(fromPhone, toPhone, 'awaiting_more', parsed);
        return { reply: followUp };
      }
    }
    const effectivePhone = parsed.callback_phone.startsWith(WEB_PREFIX) ? null : parsed.callback_phone;
    if (!effectivePhone) {
      await deleteSession(fromPhone, toPhone);
      return { reply: `${serviceName}: We need your callback phone number to reach you. Please send your details again and include your phone number.` };
    }
    await deleteSession(fromPhone, toPhone);
    const request = await createServiceRequest({
      caller_name: parsed.caller_name || null,
      callback_phone: effectivePhone,
      service_category: parsed.service_category,
      urgency_level: parsed.urgency_level,
      location: parsed.location || null,
      issue_summary: parsed.issue_summary || 'See request',
      intake_channel: 'web',
    });
    startDispatch(request.id).catch((err) =>
      console.error('[Emergency Web Intake] startDispatch error:', err?.message || err)
    );
    return { reply: `${serviceName}: Thanks. We're contacting providers now. You may get a call or text shortly.`, requestId: request.id };
  }

  const first = session.data || {};
  const second = parseSingleMessage(rawText, callbackPhone);
  const merged = {
    caller_name: second.caller_name || first.caller_name || null,
    callback_phone: second.callback_phone.startsWith(WEB_PREFIX) ? (first.callback_phone?.startsWith(WEB_PREFIX) ? null : first.callback_phone) : second.callback_phone,
    service_category: second.service_category !== 'Other' ? second.service_category : (first.service_category || 'Other'),
    urgency_level: first.urgency_level || second.urgency_level || 'Immediate Emergency',
    location: second.location || first.location || null,
    issue_summary: rawText.length >= 10 ? issueSummaryOnly(rawText, second) : (first.issue_summary || second.issue_summary || 'See request'),
  };
  await deleteSession(fromPhone, toPhone);
  if (!merged.callback_phone) {
    return { reply: `${serviceName}: We need your callback phone number to reach you. Please start over and include your phone number.` };
  }
  const request = await createServiceRequest({
    caller_name: merged.caller_name || null,
    callback_phone: merged.callback_phone,
    service_category: merged.service_category,
    urgency_level: merged.urgency_level,
    location: merged.location || null,
    issue_summary: merged.issue_summary || 'See request',
    intake_channel: 'web',
  });
  startDispatch(request.id).catch((err) =>
    console.error('[Emergency Web Intake] startDispatch error:', err?.message || err)
  );
  return { reply: `${serviceName}: Thanks. We're contacting providers now. You may get a call or text shortly.`, requestId: request.id };
}
