/**
 * Orbix Dad Jokes long-form only: list jokes from shorts, generate story-then-punchline script, create long-form video records.
 * Does not modify puzzle long-form or any other channel.
 */

import OpenAI from 'openai';
import { readFile, unlink } from 'fs';
import { promisify } from 'util';
import { supabaseClient } from '../../config/database.js';
import {
  getLongformDadJokeScenePromptsFromChat,
  buildLongformDadJokeScenePrompts,
  generateLongformDadJokeBackgroundImageWithPrompt,
  LONGFORM_SCENE_KEYS,
} from './longform-dadjoke-image-prompts.js';

const readFileAsync = promisify(readFile);
const unlinkAsync = promisify(unlink);

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

const DAD_ACTIVITIES = [
  'BBQ', 'mowing the lawn', 'washing the car', 'fishing', 'hardware store trip',
  'fixing something in the garage', 'watching sports', 'shopping for something simple that becomes overcomplicated',
  'chatting with a neighbor', 'trying to do a basic household task', 'lawn chair', 'grilling'
];

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
    : '(Use your own dad jokes in the same style: short setup, quick punchline.)';

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (clientErr) {
    console.error('[longform-dadjoke] getOpenAIClient error:', clientErr?.message);
    const err = new Error(process.env.OPENAI_API_KEY ? 'OpenAI client failed.' : 'OPENAI_API_KEY is not set. Add it to your environment.');
    err.status = 502;
    throw err;
  }
  const systemPrompt = `You are a writer for "Orbix – Dad Jokes" story-based comedy scripts for 6–8 minute YouTube videos. Target: 900–1200 words. The narrator sounds like a calm dad telling a story that slowly becomes ridiculous.

GOAL: Generate long-form comedy scripts where a calm dad tells a story that slowly spirals into ridiculous chaos while repeatedly insisting he has not told the real joke yet.

=== VIDEO STRUCTURE (required order) ===

1. Cold Open Joke
2. Story Introduction
3. Act 1 – Setup
4. Act 2 – Escalation
5. Act 3 – Chaos
6. Peak Chaos Moment
7. Final Reset
8. Final Dad Joke
9. Closing Call to Action

=== COLD OPEN ===

Start with a quick dad joke. Example: "I just read a book about anti-gravity. [beat] I couldn't put it down." Immediately follow with: "Anyway… I've got one joke for you today. Just one. But first I need to explain something that happened this weekend."

=== ACT 1 – SETUP ===

Introduce a normal dad scenario: washing the car, fixing the garage door, mowing the lawn, cleaning the garage, going to the hardware store. Introduce the first minor inconvenience: hose tangled, tool missing, ladder misplaced, paint can in the way. Include 3–4 observational jokes.

=== ACT 2 – ESCALATION ===

Introduce additional characters and complications: neighbor Gary appears, kid rides through yard on skateboard, dog runs through paint or mud, Gary borrows a ladder, something spills. Include 6–8 jokes.

=== ACT 3 – CHAOS ===

Events must escalate through a domino chain of cause and effect. Example: kid knocks paint → dog runs through paint → dog bumps ladder → ladder hits shelf → shelf triggers sprinkler → sprinkler floods yard. Each event must cause the next event.

=== CHAOS LADDER ===

Stories must escalate through five levels: Level 1 – inconvenience | Level 2 – interruption | Level 3 – problem | Level 4 – chaos | Level 5 – absurd chaos. Each paragraph should increase the chaos level.

=== SCENE EXPANSION ===

Each scene must contain at least: (1) event description, (2) observational commentary, (3) analogy, (4) mini punchline, (5) meta reminder. Each event should be 5–8 lines before the next. This increases runtime and improves storytelling.

=== SCENE COMEDY RULE ===

Every scene must contain a mini punchline. Structure: event → observation → punchline → meta reminder.

Example: "The dog ran through the paint. Which technically makes him an artist. Except instead of a gallery opening… he's just repainting the driveway. Still zero jokes."

=== JOKE LIMIT RULE ===

Classic question-and-answer dad jokes should be limited. Maximum: 1 Q&A joke every 3–4 scenes. Prefer observational humor instead.

Bad: "What do you call a lazy kangaroo? A pouch potato."
Better: "That kid flies around the yard like a caffeinated kangaroo. Honestly he's one lazy jump away from becoming a pouch potato."

=== JOKE STYLE ===

Prefer observational humor tied to the story. Avoid excessive Q&A.

Bad: "Why did the math book look sad?"
Better: "At that point the situation had more problems than a math textbook."

=== RUNNING META JOKE ===

Throughout the story the narrator repeatedly reminds viewers that the real joke has not happened yet. Examples: "That doesn't count." / "Still zero jokes." / "We're not at the joke yet." / "That was just context." / "We're building toward it." These lines should appear frequently.

=== CURIOSITY LOOP REQUIREMENT ===

Every script must introduce a mystery early in the story. Example: "Remind me to tell you what Gary did with the leaf blower later." This mystery should be referenced again in the middle of the story and revealed near the end.

=== PEAK CHAOS RULE ===

Near the end of the story, multiple chaotic events should happen simultaneously. Example: Gary loses control of the ladder, the dog runs through paint, the skateboard kid jumps the toolbox, the sprinkler activates. This should feel like the situation collapsing into chaos.

=== COMEDIC TIMING ===

Use pacing markers throughout: [beat], [pause], [sigh], [looks around]. These help slow narration.

=== FINAL RESET ===

After peak chaos, the narrator suddenly becomes calm and recaps the chaos. Example: "Anyway after all that… Gary breaking my ladder… the dog covered in paint… the kid trying to ollie over my toolbox… and the sprinkler system turning the driveway into a water park… it reminded me of the one joke I promised you." Use the same details that actually happened in your story.

=== FINAL JOKE ===

Deliver one short classic dad joke (exact words will be provided). Use [beat] before the punchline.

=== ENDING ===

End with: "Subscribe for daily dad jokes. Leave your worst dad joke in the comments. And tell me… how many jokes I told before the real one."

IMPORTANT: The full_script field is read aloud by TTS. Never put section headers or labels (e.g. "Act 1", "Act 2 – Escalation", "Cold open") in the narration—only the spoken story.

QUALITY: 900–1200 words. Family friendly. Output valid JSON only.`;

  const userPrompt = `Generate one long-form story-based comedy script: 6–8 minutes, 900–1200 words.

VIDEO STRUCTURE: Cold Open Joke → Story Introduction → Act 1 Setup (normal dad scenario + first inconvenience, 3–4 jokes) → Act 2 Escalation (Gary, kid, dog, complications, 6–8 jokes) → Act 3 Chaos (domino chain: each event causes the next, e.g. kid knocks paint → dog runs through paint → dog bumps ladder → ladder hits shelf → sprinkler floods yard) → Peak Chaos Moment (multiple events at once: ladder, dog, kid, sprinkler—situation collapsing) → Final Reset (calm recap; use exact details from your story) → Final Joke (exact words below) → Closing Call to Action.

SCENE EXPANSION: Each scene at least: event description, observational commentary, analogy, mini punchline, meta reminder. 5–8 lines per event.

JOKE LIMIT: Max 1 Q&A joke per 3–4 scenes; prefer observational (e.g. weave "pouch potato" into story observation, don't do "What do you call a lazy kangaroo?").

CURIOSITY LOOP: Every script must have a mystery early (e.g. "Remind me to tell you what Gary did with the leaf blower later"), reference again mid-story, reveal near end.

PEAK CHAOS: Multiple events at once near the end (ladder, dog through paint, kid jumps toolbox, sprinkler)—situation collapsing into chaos.

CHAOS LADDER: each paragraph increases level (1→5). Running meta joke frequently. Use [beat], [pause], [sigh], [looks around].

FINAL JOKE (use these exact words only at the very end, after the build-up):
Setup: ${finalJoke.setup}
Punchline: ${finalJoke.punchline}

Dad activity/setting: ${dadActivity}.

JOKE POOL (weave 11–17 into the story as event→observation→joke; final joke above is separate and must be last):
${jokePoolText}

Return JSON with:
- "title": string (e.g. "I Tried To Tell One Dad Joke…", "I Promised Only One Dad Joke")
- "thumbnail_text_suggestions": array of 2–4 short strings (e.g. "ONLY ONE JOKE", "DAD LOGIC")
- "full_script": string — COMPLETE narration only, 900–1200 words. This text is read aloud by TTS: do NOT include any section headers or labels (e.g. "Act 1", "Act 2 – Escalation", "Cold open", "Final reset"). Write only the spoken story. Follow the structure in order (cold open → intro → Act 1 → Act 2 → Act 3 → peak chaos → final reset → final joke → closing CTA) but never label the sections in the text. Each scene: event description, observational commentary, analogy, mini punchline, meta reminder. Max 1 Q&A joke per 3–4 scenes; prefer observational. Curiosity loop required. Use [beat], [pause], [sigh], [looks around] for pacing only.
- "segment_markers": object with keys: cold_open, story_introduction, act_1_setup, act_2_escalation, act_3_absurd_chaos, final_reset, final_joke, outro_cta — each value is the text for that segment only
- "visual_suggestions": object with same keys as segment_markers, values like "mower won't start", "Gary with ladder", "skateboard kid", "dog in grass"
- "final_joke": object with "setup", "punchline"
- "joke_metadata": array for each joke: { "setup", "punchline", "position_in_script", "is_final" }
- "estimated_duration_seconds": number (360–480 for 6–8 min)`;

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
