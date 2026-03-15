/**
 * Orbix Dad Jokes long-form only: list jokes from shorts, generate story-then-punchline script, create long-form video records.
 * Does not modify puzzle long-form or any other channel.
 */

import OpenAI from 'openai';
import { readFile, unlink, writeFile, mkdir } from 'fs';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseClient } from '../../config/database.js';
import {
  getLongformDadJokeScenePromptsFromChat,
  buildLongformDadJokeScenePrompts,
  generateLongformDadJokeBackgroundImageWithPrompt,
  LONGFORM_SCENE_KEYS,
} from './longform-dadjoke-image-prompts.js';

const readFileAsync = promisify(readFile);
const unlinkAsync = promisify(unlink);
const writeFileAsync = promisify(writeFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKGROUNDS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

/** Opening joke pool — cold open only. Rotated so we don't repeat back-to-back. */
const OPENING_JOKE_POOL = [
  'I just burned 2,000 calories. That\'s the last time I leave brownies in the oven.',
  'I used to be addicted to soap, but I\'m clean now.',
  'I ordered a chicken and an egg online. I\'ll let you know.',
  'I stayed up all night wondering where the sun went, then it dawned on me.',
  'I told my wife she was drawing her eyebrows too high. She looked surprised.',
  'I only know 25 letters of the alphabet. I don\'t know y.',
  'I used to hate facial hair, but then it grew on me.',
  'I\'m reading a book on the history of glue. I just can\'t seem to put it down.',
  'I\'m friends with all electricians. We have good current connections.',
  'I just read a book about anti-gravity. I couldn\'t put it down.',
  'Why don\'t scientists trust atoms? Because they make up everything.',
  'I would avoid the sushi if I were you. It\'s a little fishy.',
  'I used to work in a shoe recycling shop. It was sole destroying.',
  'I have a few jokes about unemployed people, but none of them work.',
  'I told my computer I needed a break. Now it won\'t stop sending me Kit Kats.',
  'I\'m on a seafood diet. I see food and I eat it.',
  'I asked the librarian if they had any books on paranoia. She whispered, "They\'re right behind you."',
  'I used to be a baker, but I couldn\'t make enough dough.',
  'I have a joke about chemistry, but I don\'t think it will get a reaction.',
  'Why don\'t eggs tell jokes? They\'d crack each other up.',
  'I was going to tell a time-travel joke, but you didn\'t like it.',
];

/** Story element pool — pick 3–6 to build an escalating causal story. */
const STORY_ELEMENT_POOL = [
  'backyard BBQ', 'empty propane tank', 'missing charcoal', 'messy garage', 'neighbor Gary',
  'ladder borrowing', 'leaf blower', 'skateboard kid', 'toolbox ramp', 'dog running through mud',
  'sprinkler system', 'paint cans', 'patio furniture', 'water bucket', 'gutter cleaning',
  'grill lid crashing', 'lawn chair', 'remote under couch cushions', 'basketball game on TV',
  'broken hose', 'slipping in the yard', 'missing screwdriver', 'borrowed lawn mower',
  'kids\' toys in the driveway', 'bee swarm near the grill', 'cooler tipping over',
];

const DAD_ACTIVITIES = [
  'BBQ', 'mowing the lawn', 'washing the car', 'fishing', 'hardware store trip',
  'fixing something in the garage', 'watching sports', 'shopping for something simple that becomes overcomplicated',
  'chatting with a neighbor', 'trying to do a basic household task', 'lawn chair', 'grilling'
];

const STATE_FILE = path.join(__dirname, 'longform-dadjoke-state.json');

async function getLastUsedOpeningJoke() {
  try {
    const data = await readFileAsync(STATE_FILE, 'utf8');
    const obj = JSON.parse(data);
    return obj?.lastOpeningJokeText ?? null;
  } catch (_) {
    return null;
  }
}

async function setLastUsedOpeningJoke(text) {
  try {
    const dir = path.dirname(STATE_FILE);
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeFileAsync(STATE_FILE, JSON.stringify({ lastOpeningJokeText: text, updatedAt: new Date().toISOString() }, null, 0));
  } catch (e) {
    console.warn('[longform-dadjoke] Could not persist last opening joke:', e?.message);
  }
}

/** Pick an opening joke from the pool, avoiding the last used one. */
async function pickOpeningJoke() {
  const last = await getLastUsedOpeningJoke();
  const candidates = last
    ? OPENING_JOKE_POOL.filter((j) => j !== last)
    : OPENING_JOKE_POOL;
  const joke = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : OPENING_JOKE_POOL[0];
  await setLastUsedOpeningJoke(joke);
  return joke;
}

/** Pick 3–6 random story elements for this script. */
function pickStoryElements() {
  const count = 3 + Math.floor(Math.random() * 4);
  const shuffled = [...STORY_ELEMENT_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * List dad joke stories for this channel that can be used as the punchline for a long-form video.
 * Returns stories with setup + punchline from script or raw item.
 */
export async function listDadJokesForLongform(businessId, channelId, limit = 100) {
  const { data: stories, error } = await supabaseClient
    .from('orbix_stories')
    .select('id, raw_item_id, created_at')
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', 'dadjoke')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!stories?.length) return [];

  const storyIds = stories.map((s) => s.id);
  const rawItemIds = [...new Set(stories.map((s) => s.raw_item_id).filter(Boolean))];

  const { data: scripts } = await supabaseClient
    .from('orbix_scripts')
    .select('story_id, content_json')
    .in('story_id', storyIds)
    .eq('content_type', 'dadjoke');
  const scriptByStory = (scripts || []).reduce((acc, r) => {
    acc[r.story_id] = r.content_json;
    return acc;
  }, {});

  let rawSnippets = {};
  if (rawItemIds.length) {
    const { data: rawItems } = await supabaseClient
      .from('orbix_raw_items')
      .select('id, snippet')
      .in('id', rawItemIds);
    (rawItems || []).forEach((r) => {
      try {
        const sn = typeof r.snippet === 'string' ? JSON.parse(r.snippet) : r.snippet;
        if (sn && (sn.setup || sn.punchline)) rawSnippets[r.id] = sn;
      } catch (_) {}
    });
  }

  const jokes = [];
  for (const s of stories) {
    const content = scriptByStory[s.id] || rawSnippets[s.raw_item_id];
    const setup = (content?.setup || '').trim();
    const punchline = (content?.punchline || '').trim();
    if (!setup || !punchline) continue;
    jokes.push({
      story_id: s.id,
      raw_item_id: s.raw_item_id,
      setup,
      punchline,
      created_at: s.created_at,
    });
  }
  return jokes;
}

/**
 * Generate a long-form script (7–10 min) with cold open, running "one joke" premise, story with 12–18 layered jokes, [beat] timing, callbacks, final payoff.
 * Does not save to DB.
 */
export async function generateLongformDadJokeScript(businessId, channelId, options = {}) {
  try {
    return await _generateLongformDadJokeScript(businessId, channelId, options);
  } catch (err) {
    console.error('[longform-dadjoke] generateLongformDadJokeScript error:', err?.message || err);
    if (err?.stack) console.error('[longform-dadjoke] stack:', err.stack);
    throw err;
  }
}

async function _generateLongformDadJokeScript(businessId, channelId, options = {}) {
  const { story_id: storyId, dad_activity: dadActivityHint } = options;
  if (!storyId) {
    const err = new Error('story_id is required');
    err.status = 400;
    throw err;
  }

  let jokes;
  try {
    jokes = await listDadJokesForLongform(businessId, channelId, 500);
  } catch (dbErr) {
    console.error('[longform-dadjoke] listDadJokesForLongform error:', dbErr?.message);
    throw dbErr;
  }
  const finalJoke = jokes.find((j) => j.story_id === storyId);
  if (!finalJoke) {
    const err = new Error('Dad joke story not found or missing setup/punchline');
    err.status = 404;
    throw err;
  }

  const jokePool = jokes.filter((j) => j.story_id !== storyId).slice(0, 28);
  const dadActivity = dadActivityHint && DAD_ACTIVITIES.includes(dadActivityHint)
    ? dadActivityHint
    : DAD_ACTIVITIES[Math.floor(Math.random() * DAD_ACTIVITIES.length)];

  const jokePoolText = jokePool.length
    ? jokePool.map((j, i) => `${i + 1}. Setup: ${j.setup} | Punchline: ${j.punchline}`).join('\n')
    : '(Use your own dad jokes in the same style: short setup, quick punchline. Weave 2–5 subtly into the story as observations, not announced jokes.)';

  const openingJoke = await pickOpeningJoke();
  const storyElements = pickStoryElements();
  const storyElementsText = storyElements.join(', ');

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (clientErr) {
    console.error('[longform-dadjoke] getOpenAIClient error:', clientErr?.message);
    const err = new Error(process.env.OPENAI_API_KEY ? 'OpenAI client failed.' : 'OPENAI_API_KEY is not set. Add it to your environment.');
    err.status = 502;
    throw err;
  }

  const systemPrompt = `You are a writer for "Orbix – Dad Jokes" long-form comedy scripts for 6–8 minute YouTube videos. Target: 900–1200 words. Style: Craig Ferguson–esque monologue — one joke promised at the start, a funny escalating story, subtle dad humor woven in, then a callback and the real joke at the end.

VOICE: Conversational, dad-like, slightly sarcastic, clean, family friendly. Story-driven with natural spoken cadence. Like a stand-up monologue with one narrator speaking to camera. Use occasional [beat], [pause], [sigh] for pacing but do not overuse them.

DO NOT: Use section headers or labels in the narration (no "Act 1", "Cold open", etc.). Do not repeat "still not the joke yet" or "we're building to the joke" or "that wasn't the joke" more than once in the whole script — at most one light reminder in the middle. Do not make the script feel like a bulleted template or a list of random events. Do not announce "here's a joke" — embed wordplay naturally.

=== STRUCTURE (follow this order in the spoken script only; never label sections) ===

1. COLD OPEN: Start with this exact opening joke (provided in the user message). Then immediately say a variation of "Anyway… I've only got one joke for you tonight." or "Tonight I'm only telling one joke." Wording can vary slightly.

2. STORY: Tell a funny, escalating everyday chaos story. Use the story elements provided — combine 3–6 of them into one coherent causal narrative. One thing leads to the next. Start simple (inconvenience), then interruption, then problem, then chaos, then absurd chaos. It should feel like a comedian telling a real story.

3. EMBEDDED DAD JOKES: Weave 2–5 subtle puns or dad-joke-style observations into the narration. They should feel like side comments or clever observations, not the script stopping to announce a joke. Natural and sparing.

4. CALLBACK: Near the end, the narrator remembers the promise: e.g. "Oh right… the one joke I promised." Then deliver the final joke (exact words provided).

5. CTA: End with a short channel outro: "Subscribe for daily dad jokes." "Leave your worst dad joke in the comments." "How many jokes did I tell before the real one?" Keep it short.

QUALITY: 900–1200 words. Family friendly. Output valid JSON only. full_script must be narration only — no headers, no labels.`;

  const userPrompt = `Generate one long-form dad joke script: 6–8 minutes, 900–1200 words.

OPENING JOKE (use this exact line first, then add "Anyway… I've only got one joke for you tonight." or similar):
${openingJoke}

STORY ELEMENTS (use 3–6 of these; build a causal chain so one event leads to the next; pick a subset that fit together):
${storyElementsText}

FINAL JOKE (use these exact words only at the very end, after the story and a natural callback like "Oh right… the one joke I promised."):
Setup: ${finalJoke.setup}
Punchline: ${finalJoke.punchline}

Dad activity/setting: ${dadActivity}.

RULES:
- Do NOT say "still not the joke yet" or "we're building to the joke" more than once. At most one light reminder. Let the audience almost forget the promise until the callback.
- Weave 2–5 subtle dad jokes/wordplay into the story as observations. Do not overdo it.
- Story must escalate: simple → chaotic. Use the story elements to build cause-and-effect.
- No section headers in full_script. Write only the spoken monologue.

OPTIONAL joke pool for inspiration (you may weave a setup/punchline into the story as an observation; the final joke above is separate and must be last):
${jokePoolText}

Return JSON with:
- "title": string (e.g. "I Tried To Tell One Dad Joke…", "Only One Joke Tonight")
- "thumbnail_text_suggestions": array of 2–4 short strings
- "full_script": string — COMPLETE narration only, 900–1200 words. No section headers or labels. Spoken story only. Include the opening joke above, then "one joke tonight" line, then story, then callback + final joke, then CTA.
- "segment_markers": object with keys cold_open, story_introduction, act_1_setup, act_2_escalation, act_3_absurd_chaos, final_reset, final_joke, outro_cta (each value = text for that segment)
- "visual_suggestions": object same keys as segment_markers, short scene descriptions
- "final_joke": object with "setup", "punchline"
- "joke_metadata": array of { "setup", "punchline", "position_in_script", "is_final" }
- "estimated_duration_seconds": number (360–480)`;

  let raw;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 16384,
      response_format: { type: 'json_object' },
    });
    raw = completion.choices[0]?.message?.content;
    const finishReason = completion.choices[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('[longform-dadjoke] Script generator hit token limit; response may be truncated');
    }
  } catch (apiErr) {
    const msg = apiErr?.message || String(apiErr);
    console.error('[longform-dadjoke] OpenAI API error:', msg);
    const err = new Error(msg.includes('rate') ? 'OpenAI rate limit. Please try again in a minute.' : `Script generation failed: ${msg}`);
    err.status = 502;
    throw err;
  }

  if (!raw || typeof raw !== 'string') {
    const err = new Error('Empty response from script generator. Please try again.');
    err.status = 502;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    console.error('[longform-dadjoke] Invalid JSON from script generator:', raw?.slice(0, 200));
    const err = new Error('Script generator returned invalid data. Please try again.');
    err.status = 502;
    throw err;
  }

  const segmentKeys = ['cold_open', 'story_introduction', 'act_1_setup', 'act_2_escalation', 'act_3_absurd_chaos', 'final_reset', 'final_joke', 'outro_cta'];
  const fallbackScript = (parsed.segment_markers && typeof parsed.segment_markers === 'object')
    ? segmentKeys.map((k) => parsed.segment_markers[k]).filter(Boolean).join('\n\n')
    : '';

  const jokeMeta = Array.isArray(parsed.joke_metadata)
    ? parsed.joke_metadata.map((j) => ({
        setup: String(j.setup || '').trim().slice(0, 200),
        punchline: String(j.punchline || '').trim().slice(0, 150),
        position_in_script: String(j.position_in_script ?? '').trim().slice(0, 80),
        is_final: !!j.is_final,
      }))
    : [];

  return {
    title: (parsed.title || '').trim().slice(0, 120) || "I Tried To Tell One Dad Joke…",
    thumbnail_text_suggestions: Array.isArray(parsed.thumbnail_text_suggestions)
      ? parsed.thumbnail_text_suggestions.slice(0, 4).map((t) => String(t).trim().slice(0, 60))
      : [],
    full_script: (parsed.full_script || '').trim() || fallbackScript,
    segment_markers: parsed.segment_markers || {},
    visual_suggestions: parsed.visual_suggestions || {},
    final_joke: {
      setup: String(parsed.final_joke?.setup ?? finalJoke.setup ?? '').trim(),
      punchline: String(parsed.final_joke?.punchline ?? finalJoke.punchline ?? '').trim(),
      category: (String(parsed.final_joke?.category ?? '').trim()) || null,
    },
    joke_metadata: jokeMeta,
    estimated_duration_seconds: Math.min(480, Math.max(360, Number(parsed.estimated_duration_seconds) || 420)),
    dad_activity: dadActivity,
  };
}

