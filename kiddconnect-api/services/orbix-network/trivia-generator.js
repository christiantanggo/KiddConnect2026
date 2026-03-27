/**
 * Orbix Trivia Generator Service
 *
 * Generates trivia questions via LLM with:
 *  - Topic bucket distribution (WORLD_EVENTS, GEOGRAPHY, LANDMARKS, ICONS, WILDCARD)
 *  - Global Recognition Scoring (picks highest-scoring candidate that is under quota)
 *  - Anti-streak rule (prevents the same bucket back-to-back)
 *  - Subtopic rotation within buckets for variety
 *  - Content policy check and fingerprint deduplication
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

// ─── Topic Buckets & Distribution Model ──────────────────────────────────────

export const TOPIC_BUCKETS = {
  WORLD_EVENTS: {
    label: 'World Events',
    description: 'Major global events, records, science breakthroughs, space, animals, food, body, language',
    historyAdjacent: false
  },
  GEOGRAPHY: {
    label: 'Geography',
    description: 'Countries, capitals, rivers, oceans, continents, flags, borders, population',
    historyAdjacent: false
  },
  LANDMARKS: {
    label: 'Landmarks & Wonders',
    description: 'Famous buildings, natural wonders, UNESCO sites, bridges, stadiums',
    historyAdjacent: false
  },
  ICONS: {
    label: 'Icons & People',
    description: 'Globally recognized figures — scientists, athletes, artists, leaders, fictional characters',
    historyAdjacent: false
  },
  WILDCARD: {
    label: 'Wildcard',
    description: 'Logic puzzles, patterns, fun maths, surprising everyday facts, pop culture trivia (fact-based only)',
    historyAdjacent: false
  }
};

// Target percentage distribution (must sum to 100)
export const MIX_MODEL = {
  WORLD_EVENTS: 30,
  GEOGRAPHY: 30,
  LANDMARKS: 20,
  ICONS: 10,
  WILDCARD: 10
};

// How many candidates to generate in parallel per run before scoring
const N_CANDIDATES = 7;

// How many recent items to look at when computing bucket distribution
const MIX_HISTORY_WINDOW = 30;

// Subtopics within each bucket — rotated to prevent ruts
const BUCKET_SUBTOPICS = {
  WORLD_EVENTS: [
    'animals & wildlife', 'human body', 'food & drink', 'weather & climate',
    'science records', 'space & astronomy', 'ocean & sea life', 'sports records',
    'inventions & technology', 'language & words'
  ],
  GEOGRAPHY: [
    'capitals of countries', 'largest/smallest countries', 'rivers & lakes',
    'flags', 'borders & neighbours', 'island nations', 'mountain ranges',
    'population & density', 'continents & regions'
  ],
  LANDMARKS: [
    'world wonders', 'famous bridges', 'UNESCO heritage sites',
    'tallest/longest structures', 'famous stadiums & arenas', 'natural formations',
    'famous museums & monuments', 'national parks'
  ],
  ICONS: [
    'scientists & inventors', 'athletes & sports records', 'artists & musicians',
    'fictional characters', 'royalty & rulers', 'explorers & adventurers',
    'business icons', 'fictional creatures & mythologies'
  ],
  WILDCARD: [
    'logic & riddles', 'surprising everyday facts', 'fun maths',
    'pop culture facts (non-copyright)', 'sequences & patterns', 'optical illusions & perception'
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
    [/\bwho's\b/g, 'who is'], [/\bwho're\b/g, 'who are'],
    [/\bwhere's\b/g, 'where is'], [/\bwhen's\b/g, 'when is'],
    [/\bhow's\b/g, 'how is'], [/\bthere's\b/g, 'there is'],
    [/\bhere's\b/g, 'here is'], [/\blet's\b/g, 'let us'],
    [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'],
    [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'],
    [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'],
    [/\bwasn't\b/g, 'was not'], [/\bweren't\b/g, 'were not']
  ];
  for (const [re, sub] of contractions) s = s.replace(re, sub);
  s = s.replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function computeTriviaFingerprint(question, correctAnswer) {
  const q = normalizeForFingerprint(question);
  const a = (correctAnswer || '').trim().toUpperCase();
  return crypto.createHash('sha256').update(`${q}|${a}`).digest('hex');
}

export async function isTriviaDuplicate(businessId, channelId, fingerprint) {
  if (!fingerprint || !channelId) return false;
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('content_fingerprint', fingerprint)
    .maybeSingle();
  if (error) {
    console.error('[Trivia Generator] Duplicate check error:', error.message);
    return false;
  }
  return !!data;
}

// ─── Content Policy Check ─────────────────────────────────────────────────────

export async function checkTriviaContentPolicy(trivia) {
  try {
    const openai = getOpenAIClient();
    const content = `Category: ${trivia.category || 'General'}\nQuestion: ${trivia.question || ''}\nA) ${trivia.option_a || ''}\nB) ${trivia.option_b || ''}\nC) ${trivia.option_c || ''}\nCorrect: ${trivia.correct_answer || ''}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a content policy reviewer for a family-safe trivia channel. Review for:
- Political topics (parties, elections, politicians, policies)
- Controversial topics (religion, sexuality, drugs, violence)
- Sensitive topics (tragedy, death, illness, trauma)
- Copyrighted material requiring images
- Anything not family-safe or COPPA-appropriate
Return JSON only: { "approved": true } or { "approved": false, "reason": "brief reason" }`
        },
        { role: 'user', content }
      ],
      temperature: 0.2,
      max_tokens: 150,
      response_format: { type: 'json_object' }
    });
    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return { approved: result.approved !== false, reason: result.reason || null };
  } catch (err) {
    console.error('[Trivia Generator] Content policy check error:', err.message);
    return { approved: true };
  }
}

// ─── Global Recognition Scorer ────────────────────────────────────────────────

/**
 * Score a trivia question for global recognition potential (0–100).
 * Higher = more globally recognizable = better retention on Shorts.
 *
 * Signals (additive):
 *  +global_familiarity  — question is about something universally known
 *  +curriculum_likely   — common school/pub-quiz knowledge worldwide
 *  +simplicity          — answer/options are clean single words or short phrases
 *  +anchor_strength     — the correct answer is a concrete noun (city, country, number, name)
 *
 * Penalties (subtractive):
 *  -niche_specificity   — topic is very niche (detected by LLM category or topic label)
 *  -specific_date       — question tests a specific year or date
 *  -complex_phrasing    — question is > 20 words (harder to read in 5s)
 */
