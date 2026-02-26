/**
 * Orbix Trivia Generator Service
 * Generates trivia questions via LLM with content policy check and fingerprint deduplication.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

const TRIVIA_CATEGORIES = [
  'History', 'Science', 'General knowledge', 'Geography', 'Logic', 'Pop culture'
];

const TRIVIA_HOOK_EXAMPLES = [
  "Let's test your knowledge.",
  "Think you know this?",
  "This one surprises people.",
  "Hard history question.",
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
 * @param {string[]} [options.recentQuestions] - The 20 most-recent full questions (freshness block)
 * @param {string[]} [options.usedTopics] - All specific topics/subjects already covered (e.g. "gold chemical symbol", "Vatican City size", "Nile river length")
 * @returns {Promise<Object|null>} Trivia payload or null on failure
 */
export async function generateTriviaQuestion(options = {}) {
  const { episodeNumber = 1, avoidCategories = [], recentQuestions = [], usedTopics = [] } = options;
  const openai = getOpenAIClient();

  const avoidCatText = avoidCategories.length
    ? `\nFor this question only, avoid these categories (they were recently rejected by content policy): ${avoidCategories.join(', ')}`
    : '';

  // The core dedup signal: specific topics/facts already covered.
  // We show ALL of them — even if there are 200 — because they're short strings (3-6 words each).
  // This tells the LLM "this specific fact has been done" without blocking the entire subject area.
  const topicText = usedTopics.length
    ? `\n\nSPECIFIC TOPICS ALREADY COVERED — do NOT ask about the same specific fact from any angle:\n${usedTopics.map(t => `- ${t}`).join('\n')}\n\nYou CAN still ask about subjects on this list from a completely different angle ONLY if the specific fact tested is different. For example, if "gold chemical symbol" is listed, you may ask about gold's melting point or gold's historical use — but NOT its periodic symbol.`
    : '';

  // Last 10 full questions as a literal "do not repeat wording" guard
  const recentText = recentQuestions.length
    ? `\n\nMost recent questions (avoid similar wording or framing):\n${recentQuestions.slice(0, 10).map(q => `- ${q}`).join('\n')}`
    : '';

  const systemPrompt = `You are a trivia script writer for Orbix Trivia Patterns, a high-retention YouTube Shorts channel.

TONE: Smart. Competitive. Calm. Confident. Slightly intense. Not childish, loud, dramatic, gimmicky, sarcastic, or hype-driven.

HOOK RULES (3–7 words):
- Calm but competitive. Not exaggerated.
- NO fake statistics ("Only 5% get this", "Genius only").
- NO clickbait.
- Approved: "Let's test your knowledge.", "Think you know this?", "This one surprises people.", "Hard history question.", "Ready for a challenge?"

QUESTION FORMAT:
- One question per video. Multiple choice only (A, B, C).
- Readable in 1–2 lines. Clear and concise.
- NO political, controversial, or sensitive topics.
- NO copyrighted material requiring images.
- Difficulty: 40% medium, 30% easy, 20% hard, 10% trick.
- Categories and TARGET MIX — follow this distribution, do NOT over-index on Geography:
  History 30%: events, dates, empires, wars, discoveries, famous people
  Science 25%: biology, chemistry, physics, space, nature, medicine
  General knowledge 20%: everyday facts, records, language, food, animals
  Geography 15%: capitals, countries, landmarks (already well-covered — keep low)
  Logic 5%: riddles, patterns, sequences
  Pop culture 5%: non-copyright-dependent music, film, sports facts

TOPIC FIELD: You must also return a "topic" field — a 3–6 word label for the specific fact being tested (e.g. "gold chemical symbol", "Vatican City smallest country", "Nile river longest", "speed of light value"). This is used to track what has been covered.

OUTPUT: Return valid JSON only, no markdown, no commentary.`;

  const userPrompt = `Generate one trivia question.${avoidCatText}${topicText}${recentText}

Episode number: ${episodeNumber}

Return JSON:
{
  "hook": "<3-7 words, calm competitive>",
  "category": "<HISTORY|SCIENCE|GENERAL KNOWLEDGE|GEOGRAPHY|LOGIC|POP CULTURE>",
  "topic": "<3-6 word label for the specific fact being tested>",
  "question": "<the question ONLY — do NOT include A) B) C) options in this field>",
  "option_a": "<answer text only, no letter prefix>",
  "option_b": "<answer text only, no letter prefix>",
  "option_c": "<answer text only, no letter prefix>",
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

    // Strip any A)/B)/C) options the LLM may have accidentally included in the question field
    const stripOptionsFromQuestion = (q) => {
      if (!q) return '';
      // Remove trailing "A) ... B) ... C) ..." pattern
      return q.replace(/\s*A\)\s*.+?\s*B\)\s*.+?\s*C\)\s*.+$/i, '').trim();
    };

    const opts = {
      hook: (raw.hook || '').trim().slice(0, 80),
      category: (raw.category || 'GENERAL KNOWLEDGE').toUpperCase().replace(/\s+/g, ' ').slice(0, 50),
      topic: (raw.topic || '').trim().slice(0, 80),
      question: stripOptionsFromQuestion((raw.question || '').trim()).slice(0, 200),
      option_a: (raw.option_a || '').trim().replace(/^[A-Ca-c]\)\s*/, '').slice(0, 100),
      option_b: (raw.option_b || '').trim().replace(/^[A-Ca-c]\)\s*/, '').slice(0, 100),
      option_c: (raw.option_c || '').trim().replace(/^[A-Ca-c]\)\s*/, '').slice(0, 100),
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
 * Load ALL historical trivia questions from orbix_raw_items.
 *
 * Returns:
 *  - usedTopics: flat list of specific fact labels (e.g. "gold chemical symbol").
 *    These are passed directly to the LLM so it knows which exact facts are exhausted.
 *    When a stored question has no topic field (older rows), we use the question text itself
 *    as the topic entry — the LLM can still infer the covered fact from it.
 *  - recent: the 20 most-recent full question texts (literal wording guard)
 *
 * @returns {Promise<{ usedTopics: string[], recent: string[] }>}
 */
async function loadAllTriviaQuestions(businessId, channelId) {
  const empty = { usedTopics: [], recent: [] };
  if (!businessId || !channelId) return empty;
  try {
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .select('snippet, created_at')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'trivia')
      .order('created_at', { ascending: false })
      .limit(1000); // safety cap
    if (error || !data) return empty;

    const usedTopics = [];
    const recentQuestions = [];

    for (const row of data) {
      try {
        const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
        if (!parsed?.question) continue;

        // Use the stored topic label if available; fall back to the question text.
        // Topic labels are short (3-6 words) and tell the LLM the specific fact covered.
        // Question text as fallback still gives the LLM enough context to infer the fact.
        const topic = parsed.topic?.trim() || parsed.question.trim();
        usedTopics.push(topic);

        // Also collect the last 20 full questions for the wording guard
        if (recentQuestions.length < 20) recentQuestions.push(parsed.question.trim());
      } catch (_) { /* skip malformed rows */ }
    }

    return { usedTopics, recent: recentQuestions };
  } catch (err) {
    console.warn('[Trivia Generator] Failed to load question history:', err?.message);
    return empty;
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

  // Load ALL historical trivia questions — topics already covered + recent full questions.
  const { usedTopics, recent } = await loadAllTriviaQuestions(businessId, channelId);
  console.log(`[Trivia Generator] Loaded ${usedTopics.length} used topics from history`);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const trivia = await generateTriviaQuestion({
      episodeNumber,
      avoidCategories,
      recentQuestions: recent,
      usedTopics,
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
      // Add this topic to the used list so the next LLM attempt knows it's taken
      if (trivia.topic) usedTopics.push(trivia.topic);
      recent.unshift(trivia.question);
      if (recent.length > 20) recent.pop();
      continue;
    }

    return { ...trivia, content_fingerprint: fingerprint };
  }
  return null;
}
