/**
 * Hardcoded character and style prompts for Orbix – Dad Jokes long-form video images.
 * Use these exact descriptions in every image prompt so OpenAI generates consistent
 * characters across videos (dad avatar, neighbor Gary, dog, kid, etc.).
 *
 * Also provides generateLongformDadJokeBackgroundImage() to create one image per video via DALL-E 3.
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs';
import { promisify } from 'util';

const writeFileAsync = promisify(writeFile);

/**
 * Single locked art style for ALL images. No mixing of realistic and cartoon.
 * Use "vivid" in API for more illustrated look; this text reinforces it.
 */
export const ART_STYLE_LOCK =
  'Art style: soft 3D animated illustration, like a family-friendly animated film. ' +
  'Entire image in this style only. No photorealistic elements. No mixing of realistic and cartoon. ' +
  'Warm lighting, soft shadows, consistent rendering. No text or logos.';

/**
 * Character sheet: short, repeatable, identical in every prompt so DALL-E keeps the same designs.
 * One sentence per character; same wording every time.
 */
export const CHARACTER_SHEET =
  'Character designs (must look identical in every image): ' +
  'DAD: White man, early 40s, short brown hair, light stubble, red-and-black plaid short-sleeve shirt, khaki chinos, warm smile. ' +
  'GARY: White man, late 40s, navy baseball cap, gray crewneck t-shirt, friendly but clumsy. ' +
  'DOG: One golden-tan dog, medium build, floppy ears, same dog in every scene. ' +
  'KID: White boy, about 11, short brown messy hair, red t-shirt, dark shorts, skateboard. ' +
  'Draw these exact same characters with the same faces, clothes, and proportions in every image.';

/** Dad narrator – for legacy single-prompt builder. */
export const DAD_AVATAR =
  'The dad is a friendly Caucasian man in his early 40s, short neat brown hair, light stubble, red-and-black plaid short-sleeve shirt, khaki chinos. Same character every time.';

/** Neighbor Gary – for legacy. */
export const GARY_NEIGHBOR =
  'Gary the neighbor is a Caucasian man in his late 40s, navy baseball cap, gray t-shirt. Same character every time.';

/** Family dog – for legacy. */
export const DOG_CHARACTER =
  'One golden-tan medium-sized dog with floppy ears. Same dog every time.';

/** Kid on skateboard – for legacy. */
export const KID_SKATEBOARD =
  'A boy about 11, short brown messy hair, red t-shirt, dark shorts, skateboard. Same character every time.';

/** Visual style – for legacy single-prompt builder. */
export const SCENE_STYLE =
  'Soft 3D animated illustration style. No photorealistic mixing. No text or logos.';

/** Default scene settings (can be overridden by script dad_activity or visual_suggestions). */
export const DEFAULT_SCENE_SETTINGS = [
  'suburban driveway and garage',
  'lawn mower and garden hose in view',
  'residential neighborhood in background',
];

/** Keys for the 5 separate background images (one per scene). */
export const LONGFORM_SCENE_KEYS = ['cold_open', 'act_1_setup', 'act_2_escalation', 'act_3_chaos', 'final_reset'];

const SCENE_BRIEFS = {
  cold_open: 'Only the DAD in frame, standing in the driveway holding a coffee mug, smiling. No other people or animals.',
  act_1_setup: 'Only the DAD in frame, next to a lawn mower and tangled garden hose. No other people or animals.',
  act_2_escalation: 'The DAD and GARY in frame; Gary holds a ladder. No dog or kid.',
  act_3_chaos: 'The DAD, GARY, the DOG, and the KID with skateboard in the same driveway; ladder and hose visible.',
  final_reset: 'Only the DAD in frame again, calm, same driveway, golden hour. No other people or animals.',
};

/**
 * Use GPT (Chat Completions) to generate the 5 DALL-E prompts in one go, like a ChatGPT conversation.
 * GPT keeps character and style consistent across all 5 prompts; then we pass each to DALL-E.
 * @param {string} [sceneHint] - Optional setting hint (e.g. "garage", "mowing the lawn")
 * @returns {Promise<{ [key: string]: string }>} Object with keys from LONGFORM_SCENE_KEYS and prompt strings
 */
export async function getLongformDadJokeScenePromptsFromChat(sceneHint = '') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: key });

  const setting = sceneHint.trim() ? `Suburban ${sceneHint.trim()}` : 'Suburban driveway and garage';

  const systemPrompt = `You are an expert at writing image prompts for DALL-E 3. Your job is to output exactly 5 prompts so that when each is sent to DALL-E separately, the resulting images share the SAME art style and the SAME character designs (same dad, same neighbor, same dog, same kid) across all 5 images.

Rules:
- Use ONE consistent art style in every prompt: soft 3D animated illustration, family-friendly animated film. No photorealistic elements. No mixing realistic and cartoon.
- Describe the same four characters identically in every prompt where they appear: use the same phrases for the dad (e.g. "white man, early 40s, short brown hair, red-and-black plaid shirt, khaki chinos"), same for Gary (navy cap, gray t-shirt), same dog (golden-tan, floppy ears), same kid (about 11, red t-shirt, skateboard). Repeat the same character wording in each prompt so DALL-E draws them consistently.
- Each prompt must describe exactly ONE moment, one composition. No panels or grids.
- Output valid JSON only, with exactly these keys: cold_open, act_1_setup, act_2_escalation, act_3_chaos, final_reset. Each value is the full DALL-E prompt string for that scene.`;

  const userPrompt = `Setting: ${setting}.

Write 5 DALL-E prompts (one per scene). Use the SAME character descriptions in every prompt so the dad, neighbor Gary, dog, and kid look identical across all 5 images.

Scene 1 (cold_open): ${SCENE_BRIEFS.cold_open}
Scene 2 (act_1_setup): ${SCENE_BRIEFS.act_1_setup}
Scene 3 (act_2_escalation): ${SCENE_BRIEFS.act_2_escalation}
Scene 4 (act_3_chaos): ${SCENE_BRIEFS.act_3_chaos}
Scene 5 (final_reset): ${SCENE_BRIEFS.final_reset}

Return JSON: { "cold_open": "...", "act_1_setup": "...", "act_2_escalation": "...", "act_3_chaos": "...", "final_reset": "..." }`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw || typeof raw !== 'string') {
    throw new Error('GPT did not return prompts');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GPT returned invalid JSON for image prompts');
  }
  const prompts = {};
  for (const k of LONGFORM_SCENE_KEYS) {
    const v = parsed[k];
    prompts[k] = typeof v === 'string' ? v.trim() : String(v || '').trim();
    if (!prompts[k]) {
      throw new Error(`GPT did not return a prompt for ${k}`);
    }
  }
  return prompts;
}

