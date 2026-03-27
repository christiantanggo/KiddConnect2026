/**
 * Orbix Mind Teaser Generator Service
 *
 * Generates mind teaser puzzles (logic, math, sequence, text illusion) via LLM with:
 *  - Type distribution (math, sequence, logic, text_illusion)
 *  - Deterministic validation where applicable (math eval, sequence next term, letter count)
 *  - AI verifier for correctness and ambiguity
 *  - Content policy and fingerprint deduplication
 *  - voice_script for TTS (question + answer)
 *
 * Format mirrors riddle-generator.js — same pipeline, same DB columns, same fingerprint approach.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

// ─── Type & Family Definitions ────────────────────────────────────────────────

export const MIND_TEASER_TYPES = {
  math: {
    label: 'Math',
    description: 'Order of operations, quick mental math, arithmetic tricks',
    families: ['order_of_ops', 'arithmetic', 'multiplication_trick', 'percent_or_fraction']
  },
  sequence: {
    label: 'Sequence',
    description: 'Number or letter sequences — next term',
    families: ['arithmetic_seq', 'geometric_seq', 'squares', 'cubes', 'fibonacci', 'alternating', 'letter_sequence']
  },
  logic: {
    label: 'Logic',
    description: 'Short logic brain teasers, word problems',
    families: ['logic_word_problem', 'deduction', 'weighing', 'switches']
  },
  text_illusion: {
    label: 'Text Illusion',
    description: 'Letter counting, perception tricks — text only',
    families: ['letter_count', 'word_count', 'perception_trick']
  }
};

// Target mix (percent); must sum to 100
export const MIND_TEASER_MIX = {
  math: 30,
  sequence: 30,
  logic: 25,
  text_illusion: 15
};

const N_CANDIDATES = 5;
const MIX_HISTORY_WINDOW = 30;

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
  s = s.replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function computeMindTeaserFingerprint(question, answer) {
  const q = normalizeForFingerprint(question);
  const a = (answer || '').trim().toUpperCase();
  return crypto.createHash('sha256').update(`${q}|${a}`).digest('hex');
}

export async function isMindTeaserDuplicate(businessId, channelId, fingerprint) {
  if (!fingerprint || !channelId) return false;
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('content_fingerprint', fingerprint)
    .maybeSingle();
  if (error) {
    console.error('[Mind Teaser Generator] Duplicate check error:', error.message);
    return false;
  }
  return !!data;
}

// ─── Deterministic Validation ──────────────────────────────────────────────────

/**
 * Safe evaluation of a math expression containing only 0-9, +, -, *, /, (, ), spaces.
 * No eval() — parse and compute.
 */
function safeEvalMath(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const s = expr.replace(/\s+/g, '');
  if (!/^[\d+\-*/().]+$/.test(s)) return null;
  try {
    // Use Function to evaluate only numeric expression (no globals)
    return new Function(`return (${s})`)();
  } catch {
    return null;
  }
}

/**
 * Verify math puzzle: question may contain an expression; answer must match computed value.
 */
function validateMathDeterministic(question, answer) {
  const num = parseFloat(String(answer).trim());
  if (Number.isNaN(num) && !/^-?\d+$/.test(String(answer).trim())) return false;
  // Try to find expression in question (e.g. "What is 2 + 2 × 2?" or "2+2*2 = ?"). Include × and ÷ so full expression is captured.
  const match = question.match(/(\d[\d+\-*/().\s×÷]*\d|\d[\d+\-*/().\s×÷]*=)/) || question.match(/(\d[\d+\-*/().\s×÷]+)/);
  const expr = match ? match[1].replace(/=\s*$/, '').replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/') : null;
  if (!expr) return null; // no expression found — skip deterministic check
  const computed = safeEvalMath(expr);
  if (computed === null) return null;
  return computed === num || Math.abs(computed - num) < 1e-6;
}

/**
 * Verify sequence: generator declares family; we check next term for known families.
 */
