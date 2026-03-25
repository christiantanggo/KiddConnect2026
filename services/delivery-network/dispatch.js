/**
 * Delivery Network dispatch: send delivery request to broker(s).
 * Phase 1: one broker (Shipday). When Shipday is configured, creates a real order on Shipday via POST /orders.
 * Broker API keys can be set in Admin → Last-Mile Delivery → Settings → Delivery company APIs, or via env DELIVERY_SHIPDAY_API_KEY.
 */
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull, isShipdayOnDemandEnabledFlag, isShipdayOnDemandAutoAssignFlag } from './config.js';
import { buildShipdayOrderPayload } from './shipdayOrder.js';
import { localToUTC, toHHmmss } from './shipdayTime.js';

const DEFAULT_BROKER_ID = 'shipday'; // or 'stub' when no API key

/**
 * Shipday assign uses carrier id in the URL. IDs from API/JSON may be numbers or strings;
 * config merge used to drop string IDs (Number.isInteger only). Accept both + comma-separated strings.
 * @returns {string[]}
 */
function coalescePreferredCarrierIds(raw) {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
  return parts
    .map((x) => (x === null || x === undefined ? '' : String(x).trim()))
    .filter(Boolean);
}

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

  import('./deliveryCustomerNotifications.js')
    .then(({ queueDeliveryStatusNotifications }) => {
      queueDeliveryStatusNotifications('New', 'Contacting', deliveryRequestId, null, {
        source: 'system',
        changed_by: 'Dispatch',
      });
    })
    .catch(() => {});

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
      try {
        const { queueDeliveryStatusNotifications } = await import('./deliveryCustomerNotifications.js');
        queueDeliveryStatusNotifications('Contacting', 'Dispatched', deliveryRequestId, null, {
          source: 'system',
          changed_by: 'Dispatch (stub)',
        });
      } catch (e) {
        console.warn('[DeliveryNetwork] stub notify:', e?.message || e);
      }
    });
    return;
  }

  // Call Shipday API to create the delivery order so it appears in Shipday (scheduled or immediate).
  const { getShipdayCredentials, getShipdayOnDemandBaseUrl } = await import('./shipdayQuote.js');
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

  /** Tomorrow's date (YYYY-MM-DD) in the given IANA timezone. */
  function tomorrowInTz(timezone) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow).replace(/\//g, '-');
  }

  /** Today's date (YYYY-MM-DD) in the given IANA timezone. */
  function todayInTz(timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/\//g, '-');
  }

  const now = new Date();
  const isImmediate = (request.priority || '').toLowerCase() === 'immediate';
  const isSameDay = (request.priority || '').toLowerCase() === 'same day';
  const isSchedule = (request.priority || '').toLowerCase() === 'schedule';
  let expectedDate;
  let pickupTime = '12:00:00';
  let deliveryTime = '13:00:00';

  // Shipday API expects expectedDeliveryDate and expectedPickupTime/expectedDeliveryTime in UTC.
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
      const pickupH = h - 1 >= 0 ? h - 1 : 23;
      pickupTime = `${String(pickupH).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    } else {
      expectedDate = today;
      pickupTime = '18:00:00';
      deliveryTime = '19:00:00';
    }
  } else if (isSchedule && request.scheduled_date && String(request.scheduled_date).trim()) {
    expectedDate = String(request.scheduled_date).trim().slice(0, 10);
    const normalized = toHHmmss(request.scheduled_time);
    const deliveryLocal = normalized || '13:00:00';
    const utc = localToUTC(expectedDate, deliveryLocal, businessTimezone);
    if (utc) {
      expectedDate = utc.date;
      deliveryTime = utc.time;
      const [h, m] = deliveryTime.split(':').map(Number);
      const pickupH = h - 1 >= 0 ? h - 1 : 23;
      pickupTime = `${String(pickupH).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    } else {
      deliveryTime = deliveryLocal;
      const [h, m] = deliveryTime.split(':').map(Number);
      const pickupH = h - 1 >= 0 ? h - 1 : 23;
      pickupTime = `${String(pickupH).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
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
      const orderNumber = orderPayload.orderNumber;
      await supabaseClient
        .from('delivery_dispatch_log')
        .update({
          result: 'accepted',
          broker_job_id: shipdayOrderId,
          attempted_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);

      const shipdayConfig = config?.brokers?.shipday;
      const onDemandEnabled = isShipdayOnDemandEnabledFlag(shipdayConfig?.on_demand_enabled);
      const onDemandBase = getShipdayOnDemandBaseUrl(baseUrl);
      const preferredIds = coalescePreferredCarrierIds(shipdayConfig?.preferred_carrier_ids);

      // On-demand + API base: either stage quote for confirm (price-only modal) or pause for carrier picker (DoorDash/Uber list).
      // Default to staged flow when preferred is empty/cheapest; explicit DoorDash/Uber need checkbox to skip picker.
      if (onDemandEnabled && onDemandBase) {
        const prefRaw = shipdayConfig?.preferred_on_demand_provider;
        const pref =
          prefRaw != null && String(prefRaw).trim()
            ? String(prefRaw).trim().toLowerCase()
            : 'cheapest';
        const autoAssign =
          isShipdayOnDemandAutoAssignFlag(shipdayConfig?.on_demand_auto_assign) ||
          pref === 'cheapest';
        if (autoAssign) {
          const { tryAutoAssignOnDemandAfterShipdayCreate } = await import('./carrierChoice.js');
          const auto = await tryAutoAssignOnDemandAfterShipdayCreate(deliveryRequestId);
          if (auto.success) {
            console.log(
              '[DeliveryNetwork] startDispatch: Shipday order',
              shipdayOrderId,
              '— staged on-demand quote (user confirms price in app)'
            );
            return;
          }
          console.warn(
            '[DeliveryNetwork] startDispatch: staged on-demand quote failed; user can pick carrier in app',
            auto.error || ''
          );
        }
        await supabaseClient
          .from('delivery_requests')
          .update({ status: 'ChoosingCarrier', updated_at: new Date().toISOString() })
          .eq('id', deliveryRequestId);
        import('./deliveryCustomerNotifications.js')
          .then(({ queueDeliveryStatusNotifications }) => {
            queueDeliveryStatusNotifications('Contacting', 'ChoosingCarrier', deliveryRequestId, null, {
              source: 'system',
              changed_by: 'Dispatch',
            });
          })
          .catch(() => {});
        console.log(
          '[DeliveryNetwork] startDispatch: Shipday order',
          shipdayOrderId,
          '— status ChoosingCarrier (pick third-party in app)'
        );
        return;
      }

      if (onDemandEnabled && !onDemandBase) {
        console.error(
          '[DeliveryNetwork] startDispatch: on-demand enabled but on-demand base URL missing — assign fleet only or fix SHIPDAY / api.shipday.com/on-demand'
        );
      }

      await supabaseClient
        .from('delivery_requests')
        .update({ status: 'Dispatched', updated_at: new Date().toISOString() })
        .eq('id', deliveryRequestId);
      console.log('[DeliveryNetwork] startDispatch: Shipday order created', shipdayOrderId, '— request', deliveryRequestId, 'Dispatched');
      try {
        const { queueDeliveryStatusNotifications } = await import('./deliveryCustomerNotifications.js');
        queueDeliveryStatusNotifications('Contacting', 'Dispatched', deliveryRequestId, null, {
          source: 'system',
          changed_by: 'Dispatch',
        });
      } catch (e) {
        console.warn('[DeliveryNetwork] dispatched notify:', e?.message || e);
      }

      if (preferredIds.length > 0) {
        const carrierId = preferredIds[0];
        try {
          const assignUrl = `${baseUrl}/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(carrierId)}`;
          const assignRes = await axios.put(assignUrl, null, { headers, timeout: 10000, validateStatus: (s) => s < 500 });
          if (assignRes.status === 204 || assignRes.status === 200) {
            console.log('[DeliveryNetwork] startDispatch: assigned order to fleet carrier', carrierId);
            await new Promise((r) => setTimeout(r, 1500));
            const getUrl = `${baseUrl}/orders/${encodeURIComponent(orderNumber)}`;
            const getRes = await axios.get(getUrl, {
              headers: { Accept: 'application/json', Authorization: headers.Authorization },
              timeout: 10000,
              validateStatus: (s) => s < 500,
            });
            if (getRes.status === 200 && Array.isArray(getRes.data) && getRes.data.length > 0) {
              const orderDetail = getRes.data[0];
              const costing = orderDetail?.costing;
              const totalCost = costing?.totalCost != null ? Number(costing.totalCost) : null;
              const deliveryFee = costing?.deliveryFee != null ? Number(costing.deliveryFee) : null;
              const amount = totalCost != null && totalCost > 0 ? totalCost : deliveryFee != null && deliveryFee > 0 ? deliveryFee : null;
              if (amount != null && amount > 0) {
                const amountCents = Math.round(amount * 100);
                await supabaseClient
                  .from('delivery_requests')
                  .update({ amount_quoted_cents: amountCents, updated_at: new Date().toISOString() })
                  .eq('id', deliveryRequestId);
                console.log('[DeliveryNetwork] startDispatch: amount_quoted_cents from Shipday costing:', amountCents);
              }
            }
          } else {
            console.error('[DeliveryNetwork] startDispatch: fleet assign failed', assignRes.status, assignRes.data, '| carrierId:', carrierId);
          }
        } catch (assignErr) {
          console.error('[DeliveryNetwork] startDispatch: fleet assign or fetch costing failed', assignErr?.message || assignErr);
        }
      } else {
        console.error(
          '[DeliveryNetwork] startDispatch: order on Shipday but no fleet carrier IDs — set preferred_carrier_ids in Admin, or enable on-demand and complete carrier pick in dashboard.'
        );
      }
    } else {
      console.warn('[DeliveryNetwork] startDispatch: Shipday create failed', createRes.status, createRes.data);
      await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRow.id);
      await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
      import('./deliveryCustomerNotifications.js')
        .then(({ queueDeliveryStatusNotifications }) => {
          queueDeliveryStatusNotifications('Contacting', 'New', deliveryRequestId, null, {
            source: 'system',
            changed_by: 'Dispatch',
            detail: { reason: 'shipday_create_failed', http_status: createRes.status },
          });
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error('[DeliveryNetwork] startDispatch: Shipday request failed', err?.message || err);
    await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRow.id);
    await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
    import('./deliveryCustomerNotifications.js')
      .then(({ queueDeliveryStatusNotifications }) => {
        queueDeliveryStatusNotifications('Contacting', 'New', deliveryRequestId, null, {
          source: 'system',
          changed_by: 'Dispatch',
          detail: { reason: 'shipday_request_exception' },
        });
      })
      .catch(() => {});
  }
}
