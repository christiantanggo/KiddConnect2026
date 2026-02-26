/**
 * Orbix Trivia Generator Service
 * Generates trivia questions via LLM with content policy check and fingerprint deduplication.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

const TRIVIA_CATEGORIES = [
  'Geography', 'Science', 'History', 'General knowledge', 'Logic', 'Pop culture'
];

const TRIVIA_HOOK_EXAMPLES = [
  "Let's test your knowledge.",
  "Think you know this?",
  "This one surprises people.",
  "Hard geography question.",
  "Ready for a challenge?"
];

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

/**
 * Normalize text for fingerprinting: collapse contractions, remove punctuation, lowercase.
 * So "What's the capital?" and "What is the capital?" produce the same fingerprint.
 */
function normalizeForFingerprint(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  // Collapse common contractions so "what's" and "what is" match
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
  // Remove punctuation
  s = s.replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Compute content fingerprint for trivia deduplication.
 * Normalize question + correct answer for consistent hashing.
 * Catches "What's the capital?" vs "What is the capital?" as the same.
 * @param {string} question
 * @param {string} correctAnswer - e.g. "B" or "Ottawa"
 * @returns {string} SHA-256 hex
 */
export function computeTriviaFingerprint(question, correctAnswer) {
  const q = normalizeForFingerprint(question);
  const a = (correctAnswer || '').trim().toUpperCase();
  const normalized = `${q}|${a}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check if trivia with this fingerprint already exists for the channel.
 * @param {string} businessId
 * @param {string} channelId
 * @param {string} fingerprint
 * @returns {Promise<boolean>} true if duplicate
 */
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
    return false; // allow on error to avoid blocking
  }
  return !!data;
}

/**
 * Content policy LLM check - reject political, controversial, sensitive topics.
 * @param {Object} trivia - { question, option_a, option_b, option_c, correct_answer, category }
 * @returns {Promise<{ approved: boolean, reason?: string }>}
 */
export async function checkTriviaContentPolicy(trivia) {
  try {
    const openai = getOpenAIClient();
    const content = `Category: ${trivia.category || 'General'}\nQuestion: ${trivia.question || ''}\nA) ${trivia.option_a || ''}\nB) ${trivia.option_b || ''}\nC) ${trivia.option_c || ''}\nCorrect: ${trivia.correct_answer || ''}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a content policy reviewer for a family-safe trivia channel. Review the trivia question for:
- Political topics (parties, elections, politicians, policies)
- Controversial topics (religion, sexuality, drugs, violence)
- Sensitive topics (tragedy, death, illness, trauma)
- Copyrighted material that would require images
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
    return { approved: true }; // allow on error
  }
}

/**
 * Generate one trivia question via LLM.
 * @param {Object} options
 * @param {number} [options.episodeNumber] - Trivia #01, #02, etc.
 * @param {string[]} [options.avoidCategories] - Categories to avoid this run (policy rejects)
 * @param {string[]} [options.recentQuestions] - The 20 most-recent questions (freshness block)
 * @param {Record<string,string[]>} [options.questionsByCategory] - All historical questions grouped by category
 * @returns {Promise<Object|null>} Trivia payload or null on failure
 */