/**
 * Create a dad joke long-form video record and store script metadata. Does not start render.
 */
export async function createLongformDadJokeVideo(businessId, channelId, payload) {
  const { story_id: storyId, title, subtitle, hook_text, description, script_json } = payload;
  if (!storyId) {
    const err = new Error('story_id is required');
    err.status = 400;
    throw err;
  }

  const { data: story } = await supabaseClient
    .from('orbix_stories')
    .select('id')
    .eq('id', storyId)
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('category', 'dadjoke')
    .single();
  if (!story) {
    const err = new Error('Dad joke story not found or not in this channel');
    err.status = 400;
    throw err;
  }

  const { data: video, error: videoErr } = await supabaseClient
    .from('orbix_longform_videos')
    .insert({
      business_id: businessId,
      channel_id: channelId,
      longform_type: 'dadjoke',
      title: title || null,
      subtitle: subtitle || null,
      hook_text: hook_text || null,
      description: description || null,
      render_status: 'PENDING',
      total_puzzles: 0,
    })
    .select('id')
    .single();
  if (videoErr) throw videoErr;

  const scriptPayload = script_json && typeof script_json === 'object'
    ? script_json
    : (typeof script_json === 'string' ? (() => { try { return JSON.parse(script_json); } catch { return {}; } })() : {});

  await supabaseClient
    .from('orbix_longform_dadjoke_data')
    .insert({
      longform_video_id: video.id,
      story_id: storyId,
      script_json: scriptPayload,
    });

  return { id: video.id };
}

