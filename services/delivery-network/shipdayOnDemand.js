/**
 * Helpers for Shipday on-demand (DoorDash / Uber) estimate + cheapest selection.
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

/**
 * Normalize Shipday estimate response to a list of { name, fee, id }.
 * Handles: top-level array, single object, or nested arrays (estimates, providers, results, data).
 * @param {object|array} raw
 */
export function normalizeEstimateList(raw) {
  if (!raw || raw.error) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((x) => normalizeEstimateList(x)).filter(Boolean);
  }
  const nested = raw.estimates || raw.providers || raw.results || raw.thirdPartyEstimates || raw.data;
  if (Array.isArray(nested)) {
    return nested.flatMap((x) => normalizeEstimateList(x)).filter(Boolean);
  }
  if (nested && typeof nested === 'object' && nested.fee != null) {
    return normalizeEstimateList([nested]);
  }
  if (nested && typeof nested === 'object') {
    return Object.values(nested).flatMap((x) => normalizeEstimateList(x)).filter(Boolean);
  }
  const list = raw.id != null || raw.fee != null ? [raw] : [];
  return list
    .filter((e) => e && e.fee != null && Number(e.fee) > 0)
    .map((e) => ({
      name: e.name,
      fee: Number(e.fee),
      id: e.id != null ? String(e.id) : '',
    }));
}

/**
 * Fetch on-demand estimates for an order. Tries base URL and optional ?name= queries
 * so we can compare DoorDash vs Uber when Shipday returns one provider per call.
 * @returns {Promise<Array<{ name: string, fee: number, id: string }>>}
 */
function buildEstimateQueryUrls(onDemandBase, orderIdEncoded) {
  const b = `${onDemandBase}/estimate/${orderIdEncoded}`;
  const pairs = [
    '',
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
  return pairs.map((q) => (q ? `${b}?${q}` : b));
}

/**
 * Fetch on-demand estimates for an order. Tries many GET query variants + optional POST
 * (Shipday may ignore unknown params but different deployments return different providers).
 */
export async function collectOnDemandEstimates(orderId, onDemandBase, headers) {
  const axios = (await import('axios')).default;
  const id = encodeURIComponent(orderId);
  const hdr = { Accept: 'application/json', 'Content-Type': 'application/json', ...headers };
  const merged = [];

  for (const url of buildEstimateQueryUrls(onDemandBase, id)) {
    try {
      const res = await axios.get(url, { headers: hdr, timeout: 15000, validateStatus: (s) => s < 500 });
      if (res.status !== 200 || !res.data || res.data.error) continue;
      merged.push(...normalizeEstimateList(res.data));
    } catch (_) {
      /* ignore */
    }
  }

  // Some Shipday setups accept POST estimate with explicit third-party name
  const postBodies = [
    { orderId: Number(orderId), name: 'DoorDash' },
    { orderId: Number(orderId), name: 'Uber' },
  ];
  for (const body of postBodies) {
    try {
      const res = await axios.post(`${onDemandBase}/estimate`, body, {
        headers: hdr,
        timeout: 15000,
        validateStatus: (s) => s < 500,
      });
      if (res.status !== 200 || !res.data || res.data.error) continue;
      merged.push(...normalizeEstimateList(res.data));
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
    console.log('[ShipdayOnDemand] collected estimates:', out.map((e) => `${e.name}=$${e.fee.toFixed(2)}`).join(' | '));
  }
  return out;
}

/**
 * Pick estimate for a fixed provider name, or cheapest among DoorDash/Uber-like names.
 * @param {Array<{ name: string, fee: number, id: string }>} estimates
 * @param {string} preferred - 'DoorDash' | 'Uber' | 'cheapest'
 */
export function pickOnDemandEstimate(estimates, preferred) {
  if (!estimates || estimates.length === 0) return null;
  const pref = String(preferred || '').trim();
  if (isCheapestMode(pref)) {
    const candidates = estimates.filter((e) => isDoorDashOrUberName(e.name));
    const pool = candidates.length > 0 ? candidates : estimates;
    let best = pool[0];
    for (const e of pool) {
      if (e.fee < best.fee) best = e;
    }
    return best;
  }
  const pl = pref.toLowerCase();
  const exact = estimates.find((e) => e && String(e.name || '').toLowerCase() === pl);
  if (exact) return exact;
  const fuzzy = estimates.find((e) => e && String(e.name || '').toLowerCase().includes(pl));
  return fuzzy || estimates[0];
}
