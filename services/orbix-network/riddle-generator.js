/**
 * Orbix Riddle Generator Service
 *
 * Generates riddles via LLM with:
 *  - Category distribution (WORDPLAY, LOGIC, OBJECT, NATURE, SCIENCE, CULTURE)
 *  - Quality scoring (picks best candidate that is under quota)
 *  - Anti-streak rule (prevents same category back-to-back)
 *  - Subtopic rotation within categories for variety
 *  - Content policy check and fingerprint deduplication
 *  - CSV seed upload support (seeds stored as SEED source_type in content_fingerprint)
 *
 * Format mirrors trivia-generator.js exactly — same pipeline, same DB columns,
 * same fingerprint approach. The render format is riddle → 3-2-1 countdown → answer flash.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

// ─── Category Buckets & Distribution Model ────────────────────────────────────

export const RIDDLE_CATEGORIES = {
  WORDPLAY: {
    label: 'Wordplay',
    description: 'Puns, homophones, letter games, rhymes, double meanings — riddles solved through language play',
  },
  LOGIC: {
    label: 'Logic',
    description: 'Pure reasoning puzzles — sequences, deductions, "what am I" logic chains with no trick wording',
  },
  OBJECT: {
    label: 'Object',
    description: 'Everyday physical objects described from unusual angles — household items, tools, food, clothing',
  },
  NATURE: {
    label: 'Nature',
    description: 'Animals, plants, weather, seasons, the natural world described in riddle form',
  },
  SCIENCE: {
    label: 'Science',
    description: 'Physics, chemistry, biology, space — scientific concepts described as riddles without jargon',
  },
  CULTURE: {
    label: 'Culture',
    description: 'History, mythology, famous landmarks, traditions — culturally universal, no politics or religion',
  }
};

// Target percentage distribution (must sum to 100)
export const RIDDLE_MIX_MODEL = {
  WORDPLAY: 20,
  LOGIC:    20,
  OBJECT:   25,
  NATURE:   15,
  SCIENCE:  10,
  CULTURE:  10
};

// How many candidates to generate in parallel per run
const N_CANDIDATES = 7;

// How many recent items to look at when computing category distribution
const MIX_HISTORY_WINDOW = 30;

// Subtopics within each category — rotated to prevent ruts
const CATEGORY_SUBTOPICS = {
  WORDPLAY: [
    'homophones', 'double meanings', 'letter riddles', 'rhyming clues',
    'word within a word', 'silent letters', 'anagrams', 'compound words'
  ],
  LOGIC: [
    'what am I deductions', 'sequence riddles', 'always/never rules',
    'the more you take the more you leave', 'paradox riddles', 'number logic',
    'directional logic', 'time riddles'
  ],
  OBJECT: [
    'kitchen items', 'tools', 'furniture', 'clothing', 'stationery',
    'vehicles', 'musical instruments', 'food and drink', 'electronics'
  ],
  NATURE: [
    'animals', 'insects', 'birds', 'ocean creatures', 'trees and plants',
    'weather events', 'seasons', 'rivers and mountains', 'the sky and stars'
  ],
  SCIENCE: [
    'light and shadow', 'gravity', 'magnets', 'fire', 'ice and water',
    'the human body', 'plants and photosynthesis', 'space and orbits', 'sound and echo'
  ],
  CULTURE: [
    'ancient landmarks', 'mythology creatures', 'classic inventions',
    'world traditions', 'famous symbols', 'timekeeping', 'currencies and trade'
  ]
};

// ─── OpenAI Client ────────────────────────────────────────────────────────────

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

// ─── Fingerprinting & Deduplication ──────────────────────────────────────────

function normalizeForFingerprint(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const contractions = [
    [/\bwhat's\b/g, 'what is'], [/\bwhat're\b/g, 'what are'],
    [/\bit's\b/g, 'it is'], [/\bit'll\b/g, 'it will'],
    [/\bthat's\b/g, 'that is'], [/\bthat'll\b/g, 'that will'],
    [/\bwho's\b/g, 'who is'], [/\bwhere's\b/g, 'where is'],
    [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'],
    [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'],
    [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'],
    [/\bwasn't\b/g, 'was not'], [/\bweren't\b/g, 'were not'],
    [/\bi'm\b/g, 'i am'], [/\bi've\b/g, 'i have'],
    [/\bi'll\b/g, 'i will'], [/\bi'd\b/g, 'i would']
  ];
  for (const [re, sub] of contractions) s = s.replace(re, sub);
  s = s.replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function computeRiddleFingerprint(riddleText, answerText) {
  const r = normalizeForFingerprint(riddleText);
  const a = (answerText || '').trim().toUpperCase();
  return crypto.createHash('sha256').update(`${r}|${a}`).digest('hex');
}

export async function isRiddleDuplicate(businessId, channelId, fingerprint) {
  if (!fingerprint || !channelId) return false;
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('content_fingerprint', fingerprint)
    .maybeSingle();
  if (error) {
    console.error('[Riddle Generator] Duplicate check error:', error.message);
    return false;
  }
  return !!data;
}

// ─── Content Policy Check ─────────────────────────────────────────────────────

export async function checkRiddleContentPolicy(riddle) {
  try {
    const openai = getOpenAIClient();
    const content = `Category: ${riddle.category || 'General'}\nRiddle: ${riddle.riddle_text || ''}\nAnswer: ${riddle.answer_text || ''}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a quality reviewer for a riddle channel targeting adults 16–45.

Riddles use POETIC LANGUAGE and WORDPLAY. A riddle clue can be metaphorically or partially true — that is what makes it a riddle. Only reject if the answer is COMPLETELY IMPOSSIBLE given the clues.

REJECT only if:
1. CONTENT: Sexual content, self-harm, violence, gore, political topics, drugs, hate speech.
2. OBVIOUS NONSENSE: The answer has no logical or metaphorical connection to the clues.
3. FACTUALLY FALSE CLUES: Any clue is literally false for the answer. Examples to REJECT:
   - "I cover you yet never touch your skin" → Clothing. FALSE: clothing touches skin.
   - "I have a shell but no feet" or "no legs" → Snail (or slug). FALSE: snails have a muscular foot; do not approve riddles that say they have "no feet" or "no legs".
   - Any riddle where a biological/anatomical claim about the answer is wrong (e.g. saying a creature has no feet when it does, or no eyes when it does).

APPROVE if:
- Every clue is factually true (or clearly metaphorical in a way that fits the answer).
- Poetic language is fine (e.g. "I have wheels but don't roam" → "A bus").
- When in doubt and the clues are all accurate, APPROVE.

Return JSON only: { "approved": true } or { "approved": false, "reason": "brief reason" }`
        },
        { role: 'user', content }
      ],
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' }
    });
    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return { approved: result.approved !== false, reason: result.reason || null };
  } catch (err) {
    console.error('[Riddle Generator] Content policy check error:', err.message);
    return { approved: true };
  }
}

// ─── Quality Scorer ───────────────────────────────────────────────────────────

/**
 * Score a riddle for short-form retention potential (0–100).
 * Higher = crisper, more satisfying riddle for Shorts audience.
 */