export function scoreRecognition(trivia) {
  if (!trivia) return 0;
  let score = 50; // neutral base

  const q = (trivia.question || '').toLowerCase();
  const topic = (trivia.topic || '').toLowerCase();
  const cat = (trivia.category || '').toLowerCase();
  const optA = (trivia.option_a || '').toLowerCase();
  const optB = (trivia.option_b || '').toLowerCase();
  const optC = (trivia.option_c || '').toLowerCase();
  const bucket = (trivia._bucket || '').toUpperCase();

  // +Anchor strength — answers that are concrete proper nouns score higher
  const correctOption = { A: optA, B: optB, C: optC }[trivia.correct_answer?.toUpperCase()] || '';
  const concretePatterns = [/^[A-Z]/, /\d+/, /^(the )?(mount |lake |river |cape )?[a-z]/i];
  if (correctOption.split(/\s+/).length <= 3) score += 8; // short answer = easy to process
  if (concretePatterns.some(p => p.test(correctOption))) score += 5;

  // +Curriculum / globally taught
  const curriculumKeywords = ['capital', 'largest', 'smallest', 'tallest', 'longest', 'first', 'inventor', 'discovered', 'planet', 'ocean', 'continent', 'country', 'flag', 'symbol', 'element', 'speed', 'distance', 'population'];
  if (curriculumKeywords.some(k => q.includes(k) || topic.includes(k))) score += 10;

  // +Geography bucket gets +5 global recognition bonus (capitals, countries are universally relatable)
  if (bucket === 'GEOGRAPHY') score += 5;
  if (bucket === 'LANDMARKS') score += 3;

  // +ICONS with a globally famous name
  if (bucket === 'ICONS') score += 4;

  // +Simple question length (≤ 12 words)
  const wordCount = q.split(/\s+/).length;
  if (wordCount <= 12) score += 8;
  else if (wordCount <= 16) score += 4;

  // +Short option texts (all ≤ 20 chars)
  const maxOptLen = Math.max(optA.length, optB.length, optC.length);
  if (maxOptLen <= 20) score += 5;
  else if (maxOptLen <= 35) score += 2;

  // -Niche specificity — specific dates, obscure people, niche category
  const datePattern = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  if (datePattern.test(q)) score -= 12; // questions that test specific years
  if (topic.includes('history') || cat.includes('history')) score -= 5; // history-heavy = polarising
  if (wordCount > 20) score -= 10; // too long to read quickly in a Short

  // -Ambiguous or overly specific phrasing
  const nicheWords = ['which of the following', 'approximately', 'according to', 'as of', 'in the year'];
  if (nicheWords.some(w => q.includes(w))) score -= 8;

  return Math.max(0, Math.min(100, score));
}

