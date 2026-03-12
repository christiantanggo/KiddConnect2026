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

  const namePatterns = [
    /(?:my\s+name\s+is|i'm|i\s+am|this\s+is|call\s+me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*[,.\-]/,
  ];
  for (const re of namePatterns) {
    const m = raw.match(re);
    if (m && m[1]) {
      const name = m[1].trim();
      if (name.length >= 2 && name.length <= 50 && !/^(hi|hello|help|please|thanks|the|a|an)$/i.test(name)) {
        result.caller_name = name;
        break;
      }
    }
  }

  result.issue_summary = issueSummaryOnly(raw, result);
  return result;
}

/**
 * Return list of missing items: 'issue' and/or 'location' if we should ask for them.
 */
function getMissingItems(parsed, rawText) {
  const missing = [];
  const raw = (rawText || '').trim();
  const hasIssueDescription = raw.length >= 25 || (ISSUE_KEYWORDS.test(raw) && raw.length >= 10);
  if (!hasIssueDescription) missing.push('issue');
  if (!parsed.location) missing.push('location');
  return missing;
}

function buildFollowUpMessage(serviceName, missing) {
  if (missing.includes('issue') && missing.includes('location')) {
    return `${serviceName}: We still need a brief description of the issue (e.g. burst pipe, no heat) and your address. Please reply with those.`;
  }
  if (missing.includes('issue')) {
    return `${serviceName}: Please describe the issue (e.g. burst pipe, no heat, clogged drain).`;
  }
  if (missing.includes('location')) {
    return `${serviceName}: Please send your service address or area.`;
  }
  return null;
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
    const reply = [
      `Thanks for contacting ${serviceName}!`,
      'Please answer all questions below so we can help as soon as possible',
      '1. Your Name:',
      '2. Your address:',
      '3. The service that you require (Plumbing/HVAC/Gas/etc.)',
      '4. Urgency Level: Immediate / Same Day / Schedule for future',
      '5. Details of the issue:',
      'Please respond in one message and we will dispatch a trades professional.',
    ].join('\n');
    return { reply };
  }

  // They replied after the initial prompt
  if (session.step === 'awaiting_details') {
    const parsed = parseSingleMessage(rawText, callbackPhone);
    const missing = getMissingItems(parsed, rawText);

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
