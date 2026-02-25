/**
 * Orbix Facts — fetch one fact from Wikidata (entity label + one claim).
 * Used by WIKIDATA_FACTS source type. Returns payload for raw item snippet and content_fingerprint for dedup.
 */

import axios from 'axios';
import crypto from 'crypto';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

/** Default entity IDs: mix of countries, companies, landmarks, people — chosen for interesting/shocking claims. */
const DEFAULT_ENTITY_IDS = [
  'Q30', 'Q145', 'Q142', 'Q183', 'Q148', 'Q38', 'Q55', 'Q16', 'Q17', 'Q668',  // countries
  'Q12418', 'Q8918', 'Q37230', 'Q380', 'Q660', 'Q916', 'Q163', 'Q9072',       // companies (Lehman, Enron, Twitter, Amazon, Microsoft, NASA, Apple, Netflix)
  'Q513', 'Q220', 'Q84', 'Q90', 'Q61', 'Q23430', 'Q35657',                    // places / landmarks (Everest, Rome, London, Paris, DC, Dubai, Burj Khalifa)
  'Q9186', 'Q2349', 'Q7192', 'Q729', 'Q658', 'Q1368'                          // people / topics (Tesla, Columbus, Darwin, Aristotle, cholera, financial crisis)
];

/** Property order: shocking/interesting first, bland demographics last. */
const PROPERTY_PREFERENCE = [
  'P576',   // dissolved — "X was dissolved in Y"
  'P571',   // inception — "X was founded in Y"
  'P1128',  // employees — "X had N employees"
  'P2048',  // height — "X is N m tall"
  'P2044',  // elevation — "X is N m above sea level"
  'P138',   // named after — "X was named after Y"
  'P112',   // founded by — "X was founded by Y"
  'P169',   // CEO — "X's CEO is Y"
  'P580',   // start time — "X started in Y"
  'P582',   // end time — "X ended in Y"
  'P569',   // date of birth — "X was born in Y"
  'P570',   // date of death — "X died in Y"
  'P1279',  // fiscal year
  'P1082'   // population — last resort
];

/**
 * Parse source URL for optional entity ID (and optional property).
 * - "facts://" or "" → use default entity list
 * - "Q30" or "facts://Q30" → use Q30
 * - "Q30,P1082" → use Q30 and prefer property P1082
 * @returns {{ entityIds: string[], preferredProperty?: string }}
 */
export function parseFactsSourceUrl(url) {
  const raw = (url || '').trim().replace(/^facts:\/\//i, '').trim();
  if (!raw) {
    return { entityIds: [...DEFAULT_ENTITY_IDS] };
  }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const entityIds = parts.filter((p) => /^Q\d+$/i.test(p));
  const preferredProperty = parts.find((p) => /^P\d+$/i.test(p)) || undefined;
  if (entityIds.length === 0) {
    return { entityIds: [...DEFAULT_ENTITY_IDS], preferredProperty };
  }
  return { entityIds, preferredProperty };
}

/**
 * Fetch entity labels and claims from Wikidata API.
 * @param {string} entityId - e.g. Q30
 * @returns {Promise<{ label: string, claims: object }|null>}
 */
async function fetchEntity(entityId) {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: entityId,
    format: 'json',
    props: 'labels|claims',
    languages: 'en'
  });
  const { data } = await axios.get(`${WIKIDATA_API}?${params}`, {
    timeout: 15000,
    headers: { 'User-Agent': 'OrbixNetworkBot/1.0 (Facts channel)' }
  });
  const entity = data?.entities?.[entityId];
  if (!entity || entity.missing === '') return null;
  const label = entity.labels?.en?.value || entityId;
  return { label, claims: entity.claims || {} };
}

/**
 * Format a claim value for display (quantity, time, item id, or plain).
 * For item values we return the raw id; caller can optionally resolve to label.
 * @param {Object} mainsnak - claim.mainsnak
 * @returns {string} Short display value
 */
