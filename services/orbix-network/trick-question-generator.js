/**
 * Orbix Trick Question Generator Service
 *
 * Generates short trick questions for YouTube Shorts (same pipeline format as riddle/trivia/dad jokes).
 * Viewer pauses, thinks, then gets the "obvious in hindsight" answer. Family friendly, no outside knowledge.
 *
 * Uses content_fingerprint for dedup; content_json: question_text, answer_text, comment_prompt, voice_script.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';

const MODULE_CATEGORY = 'trickquestion';

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
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,?!;:'"()\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function computeTrickQuestionFingerprint(question, answer) {
  const q = normalizeForFingerprint(question);
  const a = normalizeForFingerprint(answer);
  return crypto.createHash('sha256').update(`${q}|${a}`).digest('hex');
}

export async function isTrickQuestionDuplicate(businessId, channelId, fingerprint) {
  if (!fingerprint || !channelId) return false;
  const { data, error } = await supabaseClient
    .from('orbix_raw_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', MODULE_CATEGORY)
    .eq('content_fingerprint', fingerprint)
    .maybeSingle();
  if (error) {
    console.error('[Trick Question Generator] Duplicate check error:', error.message);
    return false;
  }
  return !!data;
}

const COMMENT_PROMPTS = [
  'Did you get it?',
  'Be honest… did you guess right?',
  'Comment if you got this!',
  'Did this trick you?',
  'What was your guess?',
  'Comment your guess before the answer!',
  'Did you figure it out?',
];

const MAX_ATTEMPTS = 5;

/**
 * Generate one trick question via LLM. Same pipeline shape as riddle/dad joke.
 * @returns {Promise<{ question_text, answer_text, comment_prompt, voice_script, content_fingerprint, episode_number, hook } | null>}
 */
export async function generateAndValidateTrickQuestion(businessId, channelId, options = {}) {
  const episodeNumber = options.episodeNumber ?? 1;
  const openai = getOpenAIClient();

  const systemPrompt = `You are generating short trick questions for YouTube Shorts. Goal: viewer pauses, thinks, often guesses wrong, then says "Oh wow… that was obvious" when they see the answer.

RULES:
- Family friendly; kids and adults. Short, instantly understandable.
- Question: 1–2 sentences max, readable in under 3 seconds. Contains a logical trap, wording trick, or assumption trap. NO outside knowledge (no trivia, no history/science facts).
- Answer: 1–3 words, obvious in hindsight. No long explanations.
- Rotate comment prompts: "Did you get it?", "Be honest… did you guess right?", "Comment if you got this!", "Did this trick you?", "What was your guess?", etc.

Viral types (use most often): Assumption traps (e.g. "A plane crashes on the border of Canada and the USA. Where are the survivors buried?" → Survivors aren't buried); Word interpretation tricks ("What has four fingers and a thumb but isn't alive?" → A glove); Obvious-in-hindsight ("How many months have 28 days?" → All of them); Everyday object descriptions ("What gets wetter the more it dries?" → A towel); Perspective/logic flips ("If you have 3 apples and take away 2, how many do you have?" → 2).

AVOID: Trivia (year Eiffel Tower built); multi-step math; long riddles; obscure knowledge; overused internet riddles ("four legs in the morning" etc.).

Difficulty: medium. Viewer needs 5–10 seconds to think, understands answer immediately after reveal.

Output valid JSON only.`;

  const userPrompt = `Generate one trick question. Episode ${episodeNumber}.

Return JSON:
{
  "question": "<short trick question, 1-2 sentences, under 3 seconds to read>",
  "answer": "<1-3 word answer, obvious in hindsight>",
  "comment_prompt": "<one of: Did you get it? / Be honest… did you guess right? / Comment if you got this! / Did this trick you? / What was your guess?>"
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
        max_tokens: 250,
        response_format: { type: 'json_object' }
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const questionText = (parsed.question || '').trim().slice(0, 300);
      const answerText = (parsed.answer || '').trim().slice(0, 80);
      const commentPrompt = (parsed.comment_prompt || COMMENT_PROMPTS[episodeNumber % COMMENT_PROMPTS.length]).trim().slice(0, 80);
      if (!questionText || !answerText) continue;

      const content_fingerprint = computeTrickQuestionFingerprint(questionText, answerText);
      const isDup = await isTrickQuestionDuplicate(businessId, channelId, content_fingerprint);
      if (isDup) {
        console.log(`[Trick Question Generator] Attempt ${attempt}: duplicate fingerprint, retrying`);
        continue;
      }

      const voice_script = `Can you get this one? ${questionText} ... The answer is ${answerText}.`;
      const hook = commentPrompt;
      return {
        question_text: questionText,
        answer_text: answerText,
        comment_prompt: commentPrompt,
        voice_script,
        content_fingerprint,
        episode_number: episodeNumber,
        hook
      };
    } catch (err) {
      console.error(`[Trick Question Generator] Attempt ${attempt} error:`, err?.message);
      if (attempt === MAX_ATTEMPTS) throw err;
    }
  }
  return null;
}
