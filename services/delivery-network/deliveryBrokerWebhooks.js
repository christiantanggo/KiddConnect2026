/**
 * Inbound webhooks from delivery brokers (Shipday, DoorDash Drive) to push status without waiting for poll.
 * DoorDash: https://developer.doordash.com/en-US/docs/drive/reference/webhooks/
 * Shipday: no single public spec; we accept order-shaped JSON and verify SHIPDAY_WEBHOOK_SECRET or Basic api key.
 */
import { timingSafeEqual } from 'crypto';
import { supabaseClient } from '../../config/database.js';
import { getShipdayCredentials } from './shipdayQuote.js';
import { applyShipdayOrderSnapshot } from './shipdayPod.js';

const LOG = '[DeliveryBrokerWebhooks]';

function safeTimingEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyDoorDashWebhookAuth(req) {
  const user = process.env.DOORDASH_WEBHOOK_BASIC_USER;
  const pass = process.env.DOORDASH_WEBHOOK_BASIC_PASSWORD;
  if (!user || !pass) {
    console.warn(`${LOG} DoorDash webhook: set DOORDASH_WEBHOOK_BASIC_USER and DOORDASH_WEBHOOK_BASIC_PASSWORD`);
    return false;
  }
  const expected = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  const got = req.get('authorization') || req.get('Authorization') || '';
  return safeTimingEqualStrings(expected, got);
}

async function verifyShipdayWebhook(req) {
  const secret = process.env.SHIPDAY_WEBHOOK_SECRET && String(process.env.SHIPDAY_WEBHOOK_SECRET).trim();
  if (secret) {
    const hdr =
      req.get('x-shipday-webhook-secret') ||
      req.get('x-webhook-secret') ||
      req.get('x-shipday-signature') ||
      '';
    return safeTimingEqualStrings(secret, String(hdr).trim());
  }
  const { apiKey } = await getShipdayCredentials();
  if (!apiKey) {
    console.warn(`${LOG} Shipday webhook: set SHIPDAY_WEBHOOK_SECRET or configure Shipday API key`);
    return false;
  }
  const expected = `Basic ${apiKey}`;
  const got = req.get('authorization') || '';
  return safeTimingEqualStrings(expected.trim(), got.trim());
}

/**
 * Normalize Zapier / custom payloads toward Shipday order object shape.
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeShipdayWebhookBody(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') return raw[0];
  const o = raw;
  if (o.orderStatus?.orderState && (o.orderNumber || o.reference_number)) {
    return o.orderNumber ? o : { ...o, orderNumber: o.reference_number };
  }
  if (o.orderNumber && o.orderState) {
    return { ...o, orderStatus: { ...(o.orderStatus && typeof o.orderStatus === 'object' ? o.orderStatus : {}), orderState: o.orderState } };
  }
  if (o.orderNumber && typeof o.status === 'string') {
    return { ...o, orderStatus: { orderState: o.status } };
  }
  if (o.order_id != null && o.orderStatus?.orderState) {
    return { ...o, orderNumber: String(o.order_id) };
  }
  if (o.orderNumber || o.reference_number) return o.reference_number && !o.orderNumber ? { ...o, orderNumber: o.reference_number } : o;
  return null;
}

async function resolveDeliveryRequestIdForShipdayWebhook(order) {
  const orderNumber = order?.orderNumber != null ? String(order.orderNumber).trim() : '';
  const numericId =
    order?.orderId != null
      ? String(order.orderId).trim()
      : order?.id != null && typeof order.id !== 'object'
        ? String(order.id).trim()
        : '';

  if (orderNumber) {
    const { data: row } = await supabaseClient
      .from('delivery_requests')
      .select('id')
      .eq('reference_number', orderNumber)
      .maybeSingle();
    if (row?.id) return row.id;
  }

  if (numericId) {
    const { data: logs } = await supabaseClient
      .from('delivery_dispatch_log')
      .select('delivery_request_id')
      .eq('broker_id', 'shipday')
      .eq('broker_job_id', numericId)
      .order('attempt_order', { ascending: false })
      .limit(1);
    if (logs?.[0]?.delivery_request_id) return logs[0].delivery_request_id;
  }

  return null;
}

function mapDoorDashCancelToStatus(cancellationReason) {
  const r = String(cancellationReason || '')
    .toLowerCase()
    .trim();
  const cancelled = new Set([
    'cancel_by_merchant',
    'cancel_by_order_placer',
    'customer_requested_other',
    'test_order',
    'duplicate_order',
  ]);
  if (cancelled.has(r)) return 'Cancelled';
  return 'Failed';
}

/**
 * @param {object} body - DoorDash webhook JSON
 * @returns {Promise<{ updated: boolean, delivery_request_id?: string, note?: string }>}
 */
