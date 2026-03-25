/**
 * In-app delivery tracking: Shipday data proxied server-side (no Shipday-hosted page in the UI).
 * @see https://docs.shipday.com/reference/order-delivery-progress
 * @see https://docs.shipday.com/reference/retrieve-order-details
 */
import { supabaseClient } from '../../config/database.js';
import { getShipdayCredentials } from './shipdayQuote.js';

const TRACKABLE_STATUSES = ['Dispatched', 'Assigned', 'PickedUp'];

/** Shipday delivery order object: https://docs.shipday.com/reference/delivery-order-object */
export function extractShipdayCustomerTrackingUrl(order) {
  if (!order || typeof order !== 'object') return null;
  const raw = order.trackingLink ?? order.tracking_link;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || !/^https?:\/\//i.test(t)) return null;
  return t;
}

/**
 * Short, customer-friendly line for the dashboard (maps Shipday / progress states).
 */
export function buildCustomerTrackingHeadline(orderState, progressStatus, etaMinutes) {
  const state = String(progressStatus || orderState || '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .trim();
  if (!state) return null;
  if (['NOT_ASSIGNED', 'NOT_ACCEPTED', 'NOT_STARTED_YET'].includes(state)) {
    return 'Finding a driver';
  }
  if (state === 'STARTED' || state === 'ACTIVE') {
    return 'Driver is on the way';
  }
  if (state === 'PICKED_UP' || state === 'READY_TO_DELIVER') {
    if (etaMinutes != null && Number.isFinite(Number(etaMinutes)) && Number(etaMinutes) <= 8) {
      return 'Driver nearby';
    }
    return 'On the way to you';
  }
  if (state === 'ALREADY_DELIVERED') return 'Delivered';
  return humanizeOrderState(state);
}

/** Shipday order states where no individual driver is active yet — hide courier brand as "driver". */
const NO_INDIVIDUAL_DRIVER_STATES = new Set(['NOT_ASSIGNED', 'NOT_ACCEPTED', 'NOT_STARTED_YET']);

/** Third-party names Shipday puts on assignedCarrier before a person is assigned — never show as the driver. */
const COURIER_BRAND_NAMES = new Set([
  'uber',
  'uber direct',
  'uber eats',
  'doordash',
  'door dash',
  'lyft',
  'skip the dishes',
  'skipthedishes',
  'instacart',
  'roadie',
  'postmates',
  'grubhub',
]);

function trimOrNull(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function isCourierBrandOnlyName(name) {
  const n = trimOrNull(name);
  if (!n) return false;
  const key = n.toLowerCase().replace(/\s+/g, ' ').trim();
  if (COURIER_BRAND_NAMES.has(key)) return true;
  for (const b of COURIER_BRAND_NAMES) {
    if (key === b || key.startsWith(`${b} `) || key.endsWith(` ${b}`)) return true;
  }
  return false;
}

/**
 * Prefer progress fixedData.carrier (often the person), then codeName, then name — skip courier brands.
 */
function pickCustomerDriverDisplay(orderState, progressStatus, assigned, fixedCarrier) {
  const state = String(progressStatus || orderState || '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .trim();
  if (state && NO_INDIVIDUAL_DRIVER_STATES.has(state)) return null;

  const fixedName = trimOrNull(fixedCarrier?.name);
  if (fixedName && !isCourierBrandOnlyName(fixedName)) return fixedName;

  const codeName = assigned && trimOrNull(assigned.codeName);
  if (codeName && !isCourierBrandOnlyName(codeName)) return codeName;

  const assignedName = assigned && trimOrNull(assigned.name);
  if (assignedName && !isCourierBrandOnlyName(assignedName)) return assignedName;

  return null;
}

function pickCarrierPhoneFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return trimOrNull(obj.phoneNumber ?? obj.phone ?? obj.mobileNumber ?? obj.mobile);
}

/**
 * When Shipday exposes a driver/courier phone, return it for live tracking.
 * Previously required a display name, which hid valid numbers when the name was filtered (e.g. third-party label).
 */
function pickCustomerDriverPhone(displayName, assigned, fixedCarrier, orderState, progressStatus) {
  const assignPhone = pickCarrierPhoneFromObject(assigned);
  const fixedPhone = pickCarrierPhoneFromObject(fixedCarrier);
  const state = String(progressStatus || orderState || '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .trim();

  if (displayName) {
    const fixedName = trimOrNull(fixedCarrier?.name);
    if (fixedName === displayName && fixedPhone) return fixedPhone;
    if (assignPhone) return assignPhone;
    return fixedPhone;
  }

  if (state && NO_INDIVIDUAL_DRIVER_STATES.has(state)) return null;
  if (['INCOMPLETE', 'FAILED_DELIVERY', 'CANCELLED'].includes(state)) return null;
  if (assignPhone) return assignPhone;
  return fixedPhone;
}

/**
 * Persist driver contact from Shipday GET /orders payload (webhook or poll).
 * @param {object} order
 * @returns {{ name: string|null, phone: string|null }}
 */
export function extractBrokerDriverContactForPersistence(order) {
  const assigned = order?.assignedCarrier && typeof order.assignedCarrier === 'object' ? order.assignedCarrier : null;
  if (!assigned) return { name: null, phone: null };
  const phone = pickCarrierPhoneFromObject(assigned);
  const codeName = trimOrNull(assigned.codeName);
  const assignedName = trimOrNull(assigned.name);
  let name = null;
  if (codeName && !isCourierBrandOnlyName(codeName)) name = codeName;
  else if (assignedName && !isCourierBrandOnlyName(assignedName)) name = assignedName;
  return { name, phone: phone || null };
}

function humanizeOrderState(raw) {
  const s = String(raw || '').toUpperCase().replace(/_/g, ' ').trim();
  if (!s) return null;
  return s
    .split(' ')
    .map((w) => (w.length ? w[0] + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/**
 * @param {string} deliveryRequestId
 * @param {string|null} businessId
 * @returns {Promise<{ success: boolean, error?: string, tracking?: object }>}
 */
async function persistCarrierTrackingUrl(deliveryRequestId, url) {
  if (!url || !deliveryRequestId) return;
  const { error } = await supabaseClient
    .from('delivery_requests')
    .update({ carrier_tracking_url: url, updated_at: new Date().toISOString() })
    .eq('id', deliveryRequestId);
  if (error) {
    console.warn('[ShipdayTracking] persist carrier_tracking_url failed:', error.message);
  }
}

export async function getLiveTrackingForDeliveryRequest(deliveryRequestId, businessId) {
  let request;
  let reqErr;
  {
    const q = await supabaseClient
      .from('delivery_requests')
      .select('id, business_id, reference_number, status, carrier_tracking_url, carrier_contact_phone, carrier_contact_name')
      .eq('id', deliveryRequestId)
      .single();
    request = q.data;
    reqErr = q.error;
  }
  if (reqErr && /carrier_contact_|column .* does not exist/i.test(String(reqErr.message || ''))) {
    const q2 = await supabaseClient
      .from('delivery_requests')
      .select('id, business_id, reference_number, status, carrier_tracking_url')
      .eq('id', deliveryRequestId)
      .single();
    request = q2.data;
    reqErr = q2.error;
  }
  if (reqErr || !request) return { success: false, error: 'Request not found' };
  if (businessId && request.business_id !== businessId) return { success: false, error: 'Forbidden' };

  if (!TRACKABLE_STATUSES.includes(request.status)) {
    return {
      success: true,
      tracking: {
        trackable: false,
        reason: 'Tracking is available once the delivery is dispatched.',
        request_status: request.status,
      },
    };
  }

  const storedTrackingUrl =
    typeof request.carrier_tracking_url === 'string' && request.carrier_tracking_url.trim()
      ? request.carrier_tracking_url.trim()
      : null;

  const { data: ddLog } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_id')
    .eq('delivery_request_id', deliveryRequestId)
    .order('attempt_order', { ascending: false })
    .limit(1);
  const brokerId = ddLog?.[0]?.broker_id || null;

  function mergeStoredCarrierContact(base) {
    const p = trimOrNull(request.carrier_contact_phone);
    const n = trimOrNull(request.carrier_contact_name);
    const out = { ...base };
    if (!out.phone && p) out.phone = p;
    if (!out.name && n) out.name = n;
    return out;
  }

  if (brokerId !== 'shipday') {
    if (storedTrackingUrl) {
      const carrier = mergeStoredCarrierContact({ name: null, phone: null });
      return {
        success: true,
        tracking: {
          trackable: true,
          source: 'stored',
          partner: brokerId,
          request_status: request.status,
          tracking_url: storedTrackingUrl,
          customer_status: 'Track your delivery',
          status_label: request.status,
          eta_minutes: null,
          eta_label: null,
          carrier,
          contact_hint: carrier.phone
            ? 'Provided by your delivery company. The number may be masked or forwarded for privacy.'
            : null,
          driver_location: null,
          maps_url: null,
          refreshed_at: new Date().toISOString(),
        },
      };
    }
    return {
      success: true,
      tracking: {
        trackable: false,
        reason:
          brokerId === 'doordash'
            ? 'A DoorDash tracking link will appear here after the carrier returns one. Refresh or open this delivery again in a moment.'
            : 'Live map and ETA in Tavari are available for Shipday-dispatched orders. Use your carrier portal for other brokers.',
        request_status: request.status,
      },
    };
  }

  const ref = request.reference_number && String(request.reference_number).trim();
  if (!ref) return { success: false, error: 'Missing reference number' };

  const { data: logRow } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_job_id')
    .eq('delivery_request_id', deliveryRequestId)
    .eq('broker_id', 'shipday')
    .eq('result', 'accepted')
    .not('broker_job_id', 'is', null)
    .order('attempt_order', { ascending: false })
    .limit(1);
  const shipdayOrderId = logRow?.[0]?.broker_job_id != null ? String(logRow[0].broker_job_id).trim() : '';

  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) return { success: false, error: 'Shipday is not configured' };

  const axios = (await import('axios')).default;
  const root = baseUrl.replace(/\/$/, '');
  const authHeader = { Authorization: `Basic ${apiKey}` };

  const orderUrl = `${root}/orders/${encodeURIComponent(ref)}`;
  let order = null;
  try {
    const res = await axios.get(orderUrl, {
      headers: { Accept: 'application/json', ...authHeader },
      timeout: 12000,
      validateStatus: (s) => s < 500,
    });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      order = res.data[0];
    }
  } catch (e) {
    console.warn('[ShipdayTracking] order details failed', e?.message || e);
  }

  if (!order) {
    return {
      success: true,
      tracking: {
        trackable: true,
        partial: true,
        request_status: request.status,
        message: storedTrackingUrl
          ? null
          : 'Could not load live details from the carrier. Try again in a moment.',
        tracking_url: storedTrackingUrl,
        customer_status: storedTrackingUrl ? 'Track your delivery for live updates' : null,
        status_label: request.status,
        eta_minutes: null,
        eta_label: null,
        carrier: { name: null, phone: null },
        driver_location: null,
        maps_url: null,
        refreshed_at: new Date().toISOString(),
      },
    };
  }

  const orderState = order?.orderStatus?.orderState;
  const assigned = order?.assignedCarrier && typeof order.assignedCarrier === 'object' ? order.assignedCarrier : null;

  let etaMinutes = null;
  let driverLat = null;
  let driverLng = null;
  let progressStatus = null;
  let fixedCarrier = null;
  let source = 'order_details';

  const progressIds = [ref, shipdayOrderId].filter((id, i, a) => id && a.indexOf(id) === i);
  const progressHeaderSets = [
    { Accept: 'application/json', ...authHeader },
    ...(apiKey ? [{ Accept: 'application/json', 'x-api-key': apiKey }] : []),
  ];

  for (const tid of progressIds) {
    const progressUrl = `${root}/order/progress/${encodeURIComponent(tid)}`;
    for (const hdr of progressHeaderSets) {
      try {
        const prog = await axios.get(progressUrl, {
          params: { isStaticDataRequired: 'true' },
          headers: hdr,
          timeout: 12000,
          validateStatus: (s) => s < 500,
        });
        if (prog.status !== 200 || !prog.data) continue;
        const fd = prog.data.fixedData;
        if (fd?.carrier && typeof fd.carrier === 'object') {
          fixedCarrier = fd.carrier;
        }
        const dyn = prog.data.dynamicData;
        if (dyn) {
          source = 'progress';
          progressStatus = dyn.orderStatus?.status || null;
          const em = dyn.estimatedTimeInMinutes ?? dyn.detailEta?.estimatedTimeInMinutes;
          if (em != null && Number.isFinite(Number(em))) etaMinutes = Math.round(Number(em));
          const loc = dyn.carrierLocation;
          if (loc?.latitude != null && loc?.longitude != null) {
            driverLat = Number(loc.latitude);
            driverLng = Number(loc.longitude);
            if (!Number.isFinite(driverLat) || !Number.isFinite(driverLng)) {
              driverLat = null;
              driverLng = null;
            }
          }
          break;
        }
      } catch (e) {
        console.warn('[ShipdayTracking] progress API failed for', tid, e?.message || e);
      }
    }
    if (source === 'progress') break;
  }

  const displayState = progressStatus || orderState;
  const driverName = pickCustomerDriverDisplay(orderState, progressStatus, assigned, fixedCarrier);
  const driverPhone = pickCustomerDriverPhone(driverName, assigned, fixedCarrier, orderState, progressStatus);
  let carrier = { name: driverName, phone: driverPhone };
  carrier = mergeStoredCarrierContact(carrier);

  if (etaMinutes == null && order?.etaTime != null && String(order.etaTime).trim()) {
    const t = String(order.etaTime).trim();
    const m = t.match(/(\d+)/);
    if (m) etaMinutes = parseInt(m[1], 10);
  }

  const shipdayTrackingUrl = extractShipdayCustomerTrackingUrl(order);
  const trackingUrl = shipdayTrackingUrl || storedTrackingUrl || null;
  if (shipdayTrackingUrl && shipdayTrackingUrl !== storedTrackingUrl) {
    persistCarrierTrackingUrl(deliveryRequestId, shipdayTrackingUrl);
  }

  const customerStatus = buildCustomerTrackingHeadline(orderState, progressStatus, etaMinutes);
  const etaLabel =
    etaMinutes != null && Number.isFinite(Number(etaMinutes))
      ? `Arrives in about ${etaMinutes} min`
      : null;

  const mapsUrl =
    driverLat != null && driverLng != null
      ? `https://www.openstreetmap.org/?mlat=${driverLat}&mlon=${driverLng}#map=15/${driverLat}/${driverLng}`
      : null;

  return {
    success: true,
    tracking: {
      trackable: true,
      source,
      request_status: request.status,
      order_state: displayState || null,
      status_label: humanizeOrderState(displayState || orderState) || request.status,
      customer_status: customerStatus,
      eta_minutes: etaMinutes,
      eta_label: etaLabel,
      tracking_url: trackingUrl,
      carrier,
      contact_hint: carrier.phone
        ? 'Provided by your delivery company. The number may be masked or forwarded for privacy.'
        : null,
      driver_location:
        driverLat != null && driverLng != null ? { latitude: driverLat, longitude: driverLng } : null,
      maps_url: mapsUrl,
      refreshed_at: new Date().toISOString(),
    },
  };
}
