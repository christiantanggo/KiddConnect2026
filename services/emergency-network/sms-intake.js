/**
 * Emergency Network SMS intake: collect same info as phone (name, service type, urgency, location, issue)
 * before creating the service request and starting dispatch. State stored in emergency_sms_intake_sessions.
 */
import { supabaseClient } from '../../config/database.js';
import { getEmergencyConfig } from './config.js';
import { createServiceRequest } from './intake.js';
import { startDispatch } from './dispatch.js';

const STEPS = ['name', 'service_type', 'urgency', 'location', 'issue'];
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h; older sessions treated as new

/**
 * Get existing session or null. Returns null if expired.
 */
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
  return { id: data.id, step: data.step || 'name', data: data.data || {} };
}

/**
 * Create or update session. step and data are written; updated_at set to now.
 */
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

/**
 * Delete session (after intake complete or cancel).
 */
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

function parseName(text) {
  const t = (text || '').trim();
  if (!t) return null;
  if (/^\s*(skip|n\/a|none)\s*$/i.test(t)) return null;
  const name = t.slice(0, 100).trim();
  if (/^\d+$/.test(name)) return null;
  return name || null;
}

function parseServiceCategory(text) {
  const t = (text || '').trim().toLowerCase();
  if (/^\s*(skip|n\/a|none)\s*$/i.test(t)) return 'Other';
  if (/^1\s*$|plumb|pipe|drain|leak|water/i.test(t)) return 'Plumbing';
  if (/^2\s*$|hvac|heat|ac|air\s*cond|furnace/i.test(t)) return 'HVAC';
  if (/^3\s*$|gas\b|gas\s*line|gas\s*leak/i.test(t)) return 'Gas';
  return 'Other';
}

function parseUrgency(text) {
  const t = (text || '').trim().toLowerCase();
  if (/^\s*(skip|n\/a|none)\s*$/i.test(t)) return 'Immediate Emergency';
  if (/^1\s*$|emergency|urgent|asap|now|immediate|right\s*away/i.test(t)) return 'Immediate Emergency';
  if (/^2\s*$|same\s*day|today/i.test(t)) return 'Same Day';
  return 'Schedule';
}

/**
 * Handle one incoming SMS: either start new intake or process next step.
 * @returns { Promise<{ reply: string, requestId?: string }> } reply to send to customer; requestId if intake completed.
 */
export async function handleSmsIntake(fromPhone, toPhone, messageText) {
  const config = await getEmergencyConfig();
  const serviceName = (config.service_line_name && config.service_line_name.trim()) || 'Emergency Dispatch';
  const rawText = (messageText || '').trim();

  let session = await getSession(fromPhone, toPhone);

  // New conversation: first message starts intake (ask name)
  if (!session) {
    await upsertSession(fromPhone, toPhone, 'name', {});
    const reply = `${serviceName}: Hi. To connect you with a provider we need a few details. What's your name? (Reply "skip" to leave blank)`;
    return { reply };
  }

  const step = session.step;
  const data = { ...(session.data || {}) };

  if (step === 'name') {
    data.caller_name = parseName(rawText);
    await upsertSession(fromPhone, toPhone, 'service_type', data);
    const reply = `What type of service? Reply 1 Plumbing, 2 HVAC, 3 Gas, 4 Other`;
    return { reply };
  }

  if (step === 'service_type') {
    data.service_category = parseServiceCategory(rawText);
    await upsertSession(fromPhone, toPhone, 'urgency', data);
    const reply = `How urgent? Reply 1 Emergency now, 2 Same day, 3 Schedule later`;
    return { reply };
  }

  if (step === 'urgency') {
    data.urgency_level = parseUrgency(rawText);
    await upsertSession(fromPhone, toPhone, 'location', data);
    const reply = `What's the service address or area? (Reply "skip" if not needed)`;
    return { reply };
  }

  if (step === 'location') {
    data.location = /^\s*(skip|n\/a|none)\s*$/i.test(rawText) ? null : rawText.slice(0, 500).trim() || null;
    await upsertSession(fromPhone, toPhone, 'issue', data);
    const reply = `Briefly describe the issue (e.g. burst pipe, no heat). Reply "skip" to leave blank.`;
    return { reply };
  }

  if (step === 'issue') {
    data.issue_summary = /^\s*(skip|n\/a|none)\s*$/i.test(rawText)
      ? 'See request'
      : (rawText || '').slice(0, 2000).trim() || 'See request';
    await deleteSession(fromPhone, toPhone);
    const request = await createServiceRequest({
      caller_name: data.caller_name || null,
      callback_phone: String(fromPhone).trim(),
      service_category: data.service_category || 'Other',
      urgency_level: data.urgency_level || 'Immediate Emergency',
      location: data.location || null,
      issue_summary: data.issue_summary || null,
      intake_channel: 'sms',
    });
    startDispatch(request.id).catch((err) =>
      console.error('[Emergency SMS Intake] startDispatch error:', err?.message || err)
    );
    const reply = `${serviceName}: Thanks. We're contacting providers now. You may get a call or text shortly.`;
    return { reply, requestId: request.id };
  }

  await deleteSession(fromPhone, toPhone);
  return { reply: `${serviceName}: Something went wrong. Please text again to start over.` };
}