export async function generateTriviaQuestion(options = {}) {
  const { episodeNumber = 1, avoidCategories = [], recentQuestions = [], questionsByCategory = {} } = options;
  const openai = getOpenAIClient();

  const avoidCatText = avoidCategories.length ? `\nAvoid these categories for this question: ${avoidCategories.join(', ')}` : '';

  // Build a per-category history block so the LLM can see what topics are exhausted
  const historyLines = [];
  for (const [cat, qs] of Object.entries(questionsByCategory)) {
    if (qs.length === 0) continue;
    historyLines.push(`${cat} (${qs.length} asked so far):`);
    // Show up to 15 examples per category — enough for the model to understand coverage
    qs.slice(0, 15).forEach(q => historyLines.push(`  - ${q}`));
  }
  const categoryHistoryText = historyLines.length
    ? `\n\nCOMPLETE QUESTION HISTORY BY CATEGORY (NEVER repeat any of these or ask about the same fact):\n${historyLines.join('\n')}`
    : '';

  const recentText = recentQuestions.length
    ? `\n\nMost recent questions (avoid topic overlap):\n${recentQuestions.map(q => `- ${q}`).join('\n')}`
    : '';

  const systemPrompt = `You are a trivia script writer for Orbix Trivia Patterns, a high-retention YouTube Shorts channel.

TONE: Smart. Competitive. Calm. Confident. Slightly intense. Not childish, loud, dramatic, gimmicky, sarcastic, or hype-driven.

HOOK RULES (3–7 words):
- Calm but competitive. Not exaggerated.
- NO fake statistics ("Only 5% get this", "Genius only").
- NO clickbait.
- Approved: "Let's test your knowledge.", "Think you know this?", "This one surprises people.", "Hard geography question.", "Ready for a challenge?"

QUESTION FORMAT:
- One question per video. Multiple choice only (A, B, C).
- Readable in 1–2 lines. Clear and concise.
- NO political, controversial, or sensitive topics.
- NO copyrighted material requiring images.
- Difficulty: 40% medium, 30% easy, 20% hard, 10% trick.
- Categories: Geography, Science, History, General knowledge, Logic, Pop culture (non-copyright dependent).

OUTPUT: Return valid JSON only, no markdown, no commentary.`;

  const userPrompt = `Generate one trivia question.${avoidCatText}${categoryHistoryText}${recentText}

Episode number: ${episodeNumber}

Return JSON:
{
  "hook": "<3-7 words, calm competitive>",
  "category": "<GEOGRAPHY|SCIENCE|HISTORY|GENERAL KNOWLEDGE|LOGIC|POP CULTURE>",
  "question": "<one question, max 2 lines>",
  "option_a": "<text>",
  "option_b": "<text>",
  "option_c": "<text>",
  "correct_answer": "A" | "B" | "C",
  "voice_script": "<full spoken script: hook, then question, then A/B/C, pause, then answer reveal and CTA like 'Did you get it right?' or 'Comment A, B, or C.'>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    });
    const raw = JSON.parse(completion.choices[0].message.content || '{}');
    const correct = String(raw.correct_answer || 'A').toUpperCase().charAt(0);
    const letter = ['A', 'B', 'C'].includes(correct) ? correct : 'A';
    const opts = {
      hook: (raw.hook || '').trim().slice(0, 80),
      category: (raw.category || 'GENERAL KNOWLEDGE').toUpperCase().replace(/\s+/g, ' ').slice(0, 50),
      question: (raw.question || '').trim().slice(0, 200),
      option_a: (raw.option_a || '').trim().slice(0, 100),
      option_b: (raw.option_b || '').trim().slice(0, 100),
      option_c: (raw.option_c || '').trim().slice(0, 100),
      correct_answer: letter,
      voice_script: (raw.voice_script || '').trim().slice(0, 500),
      episode_number: episodeNumber
    };
    if (!opts.question || !opts.option_a || !opts.option_b || !opts.option_c) return null;
    return opts;
  } catch (err) {
    console.error('[Trivia Generator] Generate error:', err.message);
    return null;
  }
}

/**
 * Load ALL historical trivia questions from orbix_raw_items, grouped by category.
 * We pull every question ever generated so the LLM never repeats one — even questions
 * from episode 1 that were asked 100+ episodes ago.
 *
 * To stay within the LLM context window we send:
 *  - Up to 30 questions per category (the most recently scraped ones, so classic
 *    over-used questions at the top of every category appear first)
 *  - Plus the 20 most-recent questions across all categories as a "freshness" block
 *
 * @returns {Promise<{ byCategory: Record<string,string[]>, recent: string[], all: string[] }>}
 */
async function loadAllTriviaQuestions(businessId, channelId) {
  const empty = { byCategory: {}, recent: [], all: [] };
  if (!businessId || !channelId) return empty;
  try {
    // Pull all trivia rows — just snippet (small JSON string per row)
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .select('snippet, created_at')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'trivia')
      .order('created_at', { ascending: false })
      .limit(1000); // safety cap — 1000 questions is ~200KB of snippet data
    if (error || !data) return empty;

    const byCategory = {};
    const all = [];

    for (const row of data) {
      try {
        const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
        if (!parsed?.question) continue;
        const q = parsed.question.trim();
        const cat = (parsed.category || 'GENERAL KNOWLEDGE').toUpperCase();
        if (!byCategory[cat]) byCategory[cat] = [];
        // Keep up to 30 per category (already sorted newest-first)
        if (byCategory[cat].length < 30) byCategory[cat].push(q);
        all.push(q);
      } catch (_) { /* skip malformed rows */ }
    }

    // First 20 overall = most recent questions (already newest-first from ORDER BY)
    const recent = all.slice(0, 20);

    return { byCategory, recent, all };
  } catch (err) {
    console.warn('[Trivia Generator] Failed to load question history:', err?.message);
    return { byCategory: {}, recent: [], all: [] };
  }
}

/**
 * Generate trivia, run policy check, and optionally check duplicates.
 * Loads recent questions from DB to avoid LLM regenerating the same trivia.
 * @param {string} businessId
 * @param {string} channelId
 * @param {Object} options
 * @param {number} [options.episodeNumber]
 * @param {number} [options.maxRetries] - Retries on policy reject or duplicate
 * @returns {Promise<Object|null>} Trivia payload with fingerprint, or null
 */
export async function generateAndValidateTrivia(businessId, channelId, options = {}) {
  const { episodeNumber = 1, maxRetries = 5 } = options;
  let avoidCategories = [];

  // Load ALL historical trivia questions grouped by category.
  // This is the key fix: the LLM now sees every question ever generated, not just the last 15.
  const { byCategory, recent, all } = await loadAllTriviaQuestions(businessId, channelId);
  console.log(`[Trivia Generator] Loaded ${all.length} historical questions across ${Object.keys(byCategory).length} categories`);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const trivia = await generateTriviaQuestion({
      episodeNumber,
      avoidCategories,
      recentQuestions: recent,
      questionsByCategory: byCategory,
    });
    if (!trivia) continue;

    const policy = await checkTriviaContentPolicy(trivia);
    if (!policy.approved) {
      console.log(`[Trivia Generator] Policy reject: ${policy.reason || 'unknown'}`);
      if (!avoidCategories.includes(trivia.category)) avoidCategories.push(trivia.category);
      continue;
    }

    const correctText = trivia[`option_${trivia.correct_answer.toLowerCase()}`] || '';
    const fingerprint = computeTriviaFingerprint(trivia.question, `${trivia.correct_answer}:${correctText}`);
    const isDup = await isTriviaDuplicate(businessId, channelId, fingerprint);
    if (isDup) {
      console.log(`[Trivia Generator] Duplicate fingerprint, retrying`);
      // Add to recent + category history so this attempt informs the next
      recent.push(trivia.question);
      if (!byCategory[trivia.category]) byCategory[trivia.category] = [];
      byCategory[trivia.category].unshift(trivia.question);
      continue;
    }

    return { ...trivia, content_fingerprint: fingerprint };
  }
  return null;
}
