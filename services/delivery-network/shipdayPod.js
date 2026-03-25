/**
 * Sync proof of delivery (signature + photos) from Shipday order details into delivery_requests.
 * @see https://docs.shipday.com/reference/delivery-order-object (proofOfDelivery)
 */
import { supabaseClient } from '../../config/database.js';
import { getShipdayCredentials } from './shipdayQuote.js';
import { extractShipdayCustomerTrackingUrl, extractBrokerDriverContactForPersistence } from './shipdayTracking.js';

/**
 * @param {object} order - Single order object from Shipday GET /orders/{orderNumber}
 * @returns {{ signatureUrl: string|null, photoUrls: string[], latitude: number|null, longitude: number|null }}
 * @see https://docs.shipday.com/reference/shipday-api — proofOfDelivery; support also cites assignedCarrier.carrierPhoto for driver POD image.
 */
export function extractProofOfDelivery(order) {
  let signatureUrl = null;
  let photoUrls = [];
  let latitude = null;
  let longitude = null;

  const pod = order?.proofOfDelivery;
  if (pod && typeof pod === 'object') {
    signatureUrl = typeof pod.signaturePath === 'string' && pod.signaturePath.trim() ? pod.signaturePath.trim() : null;
    photoUrls = Array.isArray(pod.imageUrls)
      ? pod.imageUrls.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim())
      : [];
    latitude = pod.latitude != null && Number.isFinite(Number(pod.latitude)) ? Number(pod.latitude) : null;
    longitude = pod.longitude != null && Number.isFinite(Number(pod.longitude)) ? Number(pod.longitude) : null;
  }

  const carrier = order?.assignedCarrier && typeof order.assignedCarrier === 'object' ? order.assignedCarrier : null;
  const carrierPhoto =
    (typeof carrier?.carrierPhoto === 'string' && carrier.carrierPhoto.trim()) ||
    (typeof carrier?.carrier_photo === 'string' && carrier.carrier_photo.trim()) ||
    '';
  if (carrierPhoto && !photoUrls.includes(carrierPhoto)) {
    photoUrls = [...photoUrls, carrierPhoto];
  }

  return { signatureUrl, photoUrls, latitude, longitude };
}

/**
 * Fetch Shipday order by order number (Tavari reference_number) and persist POD fields.
 * @param {string} deliveryRequestId - UUID
 * @returns {Promise<{ success: boolean, updated?: boolean, error?: string, proof?: object }>}
 */
