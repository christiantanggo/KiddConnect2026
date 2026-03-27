/**
 * Sync proof of delivery (signature + photos) from Shipday order details into delivery_requests.
 * @see https://docs.shipday.com/reference/delivery-order-object (proofOfDelivery)
 */
import { supabaseClient } from '../../config/database.js';
import { getShipdayCredentials } from './shipdayQuote.js';

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

    const { error: upErr } = await supabaseClient.from('delivery_requests').update(updates).eq('id', deliveryRequestId);
    if (upErr) return { success: false, error: upErr.message };

    const orderState = order?.orderStatus?.orderState;
    return {
      success: true,
      updated: hasAny || (delivered && order?.proofOfDelivery),
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
