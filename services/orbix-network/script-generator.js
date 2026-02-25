/**
 * Orbix Network Script Generator Service
 * Generates video scripts from classified stories
 */

import OpenAI from 'openai';
import { supabaseClient } from '../../config/database.js';

/** Max words per hook line; max lines for hook. */
const HOOK_MAX_WORDS_PER_LINE = 14;
const HOOK_MAX_LINES = 2;

/** Hedging / filler words to remove or replace so hooks stay punchy. */
const HOOK_BANNED_WORDS = /\b(might|may|can|often|sometimes|perhaps|probably|possibly|generally|usually|typically|reveals?|influenced?|modelling|satisfaction|many people|it can|this is why|ever wonder|pretend|maybe|preferences?|influence|tend|insecurity)\b/gi;

/** High-retention hooks (Money + Psychology): 4–8 words; strong declarative; high-authority. */
const HOOK_MIN_WORDS_HIGH_RETENTION = 4;
const HOOK_MAX_WORDS_HIGH_RETENTION = 8;

/** Shorts-native format (psychology/money): 12–16s, tension + loop cut. */
const SHORTS_NATIVE_HOOK_MAX_WORDS = 7;
const SHORTS_NATIVE_TOTAL_WORDS_MIN = 32;
const SHORTS_NATIVE_TOTAL_WORDS_MAX = 45;
const MONEY_HOOK_MAX_WORDS = HOOK_MAX_WORDS_HIGH_RETENTION;
const PSYCHOLOGY_HOOK_MAX_WORDS = HOOK_MAX_WORDS_HIGH_RETENTION;

/** Banned starts for money/psychology (reject and strip): soft, academic, explanatory. */
const HIGH_RETENTION_BANNED_STARTS = /^\s*(Have you ever[,.]?\s|Many people[,.]?\s|Sometimes[,.]?\s|It can be\s|This can lead to\s|Over time[,.]?\s|Understanding this can help\s|Why do\s|Why does\s|Ever wonder[,.]?\s|Did you know[,.]?\s|In psychology[,.]?\s|Studies show[,.]?\s|Understanding\s|Why\s)/i;

