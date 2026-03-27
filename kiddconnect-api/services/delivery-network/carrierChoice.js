/**
 * Customer-facing carrier choice: list on-demand estimates with Tavari customer price (pricing engine),
 * then assign the selected provider to the existing Shipday order.
 */
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull, isShipdayOnDemandEnabledFlag } from './config.js';
import { getShipdayCredentials, getShipdayOnDemandBaseUrl } from './shipdayQuote.js';
import {
  buildOnDemandAssignBody,
  collectOnDemandEstimates,
  fetchOnDemandEstimatesForConfirm,
  isCheapestMode,
  pickOnDemandEstimate,
} from './shipdayOnDemand.js';
import { calculateDeliveryPrice, PRICE_DISCLAIMER } from './pricingEngine.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const QUOTED_ON_DEMAND_PROVIDER_MAX_LEN = 50;

/** Shipday may return 200 with an error payload; empty body must not count as success. */
function isShipdayOnDemandAssignSuccess(res) {
  if (!res || typeof res.status !== 'number') return false;
  if (res.status < 200 || res.status >= 300) return false;
  if (res.status === 204) return true;
  const d = res.data;
  // Shipday often returns 200 with no JSON body (axios: data undefined or "").
  if (res.status === 200 && (d === undefined || d === null || d === '')) return true;
  if (d === undefined || d === null) return false;
  if (typeof d === 'string' && !String(d).trim()) return false;
  if (typeof d === 'object' && !Array.isArray(d) && d !== null) {
    if (d.error === true || d.success === false) return false;
  }
  return true;
}

async function postOnDemandAssignWithRetry(axios, assignUrl, assignBody, headers) {
  const maxAttempts = Math.min(8, Math.max(1, Number(process.env.SHIPDAY_ASSIGN_MAX_RETRIES) || 5));
  const baseDelayMs = Math.max(500, Number(process.env.SHIPDAY_ASSIGN_RETRY_BASE_MS) || 2500);
  let lastRes = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastRes = await axios.post(assignUrl, assignBody, {
        headers,
        timeout: 25000,
        validateStatus: (s) => s < 600,
      });
    } catch (netErr) {
      lastRes = { status: 0, data: { message: netErr?.message || 'network error' } };
    }
    if (isShipdayOnDemandAssignSuccess(lastRes)) return lastRes;
    const retryable = lastRes.status === 429 || lastRes.status === 503 || lastRes.status === 0;
    if (retryable && attempt < maxAttempts) {
      const wait = Math.min(45000, baseDelayMs * 2 ** (attempt - 1));
      await sleep(wait);
      continue;
    }
    return lastRes;
  }
  return lastRes;
}

function coalescePreferredCarrierIds(raw) {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
  return parts
    .map((x) => (x === null || x === undefined ? '' : String(x).trim()))
    .filter(Boolean);
}