export function scoreRiddle(riddle) {
  if (!riddle) return 0;
  let score = 50;

  const text = (riddle.riddle_text || '').toLowerCase();
  const answer = (riddle.answer_text || '').toLowerCase();
  const category = (riddle.category || '').toLowerCase();

  // +Short riddle text (easy to read in 2–3 seconds on screen)
  const wordCount = text.split(/\s+/).length;
  if (wordCount <= 12) score += 12;
  else if (wordCount <= 18) score += 6;
  else if (wordCount > 30) score -= 15;

  // +Short answer (1–2 words = satisfying reveal)
  const answerWords = answer.split(/\s+/).length;
  if (answerWords === 1) score += 10;
  else if (answerWords === 2) score += 6;
  else if (answerWords > 4) score -= 8;

  // +Riddle doesn't contain the answer word (would make it too easy/obvious)
  if (answer && text.includes(answer)) score -= 20;

  // +Classic riddle structure keywords (engagement signals)
  const classicPatterns = ['i have', 'i am', 'i speak', 'i run', 'i fly', 'i grow', 'i never', 'i always',
    'what has', 'what am i', 'what gets', 'the more', 'the less', 'without a'];
  if (classicPatterns.some(p => text.includes(p))) score += 8;

  // +Category bonuses based on expected engagement
  if (category === 'wordplay') score += 5;
  if (category === 'object') score += 3;
  if (category === 'nature') score += 3;

  // -Penalty for multi-sentence riddles (harder to read quickly in a Short)
  const sentences = (riddle.riddle_text || '').split(/[.!?]+/).filter(s => s.trim().length > 3);
  if (sentences.length > 2) score -= 10;

  // +Hook is short and punchy
  const hook = (riddle.hook || '').split(/\s+/).length;
  if (hook >= 3 && hook <= 7) score += 4;

  return Math.max(0, Math.min(100, score));
}