/**
 * Update the full_script (and optionally other script_json fields) for a dad joke long-form video.
 * Used when the user edits the script before (re-)rendering.
 * @param {string} videoId - orbix_longform_videos.id
 * @param {string} businessId
 * @param {string|null} channelId
 * @param {{ full_script: string }} payload - full_script to merge into script_json
 */
export async function updateLongformDadJokeScript(videoId, businessId, channelId, payload) {
  const fullScript = typeof payload?.full_script === 'string' ? payload.full_script.trim() : '';
  const { data: video, error: videoErr } = await supabaseClient
    .from('orbix_longform_videos')
    .select('id')
    .eq('id', videoId)
    .eq('business_id', businessId)
    .single();
  if (videoErr || !video) {
    const err = new Error('Long-form video not found');
    err.status = 404;
    throw err;
  }
  if (channelId != null) {
    const { data: row } = await supabaseClient
      .from('orbix_longform_videos')
      .select('channel_id')
      .eq('id', videoId)
      .single();
    if (row?.channel_id != null && row.channel_id !== channelId) {
      const err = new Error('Long-form video not found');
      err.status = 404;
      throw err;
    }
  }

  const { data: existing, error: fetchErr } = await supabaseClient
    .from('orbix_longform_dadjoke_data')
    .select('script_json')
    .eq('longform_video_id', videoId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  if (!existing) {
    const err = new Error('No script data for this video. Create the video from a dad joke first.');
    err.status = 404;
    throw err;
  }
  const currentScript = (existing.script_json && typeof existing.script_json === 'object')
    ? existing.script_json
    : {};
  const updatedScriptJson = { ...currentScript, full_script: fullScript };

  const { error: updateErr } = await supabaseClient
    .from('orbix_longform_dadjoke_data')
    .update({ script_json: updatedScriptJson })
    .eq('longform_video_id', videoId);
  if (updateErr) throw updateErr;

  return { script_json: updatedScriptJson };
}

/**
 * Generate 5 separate background images for a dad joke long-form video (DALL-E 3), upload to storage, and save URLs.
 * Each image is one scene: cold_open, act_1_setup, act_2_escalation, act_3_chaos, final_reset.
 * @param {string} videoId - orbix_longform_videos.id
 * @param {string} businessId
 * @param {string} channelId
 * @returns {Promise<{ background_image_url: string, background_image_urls: Record<string, string> }>}
 */
export async function generateAndSaveLongformDadJokeBackground(videoId, businessId, channelId) {
  const { data: video, error: videoErr } = await supabaseClient
    .from('orbix_longform_videos')
    .select('id')
    .eq('id', videoId)
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('longform_type', 'dadjoke')
    .single();
  if (videoErr || !video) {
    const err = new Error('Long-form video not found or not a dad joke video');
    err.status = 404;
    throw err;
  }

  const { data: dadjokeRow } = await supabaseClient
    .from('orbix_longform_dadjoke_data')
    .select('script_json')
    .eq('longform_video_id', videoId)
    .maybeSingle();
  const scriptJson = dadjokeRow?.script_json && typeof dadjokeRow.script_json === 'object'
    ? dadjokeRow.script_json
    : {};
  const rawHint = [scriptJson.dad_activity, scriptJson.visual_suggestions?.act_1_setup, scriptJson.visual_suggestions?.cold_open].filter(Boolean)[0];
  const sceneHint = typeof rawHint === 'string' ? rawHint.slice(0, 200) : '';

  let prompts;
  try {
    prompts = await getLongformDadJokeScenePromptsFromChat(sceneHint);
  } catch (chatErr) {
    console.warn('[longform-dadjoke] GPT prompt generation failed, using hardcoded prompts:', chatErr?.message);
    prompts = buildLongformDadJokeScenePrompts(sceneHint);
  }

  const urls = {};

  for (const key of LONGFORM_SCENE_KEYS) {
    const localPath = await generateLongformDadJokeBackgroundImageWithPrompt(prompts[key], { videoId, sceneKey: key });
    const buffer = await readFileAsync(localPath);
    await unlinkAsync(localPath).catch(() => {});

    const storagePath = `${businessId}/longform/${videoId}/background-${key}.png`;
    const { error: uploadErr } = await supabaseClient.storage
      .from(BACKGROUNDS_BUCKET)
      .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
    if (uploadErr) {
      console.error('[longform-dadjoke] Background upload failed:', uploadErr);
      throw new Error(uploadErr.message || `Failed to upload background image (${key})`);
    }
    const { data: urlData } = supabaseClient.storage.from(BACKGROUNDS_BUCKET).getPublicUrl(storagePath);
    urls[key] = urlData?.publicUrl || '';
  }

  const primaryUrl = urls.act_1_setup || urls[LONGFORM_SCENE_KEYS[0]] || Object.values(urls)[0];
  if (!primaryUrl) {
    throw new Error('Failed to get any public URL for uploaded backgrounds');
  }

  await supabaseClient
    .from('orbix_longform_videos')
    .update({
      generated_background_url: primaryUrl,
      generated_background_urls: urls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId);

  return { background_image_url: primaryUrl, background_image_urls: urls };
}

/**
 * Upload a user-provided image for one segment and save URL to the video.
 * @param {string} videoId - orbix_longform_videos.id
 * @param {string} businessId
 * @param {string} channelId
 * @param {string} segmentKey - one of LONGFORM_SCENE_KEYS (cold_open, act_1_setup, etc.)
 * @param {Buffer} buffer - image file buffer
 * @param {string} contentType - e.g. 'image/png', 'image/jpeg'
 * @returns {Promise<{ segment_key: string, url: string, background_image_urls: Record<string, string> }>}
 */
export async function uploadLongformDadJokeSegmentImage(videoId, businessId, channelId, segmentKey, buffer, contentType) {
  if (!LONGFORM_SCENE_KEYS.includes(segmentKey)) {
    const err = new Error(`segment_key must be one of: ${LONGFORM_SCENE_KEYS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const { data: video, error: videoErr } = await supabaseClient
    .from('orbix_longform_videos')
    .select('id, generated_background_urls')
    .eq('id', videoId)
    .eq('business_id', businessId)
    .eq('channel_id', channelId)
    .eq('longform_type', 'dadjoke')
    .single();
  if (videoErr || !video) {
    const err = new Error('Long-form video not found or not a dad joke video');
    err.status = 404;
    throw err;
  }

  const ext = contentType?.includes('jpeg') || contentType?.includes('jpg') ? 'jpg' : 'png';
  const storagePath = `${businessId}/longform/${videoId}/segment-${segmentKey}.${ext}`;
  const { error: uploadErr } = await supabaseClient.storage
    .from(BACKGROUNDS_BUCKET)
    .upload(storagePath, buffer, { contentType: contentType || 'image/png', upsert: true });
  if (uploadErr) {
    console.error('[longform-dadjoke] Segment image upload failed:', uploadErr);
    throw new Error(uploadErr.message || 'Failed to upload image');
  }

  const { data: urlData } = supabaseClient.storage.from(BACKGROUNDS_BUCKET).getPublicUrl(storagePath);
  const url = urlData?.publicUrl || null;
  if (!url) throw new Error('Failed to get public URL');

  const existingUrls = (video.generated_background_urls && typeof video.generated_background_urls === 'object')
    ? { ...video.generated_background_urls }
    : {};
  existingUrls[segmentKey] = url;
  const primaryUrl = existingUrls.act_1_setup || existingUrls[LONGFORM_SCENE_KEYS[0]] || Object.values(existingUrls)[0];

  await supabaseClient
    .from('orbix_longform_videos')
    .update({
      generated_background_url: primaryUrl || undefined,
      generated_background_urls: existingUrls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId);

  return { segment_key: segmentKey, url, background_image_urls: existingUrls };
}