/** Accusatory phrases that violate observational tone (reject hook). */
const HOOK_ACCUSATORY_PHRASES = /\b(you'?re wrong|you'?re lying|you'?re fooling yourself)\b/i;
const MONEY_HOOK_BANNED_STARTS = HIGH_RETENTION_BANNED_STARTS;
const PSYCHOLOGY_HOOK_BANNED_STARTS = HIGH_RETENTION_BANNED_STARTS;

/** Hook Style Guide block for LLM prompts (Money + Psychology). */
const HOOK_STYLE_GUIDE = `HOOK STYLE GUIDE (high-retention Shorts):
- Output 1–2 lines only. Each line ≤ ${HOOK_MAX_WORDS_PER_LINE} words.
- First line must be a pattern interrupt: bold claim, contradiction, or "you think X, but Y".
- Use 2nd person ("you/your") and identity triggers. Simple words. Short sentences.
- No hedging: avoid "might, may, can, often, sometimes". No academic: "reveals, influenced, modelling, satisfaction".
- No questions unless a single sharp question as line 2.
- Approved structures: A) "You think _____. You're wrong." B) "Your brain _____. That's why ____." C) "This is why ____ feels ____." D) "Most people _____. Here's what's actually happening." E) "____ is not about _____. It's about ____."`;

/** Final tone: observational, not accusatory (Money + Psychology). */
const HIGH_RETENTION_HOOK_RULES = `HOOK: One strong declarative sentence. ${HOOK_MIN_WORDS_HIGH_RETENTION}–${HOOK_MAX_WORDS_HIGH_RETENTION} words. Calm but sharp. Observational, not accusatory.
AVOID: "You're wrong," "You're fooling yourself," "You're lying." No attacking the viewer.
Use framing like: "Fairness isn't always what it seems." "Generosity has hidden motives." "Approval influences spending." "Selflessness has a cost."
FORBIDDEN: "Why…", "Many people…", "Have you ever…", "Understanding…". No soft curiosity. No motivational tone.`;

/** Observational hook examples (one per variation). */
const HOOK_ALLOWED_FORMATS = `HOOK EXAMPLES (observational, final brand voice):
"Fairness isn't always what it seems." "Generosity has hidden motives." "Approval influences spending."
"Selflessness has a cost." "Fairness isn't always what it appears to be." "Unexamined motives have consequences."`;

/** Money channel: observers of behavior, not judges. */
const MONEY_HOOK_STYLE_GUIDE = `HOOK (Money) — ${HIGH_RETENTION_HOOK_RULES}

${HOOK_ALLOWED_FORMATS}

MONEY CHANNEL: Calm, analytical, observational. Focus on behavioral dynamics. Not accusatory. Not theatrical.`;

/** Psychology channel: observers of behavior, not judges. */
const PSYCHOLOGY_HOOK_STYLE_GUIDE = `HOOK (Psychology) — ${HIGH_RETENTION_HOOK_RULES}

${HOOK_ALLOWED_FORMATS}

PSYCHOLOGY CHANNEL: Calm, analytical, observational. Focus on behavioral dynamics. Not accusatory. Not theatrical.`;

/** What Happened: analytical; no moral judgment (Money + Psychology). */
const WHAT_HAPPENED_STRUCTURE = `WHAT HAPPENED (final brand voice — observational, not accusatory):
- 2–3 clean sentences. Natural flow. Analytical tone.
- No moral judgment. No emotional exaggeration.
- FORBIDDEN words: "manipulation," "fake," "lying," "pretend," etc. Focus on behavioral dynamics.
- FORBIDDEN openers: "Many people…", "This can lead to…", "Understanding this can help…". No preachy or motivational tone.

DO NOT: Judge the viewer. Use accusatory language. Be emotional or theatrical.

GOOD (2–3 sentences, analytical):
You may believe your spending reflects generosity or altruism. But social approval and the desire to be perceived positively often influence financial choices in subtle ways. Over time, these influences reshape priorities without conscious awareness.`;

/** Tone: observers of behavior, not judges. Final brand voice. */
const AUTHORITY_TONE = `TONE (final brand voice): We are observers of behavior, not judges of behavior.
We are: Calm. Controlled. Slightly unsettling. Intellectually composed.
We are never: Accusatory. Emotional. Preachy. Motivational. Theatrical.
The viewer should feel: "Hmm. That's interesting."
Not: "I'm being attacked."`;

/** Shock score below this (for money) triggers an extra retry for a more aggressive hook. */
const MONEY_SHOCK_SCORE_MIN = 70;

/** Shorts-native format: FORCE retention — tension, ego-threat, punchy ending. NO educational/documentary tone. */
const SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE = 9;
/** Banned abstract words in twist/payoff (psychology/money). */
const SHORTS_NATIVE_BANNED_WORDS = /\b(influences?|preferences?|subconsciously|lens|shapes?\b|decisions?)\b/gi;
const SHORTS_NATIVE_PAYOFF_MAX_WORDS = 10;
const SHORTS_NATIVE_LOOP_MAX_WORDS = 8;
const SHORTS_NATIVE_CAPTION_MAX_WORDS = 6;
const SHORTS_NATIVE_CAPTION_LINES_MIN = 5;
const SHORTS_NATIVE_CAPTION_LINES_MAX = 7;

const SHORTS_NATIVE_SYSTEM = `You write YouTube Shorts scripts for Psychology and Money. PRIMARY GOAL: stop swipes. Create tension, ego-threat, discomfort, and a punchy ending that drives rewatch. The story must feel complete; the last line must be a full sentence. We are NOT polite. We are NOT teaching.

=== HARD OUTPUT (PASS/FAIL) ===
- LENGTH: 12–16 seconds spoken. Word count MUST be ${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX} words total. No exceptions.
- STRUCTURE (EXACT):
  - HOOK: 1 line, <= ${SHORTS_NATIVE_HOOK_MAX_WORDS} words. Identity threat or contradiction. Must land in under 1 second — first 3–4 words are the punch (no setup phrase first).
  - TWIST (what_happened): EXACTLY 2 lines. Each line <= ${SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE} words. Escalate tension. NO definitions, NO explanations.
  - PAYOFF (why_it_matters): 1 line, <= ${SHORTS_NATIVE_PAYOFF_MAX_WORDS} words. Sharp insight, concrete language.
  - LOOP CUT (what_happens_next): 1 line, <= ${SHORTS_NATIVE_LOOP_MAX_WORDS} words. Must be a COMPLETE sentence or phrase — the story must feel complete. Create rewatch with a punch or open-ended implication, not a literal cut-off.

- TONE: Must feel like exposure / call-out / secret. NOT a lesson, blog post, or TED talk. The script must read as a COMPLETE story (clear point, full thought).

- BANNED (FAIL IF PRESENT): Section headers. Soft CTA ("comment below", "follow for more"). Intros ("did you know", "in this video", "let's talk about"). Lists ("3 signs", "5 ways"). Moralizing: "might", "could", "sometimes", "often" (max 1 total if needed). HEAVY ABSTRACT WORDS — avoid: "influences", "preferences", "subconsciously", "lens", "shapes", "decisions". Use "bias" at most once; prefer not. No long explanations, no definitions. Literally incomplete sentences (e.g. "And that's why you still..." with nothing after).

- REQUIRED: Include at least ONE of: ego trigger ("You think you're… but…"), threat ("This is why you keep losing…"), conflict ("They want you to…"), regret ("This is costing you…"), secret ("Nobody tells you this…").

- LOOP CUT (CRITICAL): Last line MUST be a full sentence or phrase — no trailing "..." with the thought unfinished. Create rewatch with a sharp punch or implication. GOOD: "And that's why you still lose." "Which is exactly how they get you." "And that's the part they don't show you." "And that's why you keep falling for it." BAD: "And that's why you still..." (incomplete). BAD: Soft question "Could this affect you?" BAD: Obvious wrap-up like "So next time, think about it."

- CAPTIONS: Return "captions" as array of 5–7 strings. Each caption <= ${SHORTS_NATIVE_CAPTION_MAX_WORDS} words. Punchy, match script pacing.

SELF-VERIFY before output: (A) Hook threatens identity or creates curiosity. (B) No line sounds like a definition. (C) Ending is a COMPLETE sentence that still creates rewatch (no literal "..."). (D) Concrete verbs: tricks, hijacks, edits, punishes, pulls, hooks, controls, steals — not abstract. (E) Word count ${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX}. (F) Whole script reads as a complete story.

Return only valid JSON: hook, what_happened (EXACTLY 2 lines separated by newline \\n — line 1 <= ${SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE} words, line 2 <= ${SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE} words), why_it_matters, what_happens_next, cta_line (""), captions (array of 5–7 strings), duration_target_seconds (14).`;

/**
 * Count words in a string (splits on whitespace).
 * @param {string} s - Text
 * @returns {number}
 */
function countWords(s) {
  if (typeof s !== 'string') return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Psychology: opening hook is what_happens_next, so it MUST be a question.
 * @param {string} text - what_happens_next
 * @returns {boolean}
 */
function isQuestion(text) {
  const s = (text || '').trim();
  if (!s) return false;
  if (s.endsWith('?')) return true;
  const lower = s.toLowerCase();
  if (/^(did you|do you|would you|have you|are you|is it|why do|why does|how do|how does|what if|when did|who |which )/i.test(lower)) return true;
  return false;
}

/**
 * Validate Shorts-native script.
 * Psychology uses a separate, lighter validation (concept-first format: question → name → "Like when..." → payoff).
 * Money uses full word-count + banned-word check.
 * @param {{ hook?: string, what_happened?: string, why_it_matters?: string, what_happens_next?: string }} scriptData
 * @param {string} [topic] - 'psychology' | 'money' | other
 * @returns {{ compliant: boolean, reason?: string }}
 */
function isShortsNativeScriptCompliant(scriptData, topic = '') {
  const isPsychology = (topic || '').toLowerCase() === 'psychology';
  const whatHappened = (scriptData.what_happened || '').trim();
  const whatHappensNext = (scriptData.what_happens_next || '').trim();
  const whyItMatters = (scriptData.why_it_matters || '').trim();

  // Psychology: question → concept name → "Like when..." → payoff (shorter, concept-first format)
  if (isPsychology) {
    if (!isQuestion(whatHappensNext)) {
      return { compliant: false, reason: 'Psychology opening hook (what_happens_next) must be a question ending with ?.' };
    }
    // Question must not contain "you" + a contrast word in the same sentence (sends brain to the wrong thing)
    const qLower = whatHappensNext.toLowerCase();
    const hasContrast = /\b(and forget|but forget|instead of|not the|over the|more than|rather than|but not|while forgetting)\b/.test(qLower);
    if (hasContrast) {
      return { compliant: false, reason: 'Psychology question must not set up a contrast (e.g. "remember X and forget Y"). Ask about the phenomenon directly: "Do you always remember the weird stuff?" not "Why do you remember X and forget Y?".' };
    }
    // Question must feel personal — include "you" or "your"
    if (!/\b(you|your)\b/.test(qLower)) {
      return { compliant: false, reason: 'Psychology question must include "you" or "your" to feel personal and direct (e.g. "Do you always remember the weird stuff?").' };
    }
    const twistLines = whatHappened.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (twistLines.length !== 2) {
      return { compliant: false, reason: `what_happened must be exactly 2 lines (concept name + "Like when..." example). Got ${twistLines.length}.` };
    }
    const spokenWords = countWords(whatHappened) + countWords(whyItMatters);
    if (spokenWords < 12 || spokenWords > 35) {
      return { compliant: false, reason: `Spoken body (what_happened + why_it_matters) must be 12–35 words (got ${spokenWords}).` };
    }
    return { compliant: true };
  }

  // Money / other Shorts-native: original word count + twist + banned word checks
  const hook = (scriptData.hook || '').trim();
  const total = countWords(hook) + countWords(whatHappened) + countWords(whyItMatters) + countWords(whatHappensNext);
  if (total < SHORTS_NATIVE_TOTAL_WORDS_MIN || total > SHORTS_NATIVE_TOTAL_WORDS_MAX) {
    return { compliant: false, reason: `Total word count ${total}; must be ${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX}.` };
  }
  const twistLines = whatHappened.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (twistLines.length !== 2) {
    return { compliant: false, reason: `TWIST must be exactly 2 lines (got ${twistLines.length}). Use newline between them.` };
  }
  const line1Words = countWords(twistLines[0]);
  const line2Words = countWords(twistLines[1]);
  if (line1Words > SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE || line2Words > SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE) {
    return { compliant: false, reason: `Each TWIST line must be <= ${SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE} words (got ${line1Words} and ${line2Words}).` };
  }
  const body = `${whatHappened} ${whyItMatters}`;
  const bannedMatch = body.match(SHORTS_NATIVE_BANNED_WORDS);
  if (bannedMatch) {
    const word = bannedMatch[0].toLowerCase();
    return { compliant: false, reason: `Banned word "${word}" in twist/payoff. Use concrete verbs instead.` };
  }
  return { compliant: true };
}

/**
 * Validate hook for high-retention rules (money/psychology): Shorts-native max 7 words, observational not accusatory, no banned starts.
 * @param {string} hook - Hook text
 * @param {string} topic - 'money' | 'psychology'
 * @returns {{ compliant: boolean, reason?: string }}
 */
export function isHookCompliant(hook, topic = '') {
  const t = (topic || '').toLowerCase();
  if (t !== 'money' && t !== 'psychology') return { compliant: true };
  const s = (hook || '').trim();
  if (!s) return { compliant: false, reason: 'empty' };
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < HOOK_MIN_WORDS_HIGH_RETENTION) return { compliant: false, reason: `fewer than ${HOOK_MIN_WORDS_HIGH_RETENTION} words (got ${words.length})` };
  if (words.length > SHORTS_NATIVE_HOOK_MAX_WORDS) return { compliant: false, reason: `hook exceeds ${SHORTS_NATIVE_HOOK_MAX_WORDS} words (got ${words.length})` };
  if (HOOK_ACCUSATORY_PHRASES.test(s)) return { compliant: false, reason: 'accusatory phrasing (observational tone required)' };
  if (HIGH_RETENTION_BANNED_STARTS.test(s)) return { compliant: false, reason: 'banned opener (Many people/Have you ever/Understanding/This can lead to/Why etc.)' };
  return { compliant: true };
}

/**
 * Normalize What Happened for Money/Psychology (authority style): keep natural flow.
 * For Shorts-native, preserves newlines (2-line twist). Converts " / " to space.
 * @param {string} text - Raw what_happened from LLM
 * @param {boolean} [preserveNewlines] - If true, keep \\n for 2-line twist
 * @returns {string} Trimmed, normalized
 */
export function normalizeWhatHappened(text, preserveNewlines = false) {
  if (typeof text !== 'string') return '';
  const t = text.trim().replace(/\s*\/\s*/g, ' ');
  if (preserveNewlines) {
    return t.split(/\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').trim() || text.trim();
  }
  const s = t.replace(/\s+/g, ' ').trim();
  return s || text.trim();
}

// Lazy OpenAI client initialization
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Convert a short statement into a single short question for psychology opening hook.
 * Used when the LLM returns a declarative "loop" line — we need a real question at the start.
 * @param {string} statement - e.g. "And you never even realize it."
 * @returns {Promise<string>} e.g. "Do you ever even realize it?"
 */
async function convertStatementToQuestion(statement) {
  const s = (statement || '').trim().replace(/[.!]$/, '').slice(0, 120);
  if (!s) return 'Did you catch that?';
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You output only a single short question (under 10 words). No explanation. The question must end with ? and hook the viewer. Psychology/bias/perception tone.' },
        { role: 'user', content: `Turn this into one short question (under 10 words, end with ?): ${s}` }
      ],
      temperature: 0.3,
      max_tokens: 50
    });
    const out = (completion.choices[0]?.message?.content || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (out && (out.endsWith('?') || /^(did you|do you|would you|have you|are you|why |how |what |when |who |which )/i.test(out))) {
      return out.endsWith('?') ? out : out + '?';
    }
  } catch (err) {
    console.warn('[Script Generator] convertStatementToQuestion failed:', err?.message);
  }
  return s + '?';
}