/**
 * Build one prompt per scene (hardcoded fallback when Chat is not used).
 * @param {string} [sceneHint] - Optional overall setting hint
 * @returns {{ [key: string]: string }} Object with keys from LONGFORM_SCENE_KEYS and prompt strings
 */
export function buildLongformDadJokeScenePrompts(sceneHint = '') {
  const setting = sceneHint.trim() ? `Suburban ${sceneHint.trim()}. ` : 'Suburban driveway and garage. ';
  const styleAndChars = `${ART_STYLE_LOCK} ${CHARACTER_SHEET}`.replace(/\s+/g, ' ').trim();
  return {
    cold_open:
      `${styleAndChars} Scene: ${setting} Only the DAD is in frame, standing in the driveway holding a coffee mug, smiling. No other people or animals. One moment, one composition.`.trim(),
    act_1_setup:
      `${styleAndChars} Scene: ${setting} Only the DAD is in frame, next to a lawn mower and tangled garden hose. No other people or animals. One moment, one composition.`.trim(),
    act_2_escalation:
      `${styleAndChars} Scene: ${setting} The DAD and GARY are in frame; Gary holds a ladder. No dog or kid. One moment, one composition.`.trim(),
    act_3_chaos:
      `${styleAndChars} Scene: ${setting} The DAD, GARY, the DOG, and the KID with skateboard are in the same driveway; ladder and hose visible. One moment, one composition.`.trim(),
    final_reset:
      `${styleAndChars} Scene: ${setting} Only the DAD is in frame again, calm, same driveway, golden hour. No other people or animals. One moment, one composition.`.trim(),
  };
}

/**
 * Build a single scene prompt for DALL-E (legacy: one image for whole video).
 * @param {string} [sceneHint] - Optional scene hint
 * @returns {string} Full prompt for OpenAI image generation
 */
export function buildLongformDadJokeScenePrompt(sceneHint = '') {
  const setting = sceneHint.trim()
    ? `Setting: ${sceneHint.trim()}. `
    : `Setting: ${DEFAULT_SCENE_SETTINGS.join(', ')}. `;
  return (
    'A single scene for a YouTube video. One moment only, one composition, no panels or grids. ' +
    setting +
    'In the scene: ' +
    DAD_AVATAR +
    ' ' +
    GARY_NEIGHBOR +
    ' ' +
    DOG_CHARACTER +
    ' ' +
    KID_SKATEBOARD +
    ' ' +
    SCENE_STYLE
  ).replace(/\s+/g, ' ').trim();
}

/**
 * Generate one image from a specific prompt (used to produce 5 separate images).
 * @param {string} prompt - Full DALL-E prompt
 * @param {Object} options - { videoId, sceneKey } for temp filename
 * @returns {Promise<string>} Path to the generated PNG file
 */
export async function generateLongformDadJokeBackgroundImageWithPrompt(prompt, options = {}) {
  const { videoId = 'longform', sceneKey = '' } = options;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set; cannot generate long-form background image');
  }
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: key });
  const outputPath = join(tmpdir(), `dadjoke-longform-${videoId}-${sceneKey || 'scene'}-${Date.now()}.png`);
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
    style: 'vivid', // illustrated look; matches ART_STYLE_LOCK (no photorealistic mixing)
    response_format: 'b64_json',
  });
  const b64 = response?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI image generation returned no image data');
  }
  const buffer = Buffer.from(b64, 'base64');
  await writeFileAsync(outputPath, buffer);
  return outputPath;
}

/**
 * Generate a single background image for a long-form dad joke video using OpenAI DALL-E 3.
 * Uses hardcoded character prompts so the dad, Gary, dog, and kid stay consistent.
 * @param {Object} options - Options
 * @param {string} [options.sceneHint] - Optional scene (e.g. "garage with ladder and tools", from script_json.dad_activity or visual_suggestions)
 * @param {string} [options.videoId] - Optional video ID for temp filename
 * @returns {Promise<string>} Path to the generated PNG file (temp directory)
 */
export async function generateLongformDadJokeBackgroundImage(options = {}) {
  const { sceneHint = '', videoId = 'longform' } = options;
  const prompt = buildLongformDadJokeScenePrompt(sceneHint);
  return generateLongformDadJokeBackgroundImageWithPrompt(prompt, { videoId });
}
