/**
 * YouTube Shorts metadata generation for Orbix Network.
 * Psychology and evergreen categories use dedicated title/description/hashtag rules.
 */
import { getDadJokeCta } from './dad-joke-cta.js';

// Inlined so youtube-metadata loads even if trick-question-cta.js is missing on deploy (avoids breaking other channels).
const TRICK_QUESTION_CTA_OPTIONS = [
  'Did you fall for it? Comment below',
  'How many got this wrong? 1–10',
  'Did you guess before the reveal?',
  'Trick questions every week — follow for more',
];
function getTrickQuestionCta(index) {
  const i = Number(index);
  const idx = (isNaN(i) || i < 0 ? 0 : Math.floor(i)) % TRICK_QUESTION_CTA_OPTIONS.length;
  return TRICK_QUESTION_CTA_OPTIONS[idx];
}

const PSYCHOLOGY_HASHTAGS = [
  '#psychology',
  '#mindset',
  '#humanbehavior',
  '#cognitivebias',
  '#selfawareness',
  '#howthebrainworks'
];

const TRIVIA_HASHTAGS = [
  '#trivia',
  '#quiz',
  '#shorts',
  '#triviachallenge',
  '#testyourknowledge',
  '#quiztime'
];

const FACTS_HASHTAGS = [
  '#facts',
  '#didyouknow',
  '#shorts',
  '#knowledge',
  '#learnontiktok',
  '#fact'
];

const RIDDLE_HASHTAGS = [
  '#riddles',
  '#riddletime',
  '#shorts',
  '#brainteaser',
  '#canyousolvethis',
  '#riddleoftheday'
];

const MINDTEASER_HASHTAGS = [
  '#brainteaser',
  '#mindteaser',
  '#puzzle',
  '#iqtest',
  '#shorts',
  '#orbix'
];

const DAD_JOKE_HASHTAGS = [
  '#dadjokes',
  '#shorts',
  '#funny',
  '#cleanhumor',
  '#dadjoke',
  '#comedy'
];

const TRICK_QUESTION_HASHTAGS = [
  '#trickquestion',
  '#brainteaser',
  '#shorts',
  '#riddle',
  '#thinkaboutit',
  '#puzzle'
];

const CATEGORY_HASHTAGS = {
  'ai-automation': ['#AI', '#Automation', '#TechNews', '#ArtificialIntelligence'],
  'corporate-collapses': ['#Business', '#Corporate', '#Finance', '#News'],
  'tech-decisions': ['#Tech', '#Technology', '#Innovation', '#TechNews'],
  'laws-rules': ['#Law', '#Policy', '#Regulation', '#News'],
  'money-markets': ['#Finance', '#Markets', '#Economy', '#Money'],
  'trivia': TRIVIA_HASHTAGS,
  'facts': FACTS_HASHTAGS,
  'riddle': RIDDLE_HASHTAGS,
  'mindteaser': MINDTEASER_HASHTAGS,
  'dadjoke': DAD_JOKE_HASHTAGS,
  'trickquestion': TRICK_QUESTION_HASHTAGS
};

/** Remove emojis and common Unicode symbols from a string. */
function stripEmojis(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Sanitize title: no emojis, no "Did you know" or clickbait prefix. */
function sanitizeTitleForYouTube(title) {
  if (!title || typeof title !== 'string') return '';
  let t = stripEmojis(title);
  const lower = t.toLowerCase();
  const clickbaitPrefixes = ['did you know', 'did you know that', 'you won\'t believe', 'this will shock you'];
  for (const prefix of clickbaitPrefixes) {
    if (lower.startsWith(prefix)) {
      t = t.slice(prefix.length).replace(/^[.:\s]+/, '').trim();
      break;
    }
  }
  return t || title;
}

/** Get first sentence (up to first . ! ?) or first ~120 chars. */
function getFirstSentence(text, maxChars = 120) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]?/);
  const first = match ? match[0].trim() : trimmed.slice(0, maxChars);
  if (first.length < trimmed.length && first.length < maxChars) return first;
  return first.length > maxChars ? first.slice(0, maxChars).replace(/\s+\S*$/, '') + '.' : first;
}

/** Build 2–4 short sentences for psychology description; end with soft question if it fits. */
function buildPsychologyDescription(script) {
  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const whatHappened = (script?.what_happened || content?.what_happened || '').trim();
  const whyItMatters = (script?.why_it_matters || content?.why_it_matters || '').trim();
  const whatNext = (script?.what_happens_next || content?.what_happens_next || '').trim();

  const parts = [];
  if (whatHappened) parts.push(getFirstSentence(whatHappened));
  if (whyItMatters) parts.push(getFirstSentence(whyItMatters));

  const question = whatNext.trim();
  if (question && question.endsWith('?') && question.length < 80) {
    parts.push(question);
  } else if (parts.length > 0) {
    parts.push('What do you think?');
  }

  const joined = parts.filter(Boolean).join('\n\n');
  return joined.length > 300 ? joined.slice(0, 297).replace(/\s+\S*$/, '') + '…' : joined || (whatHappened ? getFirstSentence(whatHappened, 200) : '');
}

