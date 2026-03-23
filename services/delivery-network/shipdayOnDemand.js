/**
 * Shipday on-demand (3rd-party) delivery: estimates + assign.
 *
 * Official API (same host as main API, path prefix /on-demand):
 * - GET  /on-demand/services           — enabled providers (name, status, prod)
 * - GET  /on-demand/estimate/{orderId} — quote for an existing order (optionally ?name=Provider)
 * - POST /on-demand/assign             — assign to provider (name, orderId, estimateReference?, tip?, contactlessDelivery?, podType | podTypes)
 * - PUT  /orders/assign/{orderId}/{carrierId} — own fleet (see dispatch.js)
 *
 * @see https://docs.shipday.com/reference/on-demand-delivery
 * @see https://docs.shipday.com/reference/services
 * @see https://docs.shipday.com/reference/estimate
 * @see https://docs.shipday.com/reference/assign
 */

const CHEAPEST_MODE = 'cheapest';

export function isCheapestMode(provider) {
  return String(provider || '').trim().toLowerCase() === CHEAPEST_MODE;
}

/** Whether the name looks like DoorDash or Uber (Shipday may return variations). */
export function isDoorDashOrUberName(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('door') || n.includes('dash') || n.includes('uber');
}

function isEstimateErrorResponse(data) {
  return data && typeof data === 'object' && data.error === true;
}

/** Shipday estimate docs use name + fee; some responses use aliases. */
function estimateDisplayName(e) {
  if (!e || typeof e !== 'object') return '';
  const n =
    e.name ??
    e.serviceName ??
    e.thirdPartyName ??
    e.providerName ??
    e.provider ??
    e.partner ??
    e.deliveryPartner;
  return typeof n === 'string' ? n.trim() : String(n || '').trim();
}