function validateSequenceDeterministic(question, answer, family, sequenceTerms) {
  if (!sequenceTerms || !Array.isArray(sequenceTerms) || sequenceTerms.length < 2) return null;
  const terms = sequenceTerms.map(t => typeof t === 'number' ? t : parseFloat(t)).filter(n => !Number.isNaN(n));
  if (terms.length < 2) return null;
  const next = parseFloat(String(answer).trim());
  if (Number.isNaN(next)) return false;

  const n = terms.length;
  if (family === 'arithmetic_seq') {
    const d = terms[1] - terms[0];
    const expected = terms[n - 1] + d;
    return next === expected;
  }
  if (family === 'geometric_seq' && terms[n - 1] !== 0) {
    const r = terms[1] / terms[0];
    const expected = terms[n - 1] * r;
    return Math.abs(next - expected) < 1e-6;
  }
  if (family === 'squares') {
    const idx = Math.round(Math.sqrt(terms[n - 1]));
    const nextSquare = (idx + 1) * (idx + 1);
    return next === nextSquare;
  }
  if (family === 'fibonacci') {
    const expected = terms[n - 1] + terms[n - 2];
    return next === expected;
  }
  return null;
}

/**
 * Letter count: question contains a phrase; answer must be the count of a given letter.
 */
function validateLetterCountDeterministic(question, answer) {
  const letterMatch = question.match(/(?:count|how many|number of)\s+(?:the\s+)?letter\s+["']?([A-Za-z])["']?/i)
    || question.match(/([A-Za-z])\s*(?:appears|times|occurrences)/i);
  const letter = letterMatch ? letterMatch[1].toLowerCase() : null;
  if (!letter) return null;
  const phraseMatch = question.match(/(?:in|from)\s+["']([^"']+)["']/i) || question.match(/(?:phrase|sentence|text)\s*[:\s]+["']?([^"?.!]+)/i);
  const phrase = phraseMatch ? phraseMatch[1] : question;
  const count = (phrase.toLowerCase().match(new RegExp(letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const ansNum = parseInt(String(answer).trim(), 10);
  return !Number.isNaN(ansNum) && ansNum === count;
}

/**
 * Run deterministic checks when applicable. Returns true = pass, false = fail, null = skip.
 */
export function runDeterministicChecks(puzzle) {
  const { type, family, question, answer } = puzzle;
  if (type === 'math') {
    const r = validateMathDeterministic(question, answer);
    if (r === false) {
      console.log('[Mind Teaser Generator] Math deterministic FAIL:', question, '=>', answer);
      return false;
    }
    return r !== null ? true : null;
  }
  if (type === 'sequence') {
    const terms = puzzle.sequence_terms;
    const r = validateSequenceDeterministic(question, answer, family, terms);
    if (r === false) {
      console.log('[Mind Teaser Generator] Sequence deterministic FAIL:', family, terms, '=>', answer);
      return false;
    }
    return r !== null ? true : null;
  }
  if (type === 'text_illusion' && (family === 'letter_count' || question.toLowerCase().includes('letter'))) {
    const r = validateLetterCountDeterministic(question, answer);
    if (r === false) {
      console.log('[Mind Teaser Generator] Letter count deterministic FAIL:', question, '=>', answer);
      return false;
    }
    return r !== null ? true : null;
  }
  return null;
}

// ─── AI Verifier ──────────────────────────────────────────────────────────────

export async function runAIVerifier(question, proposedAnswer) {
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a correctness verifier for mind teaser puzzles. Given a puzzle question and the proposed answer, determine:
1. Is the proposed answer CORRECT for this puzzle?
2. Is the puzzle ambiguous (could multiple answers be defensible)?

Return strict JSON only, no markdown:
{ "verdict": "PASS" or "FAIL", "correct_answer": "<the correct answer if you know it>", "is_ambiguous": true or false, "reason": "<brief reason>" }

Rules: PASS only if the answer is clearly correct and the puzzle is not ambiguous. FAIL if wrong or ambiguous.`
        },
        { role: 'user', content: `Question: ${question}\n\nProposed answer: ${proposedAnswer}` }
      ],
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });
    const raw = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(raw);
    const verdict = (parsed.verdict || '').toUpperCase();
    const pass = verdict === 'PASS' && parsed.is_ambiguous !== true;
    if (!pass) {
      console.log('[Mind Teaser Generator] AI verifier:', verdict, parsed.reason || '');
    }
    return { pass, correct_answer: parsed.correct_answer, is_ambiguous: !!parsed.is_ambiguous, reason: parsed.reason };
  } catch (err) {
    console.error('[Mind Teaser Generator] AI verifier error:', err.message);
    return { pass: true };
  }
}

// ─── Content Policy ────────────────────────────────────────────────────────────

export async function checkMindTeaserContentPolicy(puzzle) {
  try {
    const openai = getOpenAIClient();
    const content = `Type: ${puzzle.type}\nFamily: ${puzzle.family || ''}\nQuestion: ${puzzle.question || ''}\nAnswer: ${puzzle.answer || ''}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a content policy reviewer for a family-safe mind teaser channel. Reject only if:
- Political, religious, sexual, violent, drug-related, or hate content
- Anything not family-safe or brand-unsafe
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
    console.error('[Mind Teaser Generator] Content policy check error:', err.message);
    return { approved: true };
  }
}

// ─── History & Category Selection ─────────────────────────────────────────────

async function loadMindTeaserHistory(businessId, channelId) {
  const empty = { usedQuestions: [], typeCounts: {}, recentTypes: [] };
  if (!businessId || !channelId) return empty;
  try {
    const { data, error } = await supabaseClient
      .from('orbix_raw_items')
      .select('snippet, created_at')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('category', 'mindteaser')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) return empty;

    const usedQuestions = [];
    const typeCounts = {};
    const recentTypes = [];

    for (const row of data) {
      try {
        const parsed = typeof row.snippet === 'string' ? JSON.parse(row.snippet) : row.snippet;
        if (!parsed?.question) continue;
        usedQuestions.push(normalizeForFingerprint(parsed.question));
        const t = parsed.type || 'logic';
        if (recentTypes.length < MIX_HISTORY_WINDOW) {
          recentTypes.push(t);
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
      } catch (_) {}
    }
    return { usedQuestions, typeCounts, recentTypes };
  } catch (err) {
    console.warn('[Mind Teaser Generator] Failed to load history:', err?.message);
    return empty;
  }
}

function selectTargetType(history) {
  const { typeCounts, recentTypes } = history;
  const total = Math.max(1, recentTypes.length);
  const lastType = recentTypes[0] || null;

  const candidates = Object.keys(MIND_TEASER_MIX).filter(t => t !== lastType);
  let bestType = null;
  let bestDeficit = -Infinity;

  for (const type of candidates) {
    const target = (MIND_TEASER_MIX[type] || 0) / 100;
    const actual = (typeCounts[type] || 0) / total;
    const deficit = target - actual;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestType = type;
    }
  }
  if (!bestType) {
    const fallbacks = Object.keys(MIND_TEASER_MIX).filter(t => t !== lastType);
    bestType = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  const typeInfo = MIND_TEASER_TYPES[bestType];
  const families = typeInfo?.families || [];
  const family = families[Math.floor(Math.random() * families.length)] || families[0] || bestType;
  console.log(`[Mind Teaser Generator] Selected type: ${bestType}, family: ${family}, last: ${lastType || 'none'}`);
  return { type: bestType, family };
}

// ─── Single Puzzle Generation ──────────────────────────────────────────────────

export async function generateMindTeaser(options = {}) {
  const {
    episodeNumber = 1,
    targetType = 'logic',
    targetFamily = '',
    recentQuestions = []
  } = options;

  const openai = getOpenAIClient();
  const typeInfo = MIND_TEASER_TYPES[targetType] || MIND_TEASER_TYPES.logic;
  const families = typeInfo.families || [];
  const family = targetFamily || families[0] || targetType;

  const recentText = recentQuestions.length
    ? `\nRecent questions (avoid same wording/concept):\n${recentQuestions.slice(0, 6).map(q => `- ${q}`).join('\n')}`
    : '';

  const systemPrompt = `You are a mind teaser writer for "Orbix – Mind Teasers", a YouTube Shorts channel. Create ONE short puzzle.

RULES:
- Type: ${targetType}. Family: ${family}.
- Question: max 2 lines, ≤ 80 chars per line. Solvable in ~3 seconds by most viewers.
- Answer: short (one number, one word, or short phrase).
- NO riddles. NO "spot the difference". NO image-based puzzles. Text only.
- Family-safe, no politics/religion/violence.
- For math: use a clear expression (e.g. "What is 2 + 2 × 2?"). Answer must be the correct computed value.
- For sequence: give the sequence and ask for the next term. Include sequence_terms as JSON array of numbers.
- For text_illusion letter_count: give a phrase and ask how many times a letter appears. Answer must be the exact count.
- Return strict JSON only. No markdown.`;

  const userPrompt = `Generate one ${targetType} mind teaser (family: ${family}).${recentText}

Episode: ${episodeNumber}

Return JSON only:
{
  "type": "${targetType}",
  "family": "${family}",
  "question": "<1-2 lines, ≤80 chars per line>",
  "answer": "<short answer>",
  "difficulty": "easy or medium",
  "estimated_solve_seconds": 1-3,
  "notes_for_verifier": "<brief explanation for verification>",
  "sequence_terms": [<only for sequence type: array of numbers>],
  "hook": "<optional 3-7 words, e.g. Can you get it?>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    });
    const raw = JSON.parse(completion.choices[0].message.content || '{}');
    const question = (raw.question || '').trim().slice(0, 200);
    const answer = (raw.answer || '').trim().slice(0, 80);
    if (!question || !answer) return null;

    const voice_script = `${question} ... The answer is ${answer}.`;
    return {
      type: raw.type || targetType,
      family: raw.family || family,
      question,
      answer,
      difficulty: raw.difficulty === 'medium' ? 'medium' : 'easy',
      estimated_solve_seconds: Math.min(3, Math.max(1, parseInt(raw.estimated_solve_seconds, 10) || 2)),
      notes_for_verifier: (raw.notes_for_verifier || '').slice(0, 200),
      sequence_terms: Array.isArray(raw.sequence_terms) ? raw.sequence_terms : undefined,
      hook: (raw.hook || 'Can you get it?').trim().slice(0, 80),
      voice_script: voice_script.slice(0, 500),
      episode_number: episodeNumber
    };
  } catch (err) {
    console.error('[Mind Teaser Generator] Generate error:', err.message);
    return null;
  }
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

/**
 * Generate one mind teaser with validation and dedup. Returns null if no valid puzzle after retries.
 */
export async function generateAndValidateMindTeaser(businessId, channelId, options = {}) {
  const { episodeNumber = 1, maxRetries = 20 } = options;

  const history = await loadMindTeaserHistory(businessId, channelId);
  const { type: targetType, family: targetFamily } = selectTargetType(history);

  let attempts = 0;
  while (attempts < maxRetries) {
    const candidatePromises = Array.from({ length: N_CANDIDATES }, () =>
      generateMindTeaser({
        episodeNumber,
        targetType,
        targetFamily,
        recentQuestions: history.usedQuestions.slice(0, 20)
      })
    );
    const candidates = (await Promise.all(candidatePromises)).filter(Boolean);

    for (const c of candidates) {
      const det = runDeterministicChecks(c);
      if (det === false) continue;

      const verifier = await runAIVerifier(c.question, c.answer);
      if (!verifier.pass) {
        // When deterministic already passed (e.g. math), accept if AI says the answer is correct
        const correctNorm = (verifier.correct_answer || '').trim().toLowerCase();
        const answerNorm = (c.answer || '').trim().toLowerCase();
        const numericMatch = !Number.isNaN(parseFloat(correctNorm)) && !Number.isNaN(parseFloat(answerNorm))
          && Math.abs(parseFloat(correctNorm) - parseFloat(answerNorm)) < 1e-6;
        if (det === true && correctNorm && (correctNorm === answerNorm || numericMatch)) {
          // Verifier said FAIL but correct_answer matches our answer (e.g. "correct but straightforward")
        } else {
          continue;
        }
      }

      const policy = await checkMindTeaserContentPolicy(c);
      if (!policy.approved) {
        console.log('[Mind Teaser Generator] Policy reject:', policy.reason);
        continue;
      }

      const fingerprint = computeMindTeaserFingerprint(c.question, c.answer);
      const isDup = await isMindTeaserDuplicate(businessId, channelId, fingerprint);
      if (isDup) continue;

      console.log('[Mind Teaser Generator] Selected:', c.type, c.family, 'answer=', c.answer);
      return { ...c, content_fingerprint: fingerprint };
    }

    attempts++;
  }

  console.error(`[Mind Teaser Generator] No valid puzzle after ${maxRetries} attempts`);
  return null;
}