export async function syncProofOfDeliveryFromShipday(deliveryRequestId) {
  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('id, reference_number')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request?.reference_number) {
    return { success: false, error: reqErr?.message || 'Request or reference_number not found' };
  }

  const { data: ddLog } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_id')
    .eq('delivery_request_id', deliveryRequestId)
    .order('attempt_order', { ascending: false })
    .limit(1);
  if (ddLog?.[0]?.broker_id === 'doordash') {
    return {
      success: false,
      error: 'This delivery was dispatched via DoorDash Drive. Use the DoorDash portal or tracking link for proof of delivery.',
    };
  }

  const orderNumber = String(request.reference_number).trim();
  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) {
    return { success: false, error: 'Shipday not configured' };
  }

  const axios = (await import('axios')).default;
  const url = `${baseUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(orderNumber)}`;
  try {
    const res = await axios.get(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${apiKey}` },
      timeout: 15000,
      validateStatus: (s) => s < 500,
    });
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
      return { success: false, error: `Shipday order not found or empty (${res.status})` };
    }
    const order = res.data[0];
    const { signatureUrl, photoUrls, latitude, longitude } = extractProofOfDelivery(order);
    const hasAny = signatureUrl || photoUrls.length > 0 || (latitude != null && longitude != null);
    const delivered = String(order?.orderStatus?.orderState || '').toUpperCase() === 'ALREADY_DELIVERED';

    const updates = { updated_at: new Date().toISOString() };
    // Only write POD when Shipday has proof (avoid wiping on early sync) or order is delivered with explicit empty POD
    if (hasAny) {
      updates.pod_signature_url = signatureUrl;
      updates.pod_photo_urls = photoUrls;
      updates.pod_latitude = latitude;
      updates.pod_longitude = longitude;
      updates.pod_captured_at = new Date().toISOString();
      updates.pod_source = 'shipday';
    } else if (delivered && order?.proofOfDelivery && typeof order.proofOfDelivery === 'object') {
      updates.pod_signature_url = null;
      updates.pod_photo_urls = [];
      updates.pod_latitude = null;
      updates.pod_longitude = null;
      updates.pod_captured_at = new Date().toISOString();
      updates.pod_source = 'shipday';
    }

    const trackingUrl = extractShipdayCustomerTrackingUrl(order);
    if (trackingUrl) {
      updates.carrier_tracking_url = trackingUrl;
    }

    const bc = extractBrokerDriverContactForPersistence(order);
    if (bc.phone) updates.carrier_contact_phone = bc.phone;
    if (bc.name) updates.carrier_contact_name = bc.name;

    const { error: upErr } = await supabaseClient.from('delivery_requests').update(updates).eq('id', deliveryRequestId);
    if (upErr) return { success: false, error: upErr.message };

    const orderState = order?.orderStatus?.orderState;
    return {
      success: true,
      updated: !!(hasAny || (delivered && order?.proofOfDelivery) || trackingUrl || bc.phone || bc.name),
      proof: {
        signature_url: signatureUrl,
        photo_urls: photoUrls,
        latitude,
        longitude,
        captured_at: hasAny ? updates.pod_captured_at || null : null,
        shipday_order_state: orderState,
      },
    };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Map Shipday orderStatus.orderState → Tavari delivery_requests.status (null = no change).
 * @param {string} orderState
 * @param {string} currentStatus
 * @returns {string|null}
 */
export function mapShipdayOrderStateToTavariStatus(orderState, currentStatus) {
  const s = String(orderState || '').toUpperCase();
  const terminal = ['Completed', 'Failed', 'Cancelled'];
  if (terminal.includes(currentStatus) && !['ALREADY_DELIVERED', 'FAILED_DELIVERY', 'INCOMPLETE'].includes(s)) {
    return null;
  }
  if (s === 'ALREADY_DELIVERED') return 'Completed';
  if (s === 'FAILED_DELIVERY') return 'Failed';
  if (s === 'INCOMPLETE') return 'Cancelled';
  if (['PICKED_UP', 'READY_TO_DELIVER'].includes(s)) {
    if (['Dispatched', 'Assigned'].includes(currentStatus)) return 'PickedUp';
    return null;
  }
  if (['STARTED', 'ACTIVE'].includes(s)) {
    if (['Dispatched', 'ChoosingCarrier', 'ConfirmingDelivery', 'New'].includes(currentStatus)) return 'Assigned';
    return null;
  }
  return null;
}

/**
 * Apply Shipday order JSON (same shape as GET /orders/{orderNumber} element) to delivery_requests:
 * status, carrier_tracking_url, proof of delivery when present.
 * @param {string} deliveryRequestId
 * @param {object} order
 * @param {{ activityOnStatusChange?: { source?: string, changed_by?: string|null, detail?: object|null } }} [options]
 * @returns {Promise<{ applied: boolean, status?: string, error?: string }>}
 */
export async function applyShipdayOrderSnapshot(deliveryRequestId, order, options = {}) {
  const activityOnStatusChange = options.activityOnStatusChange;
  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('id, reference_number, status')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request) {
    return { applied: false, error: reqErr?.message || 'Request not found' };
  }

  const { data: ddLog } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_id')
    .eq('delivery_request_id', deliveryRequestId)
    .order('attempt_order', { ascending: false })
    .limit(1);
  if (ddLog?.[0]?.broker_id !== 'shipday') {
    return { applied: false, error: 'Not a Shipday delivery' };
  }

  const orderState = String(order?.orderStatus?.orderState || '').toUpperCase();
  const trackingUrl = extractShipdayCustomerTrackingUrl(order);
  const newStatus = mapShipdayOrderStateToTavariStatus(orderState, request.status);

  const patch = { updated_at: new Date().toISOString() };
  if (trackingUrl) patch.carrier_tracking_url = trackingUrl;

  const { signatureUrl, photoUrls, latitude, longitude } = extractProofOfDelivery(order);
  const hasPod = !!(
    signatureUrl ||
    (Array.isArray(photoUrls) && photoUrls.length > 0) ||
    (latitude != null && longitude != null)
  );
  const delivered = orderState === 'ALREADY_DELIVERED';
  if (hasPod) {
    patch.pod_signature_url = signatureUrl;
    patch.pod_photo_urls = photoUrls;
    patch.pod_latitude = latitude;
    patch.pod_longitude = longitude;
    patch.pod_captured_at = new Date().toISOString();
    patch.pod_source = 'shipday';
  } else if (delivered && order?.proofOfDelivery && typeof order.proofOfDelivery === 'object') {
    patch.pod_signature_url = null;
    patch.pod_photo_urls = [];
    patch.pod_latitude = null;
    patch.pod_longitude = null;
    patch.pod_captured_at = new Date().toISOString();
    patch.pod_source = 'shipday';
  }

  const prevStatus = request.status;
  let statusChanged = false;
  if (newStatus && request.status !== newStatus) {
    patch.status = newStatus;
    statusChanged = true;
  }

  const meaningful =
    patch.carrier_tracking_url !== undefined ||
    patch.status !== undefined ||
    patch.carrier_contact_phone !== undefined ||
    patch.carrier_contact_name !== undefined ||
    hasPod ||
    (delivered && order?.proofOfDelivery && typeof order.proofOfDelivery === 'object');

  if (!meaningful) {
    return { applied: false };
  }

  const { error: upErr } = await supabaseClient.from('delivery_requests').update(patch).eq('id', deliveryRequestId);
  if (upErr) return { applied: false, error: upErr.message };

  if (statusChanged) {
    console.log('[ShipdayPod] Applied Shipday snapshot', orderState, '→', newStatus, deliveryRequestId);
    try {
      const { queueDeliveryStatusNotifications } = await import('./deliveryCustomerNotifications.js');
      queueDeliveryStatusNotifications(prevStatus, newStatus, deliveryRequestId, null, activityOnStatusChange);
    } catch (nErr) {
      console.warn('[ShipdayPod] status notify:', nErr?.message || nErr);
    }
    return { applied: true, status: newStatus };
  }
  return { applied: true };
}

/**
 * Sync delivery_requests.status from Shipday order state.
 * When an order is cancelled in Shipday (or deleted), we update our record to Cancelled.
 * Also maps ALREADY_DELIVERED→Completed, FAILED_DELIVERY→Failed, INCOMPLETE→Cancelled.
 * @param {string} deliveryRequestId - UUID
 * @returns {Promise<{ synced: boolean, status?: string, error?: string }>}
 */
export async function syncOrderStatusFromShipday(deliveryRequestId) {
  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('id, reference_number, status')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request?.reference_number) {
    return { synced: false, error: reqErr?.message || 'Request not found' };
  }

  const { data: ddLog } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_id')
    .eq('delivery_request_id', deliveryRequestId)
    .order('attempt_order', { ascending: false })
    .limit(1);
  if (ddLog?.[0]?.broker_id !== 'shipday') {
    return { synced: false, error: 'Not a Shipday delivery' };
  }

  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) return { synced: false, error: 'Shipday not configured' };

  const axios = (await import('axios')).default;
  const url = `${baseUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(String(request.reference_number).trim())}`;
  try {
    const res = await axios.get(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${apiKey}` },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });
    if (res.status === 404 || !Array.isArray(res.data) || res.data.length === 0) {
      if (
        !['Cancelled', 'Completed', 'Failed'].includes(request.status) &&
        !['ChoosingCarrier', 'ConfirmingDelivery'].includes(request.status)
      ) {
        await supabaseClient
          .from('delivery_requests')
          .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
          .eq('id', deliveryRequestId);
        console.log('[ShipdayPod] Order not found in Shipday → marked Cancelled', deliveryRequestId);
        try {
          const { queueDeliveryStatusNotifications } = await import('./deliveryCustomerNotifications.js');
          queueDeliveryStatusNotifications(request.status, 'Cancelled', deliveryRequestId, null, {
            source: 'system',
            changed_by: 'Shipday sync',
            detail: { reason: 'order_not_found_in_shipday' },
          });
        } catch (nErr) {
          console.warn('[ShipdayPod] cancelled notify:', nErr?.message || nErr);
        }
        return { synced: true, status: 'Cancelled' };
      }
      return { synced: false };
    }
    const order = res.data[0];
    const applied = await applyShipdayOrderSnapshot(deliveryRequestId, order);
    if (applied.error) return { synced: false, error: applied.error };
    if (applied.applied) {
      return { synced: true, ...(applied.status ? { status: applied.status } : {}) };
    }
    return { synced: false };
  } catch (e) {
    return { synced: false, error: e?.message || String(e) };
  }
}