export async function applyDoorDashWebhookPayload(body) {
  const externalId = body.external_delivery_id != null ? String(body.external_delivery_id).trim() : '';
  const eventName = body.event_name != null ? String(body.event_name).trim() : '';
  if (!externalId || !eventName) {
    return { updated: false, note: 'missing external_delivery_id or event_name' };
  }

  const { data: logs } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('delivery_request_id')
    .eq('broker_id', 'doordash')
    .eq('broker_job_id', externalId)
    .order('attempt_order', { ascending: false })
    .limit(1);

  const deliveryRequestId = logs?.[0]?.delivery_request_id;
  if (!deliveryRequestId) {
    console.warn(`${LOG} DoorDash webhook: no dispatch log for external_delivery_id`, externalId);
    return { updated: false, note: 'unknown_external_delivery_id' };
  }

  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('id, status')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request) {
    return { updated: false, note: 'request_not_found' };
  }

  const prev = request.status;
  const terminal = ['Completed', 'Failed', 'Cancelled'];
  const patch = { updated_at: new Date().toISOString() };
  let newStatus = null;

  const track = body.tracking_url;
  if (typeof track === 'string' && track.trim() && /^https?:\/\//i.test(track.trim())) {
    patch.carrier_tracking_url = track.trim();
  }

  const dashPhoneDrop =
    typeof body.dasher_dropoff_phone_number === 'string' && String(body.dasher_dropoff_phone_number).trim()
      ? String(body.dasher_dropoff_phone_number).trim()
      : null;
  const dashPhonePickup =
    typeof body.dasher_pickup_phone_number === 'string' && String(body.dasher_pickup_phone_number).trim()
      ? String(body.dasher_pickup_phone_number).trim()
      : null;
  const dashPhone = dashPhoneDrop || dashPhonePickup;
  const dashName =
    typeof body.dasher_name === 'string' && String(body.dasher_name).trim()
      ? String(body.dasher_name).trim()
      : null;
  if (dashPhone) patch.carrier_contact_phone = dashPhone;
  if (dashName) patch.carrier_contact_name = dashName;

  if (eventName === 'DASHER_CONFIRMED' || eventName === 'DASHER_CONFIRMED_PICKUP_ARRIVAL') {
    if (prev === 'Dispatched') newStatus = 'Assigned';
  } else if (eventName === 'DASHER_PICKED_UP') {
    if (prev === 'Dispatched' || prev === 'Assigned') newStatus = 'PickedUp';
  } else if (eventName === 'DASHER_DROPPED_OFF') {
    if (!terminal.includes(prev)) newStatus = 'Completed';
    const photos = [];
    const sig =
      typeof body.dropoff_signature_image_url === 'string' && body.dropoff_signature_image_url.trim()
        ? body.dropoff_signature_image_url.trim()
        : null;
    const img =
      typeof body.dropoff_verification_image_url === 'string' && body.dropoff_verification_image_url.trim()
        ? body.dropoff_verification_image_url.trim()
        : null;
    if (img) photos.push(img);
    if (sig || photos.length > 0) {
      patch.pod_signature_url = sig;
      patch.pod_photo_urls = photos;
      patch.pod_captured_at = new Date().toISOString();
      patch.pod_source = 'doordash';
      const loc = body.dasher_location;
      if (loc && typeof loc === 'object') {
        const lat = loc.lat != null ? Number(loc.lat) : null;
        const lng = loc.lng != null ? Number(loc.lng) : null;
        if (lat != null && Number.isFinite(lat)) patch.pod_latitude = lat;
        if (lng != null && Number.isFinite(lng)) patch.pod_longitude = lng;
      }
    }
  } else if (eventName === 'DELIVERY_CANCELLED') {
    if (!terminal.includes(prev)) {
      newStatus = mapDoorDashCancelToStatus(body.cancellation_reason);
    }
  } else if (
    eventName === 'DELIVERY_RETURN_INITIALIZED' ||
    eventName === 'DELIVERY_RETURNED' ||
    eventName === 'DASHER_CONFIRMED_RETURN_ARRIVAL'
  ) {
    if (!terminal.includes(prev)) newStatus = 'Failed';
  }

  if (newStatus && prev !== newStatus) {
    patch.status = newStatus;
  }

  const meaningful =
    patch.carrier_tracking_url !== undefined ||
    patch.status !== undefined ||
    patch.carrier_contact_phone !== undefined ||
    patch.carrier_contact_name !== undefined ||
    patch.pod_signature_url !== undefined ||
    (patch.pod_photo_urls !== undefined && Array.isArray(patch.pod_photo_urls));

  if (!meaningful) {
    return { updated: false, delivery_request_id: deliveryRequestId, note: 'no_op_for_event' };
  }

  const { error: upErr } = await supabaseClient.from('delivery_requests').update(patch).eq('id', deliveryRequestId);
  if (upErr) {
    console.error(`${LOG} DoorDash DB update failed`, upErr.message);
    throw new Error(upErr.message);
  }

  if (newStatus && prev !== newStatus) {
    try {
      const { queueDeliveryStatusNotifications } = await import('./deliveryCustomerNotifications.js');
      queueDeliveryStatusNotifications(prev, newStatus, deliveryRequestId, null, {
        source: 'webhook',
        changed_by: 'DoorDash',
        detail: { event_name: body.event_name },
      });
    } catch (nErr) {
      console.warn(`${LOG} DoorDash notify:`, nErr?.message || nErr);
    }
  }

  return { updated: true, delivery_request_id: deliveryRequestId, status: newStatus || prev };
}

