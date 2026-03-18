/**
 * Delivery Network dispatch: send delivery request to broker(s).
 * Phase 1: one broker (Shipday). When Shipday is configured, creates a real order on Shipday via POST /orders.
 * Broker API keys can be set in Admin → Last-Mile Delivery → Settings → Delivery company APIs, or via env DELIVERY_SHIPDAY_API_KEY.
 */
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull } from './config.js';
import { buildShipdayOrderPayload } from './shipdayOrder.js';

const DEFAULT_BROKER_ID = 'shipday'; // or 'stub' when no API key

/** Build full address for Shipday from structured fields (street, city, province, postal code). */
function buildFullAddress(street, city, province, postalCode) {
  const s = street && String(street).trim();
  const c = city && String(city).trim();
  const p = province && String(province).trim();
  const z = postalCode && String(postalCode).trim();
  if (s && (c || p || z)) {
    const rest = [c, [p, z].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return rest ? `${s}, ${rest}` : s;
  }
  return s || null;
}

function buildFullPickupAddress(request) {
  return buildFullAddress(
    request.pickup_address,
    request.pickup_city,
    request.pickup_province,
    request.pickup_postal_code
  ) || 'Pickup address TBD';
}

function buildFullDeliveryAddress(request) {
  return buildFullAddress(
    request.delivery_address,
    request.delivery_city,
    request.delivery_province,
    request.delivery_postal_code
  ) || String(request.delivery_address || '').trim() || 'Address TBD';
}

/**
 * Resolve whether we have a valid Shipday (or first enabled broker) API key: from delivery config (UI) or env.
 */
async function getEffectiveBrokerId() {
  const config = await getDeliveryConfigFull();
  const shipday = config?.brokers?.shipday;
  if (shipday?.enabled && shipday?.api_key) return DEFAULT_BROKER_ID;
  if (process.env.DELIVERY_SHIPDAY_API_KEY) return DEFAULT_BROKER_ID;
  return 'stub';
}

/**
 * Get Shipday API key for use when calling Shipday API. Prefers UI config, then env.
 */
export async function getShipdayApiKey() {
  const config = await getDeliveryConfigFull();
  const shipday = config?.brokers?.shipday;
  if (shipday?.enabled && shipday?.api_key) return shipday.api_key;
  return process.env.DELIVERY_SHIPDAY_API_KEY || null;
}

/**
 * Start dispatch for a delivery request: create broker job and log attempt.
 * If no Shipday API key (config or env) is set, stub: create log row and mark as dispatched after short delay.
 */
export async function startDispatch(deliveryRequestId) {
  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('*')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request) {
    console.warn('[DeliveryNetwork] startDispatch: request not found', deliveryRequestId);
    return;
  }
  if (!['New'].includes(request.status)) {
    console.warn('[DeliveryNetwork] startDispatch: request already in progress', deliveryRequestId, request.status);
    return;
  }

  await supabaseClient
    .from('delivery_requests')
    .update({ status: 'Contacting', updated_at: new Date().toISOString() })
    .eq('id', deliveryRequestId);

  const brokerId = await getEffectiveBrokerId();
  const { data: logRow, error: logErr } = await supabaseClient
    .from('delivery_dispatch_log')
    .insert({
      delivery_request_id: deliveryRequestId,
      broker_id: brokerId,
      attempt_order: 1,
      result: 'pending',
      attempted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (logErr) {
    console.error('[DeliveryNetwork] startDispatch: failed to insert dispatch log', logErr.message);
    return;
  }

  if (brokerId === 'stub') {
    // Stub: after a short delay, mark as dispatched (simulate broker accepting).
    setImmediate(async () => {
      await supabaseClient
        .from('delivery_dispatch_log')
        .update({
          result: 'accepted',
          broker_job_id: `stub-${deliveryRequestId.slice(0, 8)}`,
          attempted_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
      await supabaseClient
        .from('delivery_requests')
        .update({ status: 'Dispatched', updated_at: new Date().toISOString() })
        .eq('id', deliveryRequestId);
      console.log('[DeliveryNetwork] startDispatch: stub accepted', deliveryRequestId);
    });
    return;
  }

  // Call Shipday API to create the delivery order so it appears in Shipday (scheduled or immediate).
  const { getShipdayCredentials } = await import('./shipdayQuote.js');
  const axios = (await import('axios')).default;
  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) {
    console.warn('[DeliveryNetwork] startDispatch: Shipday API key missing; cannot create order');
    await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRow.id);
    await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
    return;
  }

  const config = await getDeliveryConfigFull();
  const pickupPhone = Array.isArray(config?.delivery_phone_numbers) && config.delivery_phone_numbers.length > 0
    ? String(config.delivery_phone_numbers[0]).trim()
    : null;
  const pickupAddress = buildFullPickupAddress(request);

  // Resolve business timezone for Schedule/Same Day (date and time in their timezone).
  let businessTimezone = 'America/New_York';
  if (request.business_id) {
    const { data: biz } = await supabaseClient.from('businesses').select('timezone').eq('id', request.business_id).single();
    if (biz?.timezone && String(biz.timezone).trim()) businessTimezone = String(biz.timezone).trim();
  }

  /** Normalize time string to HH:mm:ss for Shipday. */
  function toHHmmss(s) {
    if (!s || typeof s !== 'string') return null;
    const t = s.trim();
    const parts = t.split(':').map((x) => x.padStart(2, '0'));
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}:${(parts[2] || '00').slice(0, 2)}`;
    return null;
  }

  /** Tomorrow's date (YYYY-MM-DD) in the given IANA timezone. */
  function tomorrowInTz(timezone) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);
  }

  /** Today's date (YYYY-MM-DD) in the given IANA timezone. */
  function todayInTz(timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  const now = new Date();
  const isImmediate = (request.priority || '').toLowerCase() === 'immediate';
  const isSameDay = (request.priority || '').toLowerCase() === 'same day';
  const isSchedule = (request.priority || '').toLowerCase() === 'schedule';
  let expectedDate;
  let pickupTime = '12:00:00';
  let deliveryTime = '13:00:00';

  if (isImmediate) {
    expectedDate = now.toISOString().slice(0, 10);
    const p = new Date(now.getTime() + 30 * 60 * 1000);
    const d = new Date(now.getTime() + 60 * 60 * 1000);
    pickupTime = `${String(p.getUTCHours()).padStart(2, '0')}:${String(p.getUTCMinutes()).padStart(2, '0')}:00`;
    deliveryTime = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:00`;
  } else if (isSameDay) {
    expectedDate = todayInTz(businessTimezone);
    pickupTime = '14:00:00';
    deliveryTime = '15:00:00';
  } else if (isSchedule && request.scheduled_date && String(request.scheduled_date).trim()) {
    // User chose a delivery date (and optionally time). Interpret in business timezone.
    expectedDate = String(request.scheduled_date).trim().slice(0, 10);
    const normalized = toHHmmss(request.scheduled_time);
    if (normalized) {
      deliveryTime = normalized;
      // Pickup 1 hour before delivery (simple string math for HH:mm:ss).
      const [h, m] = deliveryTime.split(':').map(Number);
      const pickupH = h - 1 >= 0 ? h - 1 : 23;
      pickupTime = `${String(pickupH).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  } else {
    // Schedule without scheduled_date: tomorrow in business timezone at 12:00 / 13:00
    expectedDate = tomorrowInTz(businessTimezone);
    pickupTime = '12:00:00';
    deliveryTime = '13:00:00';
  }

  const deliveryAddress = buildFullDeliveryAddress(request);
  const orderPayload = buildShipdayOrderPayload({
    orderNumber: (request.reference_number && String(request.reference_number).trim()) || `tavari-${deliveryRequestId.slice(0, 8)}`,
    customerName: (request.recipient_name && String(request.recipient_name).trim()) || 'Customer',
    customerAddress: deliveryAddress,
    customerPhoneNumber: (request.callback_phone && String(request.callback_phone).trim()) || (request.recipient_phone && String(request.recipient_phone).trim()) || null,
    restaurantName: 'Pickup',
    restaurantAddress: pickupAddress,
    restaurantPhoneNumber: pickupPhone,
    expectedDeliveryDate: expectedDate,
    expectedPickupTime: pickupTime,
    expectedDeliveryTime: deliveryTime,
    deliveryFee: 0,
    totalOrderCost: 0,
    paymentMethod: 'credit_card',
    deliveryInstruction: [request.special_instructions, request.package_description].filter(Boolean).join('. ') || undefined,
  });

  const createUrl = `${baseUrl}/orders`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${apiKey}`,
  };
  console.log('[DeliveryNetwork] startDispatch: POST', createUrl, '→ creating order on Shipday for request', deliveryRequestId);

  try {
    const createRes = await axios.post(createUrl, orderPayload, { headers, timeout: 15000, validateStatus: (s) => s < 500 });
    if (createRes.status === 200 && createRes.data?.orderId) {
      const shipdayOrderId = String(createRes.data.orderId);
      await supabaseClient
        .from('delivery_dispatch_log')
        .update({
          result: 'accepted',
          broker_job_id: shipdayOrderId,
          attempted_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
      await supabaseClient
        .from('delivery_requests')
        .update({ status: 'Dispatched', updated_at: new Date().toISOString() })
        .eq('id', deliveryRequestId);
      console.log('[DeliveryNetwork] startDispatch: Shipday order created', shipdayOrderId, '— request', deliveryRequestId, 'Dispatched');
    } else {
      console.warn('[DeliveryNetwork] startDispatch: Shipday create failed', createRes.status, createRes.data);
      await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRow.id);
      await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
    }
  } catch (err) {
    console.error('[DeliveryNetwork] startDispatch: Shipday request failed', err?.message || err);
    await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRow.id);
    await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
  }
}