const IN_FLIGHT_STATUSES = ['Dispatched', 'Assigned', 'PickedUp', 'ChoosingCarrier', 'ConfirmingDelivery'];
const SYNC_MAX_IN_FLIGHT = 10;
const SYNC_BATCH_DELAY_MS = 300;

/**
 * Sync status from Shipday for in-flight Shipday deliveries. Runs in background; does not throw.
 * @param {string|null} businessId - Scope to business (null = all)
 * @returns {Promise<{ synced: number }>}
 */
export async function syncInFlightShipdayOrders(businessId = null) {
  let q = supabaseClient
    .from('delivery_requests')
    .select('id')
    .in('status', IN_FLIGHT_STATUSES)
    .limit(SYNC_MAX_IN_FLIGHT * 2);
  if (businessId) q = q.eq('business_id', businessId);
  const { data: rows } = await q;
  if (!rows?.length) return { synced: 0 };

  const { data: logRows } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('delivery_request_id')
    .eq('broker_id', 'shipday')
    .in('delivery_request_id', rows.map((r) => r.id));
  const shipdayIds = new Set((logRows || []).map((r) => r.delivery_request_id));
  const toSync = rows.filter((r) => shipdayIds.has(r.id)).slice(0, SYNC_MAX_IN_FLIGHT);
  if (toSync.length === 0) return { synced: 0 };

  let synced = 0;
  for (const r of toSync) {
    const result = await syncOrderStatusFromShipday(r.id);
    if (result.synced) synced += 1;
    if (toSync.indexOf(r) < toSync.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SYNC_BATCH_DELAY_MS));
    }
  }
  return { synced };
}