export async function handleDoorDashDriveWebhook(req, res) {
  try {
    if (!verifyDoorDashWebhookAuth(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    const result = await applyDoorDashWebhookPayload(body);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error(`${LOG} DoorDash handler error`, e?.message || e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

export async function handleShipdayBrokerWebhook(req, res) {
  try {
    if (!(await verifyShipdayWebhook(req))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const order = normalizeShipdayWebhookBody(req.body);
    if (!order) {
      return res.status(400).json({ error: 'Unrecognized Shipday payload shape' });
    }
    const deliveryRequestId = await resolveDeliveryRequestIdForShipdayWebhook(order);
    if (!deliveryRequestId) {
      console.warn(`${LOG} Shipday webhook: could not resolve delivery request`, {
        orderNumber: order?.orderNumber,
        hasOrderState: !!order?.orderStatus?.orderState,
      });
      return res.status(200).json({ ok: true, applied: false, note: 'unknown_order' });
    }
    const applied = await applyShipdayOrderSnapshot(deliveryRequestId, order, {
      activityOnStatusChange: { source: 'webhook', changed_by: 'Shipday', detail: { broker: 'shipday' } },
    });
    if (applied.error) {
      console.warn(`${LOG} Shipday apply error`, applied.error);
      return res.status(200).json({ ok: true, applied: false, note: applied.error });
    }
    return res.status(200).json({
      ok: true,
      applied: applied.applied,
      ...(applied.status ? { status: applied.status } : {}),
    });
  } catch (e) {
    console.error(`${LOG} Shipday handler error`, e?.message || e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