async function getShipdayOrderContext(deliveryRequestId) {
  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('*')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request) return { error: 'Request not found' };

  const { data: logRows } = await supabaseClient
    .from('delivery_dispatch_log')
    .select('broker_job_id, result')
    .eq('delivery_request_id', deliveryRequestId)
    .eq('broker_id', 'shipday')
    .eq('result', 'accepted')
    .not('broker_job_id', 'is', null)
    .order('attempt_order', { ascending: false })
    .limit(1);

  const shipdayOrderId = logRows?.[0]?.broker_job_id;
  if (!shipdayOrderId) return { error: 'No Shipday order for this request yet' };

  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) return { error: 'Shipday is not configured' };

  const config = await getDeliveryConfigFull();
  const shipdayConfig = config?.brokers?.shipday;
  const onDemandBase = getShipdayOnDemandBaseUrl(baseUrl);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${apiKey}`,
  };

  return {
    request,
    shipdayOrderId: String(shipdayOrderId),
    baseUrl: baseUrl.replace(/\/$/, ''),
    onDemandBase,
    headers,
    shipdayConfig,
    preferredIds: coalescePreferredCarrierIds(shipdayConfig?.preferred_carrier_ids),
  };
}

/**
 * Resolve the Shipday estimate row the customer selected (by estimate_id if present, else provider name).
 * Does not fall back to an arbitrary first estimate — wrong match must yield null so the caller can retry full collect.
 */
function findOnDemandEstimateForConfirm(estimates, providerName, estimateId) {
  if (!estimates || estimates.length === 0) return null;
  const wantId = estimateId != null ? String(estimateId).trim() : '';
  if (wantId) {
    const byId = estimates.find((e) => e && String(e.id || '').trim() === wantId);
    if (byId) return byId;
  }
  const pref = String(providerName || '').trim();
  if (!pref) return null;
  if (isCheapestMode(pref)) {
    return pickOnDemandEstimate(estimates, 'cheapest');
  }
  const pl = pref.toLowerCase();
  const exact = estimates.find((e) => e && String(e.name || '').toLowerCase() === pl);
  if (exact) return exact;
  return estimates.find((e) => e && String(e.name || '').toLowerCase().includes(pl)) || null;
}

async function collectEstimatesAfterCreate(shipdayOrderId, onDemandBase, authHeader) {
  const preEst = Number(process.env.SHIPDAY_POST_CREATE_BEFORE_ESTIMATE_MS);
  const createWaitMs = Number.isFinite(preEst) && preEst >= 0 ? preEst : 2500;
  if (createWaitMs > 0) await sleep(createWaitMs);
  const authH = { Authorization: authHeader.Authorization };
  let estimates = await collectOnDemandEstimates(shipdayOrderId, onDemandBase, authH);
  if (!estimates || estimates.length === 0) {
    const retryMs = Number(process.env.SHIPDAY_ESTIMATE_RETRY_DELAY_MS);
    const wait = Number.isFinite(retryMs) && retryMs >= 0 ? retryMs : 3000;
    await sleep(wait);
    estimates = await collectOnDemandEstimates(shipdayOrderId, onDemandBase, authH);
  }
  const postEstimateDelay = Number(process.env.SHIPDAY_POST_ESTIMATE_DELAY_MS);
  const pauseMs = Number.isFinite(postEstimateDelay) && postEstimateDelay >= 0 ? postEstimateDelay : 1500;
  if (pauseMs > 0) await sleep(pauseMs);
  return estimates || [];
}

/**
 * Priced options for dashboard (customer price only in API response).
 */
export async function getCarrierOptionsForRequest(deliveryRequestId, businessId) {
  const ctx = await getShipdayOrderContext(deliveryRequestId);
  if (ctx.error) return { success: false, error: ctx.error };

  const { request, shipdayOrderId, onDemandBase, headers } = ctx;
  if (businessId && request.business_id !== businessId) {
    return { success: false, error: 'Forbidden' };
  }
  if (request.status !== 'ChoosingCarrier') {
    return { success: false, error: 'Carrier choice is not required for this delivery' };
  }
  if (!onDemandBase) {
    return { success: false, error: 'On-demand delivery is not available (missing API base)' };
  }

  const config = await getDeliveryConfigFull();
  if (!isShipdayOnDemandEnabledFlag(config?.brokers?.shipday?.on_demand_enabled)) {
    return { success: false, error: 'On-demand delivery is not enabled' };
  }

  const estimates = await collectEstimatesAfterCreate(shipdayOrderId, onDemandBase, headers);
  const businessIdForPricing = request.business_id || null;

  const priced = [];
  for (const e of estimates) {
    const feeUsd = Number(e.fee);
    if (!e?.name || !Number.isFinite(feeUsd) || feeUsd < 0) continue;
    const pricing = await calculateDeliveryPrice({ cost_usd: feeUsd, business_id: businessIdForPricing });
    priced.push({
      estimate_id: e.id != null ? String(e.id) : '',
      provider_name: String(e.name).trim(),
      price_cad: pricing.final_price_cad,
      amount_cents: pricing.amount_cents,
      disclaimer: pricing.disclaimer || PRICE_DISCLAIMER,
    });
  }

  return {
    success: true,
    disclaimer: PRICE_DISCLAIMER,
    estimates: priced,
    fleet_fallback_available: ctx.preferredIds.length > 0,
  };
}

async function runOnDemandAssignVariants(axios, assignUrl, match, shipdayOrderId, shipdayConfig, headers) {
  const assignBaseOpts = {
    contactlessDelivery: shipdayConfig?.on_demand_contactless === true,
    tip: shipdayConfig?.on_demand_tip,
  };
  const assignVariants = [
    { podTypes: ['SIGNATURE', 'PHOTO'] },
    { podTypes: ['PHOTO'] },
    { omitPodTypes: true },
    { omitPodTypes: true, omitEstimateReference: true },
  ];
  let assignRes = null;
  for (let vi = 0; vi < assignVariants.length; vi++) {
    let assignBody;
    try {
      assignBody = buildOnDemandAssignBody(match, shipdayOrderId, {
        ...assignBaseOpts,
        ...assignVariants[vi],
      });
    } catch {
      assignBody = null;
    }
    if (!assignBody) break;
    try {
      assignRes = await postOnDemandAssignWithRetry(axios, assignUrl, assignBody, headers);
    } catch {
      assignRes = { status: 0, data: null };
    }
    if (isShipdayOnDemandAssignSuccess(assignRes)) {
      break;
    }
  }
  return assignRes;
}

/**
 * Assign selected on-demand provider; persist customer price from pricing engine (not Shipday billable).
 */
export async function confirmOnDemandCarrierForRequest(deliveryRequestId, businessId, body) {
  try {
    return await confirmOnDemandCarrierForRequestImpl(deliveryRequestId, businessId, body);
  } catch (err) {
    console.error('[CarrierChoice] confirmOnDemandCarrierForRequest unexpected:', err?.stack || err?.message || err);
    return {
      success: false,
      error: err?.message ? String(err.message) : 'Confirm carrier failed unexpectedly. Check server logs.',
    };
  }
}

async function confirmOnDemandCarrierForRequestImpl(deliveryRequestId, businessId, body) {
  const providerName = body?.provider_name != null ? String(body.provider_name).trim() : '';
  const estimateId = body?.estimate_id != null ? String(body.estimate_id).trim() : '';
  if (!providerName) return { success: false, error: 'provider_name is required' };

  const ctx = await getShipdayOrderContext(deliveryRequestId);
  if (ctx.error) return { success: false, error: ctx.error };

  const { request, shipdayOrderId, onDemandBase, baseUrl, headers, shipdayConfig } = ctx;
  if (businessId && request.business_id !== businessId) {
    return { success: false, error: 'Forbidden' };
  }
  if (request.status !== 'ChoosingCarrier') {
    return { success: false, error: 'This delivery is not waiting for a carrier choice' };
  }
  if (!onDemandBase) return { success: false, error: 'On-demand is not configured' };

  /** Avoid collectEstimatesAfterCreate + full collect here (~15–25s+); that exceeded the dashboard 30s client timeout. */
  let estimates = await fetchOnDemandEstimatesForConfirm(shipdayOrderId, onDemandBase, headers, providerName);
  let match = findOnDemandEstimateForConfirm(estimates, providerName, estimateId);
  if (!match) {
    console.log('[CarrierChoice] confirm: fast estimate fetch did not resolve selection; running full collect');
    estimates = await collectOnDemandEstimates(shipdayOrderId, onDemandBase, headers);
    match = findOnDemandEstimateForConfirm(estimates, providerName, estimateId);
  }
  if (!match) {
    console.warn(
      '[CarrierChoice] confirm: no estimate for provider',
      JSON.stringify(providerName),
      'wantId',
      estimateId,
      'shipdayOrderId',
      shipdayOrderId,
      'sample names',
      (estimates || []).slice(0, 6).map((e) => `${e?.name}:${e?.id}`)
    );
    return { success: false, error: 'That delivery option is no longer available. Refresh the list and try again.' };
  }

  const feeUsd = Number(match.fee);
  if (!Number.isFinite(feeUsd) || feeUsd < 0) {
    return { success: false, error: 'Invalid estimate from Shipday' };
  }

  const pricing = await calculateDeliveryPrice({
    cost_usd: feeUsd,
    business_id: request.business_id || null,
  });

  const axios = (await import('axios')).default;
  const assignUrl = `${String(onDemandBase).replace(/\/$/, '')}/assign`;
  const assignRes = await runOnDemandAssignVariants(axios, assignUrl, match, shipdayOrderId, shipdayConfig, headers);

  if (!isShipdayOnDemandAssignSuccess(assignRes)) {
    const msg =
      assignRes?.data?.errorMessage ||
      assignRes?.data?.message ||
      (typeof assignRes?.data?.error === 'string' ? assignRes.data.error : null) ||
      `Assign failed (${assignRes?.status || 'network'})`;
    console.warn('[CarrierChoice] confirm: Shipday assign rejected', assignRes?.status, assignRes?.data);
    return { success: false, error: String(msg) };
  }

  const cents = Math.max(0, Math.round(Number(pricing.amount_cents)));
  const safeCents = Number.isFinite(cents) ? cents : 0;
  const providerDb = providerName.slice(0, QUOTED_ON_DEMAND_PROVIDER_MAX_LEN);

  const { error: upErr } = await supabaseClient
    .from('delivery_requests')
    .update({
      status: 'Dispatched',
      amount_quoted_cents: safeCents,
      quoted_on_demand_provider: providerDb,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryRequestId);
  if (upErr) {
    console.error('[CarrierChoice] confirm: DB update failed after Shipday assign', upErr.message || upErr);
    return {
      success: false,
      error:
        'Carrier was assigned in Shipday but we could not save your request. Contact support with your reference number.',
    };
  }

  return {
    success: true,
    provider_name: providerName,
    amount_cents: safeCents,
    final_price_cad: pricing.final_price_cad,
    disclaimer: pricing.disclaimer,
  };
}

/**
 * When no third-party quotes: assign own fleet carrier from Shipday settings.
 */
export async function confirmFleetCarrierForRequest(deliveryRequestId, businessId) {
  try {
    return await confirmFleetCarrierForRequestImpl(deliveryRequestId, businessId);
  } catch (err) {
    console.error('[CarrierChoice] confirmFleetCarrierForRequest unexpected:', err?.stack || err?.message || err);
    return {
      success: false,
      error: err?.message ? String(err.message) : 'Fleet confirm failed unexpectedly. Check server logs.',
    };
  }
}

async function confirmFleetCarrierForRequestImpl(deliveryRequestId, businessId) {
  const ctx = await getShipdayOrderContext(deliveryRequestId);
  if (ctx.error) return { success: false, error: ctx.error };

  const { request, shipdayOrderId, baseUrl, headers, preferredIds } = ctx;
  if (businessId && request.business_id !== businessId) {
    return { success: false, error: 'Forbidden' };
  }
  if (request.status !== 'ChoosingCarrier') {
    return { success: false, error: 'This delivery is not waiting for a carrier choice' };
  }
  if (!preferredIds.length) {
    return { success: false, error: 'No fleet carrier is configured for fallback' };
  }

  const carrierId = preferredIds[0];
  const axios = (await import('axios')).default;
  const orderNumber = String(request.reference_number || '').trim();
  try {
    const assignUrlFleet = `${baseUrl}/orders/assign/${encodeURIComponent(shipdayOrderId)}/${encodeURIComponent(carrierId)}`;
    const fleetRes = await axios.put(assignUrlFleet, null, { headers, timeout: 10000, validateStatus: (s) => s < 500 });
    if (fleetRes.status !== 204 && fleetRes.status !== 200) {
      return { success: false, error: fleetRes.data?.message || `Fleet assign failed (${fleetRes.status})` };
    }
    await sleep(1500);
    let amountCents = null;
    if (orderNumber) {
      const getUrl = `${baseUrl}/orders/${encodeURIComponent(orderNumber)}`;
      const getRes = await axios.get(getUrl, {
        headers: { Accept: 'application/json', Authorization: headers.Authorization },
        timeout: 10000,
        validateStatus: (s) => s < 500,
      });
      if (getRes.status === 200 && Array.isArray(getRes.data) && getRes.data.length > 0) {
        const costing = getRes.data[0]?.costing;
        const totalCost = costing?.totalCost != null ? Number(costing.totalCost) : null;
        const deliveryFee = costing?.deliveryFee != null ? Number(costing.deliveryFee) : null;
        const amountUsd = totalCost != null && totalCost > 0 ? totalCost : deliveryFee != null && deliveryFee > 0 ? deliveryFee : null;
        if (amountUsd != null && amountUsd > 0) {
          const pricing = await calculateDeliveryPrice({
            cost_usd: amountUsd,
            business_id: request.business_id || null,
          });
          amountCents = pricing.amount_cents;
        }
      }
    }

    const updates = {
      status: 'Dispatched',
      quoted_on_demand_provider: null,
      updated_at: new Date().toISOString(),
    };
    if (amountCents != null) {
      const r = Math.max(0, Math.round(Number(amountCents)));
      if (Number.isFinite(r)) updates.amount_quoted_cents = r;
    }

    const { error: fleetUpErr } = await supabaseClient.from('delivery_requests').update(updates).eq('id', deliveryRequestId);
    if (fleetUpErr) {
      console.error('[CarrierChoice] fleet confirm: DB update failed', fleetUpErr.message || fleetUpErr);
      return {
        success: false,
        error: 'Fleet was assigned in Shipday but we could not update your request. Contact support.',
      };
    }

    return { success: true, mode: 'fleet', amount_cents: amountCents };
  } catch (e) {
    return { success: false, error: e?.message || 'Fleet assign failed' };
  }
}
