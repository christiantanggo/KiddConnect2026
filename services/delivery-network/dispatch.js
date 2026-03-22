/**
 * Delivery Network dispatch: send delivery request to broker(s).
 * Phase 1: one broker (Shipday). When Shipday is configured, creates a real order on Shipday via POST /orders.
 * Broker API keys can be set in Admin → Last-Mile Delivery → Settings → Delivery company APIs, or via env DELIVERY_SHIPDAY_API_KEY.
 */
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull } from './config.js';
import { buildShipdayOrderPayload } from './shipdayOrder.js';
import {
  buildOnDemandAssignBody,
  collectOnDemandEstimates,
  isCheapestMode,
  resolveOnDemandAssignEstimate,
} from './shipdayOnDemand.js';
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST Shipday on-demand /assign. Retries on 429/503 — estimate polling fires many GETs and can exhaust rate limits.
 */
async function postOnDemandAssignWithRetry(axios, assignUrl, assignBody, headers) {
  const maxAttempts = Math.min(8, Math.max(1, Number(process.env.SHIPDAY_ASSIGN_MAX_RETRIES) || 5));
  const baseDelayMs = Math.max(500, Number(process.env.SHIPDAY_ASSIGN_RETRY_BASE_MS) || 2500);
  let lastRes = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastRes = await axios.post(assignUrl, assignBody, {
      headers,
      timeout: 25000,
      validateStatus: (s) => s < 600,
    });
    if (lastRes.status === 200 && lastRes.data) return lastRes;
    if ((lastRes.status === 429 || lastRes.status === 503) && attempt < maxAttempts) {
      const wait = Math.min(45000, baseDelayMs * 2 ** (attempt - 1));
      console.warn('[DeliveryNetwork] on-demand assign HTTP', lastRes.status, `— rate limit or overload; waiting ${wait}ms then retry ${attempt + 1}/${maxAttempts}`);
      await sleep(wait);
      continue;
    }
    return lastRes;
  }
  return lastRes;
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
      await supabaseClient
        .from('delivery_requests')
        .update({ status: 'Dispatched', updated_at: new Date().toISOString() })
        .eq('id', deliveryRequestId);
      console.log('[DeliveryNetwork] startDispatch: Shipday order created', shipdayOrderId, '— request', deliveryRequestId, 'Dispatched');

      // Assign to preferred provider and store quoted amount.
      // On-demand first when enabled; fleet carrier (preferred_carrier_ids) as fallback when on-demand returns nothing or fails (e.g. Canada / non-US).
      const shipdayConfig = config?.brokers?.shipday;
      const onDemandEnabled = shipdayConfig?.on_demand_enabled === true;
      const preferredOnDemandRaw =
        typeof shipdayConfig?.preferred_on_demand_provider === 'string'
          ? shipdayConfig.preferred_on_demand_provider.trim()
          : '';
      // Default to cheapest when on-demand is on but no provider chosen (lowest fee among all estimates).
      const preferredOnDemand = onDemandEnabled ? (preferredOnDemandRaw || 'cheapest') : null;
      const preferredIds = coalescePreferredCarrierIds(shipdayConfig?.preferred_carrier_ids);

      if (onDemandEnabled) {
        const onDemandBase = getShipdayOnDemandBaseUrl(baseUrl);
        if (!onDemandBase) {
          console.error('[DeliveryNetwork] startDispatch: on-demand enabled but on-demand base URL missing (set SHIPDAY_ON_DEMAND_BASE_URL or use default api.shipday.com/on-demand). Skipping third-party assign.');
        }
        if (onDemandBase) {
          /** True after successful on-demand assign or any successful fleet PUT in this block */
          let onDemandOrThirdPartyAssigned = false;
          try {
            const authH = { Authorization: headers.Authorization };
            const estimates = await collectOnDemandEstimates(shipdayOrderId, onDemandBase, authH);
            // Brief pause: collectOnDemandEstimates hits many GETs; immediate POST /assign often gets HTTP 429.
            const postEstimateDelay = Number(process.env.SHIPDAY_POST_ESTIMATE_DELAY_MS);
            const pauseMs = Number.isFinite(postEstimateDelay) && postEstimateDelay >= 0 ? postEstimateDelay : 1500;
            if (pauseMs > 0) await sleep(pauseMs);
            // Use quoted provider from the request when set (so we assign to the same provider we quoted).
            // Assign uses THIS order's estimates + estimateReference (quote was on a deleted temp order).
            const quotedRaw = request.quoted_on_demand_provider != null ? String(request.quoted_on_demand_provider).trim() : '';
            const match = resolveOnDemandAssignEstimate(estimates, quotedRaw || null, preferredOnDemand);
            if (!match || !match.name) {
              console.warn('[DeliveryNetwork] startDispatch: no on-demand estimate for assign', {
                preferredOnDemand,
                quotedRaw: quotedRaw || '(none)',
                estimateCount: estimates?.length ?? 0,
              });
            } else {
              // POST https://api.shipday.com/on-demand/assign — @see https://docs.shipday.com/reference/assign
              const assignUrl = `${String(onDemandBase).replace(/\/$/, '')}/assign`;
              let assignBody;
              try {
                assignBody = buildOnDemandAssignBody(match, shipdayOrderId, {
                  contactlessDelivery: shipdayConfig?.on_demand_contactless === true,
                  tip: shipdayConfig?.on_demand_tip,
                  podTypes: ['SIGNATURE', 'PHOTO'],
                });
              } catch (buildErr) {
                console.error('[DeliveryNetwork] startDispatch: invalid on-demand assign payload', buildErr?.message || buildErr);
                assignBody = null;
              }
              if (!assignBody) {
                /* skip assign attempt */
              } else {
              const assignRes = await postOnDemandAssignWithRetry(axios, assignUrl, assignBody, headers);
              if (assignRes.status === 200 && assignRes.data) {
                onDemandOrThirdPartyAssigned = true;
                const totalBillable = assignRes.data.totalBillableAmount != null ? Number(assignRes.data.totalBillableAmount) : null;
                const amount = totalBillable != null && totalBillable > 0 ? totalBillable : (assignRes.data.thirdPartyFee != null ? Number(assignRes.data.thirdPartyFee) : null);
                if (amount != null && amount > 0) {
                  const amountCents = Math.round(amount * 100);
                  await supabaseClient.from('delivery_requests').update({ amount_quoted_cents: amountCents, updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
                }
                const quotedHint = quotedRaw && !/^cheapest$/i.test(quotedRaw) ? `(matched quote: ${quotedRaw})` : (isCheapestMode(preferredOnDemand) ? '(cheapest)' : '');
                console.log('[DeliveryNetwork] startDispatch: assigned to on-demand', match.name, quotedHint, 'estimateRef:', match.id || '—');
              } else {
                const errMsg = (assignRes.data?.errorMessage || assignRes.data?.message || JSON.stringify(assignRes.data || '')).toLowerCase();
                const isPaidPlanError = errMsg.includes('paid plan') || errMsg.includes('third party');
                console.error('[DeliveryNetwork] startDispatch: on-demand assign HTTP', assignRes.status, assignRes.data, '| preferred_carrier_ids:', preferredIds.length ? preferredIds.join(',') : '(none)');
                if (isPaidPlanError && preferredIds.length > 0) {
                  console.log('[DeliveryNetwork] startDispatch: on-demand assign blocked (paid plan); falling back to fleet carrier', preferredIds[0]);
                  const carrierId = preferredIds[0];
                  try {
                    const fleetAssignUrl = `${baseUrl}/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(carrierId)}`;
                    const fleetRes = await axios.put(fleetAssignUrl, null, { headers, timeout: 10000, validateStatus: (s) => s < 500 });
                    if (fleetRes.status === 204 || fleetRes.status === 200) {
                      onDemandOrThirdPartyAssigned = true;
                      console.log('[DeliveryNetwork] startDispatch: assigned to fleet carrier', carrierId, '(on-demand requires Shipday paid plan)');
                    } else {
                      console.error('[DeliveryNetwork] startDispatch: fleet fallback assign failed', fleetRes.status, fleetRes.data);
                    }
                  } catch (e) {
                    console.error('[DeliveryNetwork] startDispatch: fleet fallback error', e?.message || e);
                  }
                } else if (preferredIds.length === 0) {
                  console.error('[DeliveryNetwork] startDispatch: on-demand assign failed; set preferred_carrier_ids in Admin for fleet fallback, or fix Shipday/on-demand error above.');
                } else {
                  console.warn('[DeliveryNetwork] startDispatch: on-demand assign failed', assignRes.status, assignRes.data);
                }
              }
              }
            }
          } catch (onDemandErr) {
            console.warn('[DeliveryNetwork] startDispatch: on-demand estimate/assign failed', onDemandErr?.message || onDemandErr);
          }
            // DoorDash/Uber on-demand is US-centric; Canada (e.g. London ON) often returns no estimates or non–paid-plan errors.
            // If nothing assigned yet, push to your fleet carrier when preferred_carrier_ids is set.
            if (!onDemandOrThirdPartyAssigned && preferredIds.length > 0) {
              const carrierId = preferredIds[0];
              console.warn('[DeliveryNetwork] startDispatch: on-demand did not assign — trying fleet carrier', carrierId, '(typical for non-US or empty estimates)');
              try {
                const assignUrlFleet = `${baseUrl}/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(carrierId)}`;
                const fleetRes = await axios.put(assignUrlFleet, null, { headers, timeout: 10000, validateStatus: (s) => s < 500 });
                if (fleetRes.status === 204 || fleetRes.status === 200) {
                  console.log('[DeliveryNetwork] startDispatch: assigned to fleet carrier', carrierId, '(fallback after on-demand)');
                  await new Promise((r) => setTimeout(r, 1500));
                  const getUrl = `${baseUrl}/orders/${encodeURIComponent(orderNumber)}`;
                  const getRes = await axios.get(getUrl, { headers: { Accept: 'application/json', Authorization: headers.Authorization }, timeout: 10000, validateStatus: (s) => s < 500 });
                  if (getRes.status === 200 && Array.isArray(getRes.data) && getRes.data.length > 0) {
                    const orderDetail = getRes.data[0];
                    const costing = orderDetail?.costing;
                    const totalCost = costing?.totalCost != null ? Number(costing.totalCost) : null;
                    const deliveryFee = costing?.deliveryFee != null ? Number(costing.deliveryFee) : null;
                    const amount = totalCost != null && totalCost > 0 ? totalCost : (deliveryFee != null && deliveryFee > 0 ? deliveryFee : null);
                    if (amount != null && amount > 0) {
                      const amountCents = Math.round(amount * 100);
                      await supabaseClient.from('delivery_requests').update({ amount_quoted_cents: amountCents, updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
                      console.log('[DeliveryNetwork] startDispatch: updated amount_quoted_cents from fleet fallback costing:', amountCents, 'cents');
                    }
                  }
                } else {
                  console.error('[DeliveryNetwork] startDispatch: fleet fallback after on-demand failed', fleetRes.status, fleetRes.data, '| carrierId:', carrierId);
                }
              } catch (fleetAfterOdErr) {
                console.error('[DeliveryNetwork] startDispatch: fleet fallback after on-demand error', fleetAfterOdErr?.message || fleetAfterOdErr);
              }
            } else if (!onDemandOrThirdPartyAssigned && preferredIds.length === 0) {
              console.error('[DeliveryNetwork] startDispatch: on-demand did not assign and preferred_carrier_ids is empty — order stays Unassigned in Shipday. For Canada: turn off on-demand OR add Tavari OS carrier ID under Shipday settings.');
            }
        }
      } else if (!onDemandEnabled && preferredIds.length > 0) {
        const carrierId = preferredIds[0];
        try {
          const assignUrl = `${baseUrl}/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(carrierId)}`;
          const assignRes = await axios.put(assignUrl, null, { headers, timeout: 10000, validateStatus: (s) => s < 500 });
          if (assignRes.status === 204 || assignRes.status === 200) {
            console.log('[DeliveryNetwork] startDispatch: assigned order to carrier', carrierId);
            await new Promise((r) => setTimeout(r, 1500));
            const getUrl = `${baseUrl}/orders/${encodeURIComponent(orderNumber)}`;
            const getRes = await axios.get(getUrl, { headers: { Accept: 'application/json', Authorization: headers.Authorization }, timeout: 10000, validateStatus: (s) => s < 500 });
            if (getRes.status === 200 && Array.isArray(getRes.data) && getRes.data.length > 0) {
              const orderDetail = getRes.data[0];
              const costing = orderDetail?.costing;
              const totalCost = costing?.totalCost != null ? Number(costing.totalCost) : null;
              const deliveryFee = costing?.deliveryFee != null ? Number(costing.deliveryFee) : null;
              const amount = totalCost != null && totalCost > 0 ? totalCost : (deliveryFee != null && deliveryFee > 0 ? deliveryFee : null);
              if (amount != null && amount > 0) {
                const amountCents = Math.round(amount * 100);
                await supabaseClient.from('delivery_requests').update({ amount_quoted_cents: amountCents, updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
                console.log('[DeliveryNetwork] startDispatch: updated amount_quoted_cents from Shipday costing:', amountCents, 'cents');
              }
            }
          } else {
            console.error('[DeliveryNetwork] startDispatch: fleet assign to carrier failed', assignRes.status, assignRes.data, '| carrierId:', carrierId, 'orderId:', shipdayOrderId);
          }
        } catch (assignErr) {
          console.error('[DeliveryNetwork] startDispatch: assign or fetch costing failed', assignErr?.message || assignErr);
        }
      } else if (!onDemandEnabled && preferredIds.length === 0) {
        console.error('[DeliveryNetwork] startDispatch: order created on Shipday but no assignment ran — on-demand is off and preferred_carrier_ids is empty. Add carrier ID(s) in Admin → Shipday or enable on-demand + provider.');
      }
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