// ─── History Loader ────────────────────────────────────────────────────────────

/**
 * Load trivia history including bucket distribution for mix-model enforcement.
 */
async function loadAllTriviaHistory(businessId, channelId) {
  const empty = { usedTopics: [], recent: [], bucketCounts: {}, recentBuckets: [] };
  if (!businessId || !channelId) return empty;
  try {
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .select('snippet, created_at')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'trivia')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) return empty;

    const usedTopics = [];
    const recent = [];
    const bucketCounts = {};
    const recentBuckets = []; // ordered most-recent first, for anti-streak

    for (const row of data) {
      try {
        const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
        if (!parsed?.question) continue;

        const topic = parsed.topic?.trim() || parsed.question.trim();
        usedTopics.push(topic);
        if (recent.length < 20) recent.push(parsed.question.trim());

        // Track bucket distribution
        const b = parsed._bucket || 'WORLD_EVENTS';
        if (recentBuckets.length < MIX_HISTORY_WINDOW) {
          recentBuckets.push(b);
          bucketCounts[b] = (bucketCounts[b] || 0) + 1;
        }
      } catch (_) {}
    }

    return { usedTopics, recent, bucketCounts, recentBuckets };
  } catch (err) {
    console.warn('[Trivia Generator] Failed to load history:', err?.message);
    return empty;
  }
}

// ─── Bucket Selector ──────────────────────────────────────────────────────────

/**
 * Select the next target bucket based on:
 *  1. Most under-represented vs MIX_MODEL target (within MIX_HISTORY_WINDOW)
 *  2. Anti-streak: never pick the same bucket as the most-recent one
 *
 * Returns { bucket, subtopic }
 */
function selectTargetBucket(history) {
  const { bucketCounts, recentBuckets } = history;
  const total = Math.max(1, recentBuckets.length);
  const lastBucket = recentBuckets[0] || null; // most recent

  // Compute actual vs target % for each bucket, excluding lastBucket (anti-streak)
  const candidates = Object.keys(TOPIC_BUCKETS).filter(b => b !== lastBucket);

  let bestBucket = null;
  let bestDeficit = -Infinity;

  for (const bucket of candidates) {
    const target = (MIX_MODEL[bucket] || 0) / 100;
    const actual = (bucketCounts[bucket] || 0) / total;
    const deficit = target - actual;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestBucket = bucket;
    }
  }

  // Fallback: if all candidates are somehow tied or missing, pick a random non-last bucket
  if (!bestBucket) {
    const fallbacks = Object.keys(TOPIC_BUCKETS).filter(b => b !== lastBucket);
    bestBucket = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  // Pick a subtopic within the bucket (rotated, not one already recently used)
  const subtopics = BUCKET_SUBTOPICS[bestBucket] || [];
  const recentTopics = (history.usedTopics || []).slice(0, 15).map(t => t.toLowerCase());
  const unusedSubtopics = subtopics.filter(s => !recentTopics.some(rt => rt.includes(s.split(' ')[0])));
  const pool = unusedSubtopics.length > 0 ? unusedSubtopics : subtopics;
  const subtopic = pool[Math.floor(Math.random() * pool.length)] || subtopics[0] || '';

  console.log(`[Trivia Generator] Selected bucket: ${bestBucket} (deficit vs target: ${(bestDeficit * 100).toFixed(1)}%), subtopic: "${subtopic}", last was: ${lastBucket || 'none'}`);

  return { bucket: bestBucket, subtopic };
}

// ─── Question Generator ───────────────────────────────────────────────────────

/**
 * Generate one trivia question via LLM for a specific target bucket and subtopic.
 */