// ─── History Loader ────────────────────────────────────────────────────────────

async function loadRiddleHistory(businessId, channelId) {
  const empty = { usedAnswers: [], recentRiddles: [], categoryCounts: {}, recentCategories: [] };
  if (!businessId || !channelId) return empty;
  try {
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .select('snippet, created_at')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'riddle')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) return empty;

    const usedAnswers = [];
    const recentRiddles = [];
    const categoryCounts = {};
    const recentCategories = [];

    for (const row of data) {
      try {
        const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
        if (!parsed?.riddle_text) continue;

        const answer = (parsed.answer_text || '').trim();
        if (answer) usedAnswers.push(answer.toLowerCase());
        if (recentRiddles.length < 20) recentRiddles.push(parsed.riddle_text.trim());

        const cat = parsed._category || 'OBJECT';
        if (recentCategories.length < MIX_HISTORY_WINDOW) {
          recentCategories.push(cat);
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      } catch (_) {}
    }

    return { usedAnswers, recentRiddles, categoryCounts, recentCategories };
  } catch (err) {
    console.warn('[Riddle Generator] Failed to load history:', err?.message);
    return empty;
  }
}

// ─── Category Selector ────────────────────────────────────────────────────────

function selectTargetCategory(history) {
  const { categoryCounts, recentCategories } = history;
  const total = Math.max(1, recentCategories.length);
  const lastCategory = recentCategories[0] || null;

  const candidates = Object.keys(RIDDLE_CATEGORIES).filter(c => c !== lastCategory);

  let bestCategory = null;
  let bestDeficit = -Infinity;

  for (const cat of candidates) {
    const target = (RIDDLE_MIX_MODEL[cat] || 0) / 100;
    const actual = (categoryCounts[cat] || 0) / total;
    const deficit = target - actual;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestCategory = cat;
    }
  }

  if (!bestCategory) {
    const fallbacks = Object.keys(RIDDLE_CATEGORIES).filter(c => c !== lastCategory);
    bestCategory = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  const subtopics = CATEGORY_SUBTOPICS[bestCategory] || [];
  const recentAnswers = (history.usedAnswers || []).slice(0, 15);
  const unusedSubtopics = subtopics.filter(s => !recentAnswers.some(a => a.includes(s.split(' ')[0])));
  const pool = unusedSubtopics.length > 0 ? unusedSubtopics : subtopics;
  const subtopic = pool[Math.floor(Math.random() * pool.length)] || subtopics[0] || '';

  console.log(`[Riddle Generator] Selected category: ${bestCategory} (deficit: ${(bestDeficit * 100).toFixed(1)}%), subtopic: "${subtopic}", last was: ${lastCategory || 'none'}`);

  return { category: bestCategory, subtopic };
}

// ─── Riddle Generator ─────────────────────────────────────────────────────────

