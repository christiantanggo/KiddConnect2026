/**
 * Dad Joke Studio — OpenAI helpers (same stack as Kid Quiz).
 */
import OpenAI from 'openai';

export const STYLE_OPTIONS = {
  base: [
    'Storytelling', 'Rant Style', 'Observational', 'Topical', 'Punchy', 'Conversational',
    'Slow Burn', 'Exaggerated',
  ],
  tone: [
    'Calm', 'Sarcastic', 'Silly', 'Mock Serious', 'Deadpan', 'Friendly Dad Energy',
    'Frustrated', 'Slightly Grumpy',
  ],
  rhythm: [
    'Dense Jokes', 'Medium Joke Density', 'Sparse Jokes', 'Long Setup / Short Payoff',
    'Rapid Fire', 'Callback Heavy', 'Repetition for Emphasis', 'Rule of Three',
  ],
  topic: [
    'Family Chaos', 'Backyard / Home Disaster', 'Parenting Moments', 'Neighbor Weirdness',
    'Technology Frustration', 'Daily Life Annoyances', 'Social Observations',
    'News / Current Events Absurdity',
  ],
  structure: [
    'Strong Opening One-Liner', 'Mid-Script Callback', 'Escalating Chaos', 'Fake Seriousness',
    'Final Real Joke Reveal', 'Audience Question Ending', 'Tangent Friendly', 'Big End Callback',
  ],
};

const CONFLICT_HINTS = [
  { a: 'Calm', b: 'Rapid Fire', msg: 'Calm + Rapid Fire is an odd combo — consider Softening rhythm or shifting tone.' },
  { a: 'Sparse Jokes', b: 'Dense Jokes', msg: 'Sparse and Dense jokes conflict — pick one density level.' },
  { a: 'Slow Burn', b: 'Rapid Fire', msg: 'Slow Burn vs Rapid Fire clash — try Medium Joke Density instead.' },
];

function flattenRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return [];
  const out = [];
  for (const k of Object.keys(STYLE_OPTIONS)) {
    const arr = recipe[k];
    if (Array.isArray(arr)) out.push(...arr.map(String));
  }
  return out;
}

export function countActiveTraits(recipe) {
  return flattenRecipe(recipe).length;
}