function formatClaimValue(mainsnak) {
  if (!mainsnak?.datavalue) return '';
  const dv = mainsnak.datavalue;
  const type = dv.type;
  const v = dv.value;
  if (type === 'quantity' && v?.amount) {
    const num = parseFloat(v.amount.replace(/^\+/, ''));
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)} billion`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)} million`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)} thousand`;
    return String(Math.round(num));
  }
  if (type === 'time' && v?.time) {
    const match = v.time.match(/^([+-]?\d{4})/);
    return match ? match[1].replace(/^\+/, '') : v.time;
  }
  if (type === 'wikibase-entityid' && v?.id) {
    return v.id; // e.g. Q123
  }
  if (type === 'string' && v) return String(v).slice(0, 80);
  return '';
}

/**
 * Pick one claim from entity and return a fact sentence and TTS script.
 * @param {string} label - Entity label
 * @param {Object} claims - entity.claims
 * @param {string} [preferredProperty] - e.g. P1082
 * @returns {{ factText: string, ttsScript: string, propertyId: string }|null}
 */
function pickOneClaim(label, claims, preferredProperty) {
  const propOrder = preferredProperty
    ? [preferredProperty, ...PROPERTY_PREFERENCE.filter((p) => p !== preferredProperty)]
    : PROPERTY_PREFERENCE;
  const knownTitles = {
    P1082: 'population',
    P571: 'founded in',
    P576: 'dissolved in',
    P169: 'CEO',
    P112: 'founded by',
    P1279: 'fiscal year',
    P1128: 'employee count of',
    P2048: 'height of',
    P2044: 'elevation of',
    P138: 'named after',
    P580: 'start date of',
    P582: 'end date of',
    P569: 'birth year of',
    P570: 'death year of'
  };
  // Punchy verb templates: (label, value) => "Label was dissolved in 2008."
  const verbTemplates = {
    P576: (l, v) => `${l} was dissolved in ${v}.`,
    P571: (l, v) => `${l} was founded in ${v}.`,
    P580: (l, v) => `${l} started in ${v}.`,
    P582: (l, v) => `${l} ended in ${v}.`,
    P569: (l, v) => `${l} was born in ${v}.`,
    P570: (l, v) => `${l} died in ${v}.`,
    P138: (l, v) => `${l} was named after ${v}.`,
    P112: (l, v) => `${l} was founded by ${v}.`
  };
  for (const pid of propOrder) {
    const list = claims[pid];
    if (!list || !list.length) continue;
    const claim = list[0];
    const value = formatClaimValue(claim?.mainsnak);
    if (!value) continue;
    const propName = knownTitles[pid] || pid;
    const factText = verbTemplates[pid]
      ? verbTemplates[pid](label, value)
      : `${label} has a ${propName} ${value}.`;
    return { factText, ttsScript: factText, propertyId: pid };
  }
  return null;
}

/**
 * Fetch one fact for the given source config.
 * @param {Object} source - { url }
 * @returns {Promise<{ title: string, fact_text: string, tts_script: string, entity_id: string, content_fingerprint: string }|null>}
 */
export async function fetchOneFact(source) {
  const { entityIds, preferredProperty } = parseFactsSourceUrl(source?.url);
  const shuffled = [...entityIds].sort(() => Math.random() - 0.5);
  for (const entityId of shuffled) {
    try {
      const entity = await fetchEntity(entityId);
      if (!entity) continue;
      const picked = pickOneClaim(entity.label, entity.claims, preferredProperty);
      if (!picked) continue;
      const { factText, ttsScript, propertyId } = picked;
      const fingerprintInput = `${entityId}|${propertyId}|${factText}`;
      const content_fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex').slice(0, 32);
      return {
        title: entity.label,
        fact_text: factText,
        tts_script: ttsScript,
        entity_id: entityId,
        content_fingerprint,
        property_id: propertyId
      };
    } catch (err) {
      console.warn(`[Wikidata Facts] Error fetching ${entityId}:`, err.message);
    }
  }
  return null;
}