/** Pick 3–6 psychology hashtags, rotated by seed (e.g. renderId) so we don't always use the same set. */
function getPsychologyHashtags(seed, count = 5) {
  const id = typeof seed === 'string' ? seed : String(seed || 0);
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  const start = Math.abs(hash) % PSYCHOLOGY_HASHTAGS.length;
  const take = Math.min(Math.max(3, count), 6, PSYCHOLOGY_HASHTAGS.length);
  const out = [];
  for (let i = 0; i < take; i++) {
    out.push(PSYCHOLOGY_HASHTAGS[(start + i) % PSYCHOLOGY_HASHTAGS.length]);
  }
  return out.join(' ');
}

/**
 * Build YouTube metadata (title, description, hashtags) for a story/script.
 * Psychology category uses short hook title, 2–4 sentence description, and category hashtags.
 * @param {Object} story - orbix_stories row (category, title)
 * @param {Object} script - orbix_scripts row (hook, what_happened, why_it_matters, what_happens_next, content_json)
 * @param {string} [renderId] - Optional render id for hashtag rotation
 * @returns {{ title: string, description: string, hashtags: string }}
 */
export function buildYouTubeMetadata(story, script, renderId = '') {
  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const hookText = (script?.hook ?? content?.hook ?? '').trim();
  const question = (content?.question || '').trim();
  const isPsychology = (story?.category || '').toLowerCase() === 'psychology';
  const isTrivia = (story?.category || '').toLowerCase() === 'trivia';
  const isFacts = (story?.category || '').toLowerCase() === 'facts';
  const isRiddle = (story?.category || '').toLowerCase() === 'riddle';
  const isMindTeaser = (story?.category || '').toLowerCase() === 'mindteaser';
  const isDadJoke = (story?.category || '').toLowerCase() === 'dadjoke';
  const isTrickQuestion = (story?.category || '').toLowerCase() === 'trickquestion';

  let title;
  let description;
  let hashtags;

  if (isDadJoke) {
    title = sanitizeTitleForYouTube(story?.title || 'Dad Joke');
    const episodeIndex = content?.episode_number ?? 0;
    const cta = getDadJokeCta(episodeIndex);
    description = 'Clean humor. Family friendly. ' + cta;
    hashtags = DAD_JOKE_HASHTAGS.slice(0, 6).join(' ');
  } else if (isTrickQuestion) {
    title = sanitizeTitleForYouTube(story?.title || 'Trick Question');
    const episodeIndex = content?.episode_number ?? 0;
    const cta = getTrickQuestionCta(episodeIndex);
    description = 'Trick questions and surprising answers. ' + cta;
    hashtags = TRICK_QUESTION_HASHTAGS.slice(0, 6).join(' ');
  } else if (isMindTeaser) {
    const questionText = (content?.question || '').trim();
    const answerText = (content?.answer || '').trim();
    title = sanitizeTitleForYouTube(hookText || questionText?.slice(0, 60) || story?.title?.slice(0, 60) || 'Can you get it?');
    description = (questionText ? `${questionText}\n\n` : '') + (answerText ? `Answer: ${answerText}\n\n` : '') + 'Comment your answer below!';
    hashtags = MINDTEASER_HASHTAGS.slice(0, 6).join(' ');
  } else if (isRiddle) {
    const riddleText = (content?.riddle_text || script?.what_happened || '').trim();
    const answerText = (content?.answer_text || '').trim();
    title = sanitizeTitleForYouTube(hookText || riddleText?.slice(0, 60) || story?.title?.slice(0, 60) || 'Can you solve this riddle?');
    description = (riddleText ? `${riddleText}\n\n` : '') + (answerText ? `Answer: ${answerText}\n\n` : '') + 'Comment your answer below!';
    hashtags = RIDDLE_HASHTAGS.slice(0, 6).join(' ');
  } else if (isFacts) {
    const factText = (content?.fact_text || script?.what_happened || '').trim();
    title = sanitizeTitleForYouTube(hookText || content?.title || factText?.slice(0, 60) || story?.title?.slice(0, 60) || 'Fact');
    description = (factText ? `${factText}\n\n` : '') + 'Subscribe for more facts.';
    hashtags = FACTS_HASHTAGS.slice(0, 6).join(' ');
  } else if (isTrivia) {
    const questionForTitle = question || (script?.what_happened || '').trim();
    const questionForDesc = question || (script?.what_happened || '').trim();
    title = sanitizeTitleForYouTube(hookText || questionForTitle?.slice(0, 60) || story?.title?.slice(0, 60) || 'Trivia challenge');
    description = (questionForDesc ? `${questionForDesc}\n\n` : '') + 'Comment A, B, or C. What did you choose?';
    hashtags = TRIVIA_HASHTAGS.slice(0, 6).join(' ');
  } else if (isPsychology) {
    title = sanitizeTitleForYouTube(hookText || story?.title || 'Psychology insight');
    description = buildPsychologyDescription(script);
    hashtags = getPsychologyHashtags(renderId || story?.id || script?.id);
  } else {
    title = hookText || story?.title || 'Orbix Short';
    const descriptionParts = [];
    if (script?.what_happened) descriptionParts.push(script.what_happened);
    if (script?.why_it_matters) descriptionParts.push(script.why_it_matters);
    if (script?.what_happens_next) descriptionParts.push(script.what_happens_next);
    description = descriptionParts.join('\n\n');
    const set = CATEGORY_HASHTAGS[story?.category] || ['#News', '#Breaking'];
    hashtags = set.join(' ');
  }

  return { title, description, hashtags };
}