export function analyzeStyleRecipe(recipe) {
  const warnings = [];
  const suggestions = [];
  const flat = new Set(flattenRecipe(recipe));
  for (const { a, b, msg } of CONFLICT_HINTS) {
    if (flat.has(a) && flat.has(b)) {
      warnings.push({ type: 'conflict', message: msg, traits: [a, b] });
    }
  }
  const n = countActiveTraits(recipe);
  if (n > 0 && n < 4) suggestions.push('Consider adding 1–2 more traits for a richer voice (target ~4–8).');
  if (n > 8) suggestions.push('Many traits selected — output may feel busy; consider trimming to ~4–8.');

  return { warnings, suggestions, traitCount: n };
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {'safe'|'creative'|'wild'} mode
 * @param {object} lockedRecipe - partial recipe; locked traits preserved
 * @param {number} [seed]
 */
export function smartRandomRecipe(mode, lockedRecipe = {}, seed = Date.now()) {
  const rng = mulberry32(seed % 2147483647);
  const recipe = { base: [], tone: [], rhythm: [], topic: [], structure: [] };
  const locked = { ...lockedRecipe };
  for (const k of Object.keys(STYLE_OPTIONS)) {
    if (Array.isArray(locked[k])) recipe[k] = [...locked[k]];
  }

  const targetMin = mode === 'safe' ? 4 : mode === 'creative' ? 5 : 4;
  const targetMax = mode === 'safe' ? 6 : mode === 'creative' ? 8 : 8;

  let total = countActiveTraits(recipe);
  const targetTotal = targetMin + Math.floor(rng() * (targetMax - targetMin + 1));

  while (total < targetTotal) {
    const cat = pickRandom(Object.keys(STYLE_OPTIONS), rng);
    const opts = STYLE_OPTIONS[cat];
    const choice = pickRandom(opts, rng);
    if (!recipe[cat].includes(choice)) {
      recipe[cat].push(choice);
      total++;
    }
    if (total > 20) break;
  }

  if (mode === 'wild' && rng() > 0.4) {
    const cat = pickRandom(Object.keys(STYLE_OPTIONS), rng);
    const choice = pickRandom(STYLE_OPTIONS[cat], rng);
    if (!recipe[cat].includes(choice)) recipe[cat].push(choice);
  }

  return recipe;
}

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateIdeasList(prompt, count = 8) {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You help create dad-joke YouTube video ideas. Return JSON only: {"ideas":[{"title":"","hook":"","format_hint":""}]}',
      },
      {
        role: 'user',
        content: `Generate ${count} distinct dad-joke video ideas from this prompt:\n${prompt}\nMake them varied, not repetitive.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  });
  const text = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ideas: [] };
  }
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  return { ideas };
}

/**
 * @param {object} params
 */
export async function generateShortsScript(params) {
  const {
    formatKey,
    aiMode,
    aiPrompt,
    extra = {},
  } = params;
  const openai = getClient();
  const formatHints = {
    shorts_classic_loop:
      'Orbix-optimized vertical Short: setup on screen 0–4s with voice; 3-2-1 countdown 4–7s; punchline voice at 7s; loop CTA. Return structured fields for the renderer.',
    shorts_vs: 'Two dad jokes labeled A and B; ask which wins; encourage comments.',
    shorts_guess_punchline: 'Setup first, pause beat, then punchline reveal.',
    shorts_micro_story: '3–4 ultra-short lines of story, last line is the dad joke punchline.',
  };
  const hint = formatHints[formatKey] || formatHints.shorts_classic_loop;

  const userParts = [
    `Format: ${formatKey}. ${hint}`,
    `Mode: ${aiMode || 'manual'}.`,
    aiPrompt ? `User direction: ${aiPrompt}` : '',
    extra.topic ? `Topic: ${extra.topic}` : '',
    extra.joke_a ? `Joke A: ${extra.joke_a}` : '',
    extra.joke_b ? `Joke B: ${extra.joke_b}` : '',
  ].filter(Boolean);

  const systemClassic =
    'You write ONE dad joke for a vertical Short that renders like Orbix: setup (spoken 0–4s), 3-2-1 countdown on screen (no extra VO during countdown), punchline at 7s, then a short loop/CTA line. ' +
    'Return JSON only: {"setup":"what viewer hears first (setup only, no punchline)","punchline":"the punchline only","voice_script":"optional; if omitted setup is spoken for the first segment","hook":"optional loop line e.g. rate 1-10; if omitted a default CTA is used","script_text":"setup then punchline as readable one piece","storyboard":[{"label":"setup","text":""},{"label":"countdown","text":"3-2-1"},{"label":"punchline","text":""}],"summary":"","content_json":{"setup":"","punchline":"","voice_script":"","hook":"","episode_number":0}}. ' +
    'setup and punchline must be non-empty. Keep setup speakable in ~4 seconds; punchline short. No emoji.';

  const systemGeneric =
    'You write short vertical YouTube dad-joke scripts. Return JSON: {"script_text":"","storyboard":[{"label":"","text":""}],"summary":""}. script_text is full narration; storyboard is on-screen beats.';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: formatKey === 'shorts_classic_loop' ? systemClassic : systemGeneric,
      },
      { role: 'user', content: userParts.join('\n') },
    ],
    response_format: { type: 'json_object' },
    temperature: aiMode === 'auto' ? 1 : 0.85,
  });
  const text = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(text);
    if (formatKey === 'shorts_classic_loop' && parsed.setup && parsed.punchline) {
      const base = parsed.content_json && typeof parsed.content_json === 'object' ? parsed.content_json : {};
      parsed.content_json = {
        ...base,
        setup: parsed.setup,
        punchline: parsed.punchline,
        voice_script: parsed.voice_script || parsed.setup,
        hook: parsed.hook ?? base.hook ?? '',
        episode_number: typeof parsed.episode_number === 'number' ? parsed.episode_number : (base.episode_number ?? 0),
      };
    }
    return parsed;
  } catch {
    return { script_text: '', storyboard: [], summary: '' };
  }
}

export async function generateLongFormScript(params) {
  const {
    aiMode,
    aiPrompt,
    title,
    topic,
    scenario,
    endingJoke,
    cta,
    styleRecipe,
  } = params;
  const openai = getClient();
  const { warnings } = analyzeStyleRecipe(styleRecipe || {});
  const warnText = warnings.length ? `Style warnings (allowed): ${warnings.map((w) => w.message).join('; ')}` : '';

  const userParts = [
    `Mode: ${aiMode || 'manual'}.`,
    aiPrompt ? `Creative direction: ${aiPrompt}` : '',
    title ? `Working title: ${title}` : '',
    topic ? `Topic: ${topic}` : '',
    scenario ? `Scenario: ${scenario}` : '',
    endingJoke ? `Ending joke to weave in: ${endingJoke}` : '',
    cta ? `Optional CTA: ${cta}` : '',
    styleRecipe ? `Style traits (JSON): ${JSON.stringify(styleRecipe)}` : '',
    warnText,
    'Write a single continuous monologue-style script (roughly 3–8 minutes spoken), family-friendly dad humor, no slurs, no impersonations.',
  ].filter(Boolean);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Return JSON only: {"script_text":"","storyboard":[{"label":"Act","text":"short beat"}],"summary":"","suggested_title":""}',
      },
      { role: 'user', content: userParts.join('\n') },
    ],
    response_format: { type: 'json_object' },
    temperature: aiMode === 'auto' ? 1 : 0.85,
  });
  const text = completion.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { script_text: '', storyboard: [], summary: '', suggested_title: '' };
  }
}

/**
 * YouTube title, description, and tags from studio content (publish step).
 * @param {object} ctx
 */
export async function generateYouTubeMetadata(ctx) {
  const {
    title = '',
    content_type = '',
    format_key = '',
    script_excerpt = '',
    script_text = '',
    summary = '',
    setup = '',
    punchline = '',
    ai_prompt = '',
  } = ctx || {};

  const scriptBody = String(script_text || '').trim().slice(0, 8000);
  const summaryLine = String(summary || '').trim().slice(0, 500);

  const openai = getClient();
  const userBlock = [
    `Working title (you may improve): ${title || '(none)'}`,
    `Video type: ${content_type || 'unknown'}; format: ${format_key || 'unknown'}`,
    summaryLine ? `Summary: ${summaryLine}` : '',
    setup ? `Setup: ${setup}` : '',
    punchline ? `Punchline: ${punchline}` : '',
    script_excerpt ? `Storyboard / script beats:\n${script_excerpt}` : '',
    scriptBody ? `Full script (what will be voiced / shown):\n${scriptBody}` : '',
    ai_prompt ? `Creator notes: ${ai_prompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You write YouTube metadata for family-friendly dad-humor Shorts and long-form videos. ' +
          'Return JSON only: {"title":"","description":"","tags":[]}. ' +
          'title: catchy, max ~95 characters, honest (no false clickbait), no emoji unless one subtle one is clearly fitting. ' +
          'description: 2–6 short lines; optional light CTA to subscribe or comment; you may end with 2–4 hashtags as words with #. ' +
          'tags: array of 8–12 strings for YouTube search — lowercase phrases, no # in the array values. ' +
          'Keep content general-audience safe.',
      },
      {
        role: 'user',
        content: userBlock || 'Generate generic dad-joke comedy metadata.',
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.75,
  });
  const text = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(text);
    const outTitle = String(parsed.title || title || 'Dad joke video').trim().slice(0, 100);
    const outDesc = String(parsed.description || '').trim();
    let tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean) : [];
    tags = [...new Set(tags.map((t) => t.replace(/^#/, '')))].slice(0, 15);
    return { title: outTitle, description: outDesc, tags };
  } catch {
    return {
      title: (title || 'Dad joke video').slice(0, 100),
      description: '',
      tags: ['dad jokes', 'comedy', 'shorts', 'funny'],
    };
  }
}

export async function generatePlaceholderLongForm(formatKey, aiPrompt) {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Return JSON: {"script_text":"","storyboard":[],"summary":""} for a starter dad-joke ${formatKey} script.`,
      },
      { role: 'user', content: aiPrompt || 'Generate a short starter monologue; mark sections for future expansion.' },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });
  const text = completion.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { script_text: '', storyboard: [], summary: '' };
  }
}