export async function generateRiddle(options = {}) {
  const {
    episodeNumber = 1,
    avoidCategories = [],
    recentRiddles = [],
    usedAnswers = [],
    targetCategory = 'OBJECT',
    targetSubtopic = ''
  } = options;

  const openai = getOpenAIClient();
  const catInfo = RIDDLE_CATEGORIES[targetCategory] || RIDDLE_CATEGORIES.OBJECT;

  const avoidCatText = avoidCategories.length
    ? `\nFor this riddle, avoid these categories (recently rejected): ${avoidCategories.join(', ')}`
    : '';

  const usedAnswersText = usedAnswers.length
    ? `\n\nANSWERS ALREADY USED — do NOT use the same answer:\n${usedAnswers.slice(0, 30).map(a => `- ${a}`).join('\n')}`
    : '';

  const recentText = recentRiddles.length
    ? `\n\nRecent riddles (avoid similar wording or structure):\n${recentRiddles.slice(0, 8).map(r => `- ${r}`).join('\n')}`
    : '';

  const subtopicInstruction = targetSubtopic
    ? `\nSubtopic preference: "${targetSubtopic}"`
    : '';

  const systemPrompt = `You are a riddle writer for Orbix Riddles, a high-retention YouTube Shorts channel targeting adults aged 16–45.

TONE: Smart. Slightly mysterious. Calm and confident. Never childish, never cringe.

TARGET CATEGORY: ${catInfo.label}
Description: ${catInfo.description}
${subtopicInstruction}

RIDDLE RULES:
- One riddle per video. The viewer must think, then the answer is revealed.
- Riddle text: 10–25 words. Must be readable in 2–3 seconds on screen.
- NO multiple choice — this is a pure riddle with one clean answer.
- Answer: 1–3 words, always a concrete noun or short phrase.
- The answer word must NOT appear anywhere in the riddle text.
- Classic riddle structures are preferred: "I have X but no Y", "I speak without a mouth", "The more you take, the more you leave behind", "What am I?" etc.
- NO politics, religion, sexuality, violence, self-harm, drugs.
- NO kids content — do NOT write nursery-rhyme style riddles.
- Audience: adults 16–45, globally recognizable answers.

CRITICAL — LOGICAL ACCURACY (this is the most important rule):
- Every clue in the riddle MUST be factually true for the answer. No exceptions — including biology and anatomy.
- Before writing, verify: is EVERY claim in the riddle true for the answer? If any single line is false, the riddle is invalid.
- BAD: "I cover you from head to toe, yet I never touch your skin" → Clothing. WRONG — clothing touches skin.
- BAD: "I have a shell but no feet, I glide through water yet never swim" → Snail. WRONG — snails have a muscular foot (they do have a "foot"); do not say "no feet" or "no legs" for snails, slugs, or similar creatures.
- BAD: Any riddle that says the answer has "no feet", "no legs", or "no arms" when the creature/object actually has them (or has a biological "foot" like a snail).
- GOOD: "I have hands but cannot clap, I have a face but no eyes. What am I?" → A clock. All clues are true.
- If you cannot make every clue 100% factually accurate, pick a different subject.

HOOK RULES (3–7 words):
- Calm, engaging, slightly competitive.
- Examples: "Think you can solve this?", "Can you figure this out?", "Most people get this wrong.", "Ready for a tough one?"

VOICE SCRIPT: Write a natural spoken script — read the hook, then the riddle slowly, pause, then say "The answer is... [answer]".

OUTPUT: Return valid JSON only, no markdown, no commentary.`;

  const userPrompt = `Generate one riddle for the "${catInfo.label}" category.${subtopicInstruction}${avoidCatText}${usedAnswersText}${recentText}

Episode number: ${episodeNumber}

Return JSON:
{
  "hook": "<3-7 words, calm competitive>",
  "category": "<Wordplay|Logic|Object|Nature|Science|Culture>",
  "riddle_text": "<the full riddle, 10-25 words, ends with 'What am I?' or similar>",
  "answer_text": "<1-3 word answer only>",
  "voice_script": "<full spoken script: hook, riddle slowly, natural pause cue, then answer reveal>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.88,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });
    const raw = JSON.parse(completion.choices[0].message.content || '{}');

    const result = {
      hook: (raw.hook || '').trim().slice(0, 80),
      category: (raw.category || catInfo.label).trim().slice(0, 40),
      riddle_text: (raw.riddle_text || '').trim().slice(0, 250),
      answer_text: (raw.answer_text || '').trim().slice(0, 60),
      voice_script: (raw.voice_script || '').trim().slice(0, 600),
      episode_number: episodeNumber,
      _category: targetCategory
    };

    if (!result.riddle_text || !result.answer_text) return null;
    return result;
  } catch (err) {
    console.error('[Riddle Generator] Generate error:', err.message);
    return null;
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate a riddle with category distribution, quality scoring, and deduplication.
 *
 * Pipeline:
 *  1. Load history (used answers, recent riddles, category counts)
 *  2. Select target category + subtopic
 *  3. Generate N_CANDIDATES in parallel
 *  4. Score each candidate via scoreRiddle()
 *  5. Sort descending, pick best that passes policy + dedup
 *  6. Return winner with fingerprint + _category tag
 */
export async function generateAndValidateRiddle(businessId, channelId, options = {}) {
  const { episodeNumber = 1, maxRetries = 5 } = options;

  const history = await loadRiddleHistory(businessId, channelId);
  console.log(`[Riddle Generator] Loaded ${history.usedAnswers.length} used answers, ${history.recentCategories.length} recent category records`);

  const { category: targetCategory, subtopic: targetSubtopic } = selectTargetCategory(history);

  let avoidCategories = [];
  let attempts = 0;

  while (attempts < maxRetries) {
    const candidatePromises = Array.from({ length: N_CANDIDATES }, () =>
      generateRiddle({
        episodeNumber,
        avoidCategories,
        recentRiddles: history.recentRiddles,
        usedAnswers: history.usedAnswers,
        targetCategory,
        targetSubtopic
      })
    );

    const candidates = (await Promise.all(candidatePromises)).filter(Boolean);
    console.log(`[Riddle Generator] Generated ${candidates.length}/${N_CANDIDATES} candidates for category ${targetCategory}`);

    if (candidates.length === 0) {
      attempts++;
      continue;
    }

    const scored = candidates.map(c => ({ ...c, _qualityScore: scoreRiddle(c) }));
    scored.sort((a, b) => b._qualityScore - a._qualityScore);

    console.log(`[Riddle Generator] Candidate scores: ${scored.map(c => c._qualityScore).join(', ')}`);

    for (const candidate of scored) {
      const policy = await checkRiddleContentPolicy(candidate);
      if (!policy.approved) {
        console.log(`[Riddle Generator] Policy reject (score ${candidate._qualityScore}): ${policy.reason || 'unknown'}`);
        if (!avoidCategories.includes(candidate.category)) avoidCategories.push(candidate.category);
        continue;
      }

      const fingerprint = computeRiddleFingerprint(candidate.riddle_text, candidate.answer_text);
      const isDup = await isRiddleDuplicate(businessId, channelId, fingerprint);
      if (isDup) {
        console.log(`[Riddle Generator] Duplicate fingerprint (score ${candidate._qualityScore}), skipping`);
        if (candidate.answer_text) history.usedAnswers.push(candidate.answer_text.toLowerCase());
        history.recentRiddles.unshift(candidate.riddle_text);
        if (history.recentRiddles.length > 20) history.recentRiddles.pop();
        continue;
      }

      console.log(`[Riddle Generator] Selected: category=${targetCategory} score=${candidate._qualityScore} answer="${candidate.answer_text}" riddle="${candidate.riddle_text?.slice(0, 60)}..."`);
      return { ...candidate, content_fingerprint: fingerprint };
    }

    attempts++;
  }

  console.error(`[Riddle Generator] Failed to produce a valid riddle after ${maxRetries} retries for category ${targetCategory}`);
  return null;
}