/**
 * Rewrite generated hook: Money/Psychology = 4–8 words, strip banned openers/filler. Other = ≤2 lines, ≤14 words/line.
 * @param {string} text - Raw hook from LLM
 * @param {string} topic - 'psychology' | 'money' | other
 * @returns {string} Rewritten hook
 */
export function rewriteHookForShorts(text, topic = '') {
  if (typeof text !== 'string') return '';
  let original = text.trim().replace(/\s+/g, ' ');
  if (!original) return '';

  const topicLower = (topic || '').toLowerCase();
  const isMoney = topicLower === 'money';
  const isPsychology = topicLower === 'psychology';
  const isHighRetention = isMoney || isPsychology;
  const maxWords = isHighRetention ? SHORTS_NATIVE_HOOK_MAX_WORDS : HOOK_MAX_WORDS_PER_LINE;

  if (isHighRetention) {
    let s = original.replace(HIGH_RETENTION_BANNED_STARTS, '').trim();
    s = s.replace(HOOK_BANNED_WORDS, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = original.replace(HIGH_RETENTION_BANNED_STARTS, '').trim();
    const words = s.split(/\s+/).filter(Boolean);
    const out = words.slice(0, maxWords).join(' ').trim();
    return out || original.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ').trim();
  }

  let s = original.replace(HOOK_BANNED_WORDS, ' ').replace(/\s+/g, ' ').trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    const fallbackWords = original.split(/\s+/).filter(Boolean);
    const lines = [];
    let cursor = 0;
    for (let i = 0; i < HOOK_MAX_LINES && cursor < fallbackWords.length; i++) {
      lines.push(fallbackWords.slice(cursor, cursor + HOOK_MAX_WORDS_PER_LINE).join(' '));
      cursor += HOOK_MAX_WORDS_PER_LINE;
    }
    return lines.join('\n').trim();
  }
  const lines = [];
  let cursor = 0;
  for (let lineIndex = 0; lineIndex < HOOK_MAX_LINES && cursor < words.length; lineIndex++) {
    const take = Math.min(HOOK_MAX_WORDS_PER_LINE, words.length - cursor);
    lines.push(words.slice(cursor, cursor + take).join(' '));
    cursor += take;
  }
  return lines.join('\n').trim() || words.slice(0, HOOK_MAX_WORDS_PER_LINE).join(' ');
}