export async function generateTriviaQuestion(options = {}) {
  const {
    episodeNumber = 1,
    avoidCategories = [],
    recentQuestions = [],
    usedTopics = [],
    targetBucket = 'WORLD_EVENTS',
    targetSubtopic = ''
  } = options;

  const openai = getOpenAIClient();
  const bucketInfo = TOPIC_BUCKETS[targetBucket] || TOPIC_BUCKETS.WORLD_EVENTS;

  const avoidCatText = avoidCategories.length
    ? `\nFor this question only, avoid these categories (recently rejected): ${avoidCategories.join(', ')}`
    : '';

  const topicText = usedTopics.length
    ? `\n\nSPECIFIC TOPICS ALREADY COVERED — do NOT ask about the same specific fact:\n${usedTopics.map(t => `- ${t}`).join('\n')}\n\nYou CAN ask about items on this list from a completely different angle if the specific fact tested is different.`
    : '';

  const recentText = recentQuestions.length
    ? `\n\nMost recent questions (avoid similar wording):\n${recentQuestions.slice(0, 10).map(q => `- ${q}`).join('\n')}`
    : '';

  const subtopicInstruction = targetSubtopic
    ? `\nSubtopic preference (aim for this area): "${targetSubtopic}"`
    : '';

  const systemPrompt = `You are a trivia script writer for Orbix Trivia, a high-retention YouTube Shorts channel targeting a global audience aged 16–45.

TONE: Smart. Competitive. Calm. Confident. Not childish, loud, or hype-driven.

TARGET BUCKET: ${bucketInfo.label}
Description: ${bucketInfo.description}
${subtopicInstruction}

QUESTION RULES:
- One question per video. Multiple choice only (A, B, C).
- Readable in 1–2 lines. Clear and concise (max 15 words preferred).
- NO political, controversial, or sensitive topics.
- NO copyrighted material requiring images.
- The subject must be globally recognizable — 16-year-old in any country should have a chance.
- Prefer concrete facts with a single clear answer (city, country, person, number).
- Do NOT ask questions that test a specific year or obscure historical date.
- Difficulty: 40% medium, 30% easy, 20% hard, 10% trick.

HOOK RULES (3–7 words):
- Calm but competitive.
- NO fake statistics ("Only 5% get this", "Genius only"). NO clickbait.
- Approved examples: "Let's test your knowledge.", "Think you know this?", "Most people get this wrong.", "Ready for a challenge?"

TOPIC FIELD: Return a 3–6 word label for the specific fact being tested (e.g. "gold chemical symbol", "Nile river longest").

OUTPUT: Return valid JSON only, no markdown, no commentary.`;

  const userPrompt = `Generate one trivia question for the "${bucketInfo.label}" bucket.${subtopicInstruction}${avoidCatText}${topicText}${recentText}

Episode number: ${episodeNumber}

Return JSON:
{
  "hook": "<3-7 words, calm competitive>",
  "category": "<WORLD EVENTS|GEOGRAPHY|LANDMARKS|ICONS|WILDCARD>",
  "topic": "<3-6 word specific fact label>",
  "question": "<the question ONLY — do NOT include A) B) C) options here>",
  "option_a": "<answer text only, no letter prefix>",
  "option_b": "<answer text only, no letter prefix>",
  "option_c": "<answer text only, no letter prefix>",
  "correct_answer": "A" | "B" | "C",
  "voice_script": "<full spoken script: hook, then question, then A/B/C, pause, then answer reveal>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.82,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    });
    const raw = JSON.parse(completion.choices[0].message.content || '{}');
    const correct = String(raw.correct_answer || 'A').toUpperCase().charAt(0);
    const letter = ['A', 'B', 'C'].includes(correct) ? correct : 'A';

    const stripOptionsFromQuestion = (q) => {
      if (!q) return '';
      return q.replace(/\s*A\)\s*.+?\s*B\)\s*.+?\s*C\)\s*.+$/i, '').trim();
    };

    const opts = {
      hook: (raw.hook || '').trim().slice(0, 80),
      category: (raw.category || 'WORLD EVENTS').toUpperCase().replace(/\s+/g, ' ').slice(0, 50),
      topic: (raw.topic || '').trim().slice(0, 80),
      question: stripOptionsFromQuestion((raw.question || '').trim()).slice(0, 200),
      option_a: (raw.option_a || '').trim().replace(/^[A-Ca-c]\)\s*/, '').slice(0, 100),
      option_b: (raw.option_b || '').trim().replace(/^[A-Ca-c]\)\s*/, '').slice(0, 100),
      option_c: (raw.option_c || '').trim().replace(/^[A-Ca-c]\)\s*/, '').slice(0, 100),
      correct_answer: letter,
      voice_script: (raw.voice_script || '').trim().slice(0, 500),
      episode_number: episodeNumber,
      _bucket: targetBucket
    };
    if (!opts.question || !opts.option_a || !opts.option_b || !opts.option_c) return null;
    return opts;
  } catch (err) {
    console.error('[Trivia Generator] Generate error:', err.message);
    return null;
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate trivia with bucket distribution, recognition scoring, and deduplication.
 *
 * Pipeline:
 *  1. Load history (topics, recent questions, bucket counts, recent buckets)
 *  2. Select target bucket + subtopic (respects distribution and anti-streak)
 *  3. Generate N_CANDIDATES in parallel targeting that bucket
 *  4. Score each candidate via scoreRecognition()
 *  5. Sort by score descending, pick best that passes policy + dedup
 *  6. Return winner with fingerprint + _bucket tag
 */
export async function generateAndValidateTrivia(businessId, channelId, options = {}) {
  const { episodeNumber = 1, maxRetries = 5 } = options;

  const history = await loadAllTriviaHistory(businessId, channelId);
  console.log(`[Trivia Generator] Loaded ${history.usedTopics.length} used topics, ${history.recentBuckets.length} recent bucket records`);

  const { bucket: targetBucket, subtopic: targetSubtopic } = selectTargetBucket(history);

  let avoidCategories = [];
  let attempts = 0;

  while (attempts < maxRetries) {
    // Generate N_CANDIDATES in parallel for the selected bucket
    const candidatePromises = Array.from({ length: N_CANDIDATES }, () =>
      generateTriviaQuestion({
        episodeNumber,
        avoidCategories,
        recentQuestions: history.recent,
        usedTopics: history.usedTopics,
        targetBucket,
        targetSubtopic
      })
    );

    const candidates = (await Promise.all(candidatePromises)).filter(Boolean);
    console.log(`[Trivia Generator] Generated ${candidates.length}/${N_CANDIDATES} candidates for bucket ${targetBucket}`);

    if (candidates.length === 0) {
      attempts++;
      continue;
    }

    // Score all candidates
    const scored = candidates.map(c => ({ ...c, _recognitionScore: scoreRecognition(c) }));
    scored.sort((a, b) => b._recognitionScore - a._recognitionScore);

    console.log(`[Trivia Generator] Candidate scores: ${scored.map(c => `${c._recognitionScore}`).join(', ')}`);

    // Find the highest-scoring candidate that passes policy and dedup
    for (const candidate of scored) {
      const policy = await checkTriviaContentPolicy(candidate);
      if (!policy.approved) {
        console.log(`[Trivia Generator] Policy reject (score ${candidate._recognitionScore}): ${policy.reason || 'unknown'}`);
        if (!avoidCategories.includes(candidate.category)) avoidCategories.push(candidate.category);
        continue;
      }

      const correctText = candidate[`option_${candidate.correct_answer.toLowerCase()}`] || '';
      const fingerprint = computeTriviaFingerprint(candidate.question, `${candidate.correct_answer}:${correctText}`);
      const isDup = await isTriviaDuplicate(businessId, channelId, fingerprint);
      if (isDup) {
        console.log(`[Trivia Generator] Duplicate fingerprint (score ${candidate._recognitionScore}), skipping`);
        if (candidate.topic) history.usedTopics.push(candidate.topic);
        history.recent.unshift(candidate.question);
        if (history.recent.length > 20) history.recent.pop();
        continue;
      }

      console.log(`[Trivia Generator] Selected: bucket=${targetBucket} score=${candidate._recognitionScore} topic="${candidate.topic}" question="${candidate.question?.slice(0, 60)}..."`);
      return { ...candidate, content_fingerprint: fingerprint };
    }

    // All candidates in this batch failed — retry with fresh generation
    attempts++;
  }

  console.error(`[Trivia Generator] Failed to produce a valid question after ${maxRetries} retries for bucket ${targetBucket}`);
  return null;
}
