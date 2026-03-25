/**
 * Delivery Network intake: create delivery request from form, SMS, phone, or chat.
 */
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

const PRIORITY_LEVELS = ['Immediate', 'Same Day', 'Schedule'];

function clampPriority(p) {
  if (PRIORITY_LEVELS.includes(p)) return p;
  if (/immediate|urgent|asap/i.test(p)) return 'Immediate';
  if (/same.?day|today/i.test(p)) return 'Same Day';
  return 'Schedule';
}

/** Generate short unique reference number (e.g. DR-A1B2C3). */
function generateReferenceNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'DR-';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += chars[bytes[i] % chars.length];
  return s;
}

/**
 * Create a delivery request.
 * @param {Object} params - business_id (optional for individuals), caller_phone, callback_phone, pickup/delivery/package fields, priority, scheduled_date (YYYY-MM-DD), scheduled_time (HH:mm or HH:mm:ss), intake_channel, intake_transcript, etc.
 */
export async function createDeliveryRequest(params) {
  const {
    business_id = null,
    caller_phone = null,
    callback_phone,
    reference_number = generateReferenceNumber(),
    pickup_address = null,
    pickup_city = null,
    pickup_province = null,
    pickup_postal_code = null,
    pickup_contact = null,
    pickup_callback = null,
    pickup_location_id = null,
    delivery_type = 'residential',
    delivery_business_name = null,
    delivery_address,
    delivery_city = null,
    delivery_province = null,
    delivery_postal_code = null,
    recipient_name = null,
    recipient_phone = null,
    package_description = null,
    package_size = null,
    package_weight = null,
    special_instructions = null,
    priority = 'Schedule',
    scheduled_date = null,
    scheduled_time = null,
    intake_channel = 'form',
    payment_status = null,
    intake_transcript = null,
    amount_quoted_cents = null,
    quoted_on_demand_provider = null,
  } = params;

  if (!callback_phone || !String(callback_phone).trim()) {
    throw new Error('callback_phone is required');
  }
  if (!delivery_address || !String(delivery_address).trim()) {
    throw new Error('delivery_address is required');
  }

  const payload = {
    business_id: business_id || null,
    caller_phone: caller_phone?.trim() || null,
    callback_phone: String(callback_phone).trim(),
    reference_number: String(reference_number).trim().slice(0, 20),
    pickup_address: pickup_address?.trim() || null,
    pickup_city: pickup_city?.trim() || null,
    pickup_province: pickup_province?.trim() || null,
    pickup_postal_code: pickup_postal_code?.trim() || null,
    pickup_contact: pickup_contact?.trim() || null,
    pickup_callback: pickup_callback?.trim() || null,
    pickup_location_id: pickup_location_id || null,
    delivery_type: delivery_type === 'business' ? 'business' : 'residential',
    delivery_business_name: delivery_business_name?.trim() || null,
    delivery_address: String(delivery_address).trim(),
    delivery_city: delivery_city?.trim() || null,
    delivery_province: delivery_province?.trim() || null,
    delivery_postal_code: delivery_postal_code?.trim() || null,
    recipient_name: recipient_name?.trim() || null,
    recipient_phone: recipient_phone?.trim() || null,
    package_description: package_description?.trim() || null,
    package_size: package_size?.trim() || null,
    package_weight: package_weight?.trim() || null,
    special_instructions: special_instructions?.trim() || null,
    priority: clampPriority(priority),
    scheduled_date: scheduled_date && String(scheduled_date).trim() ? String(scheduled_date).trim().slice(0, 10) : null,
    scheduled_time: scheduled_time && String(scheduled_time).trim() ? String(scheduled_time).trim().slice(0, 10) : null,
    status: 'New',
    intake_channel: ['phone', 'sms', 'form', 'chat', 'api'].includes(intake_channel) ? intake_channel : 'form',
    payment_status: payment_status || null,
    updated_at: new Date().toISOString(),
    customer_notify_token: crypto.randomBytes(32).toString('hex'),
  };
  if (amount_quoted_cents != null && Number.isFinite(amount_quoted_cents) && amount_quoted_cents >= 0) {
    payload.amount_quoted_cents = Math.round(amount_quoted_cents);
  }
  if (quoted_on_demand_provider != null && String(quoted_on_demand_provider).trim()) {
    payload.quoted_on_demand_provider = String(quoted_on_demand_provider).trim().slice(0, 50);
  }
  if (intake_transcript != null && String(intake_transcript).trim()) {
    payload.intake_transcript = String(intake_transcript).trim().slice(0, 50000);
    payload.transcript_access_token = crypto.randomBytes(32).toString('hex');
  }

  const { data, error } = await supabaseClient
    .from('delivery_requests')
    .insert(payload)
    .select('id, status, reference_number, created_at')
    .single();

  if (error) throw error;
  try {
    const { logRequestActivity } = await import('./activity.js');
    await logRequestActivity(data.id, 'request_created', {
      to_status: 'New',
      source: 'system',
      detail: { intake_channel: payload.intake_channel },
    });
  } catch {
    /* activity table optional until migration */
  }
  return payload.transcript_access_token
    ? { ...data, transcript_access_token: payload.transcript_access_token }
    : data;
}

/**
 * @deprecated Use `handleSmsIntake` in `sms-intake.js` (Telnyx → bulkSMS webhook). Kept for tests/scripts.
 */
export async function createDeliveryRequestFromSms(fromPhone, messageText, businessId = null) {
  return createDeliveryRequest({
    business_id: businessId,
    callback_phone: fromPhone,
    delivery_address: '(Address to be collected)',
    package_description: (messageText || '').slice(0, 2000),
    priority: 'Immediate',
    intake_channel: 'sms',
  });
}
