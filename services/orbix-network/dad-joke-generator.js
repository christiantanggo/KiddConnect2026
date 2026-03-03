/**
 * Orbix Dad Jokes Generator Service
 *
 * Generates one dad joke (setup + punchline) via LLM.
 * - Clean / family safe; no politics, religion, adult, dark humor, profanity
 * - Duplicate prevention via content_fingerprint (stored in orbix_raw_items, category dadjoke)
 * - Short setup and punchline for 7–10s Shorts
 *
 * Format mirrors riddle-generator: same pipeline, content_json, fingerprint in raw items.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function normalizeForFingerprint(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  s = s.replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function computeDadJokeFingerprint(setup, punchline) {
  const a = normalizeForFingerprint(setup);
  const b = normalizeForFingerprint(punchline);
  return crypto.createHash('sha256').update(`${a}|${b}`).digest('hex');
}

export async function isDadJokeDuplicate(businessId, channelId, fingerprint) {
  if (!fingerprint || !channelId) return false;
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', 'dadjoke')
    .eq('content_fingerprint', fingerprint)
    .maybeSingle();
  if (error) {
    console.error('[Dad Joke Generator] Duplicate check error:', error.message);
    return false;
  }
  return !!data;
}

/** Load recent setups/punchlines for similarity avoidance (optional near-duplicate check). */
async function loadRecentJokes(businessId, channelId, limit = 50) {
  if (!businessId || !channelId) return [];
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('snippet')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', 'dadjoke')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const jokes = [];
  for (const row of data) {
    try {
      const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
      if (parsed?.setup && parsed?.punchline) jokes.push({ setup: parsed.setup, punchline: parsed.punchline });
    } catch (_) {}
  }
  return jokes;
}

const MAX_ATTEMPTS = 5;

/**
 * Generate one dad joke, validate duplicate, optionally content policy.
 * @param {string} businessId
 * @param {string} channelId
 * @param {{ episodeNumber?: number }} options
 * @returns {Promise<{ setup, punchline, voice_script, content_fingerprint, episode_number, hook } | null>}
 */
export async function generateAndValidateDadJoke(businessId, channelId, options = {}) {
  const episodeNumber = options.episodeNumber ?? 1;
  const openai = getOpenAIClient();
  const recentJokes = await loadRecentJokes(businessId, channelId, 80);

  const recentText = recentJokes.length
    ? `\n\nJokes already used (do NOT repeat or rephrase these):\n${recentJokes.slice(0, 15).map(j => `- ${j.setup} → ${j.punchline}`).join('\n')}`
    : '';

  const systemPrompt = `You are a dad joke writer for "Orbix – Dad Jokes", a YouTube Shorts channel. One joke per video.

RULES:
- TRUE DAD JOKES ONLY: puns, wordplay, light cringe, classic dad energy.
- CLEAN / FAMILY SAFE: no politics, religion, offensive humor, adult themes, dark humor, profanity.
- SHORT: setup 5–15 words, punchline 3–12 words. Easy to read quickly on screen.
- Setup and punchline must be clearly separated. Punchline should pop.
- Voice script: only the SETUP read aloud naturally (for TTS). Do not include the punchline in voice — it appears on screen after a countdown.
- Output valid JSON only.`;

  const userPrompt = `Generate one dad joke. Episode ${episodeNumber}.${recentText}

Return JSON:
{
  "setup": "<short setup, 5-15 words>",
  "punchline": "<short punchline, 3-12 words>",
  "voice_script": "<only the setup read aloud, natural pace>"
}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const setup = (parsed.setup || '').trim().slice(0, 120);
      const punchline = (parsed.punchline || '').trim().slice(0, 80);
      const voice_script = (parsed.voice_script || setup).trim().slice(0, 300);
      if (!setup || !punchline) continue;

      const content_fingerprint = computeDadJokeFingerprint(setup, punchline);
      const isDup = await isDadJokeDuplicate(businessId, channelId, content_fingerprint);
      if (isDup) {
        console.log(`[Dad Joke Generator] Attempt ${attempt}: duplicate fingerprint, retrying`);
        continue;
      }

      return {
        setup,
        punchline,
        voice_script,
        content_fingerprint,
        episode_number: episodeNumber,
        hook: 'Comment your worst dad joke 👇'
      };
    } catch (err) {
      console.error(`[Dad Joke Generator] Attempt ${attempt} error:`, err?.message);
      if (attempt === MAX_ATTEMPTS) throw err;
    }
  }
  return null;
}
