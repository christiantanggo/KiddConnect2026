/**
 * Orbix Trick Question Generator Service
 *
 * Same pipeline shape as dad-joke-generator:
 * - Trick question (setup) + surprising answer (punchline)
 * - Voice reads setup only; answer after countdown on screen + TTS
 * - Duplicate prevention via content_fingerprint (category trickquestion)
 * - Family safe; no politics, religion, adult, dark humor, profanity
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

export function computeTrickQuestionFingerprint(setup, punchline) {
  const a = normalizeForFingerprint(setup);
  const b = normalizeForFingerprint(punchline);
  return crypto.createHash('sha256').update(`${a}|${b}`).digest('hex');
}

export async function isTrickQuestionDuplicate(businessId, channelId, fingerprint) {
  if (!fingerprint || !channelId) return false;
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', 'trickquestion')
    .eq('content_fingerprint', fingerprint)
    .maybeSingle();
  if (error) {
    console.error('[Trick Question Generator] Duplicate check error:', error.message);
    return false;
  }
  return !!data;
}

async function loadRecentItems(businessId, channelId, limit = 50) {
  if (!businessId || !channelId) return [];
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('snippet')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', 'trickquestion')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const out = [];
  for (const row of data) {
    try {
      const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
      if (parsed?.setup && parsed?.punchline) out.push({ setup: parsed.setup, punchline: parsed.punchline });
    } catch (_) {}
  }
  return out;
}

const MAX_ATTEMPTS = 5;

/**
 * Generate one trick question (setup misleads; punchline is the surprising answer).
 * JSON shape matches dad joke: setup, punchline, voice_script, hook.
 */
export async function generateAndValidateTrickQuestion(businessId, channelId, options = {}) {
  const episodeNumber = options.episodeNumber ?? 1;
  const openai = getOpenAIClient();
  const recent = await loadRecentItems(businessId, channelId, 80);

  const recentText = recent.length
    ? `\n\nAlready used (do NOT repeat or trivially rephrase):\n${recent.slice(0, 15).map(j => `- ${j.setup} → ${j.punchline}`).join('\n')}`
    : '';

  const systemPrompt = `You are a writer for "Orbix – Trick Questions", a YouTube Shorts channel. One trick question per video.

RULES:
- TRICK QUESTIONS: The setup sounds like it has an obvious answer, but the real answer is surprising or counterintuitive (wordplay, logic trap, common misconception).
- CLEAN / FAMILY SAFE: no politics, religion, offensive content, adult themes, dark humor, profanity.
- SHORT: setup 8–20 words, punchline 3–15 words. Readable on screen quickly.
- Voice script: only the SETUP read aloud (natural pace). Do NOT read the punchline in voice_script — it appears on screen after a countdown, then TTS says it.
- Output valid JSON only.`;

  const userPrompt = `Generate one trick question. Episode ${episodeNumber}.${recentText}

Return JSON:
{
  "setup": "<trick question / misleading prompt, 8-20 words>",
  "punchline": "<surprising answer, 3-15 words>",
  "voice_script": "<only the setup, read aloud naturally>"
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
        max_tokens: 220,
        response_format: { type: 'json_object' }
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const setup = (parsed.setup || '').trim().slice(0, 200);
      const punchline = (parsed.punchline || '').trim().slice(0, 100);
      const voice_script = (parsed.voice_script || setup).trim().slice(0, 300);
      if (!setup || !punchline) continue;

      const content_fingerprint = computeTrickQuestionFingerprint(setup, punchline);
      if (await isTrickQuestionDuplicate(businessId, channelId, content_fingerprint)) {
        console.log(`[Trick Question Generator] Attempt ${attempt}: duplicate fingerprint, retrying`);
        continue;
      }

      const { getTrickQuestionCta } = await import('./trick-question-cta.js');
      return {
        setup,
        punchline,
        voice_script,
        content_fingerprint,
        episode_number: episodeNumber,
        hook: getTrickQuestionCta(episodeNumber)
      };
    } catch (err) {
      console.error(`[Trick Question Generator] Attempt ${attempt} error:`, err?.message);
      if (attempt === MAX_ATTEMPTS) throw err;
    }
  }
  console.warn('[Trick Question Generator] All attempts exhausted (invalid response or duplicates)');
  return null;
}
