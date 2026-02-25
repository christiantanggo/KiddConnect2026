/**
 * Orbix Facts — fetch one fact from Numbers API (numbersapi.com).
 * Replaces Wikidata which was returning 403 from Railway's IP.
 * Returns the same payload shape the scraper expects.
 */

import axios from 'axios';
import crypto from 'crypto';

// Numbers API: trivia facts about numbers and dates. No auth, no IP blocking.
const NUMBERS_API = 'http://numbersapi.com';

/**
 * Categories of interesting number ranges to pull trivia from.
 * Each entry is [min, max] inclusive.
 */
const NUMBER_RANGES = [
  [1, 100],       // small numbers — most have interesting trivia
  [101, 500],
  [501, 1000],
  [1001, 9999],
  [10000, 99999]
];

/**
 * Date-based facts: [month, day] pairs for notable historical dates.
 */
const NOTABLE_DATES = [
  [1, 1], [2, 14], [3, 14], [4, 12], [4, 22], [5, 4], [5, 20],
  [6, 6], [7, 4], [7, 20], [8, 6], [9, 11], [10, 14], [11, 9],
  [11, 22], [12, 7], [12, 17], [12, 25]
];

/**
 * Pick a random integer in [min, max] inclusive.
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Fetch a trivia fact about a random number from Numbers API.
 * @returns {Promise<{ number: number, text: string }|null>}
 */
async function fetchNumberFact() {
  const [min, max] = NUMBER_RANGES[randomInt(0, NUMBER_RANGES.length - 1)];
  const n = randomInt(min, max);
  const { data } = await axios.get(`${NUMBERS_API}/${n}/trivia?json`, {
    timeout: 10000,
    headers: { 'User-Agent': 'OrbixNetworkBot/1.0 (Facts channel)' }
  });
  if (!data?.text || data.found === false) return null;
  return { number: n, text: data.text };
}

/**
 * Fetch a fact about a random notable date from Numbers API.
 * @returns {Promise<{ month: number, day: number, text: string }|null>}
 */
async function fetchDateFact() {
  const [month, day] = NOTABLE_DATES[randomInt(0, NOTABLE_DATES.length - 1)];
  const { data } = await axios.get(`${NUMBERS_API}/${month}/${day}/date?json`, {
    timeout: 10000,
    headers: { 'User-Agent': 'OrbixNetworkBot/1.0 (Facts channel)' }
  });
  if (!data?.text || data.found === false) return null;
  return { month, day, text: data.text };
}

/**
 * Fetch one fact. Tries number trivia first (70% of the time), date facts otherwise.
 * Returns the same shape the scraper expects from the old Wikidata implementation.
 * @returns {Promise<{ title: string, fact_text: string, tts_script: string, entity_id: string, content_fingerprint: string, property_id: string }|null>}
 */
export async function fetchOneFact() {
  const useDate = Math.random() < 0.3;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let factText, entityId, propertyId, title;

      if (useDate || attempt === 1) {
        const result = await fetchDateFact();
        if (!result) continue;
        factText = result.text;
        entityId = `date-${result.month}-${result.day}`;
        propertyId = 'date';
        title = `${new Date(2000, result.month - 1, result.day).toLocaleString('default', { month: 'long' })} ${result.day}`;
      } else {
        const result = await fetchNumberFact();
        if (!result) continue;
        factText = result.text;
        entityId = `number-${result.number}`;
        propertyId = 'trivia';
        title = `The number ${result.number}`;
      }

      // Skip if fact is too short or generic
      if (!factText || factText.length < 20) continue;

      const ttsScript = factText;
      const fingerprintInput = `${entityId}|${factText}`;
      const content_fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex').slice(0, 32);

      return {
        title,
        fact_text: factText,
        tts_script: ttsScript,
        entity_id: entityId,
        content_fingerprint,
        property_id: propertyId
      };
    } catch (err) {
      console.warn(`[Facts] Error fetching fact (attempt ${attempt + 1}):`, err.message);
    }
  }

  return null;
}

/**
 * Legacy export — kept so scraper.js import doesn't break.
 * Numbers API doesn't use source URLs, so this is a no-op.
 */
export function parseFactsSourceUrl() {
  return { entityIds: [], preferredProperty: undefined };
}
