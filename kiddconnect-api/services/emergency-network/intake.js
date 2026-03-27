/**
 * Emergency Network intake: create service request from form or SMS.
 * Does not touch existing agent.
 */
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

const SERVICE_CATEGORIES = ['Plumbing', 'HVAC', 'Gas', 'Other'];
const URGENCY_LEVELS = ['Immediate Emergency', 'Same Day', 'Schedule'];

function clampCategory(cat) {
  if (SERVICE_CATEGORIES.includes(cat)) return cat;
  return 'Other';
}

function clampUrgency(u) {
  if (URGENCY_LEVELS.includes(u)) return u;
  if (u === 'Schedule Service') return 'Schedule';
  if (/immediate|emergency|urgent/i.test(u)) return 'Immediate Emergency';
  if (/same.?day|today/i.test(u)) return 'Same Day';
  return 'Schedule';
}

/**
 * Create a service request (form or SMS intake).
 * @param {Object} params - caller_name, callback_phone, service_category, urgency_level, location, issue_summary, preferred_contact_method, access_notes, intake_channel, custom_intake, intake_transcript (optional; from phone intake — enables transcript link in provider SMS/email)
 */
export async function createServiceRequest(params) {
  const {
    caller_name = null,
    callback_phone,
    service_category = 'Other',
    urgency_level = 'Schedule',
    location = null,
    issue_summary = null,
    preferred_contact_method = null,
    access_notes = null,
    intake_channel = 'form',
    custom_intake = null,
    intake_transcript = null,
  } = params;

  if (!callback_phone || !String(callback_phone).trim()) {
    throw new Error('callback_phone is required');
  }

  const payload = {
    caller_name: caller_name?.trim() || null,
    callback_phone: String(callback_phone).trim(),
    service_category: clampCategory(service_category),
    urgency_level: clampUrgency(urgency_level),
    location: location?.trim() || null,
    issue_summary: issue_summary?.trim() || null,
    preferred_contact_method: preferred_contact_method?.trim() || null,
    access_notes: access_notes?.trim() || null,
    intake_channel: intake_channel === 'sms' ? 'sms' : intake_channel === 'phone' ? 'phone' : 'form',
    status: 'New',
    updated_at: new Date().toISOString(),
  };
  if (custom_intake && typeof custom_intake === 'object' && Object.keys(custom_intake).length > 0) {
    payload.custom_intake = custom_intake;
  }
  if (intake_transcript != null && String(intake_transcript).trim()) {
    payload.intake_transcript = String(intake_transcript).trim().slice(0, 50000);
    payload.transcript_access_token = crypto.randomBytes(32).toString('hex');
  }

  const { data, error } = await supabaseClient
    .from('emergency_service_requests')
    .insert(payload)
    .select('id, status, created_at')
    .single();

  if (error) throw error;
  // Return transcript_access_token from payload when set (column may not exist if migration not run)
  return payload.transcript_access_token
    ? { ...data, transcript_access_token: payload.transcript_access_token }
    : data;
}

/**
 * Create a service request from an inbound SMS (minimal info).
 */
export async function createServiceRequestFromSms(fromPhone, messageText) {
  return createServiceRequest({
    callback_phone: fromPhone,
    issue_summary: (messageText || '').slice(0, 2000),
    urgency_level: 'Immediate Emergency',
    service_category: 'Other',
    intake_channel: 'sms',
  });
}
