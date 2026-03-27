/**
 * Sync a delivery request's date/time (and other fields) to Shipday via Edit Order API.
 * When an operator edits scheduled_date, scheduled_time, or priority in Tavari, we push the change to Shipday.
 * @see https://docs.shipday.com/reference/edit-order
 */
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull } from './config.js';
import { buildShipdayOrderPayload } from './shipdayOrder.js';
import { getShipdayCredentials } from './shipdayQuote.js';

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
 * Resolve expectedDeliveryDate, expectedPickupTime, expectedDeliveryTime for Shipday (all in UTC).
 */
async function resolveShipdayDateTimes(request) {
  const { localToUTC, toHHmmss } = await import('./shipdayTime.js');
  let businessTimezone = 'America/New_York';
  if (request.business_id) {
    const { data: biz } = await supabaseClient.from('businesses').select('timezone').eq('id', request.business_id).single();
    if (biz?.timezone && String(biz.timezone).trim()) businessTimezone = String(biz.timezone).trim();
  }

  function tomorrowInTz(timezone) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow).replace(/\//g, '-');
  }

  function todayInTz(timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/\//g, '-');
  }

  const now = new Date();
  const priority = (request.priority || '').toLowerCase();
  const isImmediate = priority === 'immediate';
  const isSameDay = priority === 'same day';
  const isSchedule = priority === 'schedule';

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
    const today = todayInTz(businessTimezone);
    const utc = localToUTC(today, '15:00', businessTimezone);
    if (utc) {
      expectedDate = utc.date;
      deliveryTime = utc.time;
      const [h, m] = deliveryTime.split(':').map(Number);
      pickupTime = `${String(h - 1 >= 0 ? h - 1 : 23).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    } else {
      expectedDate = today;
      pickupTime = '18:00:00';
      deliveryTime = '19:00:00';
    }
  } else if (isSchedule && request.scheduled_date && String(request.scheduled_date).trim()) {
    expectedDate = String(request.scheduled_date).trim().slice(0, 10);
    const deliveryLocal = toHHmmss(request.scheduled_time) || '13:00:00';
    const utc = localToUTC(expectedDate, deliveryLocal, businessTimezone);
    if (utc) {
      expectedDate = utc.date;
      deliveryTime = utc.time;
      const [h, m] = deliveryTime.split(':').map(Number);
      pickupTime = `${String(h - 1 >= 0 ? h - 1 : 23).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    } else {
      deliveryTime = deliveryLocal;
      const [h, m] = deliveryTime.split(':').map(Number);
      pickupTime = `${String(h - 1 >= 0 ? h - 1 : 23).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  } else {
    const tomorrow = tomorrowInTz(businessTimezone);
    const utc = localToUTC(tomorrow, '13:00', businessTimezone);
    if (utc) {
      expectedDate = utc.date;
      deliveryTime = utc.time;
      const [h, m] = deliveryTime.split(':').map(Number);
      pickupTime = `${String(h - 1 >= 0 ? h - 1 : 23).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    } else {
      expectedDate = tomorrow;
      pickupTime = '12:00:00';
      deliveryTime = '13:00:00';
    }
  }

  return { expectedDate, pickupTime, deliveryTime };
}

/**
 * Push delivery request to Shipday Edit Order so Shipday reflects current scheduled date/time and address.
 * @param {string} deliveryRequestId - delivery_requests.id
 * @param {Object} [requestRow] - Optional full request row (e.g. from PATCH response). If omitted, fetched from DB.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function syncDeliveryRequestToShipday(deliveryRequestId, requestRow = null) {
  const request = requestRow || (await supabaseClient.from('delivery_requests').select('*').eq('id', deliveryRequestId).single()).data;
  if (!request) {
    return { success: false, error: 'Request not found' };
  }

  const { data: logRows } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_job_id')
    .eq('delivery_request_id', deliveryRequestId)
    .eq('broker_id', 'shipday')
    .eq('result', 'accepted')
    .not('broker_job_id', 'is', null)
    .order('attempt_order', { ascending: false })
    .limit(1);

  const shipdayOrderId = logRows?.[0]?.broker_job_id;
  if (!shipdayOrderId || String(shipdayOrderId).trim() === '') {
    return { success: false, error: 'No Shipday order ID for this request' };
  }

  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) {
    return { success: false, error: 'Shipday not configured' };
  }

  const config = await getDeliveryConfigFull();
  const pickupPhone = Array.isArray(config?.delivery_phone_numbers) && config.delivery_phone_numbers.length > 0
    ? String(config.delivery_phone_numbers[0]).trim()
    : null;
  const pickupAddress = buildFullPickupAddress(request);
  const deliveryAddress = buildFullDeliveryAddress(request);

  const { expectedDate, pickupTime, deliveryTime } = await resolveShipdayDateTimes(request);

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
  orderPayload.orderId = Number(shipdayOrderId) || shipdayOrderId;

  const editBase = baseUrl.replace(/\/$/, '');
  const editUrl = `${editBase}/order/edit/${encodeURIComponent(String(shipdayOrderId))}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${apiKey}`,
  };

  try {
    const axios = (await import('axios')).default;
    const res = await axios.put(editUrl, orderPayload, { headers, timeout: 15000, validateStatus: (s) => s < 500 });
    if (res.status === 200 && res.data?.success) {
      console.log('[ShipdayEdit] Order', shipdayOrderId, 'updated for request', deliveryRequestId, '— date', expectedDate, pickupTime, deliveryTime);
      return { success: true };
    }
    return { success: false, error: res.data?.response || `HTTP ${res.status}` };
  } catch (err) {
    console.warn('[ShipdayEdit] Edit failed', err?.message || err);
    return { success: false, error: err?.message || 'Request failed' };
  }
}