/**
 * Generate script for a story
 * @param {Object} story - Story object from database
 * @param {Object} rawItem - Raw item data
 * @returns {Promise<Object>} Script object
 */
export async function generateScript(story, rawItem) {
  const startTime = Date.now();
  console.log(`[Script Generator] ========== generateScript START ==========`);
  console.log(`[Script Generator] Story ID: ${story.id}, Raw Item ID: ${rawItem?.id}`);
  const isPsychology = story.category === 'psychology';
  const isMoney = story.category === 'money';
  const isTrivia = story.category === 'trivia';
  const isFacts = story.category === 'facts';

  try {
    // Facts: turn raw fact into Shorts-native script (hook, twist, payoff, loop) via LLM
    if (isFacts && rawItem?.snippet) {
      let factsPayload;
      try {
        factsPayload = typeof rawItem.snippet === 'string' ? JSON.parse(rawItem.snippet) : rawItem.snippet;
      } catch {
        console.error('[Script Generator] Facts snippet is not valid JSON');
        throw new Error('Facts snippet must be valid JSON');
      }
      const title = (factsPayload.title || 'Fact').trim();
      const factText = (factsPayload.fact_text || '').trim();
      if (!factText) {
        throw new Error('Facts snippet missing fact_text');
      }
      const factsSystemPrompt = `You write YouTube Shorts scripts for a Facts channel. Turn a single factual claim into a retention-focused Shorts script. Same rules as psychology/money: tension, hook, punchy ending. NOT educational or documentary tone.

- TOTAL: ${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX} words. Hook <= ${SHORTS_NATIVE_HOOK_MAX_WORDS} words. TWIST (what_happened): exactly 2 lines (separate with \\n), each <= ${SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE} words — the fact, punchy. PAYOFF (why_it_matters): 1 line <= ${SHORTS_NATIVE_PAYOFF_MAX_WORDS} words. LOOP (what_happens_next): 1 line <= ${SHORTS_NATIVE_LOOP_MAX_WORDS} words, complete sentence with punch.
- Hook must land in under 1 second (identity threat or curiosity). No "Did you know". No soft endings. Include at least one of: secret, ego trigger, conflict.
- Return JSON only: hook, what_happened (2 lines with \\n), why_it_matters, what_happens_next, cta_line (""), duration_target_seconds (14).`;

      const factsUserPrompt = `Turn this fact into a Shorts script (${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX} words). Hook <= ${SHORTS_NATIVE_HOOK_MAX_WORDS} words. 2-line twist, payoff, loop (complete punch).

Subject: ${title}
Fact: ${factText}

Return JSON only: hook, what_happened (2 lines with \\n), why_it_matters, what_happens_next, cta_line "", duration_target_seconds 14.`;

      const completion = await getOpenAIClient().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: factsSystemPrompt },
          { role: 'user', content: factsUserPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });
      const scriptData = JSON.parse(completion.choices[0].message.content);
      if (scriptData.what_happened && typeof scriptData.what_happened === 'string') {
        scriptData.what_happened = scriptData.what_happened.replace(/\\n/g, '\n').trim();
      }
      const rawWhatHappened = (scriptData.what_happened || '').trim();
      const script = {
        hook: (scriptData.hook || '').trim().slice(0, 80),
        what_happened: normalizeWhatHappened(rawWhatHappened, true) || rawWhatHappened,
        why_it_matters: (scriptData.why_it_matters || '').trim().slice(0, 200),
        what_happens_next: (scriptData.what_happens_next || '').trim().slice(0, 150),
        cta_line: '',
        duration_target_seconds: Math.min(16, Math.max(12, Number(scriptData.duration_target_seconds) || 14)),
        content_type: 'facts',
        content_json: {
          title: factsPayload.title,
          fact_text: factsPayload.fact_text,
          entity_id: factsPayload.entity_id,
          property_id: factsPayload.property_id
        }
      };
      if (!script.hook || !script.what_happened || !script.why_it_matters || !script.what_happens_next) {
        throw new Error('Facts LLM script missing required fields');
      }
      console.log(`[Script Generator] Facts script from LLM (hook + twist + payoff + loop)`);
      return script;
    }

    // Trivia: use pre-generated payload from raw item snippet (no LLM call)
    if (isTrivia && rawItem?.snippet) {
      let trivia;
      try {
        trivia = typeof rawItem.snippet === 'string' ? JSON.parse(rawItem.snippet) : rawItem.snippet;
      } catch {
        console.error('[Script Generator] Trivia snippet is not valid JSON');
        throw new Error('Trivia snippet must be valid JSON');
      }
      const script = {
        hook: (trivia.hook || 'Let\'s test your knowledge.').trim(),
        what_happened: trivia.question || '',
        why_it_matters: '',
        what_happens_next: 'Comment A, B, or C.',
        cta_line: trivia.voice_script?.includes('Comment') ? 'Comment A, B, or C.' : 'Did you get it right?',
        duration_target_seconds: 30,
        content_type: 'trivia',
        content_json: {
          hook: trivia.hook,
          category: trivia.category,
          question: trivia.question,
          option_a: trivia.option_a,
          option_b: trivia.option_b,
          option_c: trivia.option_c,
          correct_answer: trivia.correct_answer,
          voice_script: trivia.voice_script,
          episode_number: trivia.episode_number
        }
      };
      console.log(`[Script Generator] Trivia script from snippet (no LLM)`);
      return script;
    }

    console.log(`[Script Generator] Step 1: Building prompts... (psychology=${isPsychology}, money=${isMoney})`);
    let systemPrompt;
    let userPrompt;
    if (isPsychology) {
      systemPrompt = `You write YouTube Shorts scripts for a Psychology channel. PRIMARY GOAL: create a curiosity loop — open with a question about the psychology idea, deliver the "aha" quickly, then loop back to the question.

STRUCTURE (EXACT — do not deviate):
1. OPENING QUESTION (what_happens_next): 1 short question, ≤ 8 words, ends with "?". Must make the viewer's brain immediately DO the thing the video is about — scan their memory, notice a feeling, recognise a pattern. Use "you" or "your". Ask about the phenomenon directly, positively. NEVER set up a contrast in the question (no "and forget the X" or "but not the Y" — that sends the brain to the wrong thing).
   GOOD: "Do you always remember the weird stuff?" → brain scans for weird memories ✓
   GOOD: "Have you ever replayed an awkward moment for days?" → brain immediately replays one ✓
   GOOD: "Why do you always notice that one mistake?" → brain finds the mistake ✓
   BAD: "Why do you remember the weird stuff and forget the normal?" → brain goes to "the normal" ✗
   BAD: "Why do bad memories feel more real than good ones?" → contrast kills focus ✗
   BAD: "Why does one criticism stick more than ten compliments?" → brain counts compliments ✗
2. CONCEPT NAME (Line 1 of what_happened): State the name of the psychology concept in plain, everyday language. Max 12 words. e.g. "It's called the negativity bias." "That's the spotlight effect at work."
3. RELATABLE EXAMPLE (Line 2 of what_happened): Start with "Like when" and give one concrete, specific scenario the viewer instantly recognises. Max 14 words. e.g. "Like when one bad comment ruins a day of great feedback." "Like when you replay an awkward moment for days."
4. PAYOFF (why_it_matters): One short line (max 12 words) that explains why this matters or what it means for them. Calm, clear, slightly fascinating tone. e.g. "Your brain weights bad events more than good ones." "It's not a flaw — it's how you're wired."

TONE: Clear, calm, slightly fascinating. NOT preachy. NOT accusatory. Like discovering something interesting about yourself.
SPOKEN BODY: what_happened (lines 1+2) + why_it_matters is all that is spoken aloud. Keep total spoken words 18–32.
VIDEO LOOP: After the payoff, the video loops back to the opening question automatically.

Return only valid JSON: hook (the concept name, for title/metadata), what_happened (EXACTLY 2 lines separated by \\n — Line 1 = concept name, Line 2 = "Like when..." example), why_it_matters (payoff line), what_happens_next (the opening question, must end with ?), cta_line (""), captions (5–6 short strings matching the spoken body), duration_target_seconds (12).`;

      userPrompt = `Write a psychology Short using the concept-first format:
- what_happens_next: Opening question about the concept (≤ 8 words, ends with ?)
- what_happened line 1: Name the psychology concept ("It's called [X]." or "That's [X] at work.")
- what_happened line 2: "Like when [concrete relatable scenario]." (≤ 14 words)
- why_it_matters: One-line payoff (≤ 12 words)

Concept: ${rawItem?.title || story.title || 'Psychology concept'}
Source: ${(rawItem?.snippet || story.snippet || '').slice(0, 600)}

EXAMPLES of the format:
  what_happens_next: "Do you always remember the one bad comment?" → brain scans for it immediately
  what_happened: "It's called the negativity bias.\\nLike when one bad review ruins a week of great ones."
  why_it_matters: "Your brain is built to weight threats more than rewards."

  what_happens_next: "Have you ever replayed an awkward moment for days?"
  what_happened: "That's the Zeigarnik effect at work.\\nLike when you can't stop thinking about an unfinished task."
  why_it_matters: "Unfinished things stay open tabs in your brain."

The question must make the viewer's brain DO the thing — not describe or contrast it. Short, personal, positive framing only.

Return JSON only: hook (concept name for metadata), what_happened (2 lines with \\n), why_it_matters, what_happens_next (question ending with ?), cta_line "", captions (5–6 short strings), duration_target_seconds 12.`;
    } else if (isMoney) {
      systemPrompt = `${SHORTS_NATIVE_SYSTEM}

Money channel: spending, approval, ego, status, control. Concrete verbs. No financial advice.`;

      const shockHint = (story.shock_score ?? 0) < MONEY_SHOCK_SCORE_MIN
        ? ` Shock score below ${MONEY_SHOCK_SCORE_MIN}: hook sharp, tension, no soft tone.`
        : '';
      userPrompt = `Shorts-native script. TOTAL words MUST be ${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX}. HOOK <= ${SHORTS_NATIVE_HOOK_MAX_WORDS} words. TWIST = exactly 2 lines separated by newline (\\\\n), each line <= ${SHORTS_NATIVE_TWIST_MAX_WORDS_PER_LINE} words. PAYOFF <= ${SHORTS_NATIVE_PAYOFF_MAX_WORDS} words. LOOP = complete sentence, punchy. Do NOT use: preferences, influences, subconsciously, lens, shapes, decisions. Include threat or regret. captions array: 5–7 lines, each <= ${SHORTS_NATIVE_CAPTION_MAX_WORDS} words.

Concept: ${rawItem?.title || story.title || 'Money concept'}
Source: ${(rawItem?.snippet || story.snippet || '').slice(0, 600)}${shockHint}

Return JSON only: hook_1, hook_2, hook_3, what_happened (2 lines with \\\\n), why_it_matters, what_happens_next, cta_line "", captions, duration_target_seconds 14.`;
    } else {
      systemPrompt = `You are a script writer for Orbix Network, a video news network tracking sudden power shifts. Write scripts that are:

- Calm and observational (not sensational)
- Authoritative and factual
- Structured for short-form video (30-45 seconds)
- NO speculation language ("might", "could", "probably")
- NO political rage framing
- NO graphic violence or tragedy

${HOOK_STYLE_GUIDE}

Script Structure:
1. Hook: One clear statement (NOT a question) that grabs attention; 1–2 lines, ≤${HOOK_MAX_WORDS_PER_LINE} words per line.
2. What happened: Brief factual summary
3. Why it matters: The impact and significance
4. What happens next: Forward-looking perspective
5. CTA: Soft utility call-to-action (never "please subscribe")

Tone: Calm, authoritative, observational.`;

      const categoryNames = {
        'ai-automation': 'AI & Automation',
        'corporate-collapses': 'Corporate Collapses',
        'tech-decisions': 'Tech Decisions',
        'laws-rules': 'Laws & Rules',
        'money-markets': 'Money & Markets'
      };

      userPrompt = `Category: ${categoryNames[story.category] || story.category}
Title: ${rawItem?.title}
Snippet: ${rawItem?.snippet || 'No snippet available'}
Shock Score: ${story.shock_score}/100

Generate a script for a short-form video. Return JSON with:
{
  "hook": "<1–2 lines, ≤${HOOK_MAX_WORDS_PER_LINE} words per line; one clear statement, not a question>",
  "what_happened": "<brief factual summary>",
  "why_it_matters": "<the impact and significance>",
  "what_happens_next": "<forward-looking perspective>",
  "cta_line": "<soft utility CTA, never 'please subscribe'>",
  "duration_target_seconds": <estimate: 30-45>
}`;
    }

    const topic = story.category || 'other';
    const isHighRetention = isPsychology || isMoney;
    const shockScore = story.shock_score ?? 0;
    const moneyNeedsAggressiveHook = isMoney && shockScore < MONEY_SHOCK_SCORE_MIN;
    let scriptData;
    let retried = false;
    let retriedForShock = false;
    let lastRejectReason = '';
    const maxRetries = isPsychology ? 2 : isMoney ? 3 : 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      console.log(`[Script Generator] Step 2: Calling OpenAI API...${attempt > 0 ? ` (retry: ${lastRejectReason || 'validation'})` : ''}`);
      const openaiStartTime = Date.now();
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      if (retried && isHighRetention) {
        const retryContent = isPsychology
          ? `[REJECTED] ${lastRejectReason}. Fix and return the same JSON format. RULES: what_happens_next = opening question (≤ 8 words, ends with ?). what_happened = EXACTLY 2 lines separated by \\n — Line 1: "It's called [concept name]." — Line 2: "Like when [relatable scenario]." why_it_matters = 1 payoff line (≤ 12 words). Total spoken words (what_happened + why_it_matters) must be 18–32. captions 5–6 short strings.`
          : `[REJECTED] ${lastRejectReason}. Generate again. Hook <= ${SHORTS_NATIVE_HOOK_MAX_WORDS} words. TWIST = exactly 2 lines. PAYOFF <= ${SHORTS_NATIVE_PAYOFF_MAX_WORDS} words. LOOP = complete sentence with punch (e.g. "And that's why you still lose." — NOT "And that's why you still…"). No abstract words. Total ${SHORTS_NATIVE_TOTAL_WORDS_MIN}–${SHORTS_NATIVE_TOTAL_WORDS_MAX} words. captions array 5–7 lines. Same JSON.`;
        messages.push({ role: 'user', content: retryContent });
      }
      const completion = await getOpenAIClient().chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      });
      const openaiDuration = Date.now() - openaiStartTime;
      console.log(`[Script Generator] ✓ OpenAI API call completed in ${openaiDuration}ms`);
      console.log(`[Script Generator] Response tokens: ${completion.usage?.total_tokens || 'unknown'}`);

      console.log(`[Script Generator] Step 3: Parsing JSON response...`);
      scriptData = JSON.parse(completion.choices[0].message.content);
      console.log(`[Script Generator] ✓ JSON parsed successfully`);
      console.log(`[Script Generator] Script data keys:`, Object.keys(scriptData || {}));
      if (scriptData.what_happened && typeof scriptData.what_happened === 'string') {
        scriptData.what_happened = scriptData.what_happened.replace(/\\n/g, '\n').trim();
      }

      // High-retention: prefer hook_1, hook_2, hook_3; pick first compliant or first rewritten
      if (isHighRetention) {
        const candidates = [
          scriptData.hook_1,
          scriptData.hook_2,
          scriptData.hook_3,
          scriptData.hook
        ].filter(Boolean).map(h => (h || '').trim());
        let chosen = '';
        for (const raw of candidates) {
          const rewritten = rewriteHookForShorts(raw, topic);
          if (isHookCompliant(rewritten, topic).compliant) {
            chosen = rewritten;
            break;
          }
          if (!chosen) chosen = rewritten;
        }
        scriptData.hook = chosen || rewriteHookForShorts(candidates[0] || scriptData.hook || '', topic);
      } else {
        const rawHook = (scriptData.hook || '').trim();
        scriptData.hook = rewriteHookForShorts(rawHook, topic);
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Script Generator] Hook after:`, scriptData.hook);
      }

      if (!isHighRetention) break;
      const hookValidation = isHookCompliant(scriptData.hook, topic);
      const doShockRetry = moneyNeedsAggressiveHook && !retriedForShock;
      const scriptValidation = isShortsNativeScriptCompliant(scriptData, topic);
      if (hookValidation.compliant && scriptValidation.compliant && !doShockRetry) break;
      if (!hookValidation.compliant) {
        lastRejectReason = hookValidation.reason || 'hook invalid';
        console.log(`[Script Generator] Hook rejected (${lastRejectReason}), will retry...`);
      } else if (!scriptValidation.compliant) {
        lastRejectReason = scriptValidation.reason || 'script validation failed';
        console.log(`[Script Generator] Script rejected (${lastRejectReason}), will retry...`);
      } else if (doShockRetry) {
        lastRejectReason = `Shock score below ${MONEY_SHOCK_SCORE_MIN}. Generate a more aggressive hook: imply weakness, insecurity, or self-deception; make the viewer uncomfortable; write as an accusation not a neutral statement.`;
        console.log(`[Script Generator] Money hook shock boost (score=${shockScore}), will retry...`);
        retriedForShock = true;
      }
      retried = true;
    }

    // Validate and clean script data (Money/Psychology: normalize What Happened to natural flow, no slashes)
    const rawWhatHappened = (scriptData.what_happened || '').trim();
    const durationTarget = scriptData.duration_target_seconds != null ? Number(scriptData.duration_target_seconds) : (isHighRetention ? 14 : 35);
    let whatHappensNext = (scriptData.what_happens_next || '').trim();
    if (isPsychology && whatHappensNext) {
      if (!isQuestion(whatHappensNext)) {
        console.log('[Script Generator] Psychology: converting opening hook to question:', whatHappensNext.slice(0, 50));
        whatHappensNext = await convertStatementToQuestion(whatHappensNext);
        console.log('[Script Generator] Psychology: question hook:', whatHappensNext);
      }
      if (!whatHappensNext.endsWith('?')) {
        whatHappensNext = whatHappensNext.replace(/[.!]$/, '') + '?';
      }
    }
    const script = {
      hook: (scriptData.hook || '').trim(),
      what_happened: isHighRetention ? normalizeWhatHappened(rawWhatHappened, true) || rawWhatHappened : normalizeWhatHappened(rawWhatHappened) || rawWhatHappened,
      why_it_matters: (scriptData.why_it_matters || '').trim(),
      what_happens_next: whatHappensNext,
      cta_line: (scriptData.cta_line || '').trim(),
      duration_target_seconds: isHighRetention ? Math.min(16, Math.max(12, durationTarget)) : Math.min(45, Math.max(30, durationTarget || 35))
    };
    if (Array.isArray(scriptData.captions) && scriptData.captions.length > 0) {
      script.content_json = { ...(typeof scriptData.content_json === 'object' && scriptData.content_json !== null ? scriptData.content_json : {}), captions: scriptData.captions };
    }

    // Validate all fields are present
    console.log(`[Script Generator] Step 4: Validating script data...`);
    if (!script.hook || !script.what_happened || !script.why_it_matters || !script.what_happens_next) {
      console.error(`[Script Generator] ERROR: Missing required fields:`, {
        hasHook: !!script.hook,
        hasWhatHappened: !!script.what_happened,
        hasWhyItMatters: !!script.why_it_matters,
        hasWhatHappensNext: !!script.what_happens_next
      });
      throw new Error('Generated script missing required fields');
    }
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Script Generator] ========== generateScript SUCCESS (${totalDuration}ms) ==========`);
    console.log(`[Script Generator] Script preview:`, {
      hook: script.hook?.substring(0, 50),
      what_happened_length: script.what_happened?.length,
      why_it_matters_length: script.why_it_matters?.length
    });
    
    return script;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Script Generator] ========== generateScript ERROR (${totalDuration}ms) ==========`);
    console.error('[Script Generator] Error generating script:', error);
    console.error('[Script Generator] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Create script record in database
 * @param {string} businessId - Business ID
 * @param {string} storyId - Story ID
 * @param {Object} scriptData - Script data from generateScript
 * @returns {Promise<Object>} Created script record
 */
export async function saveScript(businessId, storyId, scriptData) {
  const startTime = Date.now();
  console.log(`[Script Generator] ========== saveScript START ==========`);
  console.log(`[Script Generator] Business ID: ${businessId}, Story ID: ${storyId}`);
  console.log(`[Script Generator] Script data preview:`, {
    hook_length: scriptData?.hook?.length,
    what_happened_length: scriptData?.what_happened?.length,
    why_it_matters_length: scriptData?.why_it_matters?.length,
    what_happens_next_length: scriptData?.what_happens_next?.length,
    duration_target_seconds: scriptData?.duration_target_seconds
  });
  
  try {
    console.log(`[Script Generator] Inserting script into database...`);
    const insertStartTime = Date.now();
    const insertPayload = {
      business_id: businessId,
      story_id: storyId,
      hook: scriptData.hook,
      what_happened: scriptData.what_happened || '',
      why_it_matters: scriptData.why_it_matters || '',
      what_happens_next: scriptData.what_happens_next || '',
      cta_line: scriptData.cta_line || '',
      duration_target_seconds: scriptData.duration_target_seconds ?? 35
    };
    if (scriptData.content_json) insertPayload.content_json = scriptData.content_json;
    if (scriptData.content_type) insertPayload.content_type = scriptData.content_type;
    const { data: script, error } = await supabaseClient
      .from('orbix_scripts')
      .insert(insertPayload)
      .select()
      .single();
    
    const insertDuration = Date.now() - insertStartTime;
    
    if (error) {
      console.error(`[Script Generator] ERROR: Database insert failed after ${insertDuration}ms:`, error);
      console.error(`[Script Generator] Error code: ${error.code}, message: ${error.message}`);
      console.error(`[Script Generator] Error details:`, error.details);
      throw error;
    }
    
    console.log(`[Script Generator] ✓ Script inserted into database in ${insertDuration}ms`);
    console.log(`[Script Generator] Created script ID: ${script.id}`);
    console.log(`[Script Generator] Script record:`, {
      id: script.id,
      story_id: script.story_id,
      business_id: script.business_id,
      created_at: script.created_at
    });
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Script Generator] ========== saveScript SUCCESS (${totalDuration}ms) ==========`);
    
    return script;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Script Generator] ========== saveScript ERROR (${totalDuration}ms) ==========`);
    console.error('[Script Generator] Error saving script:', error);
    console.error('[Script Generator] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Generate script and save it for a story
 * @param {string} businessId - Business ID
 * @param {Object} story - Story object
 * @returns {Promise<Object>} Created script record
 */
export async function generateAndSaveScript(businessId, story) {
  const startTime = Date.now();
  console.log(`[Script Generator] ========== generateAndSaveScript START ==========`);
  console.log(`[Script Generator] Story ID: ${story.id}, Business ID: ${businessId}`);
  
  try {
    // Get raw item data
    console.log(`[Script Generator] Step 1: Fetching raw item (raw_item_id: ${story.raw_item_id})...`);
    const { data: rawItem, error: rawError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('id', story.raw_item_id)
      .single();
    
    if (rawError) {
      console.error(`[Script Generator] ERROR: Raw item fetch failed:`, rawError);
      throw new Error(`Raw item not found: ${rawError.message}`);
    }
    
    if (!rawItem) {
      console.error(`[Script Generator] ERROR: Raw item not found (no data returned)`);
      throw new Error('Raw item not found (no data)');
    }
    
    console.log(`[Script Generator] ✓ Raw item found:`, {
      id: rawItem.id,
      title: rawItem.title?.substring(0, 50),
      status: rawItem.status
    });
    
    // Generate script
    console.log(`[Script Generator] Step 2: Calling generateScript function...`);
    const generateStartTime = Date.now();
    const scriptData = await generateScript(story, rawItem);
    const generateDuration = Date.now() - generateStartTime;
    console.log(`[Script Generator] ✓ Script data generated in ${generateDuration}ms`);
    console.log(`[Script Generator] Script data keys:`, Object.keys(scriptData || {}));
    
    // Save script
    console.log(`[Script Generator] Step 3: Saving script to database...`);
    const saveStartTime = Date.now();
    const script = await saveScript(businessId, story.id, scriptData);
    const saveDuration = Date.now() - saveStartTime;
    console.log(`[Script Generator] ✓ Script saved to database in ${saveDuration}ms`);
    console.log(`[Script Generator] Script ID: ${script?.id}`);
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Script Generator] ========== generateAndSaveScript SUCCESS (${totalDuration}ms) ==========`);
    
    return script;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Script Generator] ========== generateAndSaveScript ERROR (${totalDuration}ms) ==========`);
    console.error(`[Script Generator] Error:`, error);
    console.error(`[Script Generator] Error stack:`, error.stack);
    throw error;
  }
}