function estimateFeeValue(e) {
  if (!e || typeof e !== 'object') return null;
  const keys = ['fee', 'thirdPartyFee', 'deliveryFee', 'price', 'amount', 'estimatedFee', 'totalFee'];
  for (const k of keys) {
    if (e[k] == null) continue;
    const v = Number(e[k]);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

/**
 * Normalize Shipday estimate response to a list of { name, fee, id }.
 * Per docs, a successful estimate object has id, name, fee, error: false.
 * @param {object|array} raw
 */
export function normalizeEstimateList(raw) {
  if (!raw || isEstimateErrorResponse(raw)) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((x) => normalizeEstimateList(x)).filter(Boolean);
  }
  const nested = raw.estimates || raw.providers || raw.results || raw.thirdPartyEstimates || raw.data;
  if (Array.isArray(nested)) {
    return nested.flatMap((x) => normalizeEstimateList(x)).filter(Boolean);
  }
  if (nested && typeof nested === 'object' && (nested.fee != null || estimateFeeValue(nested) != null)) {
    return normalizeEstimateList([nested]);
  }
  if (nested && typeof nested === 'object') {
    return Object.values(nested).flatMap((x) => normalizeEstimateList(x)).filter(Boolean);
  }
  const list = raw.id != null || raw.fee != null || estimateFeeValue(raw) != null ? [raw] : [];
  return list
    .filter((e) => {
      if (!e || isEstimateErrorResponse(e)) return false;
      const name = estimateDisplayName(e);
      const fee = estimateFeeValue(e);
      return Boolean(name) && fee != null;
    })
    .map((e) => ({
      name: estimateDisplayName(e),
      fee: estimateFeeValue(e),
      id: e.id != null ? String(e.id) : e.referenceId != null ? String(e.referenceId) : e.estimateId != null ? String(e.estimateId) : '',
    }));
}

/**
 * GET /on-demand/services — providers enabled for the account (per Shipday docs).
 * @returns {Promise<string[]>} service names with status === true
 */
export async function fetchEnabledOnDemandServiceNames(onDemandBase, headers) {
  const axios = (await import('axios')).default;
  const hdr = { Accept: 'application/json', 'Content-Type': 'application/json', ...headers };
  const url = `${String(onDemandBase).replace(/\/$/, '')}/services`;
  try {
    const res = await axios.get(url, { headers: hdr, timeout: 12000, validateStatus: (s) => s < 500 });
    if (res.status !== 200 || !Array.isArray(res.data)) return [];
    return res.data
      .filter((s) => s && s.status === true && s.name && String(s.name).trim())
      .map((s) => String(s.name).trim());
  } catch (e) {
    console.warn('[ShipdayOnDemand] GET /services failed:', e?.message || e);
    return [];
  }
}

function buildLegacyEstimateQueryUrls(onDemandBase, orderIdEncoded) {
  const b = `${onDemandBase}/estimate/${orderIdEncoded}`;
  const pairs = [
    'name=DoorDash',
    'name=Uber',
    'provider=DoorDash',
    'provider=Uber',
    'thirdPartyName=DoorDash',
    'thirdPartyName=Uber',
    'serviceName=DoorDash',
    'serviceName=Uber',
    'partner=DoorDash',
    'partner=Uber',
    'deliveryPartner=DoorDash',
    'deliveryPartner=Uber',
  ];
  return pairs.map((q) => `${b}?${q}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Collect estimates per Shipday flow: services list + GET /estimate/{orderId} for each enabled name,
 * plus unqualified estimate and legacy query variants.
 * @returns {Promise<Array<{ name: string, fee: number, id: string }>>}
 */
export async function collectOnDemandEstimates(orderId, onDemandBase, headers) {
  const axios = (await import('axios')).default;
  const id = encodeURIComponent(orderId);
  const hdr = { Accept: 'application/json', 'Content-Type': 'application/json', ...headers };
  const merged = [];
  const base = String(onDemandBase).replace(/\/$/, '');

  const ingest = (data) => {
    if (!data || isEstimateErrorResponse(data)) return;
    merged.push(...normalizeEstimateList(data));
  };

  const gapMs = Math.min(2000, Math.max(0, Number(process.env.SHIPDAY_ESTIMATE_STAGGER_MS) || 250));

  // 1) Canonical: GET /estimate/{orderId} (all providers Shipday returns in one call, if supported)
  try {
    const res = await axios.get(`${base}/estimate/${id}`, {
      headers: hdr,
      timeout: 15000,
      validateStatus: (s) => s < 500,
    });
    if (res.status === 200) ingest(res.data);
  } catch (_) {
    /* ignore */
  }

  // 2) GET /services then GET /estimate/{orderId}?name=<exact name> for each enabled provider (documented pattern)
  const serviceNames = await fetchEnabledOnDemandServiceNames(base, headers);
  if (serviceNames.length > 0) {
    console.log('[ShipdayOnDemand] enabled on-demand services from API:', serviceNames.join(', '));
  }
  for (const svcName of serviceNames) {
    if (gapMs) await sleep(gapMs);
    try {
      const res = await axios.get(`${base}/estimate/${id}?name=${encodeURIComponent(svcName)}`, {
        headers: hdr,
        timeout: 15000,
        validateStatus: (s) => s < 500,
      });
      if (res.status === 200) ingest(res.data);
    } catch (_) {
      /* ignore */
    }
  }

  // 3) Legacy hard-coded provider query strings (accounts that don’t expose /services)
  for (const url of buildLegacyEstimateQueryUrls(base, id)) {
    if (gapMs) await sleep(gapMs);
    try {
      const res = await axios.get(url, { headers: hdr, timeout: 15000, validateStatus: (s) => s < 500 });
      if (res.status === 200) ingest(res.data);
    } catch (_) {
      /* ignore */
    }
  }

  // 4) POST /estimate with orderId + name (some tenants support this)
  const postNames = [...new Set([...serviceNames, 'DoorDash', 'Uber'])];
  for (const name of postNames) {
    if (gapMs) await sleep(gapMs);
    try {
      const oid = Number(orderId);
      const body = Number.isFinite(oid) ? { orderId: oid, name } : { name };
      const res = await axios.post(`${base}/estimate`, body, {
        headers: hdr,
        timeout: 15000,
        validateStatus: (s) => s < 500,
      });
      if (res.status === 200) ingest(res.data);
    } catch (_) {
      /* endpoint may not exist */
    }
  }

  const byName = new Map();
  for (const e of merged) {
    const key = String(e.name || '').toLowerCase().trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || e.fee < prev.fee) byName.set(key, e);
  }
  const out = [...byName.values()];
  if (out.length > 0) {
    console.log('[ShipdayOnDemand] collected estimates:', out.map((e) => `${e.name}=$${Number(e.fee).toFixed(2)}`).join(' | '));
  }
  return out;
}

/**
 * Fast path before on-demand assign: two parallel GETs (all estimates + provider-specific).
 * Avoids /services crawl, legacy query strings, and POST /estimate — saves ~10–20s vs collectOnDemandEstimates.
 */
export async function fetchOnDemandEstimatesForConfirm(orderId, onDemandBase, headers, providerName) {
  const axios = (await import('axios')).default;
  const id = encodeURIComponent(String(orderId));
  const base = String(onDemandBase).replace(/\/$/, '');
  const hdr = { Accept: 'application/json', 'Content-Type': 'application/json', ...headers };
  const timeout = 15000;
  const name = String(providerName || '').trim();

  const tryGet = async (querySuffix) => {
    const url = querySuffix ? `${base}/estimate/${id}${querySuffix}` : `${base}/estimate/${id}`;
    try {
      const res = await axios.get(url, {
        headers: hdr,
        timeout,
        validateStatus: (s) => s < 500,
      });
      if (res.status === 200) return normalizeEstimateList(res.data);
    } catch (_) {
      /* ignore */
    }
    return [];
  };

  const [fromBroad, fromNamed] = await Promise.all([
    tryGet(''),
    name ? tryGet(`?name=${encodeURIComponent(name)}`) : Promise.resolve([]),
  ]);

  const merged = [...fromBroad, ...fromNamed];
  const byName = new Map();
  for (const e of merged) {
    const key = String(e.name || '').toLowerCase().trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || Number(e.fee) < Number(prev.fee)) byName.set(key, e);
  }
  return [...byName.values()];
}

/**
 * Pick estimate for a fixed provider name, or lowest fee among all returned estimates (cheapest mode).
 * @param {Array<{ name: string, fee: number, id: string }>} estimates
 * @param {string} preferred - 'DoorDash' | 'Uber' | 'cheapest'
 */
export function pickOnDemandEstimate(estimates, preferred) {
  if (!estimates || estimates.length === 0) return null;
  const pref = String(preferred || '').trim();
  if (isCheapestMode(pref)) {
    const valid = estimates.filter((e) => e && Number.isFinite(Number(e.fee)) && Number(e.fee) >= 0);
    if (valid.length === 0) return estimates[0] || null;
    let best = valid[0];
    for (const e of valid) {
      if (Number(e.fee) < Number(best.fee)) best = e;
    }
    return best;
  }
  const pl = pref.toLowerCase();
  const exact = estimates.find((e) => e && String(e.name || '').toLowerCase() === pl);
  if (exact) return exact;
  const fuzzy = estimates.find((e) => e && String(e.name || '').toLowerCase().includes(pl));
  return fuzzy || estimates[0];
}

/**
 * Pick which estimate to assign for a **new** Shipday order. Quote used a different temp order; we must use
 * this order's estimates + estimateReference. Treat DB value "cheapest" as unset (not a Shipday provider name).
 *
 * @param {Array<{ name: string, fee: number, id: string }>} estimates
 * @param {string|null|undefined} quotedFromRequest - delivery_requests.quoted_on_demand_provider
 * @param {string} preferredOnDemand - config e.g. 'cheapest' | 'DoorDash'
 */
export function resolveOnDemandAssignEstimate(estimates, quotedFromRequest, preferredOnDemand) {
  const raw = quotedFromRequest != null ? String(quotedFromRequest).trim() : '';
  const pref = String(preferredOnDemand || 'cheapest').trim() || 'cheapest';
  if (!estimates || estimates.length === 0) return null;

  // Literal "cheapest" in DB is not assignable — recompute lowest fee on this order.
  if (!raw || /^cheapest$/i.test(raw)) {
    return pickOnDemandEstimate(estimates, pref);
  }

  const ql = raw.toLowerCase();
  const exact = estimates.find((e) => e?.name && String(e.name).toLowerCase() === ql);
  if (exact) return exact;

  const fuzzy = estimates.filter((e) => e?.name && String(e.name).toLowerCase().includes(ql));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) return pickOnDemandEstimate(fuzzy, 'cheapest');

  console.warn('[ShipdayOnDemand] quoted provider not in estimates for this order:', raw, '— using', pref);
  return pickOnDemandEstimate(estimates, pref);
}

/**
 * Build POST /on-demand/assign body per https://docs.shipday.com/reference/assign
 * Required: name, orderId (integer). Optional: estimateReference, tip, contactlessDelivery, podType | podTypes.
 */
export function buildOnDemandAssignBody(match, shipdayOrderId, options = {}) {
  const oid = Number(shipdayOrderId);
  if (!Number.isFinite(oid) || oid <= 0) {
    throw new Error(`Invalid Shipday orderId for on-demand assign: ${shipdayOrderId}`);
  }
  const name = match?.name && String(match.name).trim();
  if (!name) {
    throw new Error('On-demand assign requires estimate.name (3rd party service provider name)');
  }
  const body = {
    name,
    orderId: oid,
    contactlessDelivery: options.contactlessDelivery === true,
  };
  if (!options.omitPodTypes) {
    const pt =
      Array.isArray(options.podTypes) && options.podTypes.length ? options.podTypes : ['SIGNATURE', 'PHOTO'];
    body.podTypes = pt;
  }
  if (!options.omitEstimateReference && match.id != null && String(match.id).trim()) {
    body.estimateReference = String(match.id).trim();
  }
  const tip = options.tip != null ? Number(options.tip) : NaN;
  if (Number.isFinite(tip) && tip > 0) {
    body.tip = tip;
  }
  return body;
}
