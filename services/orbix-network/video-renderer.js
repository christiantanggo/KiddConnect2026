/**
 * Orbix Network Video Renderer Service
 * Renders videos using FFmpeg with studio backdrops, motion, hook text, captions, and music
 * 
 * Note: Requires FFmpeg to be installed on the system
 * Background assets (12 images) must be in Supabase Storage
 * Music tracks must be in Supabase Storage bucket 'orbix-network-music'
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomInt } from 'crypto';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

// Background asset configuration
const TOTAL_BACKGROUNDS = 12; // 12 images total (IDs 1-12)
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
const MUSIC_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_MUSIC || 'orbix-network-music';
const RENDERS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_RENDERS || 'orbix-network-videos';
const VIDEO_DURATION = 35; // Default video duration in seconds

// Render configuration
const RENDER_CONFIG = {
  motion: {
    enabled: true,
    mode: 'random',
    zoom_range: [1.00, 1.03],
    pan_range: [0.00, 0.03],
    fps: 30
  },
  hook: {
    enabled: true,
    fade_in_duration: 0.5,
    fade_out_duration: 0.5,
    max_length: 80
  },
  captions: {
    enabled: true,
    font_size: 48,
    position: 'lower-third',
    words_per_second: 2.5 // For timing estimation
  },
  music: {
    enabled: true,
    volume_db: -28,
    fade_in_ms: 800,
    fade_out_ms: 800,
    start_delay_seconds: 0.5
  }
};

/**
 * Select template based on story (A, B, or C)
 * @param {Object} story - Story object
 * @returns {string} Template ID ('A', 'B', or 'C')
 */
export function selectTemplate(story) {
  const score = story.shock_score;
  if (score >= 80) {
    return 'A'; // High impact
  } else if (score >= 65) {
    return 'B'; // Medium-high
  } else {
    return 'C'; // Medium
  }
}

const BACKGROUND_IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;
const MUSIC_EXT = /\.(mp3|m4a|wav|aac)$/i;

/**
 * List music track file names for a channel (storage path prefix: businessId/channelId/)
 * @param {string} businessId
 * @param {string} channelId
 * @returns {Promise<Array<{name: string, path: string, url: string}>>}
 */
export async function listChannelMusicTracks(businessId, channelId) {
  if (!businessId || !channelId) return [];
  try {
    const prefix = `${businessId}/${channelId}`;
    const { data: files, error } = await supabaseClient.storage
      .from(MUSIC_BUCKET)
      .list(prefix, { limit: 200 });
    if (error) {
      console.warn('[Orbix Video Renderer] listChannelMusicTracks:', error.message);
      return [];
    }
    const items = (files || [])
      .filter((f) => f.name && MUSIC_EXT.test(f.name))
      .map((f) => {
        const path = `${prefix}/${f.name}`;
        const { data } = supabaseClient.storage.from(MUSIC_BUCKET).getPublicUrl(path);
        return { name: f.name, path, url: data?.publicUrl };
      });
    return items;
  } catch (e) {
    console.warn('[Orbix Video Renderer] listChannelMusicTracks error:', e?.message);
    return [];
  }
}

/**
 * List background image file names for a channel (storage path prefix: businessId/channelId/)
 * @param {string} businessId
 * @param {string} channelId
 * @returns {Promise<string[]>} File names (e.g. ['image1.png']) or []
 */
export async function listChannelBackgrounds(businessId, channelId) {
  if (!businessId || !channelId) return [];
  try {
    const prefix = `${businessId}/${channelId}`;
    const { data: files, error } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: 200 });
    if (error) {
      console.warn('[Orbix Video Renderer] listChannelBackgrounds:', error.message);
      return [];
    }
    const names = (files || [])
      .filter((f) => f.name && BACKGROUND_IMAGE_EXT.test(f.name))
      .map((f) => f.name);
    return names;
  } catch (e) {
    console.warn('[Orbix Video Renderer] listChannelBackgrounds error:', e?.message);
    return [];
  }
}

/**
 * Pick a random index in [0, length) using crypto for better entropy (avoids same choice in rapid succession).
 * @param {number} length - Length of the list (must be > 0)
 * @returns {number} Index in [0, length)
 */
function randomIndex(length) {
  if (length <= 0) return 0;
  if (length === 1) return 0;
  return randomInt(length);
}

/**
 * Shuffle array in place (Fisher-Yates) and return it, so rapid successive calls get different orders.
 * Uses crypto.randomInt for swap indices.
 */
function shuffleWithCrypto(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Select background for a channel: use channel's images if any, else global Photo1-12.
 * Uses crypto.randomInt for selection so multiple renders created in quick succession get different backgrounds.
 * @param {string} businessId - Business ID (for settings lookup)
 * @param {string|null} channelId - Orbix channel ID (for per-channel images)
 * @returns {Promise<Object>} { type: 'MOTION', id: number, imageId: number, storagePath?: string }
 */
export async function selectBackground(businessId, channelId = null) {
  try {
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    const randomMode = moduleSettings?.settings?.backgrounds?.random_mode || 'uniform';

    if (businessId && channelId) {
      const channelFiles = await listChannelBackgrounds(businessId, channelId);
      if (channelFiles.length > 0) {
        // Shuffle then pick first so we get a random choice with good entropy (avoids same background when creating multiple renders in one run)
        const shuffled = shuffleWithCrypto([...channelFiles]);
        const name = shuffled[0];
        const idx = channelFiles.indexOf(name);
        const storagePath = `${businessId}/${channelId}/${name}`;
        return {
          type: 'MOTION',
          id: idx + 1,
          imageId: idx + 1,
          storagePath
        };
      }
    }

    // Fallback: global images Photo1.png ... Photo12.png (use crypto for variety)
    const imageId = randomIndex(TOTAL_BACKGROUNDS) + 1;
    return {
      type: 'MOTION',
      id: imageId,
      imageId: imageId,
      storagePath: null
    };
  } catch (error) {
    console.error('[Orbix Video Renderer] Error selecting background:', error);
    return { type: 'MOTION', id: 1, imageId: 1, storagePath: null };
  }
}

/**
 * Apply 4-segment repeating motion pattern to a still image
 * Pattern: (1) Zoom in, (2) Pan right-to-left, (3) Pan left-to-right, (4) Zoom out then in
 * This pattern applies to ALL background images uniformly
 * 
 * @param {string} imagePath - Local path to image file
 * @param {number} duration - Video duration in seconds (default 35)
 * @returns {Promise<string>} Path to generated motion video file
 */
export async function applyMotionToImage(imagePath, duration = VIDEO_DURATION) {
  try {
    const videoPath = join(tmpdir(), `orbix-motion-${Date.now()}.mp4`);
    const fps = RENDER_CONFIG.motion.fps;
    // Full video length divided by 4 — no minimum; each segment = duration/4
    const segmentDuration = Math.max(duration / 4, 1);
    const segmentFrames = Math.round(segmentDuration * fps);
    
    // Scale image larger to allow for zooming and panning (1.5x scale for room to zoom/pan).
    // Use scale-to-cover then crop so any aspect ratio is preserved (no stretching).
    const scaleWidth = 1080 * 1.5; // 1620
    const scaleHeight = 1920 * 1.5; // 2880
    const outputWidth = 1080;
    const outputHeight = 1920;
    const scaleCover = `scale=${scaleWidth}:${scaleHeight}:force_original_aspect_ratio=increase,crop=${scaleWidth}:${scaleHeight}:(iw-${scaleWidth})/2:(ih-${scaleHeight})/2`;

    // Linear zoom over segment (smoother): total zoom range 0.15 in segmentFrames frames
    const zoomRangePerFrame = segmentFrames > 0 ? 0.15 / segmentFrames : 0.0005;

    // A B A B pattern: Zoom in → Pan → Zoom out → Pan (alternating, different angles)
    // Segment 1: Zoom in 1.0 → 1.15, linear in 'on' for smooth motion
    const segment1Filter = `${scaleCover},zoompan=z='min(1.0+on*${zoomRangePerFrame},1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${segmentFrames}:s=${outputWidth}x${outputHeight}`;

    // Segment 2: Pan right-to-left, start from RIGHT + UPPER (different angle)
    const segment2Zoom = 1.15;
    const segment2StartX = scaleWidth - (outputWidth * segment2Zoom);
    const segment2EndX = 0;
    const segment2OffsetY = scaleHeight * 0.15;
    const segment2Filter = `${scaleCover},crop=${outputWidth * segment2Zoom}:${outputHeight * segment2Zoom}:x='${segment2StartX}-(${segment2StartX}-${segment2EndX})*n/${segmentFrames}':y='${segment2OffsetY}+(ih/2-${outputHeight * segment2Zoom}/2-${segment2OffsetY})*n/${segmentFrames}',scale=${outputWidth}:${outputHeight}`;

    // Segment 3: Zoom out 1.15 → 1.0, linear in 'on' for smooth motion
    const segment3Filter = `${scaleCover},zoompan=z='max(1.15-on*${zoomRangePerFrame},1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${segmentFrames}:s=${outputWidth}x${outputHeight}`;

    // Segment 4: Pan left-to-right, start from LEFT + LOWER (different angle from seg 2)
    const segment4Zoom = 1.15;
    const segment4StartX = 0;
    const segment4EndX = scaleWidth - (outputWidth * segment4Zoom);
    const segment4OffsetY = scaleHeight * 0.65;
    const segment4Filter = `${scaleCover},crop=${outputWidth * segment4Zoom}:${outputHeight * segment4Zoom}:x='${segment4StartX}+(${segment4EndX}-${segment4StartX})*n/${segmentFrames}':y='${segment4OffsetY}+(ih/2-${outputHeight * segment4Zoom}/2-${segment4OffsetY})*n/${segmentFrames}',scale=${outputWidth}:${outputHeight}`;
    
    const segment1Path = join(tmpdir(), `orbix-segment1-${Date.now()}.mp4`);
    const segment2Path = join(tmpdir(), `orbix-segment2-${Date.now()}.mp4`);
    const segment3Path = join(tmpdir(), `orbix-segment3-${Date.now()}.mp4`);
    const segment4Path = join(tmpdir(), `orbix-segment4-${Date.now()}.mp4`);
    
    console.log(`[Orbix Video Renderer] Applying 4-segment A-B-A-B motion (segment=${segmentDuration.toFixed(1)}s each, total=${duration}s)...`);
    
    // Segment 1: Zoom in
    const segment1Command = `ffmpeg -loop 1 -i "${imagePath}" -vf "${segment1Filter}" -t ${segmentDuration} -pix_fmt yuv420p -c:v libx264 -preset medium -crf 23 "${segment1Path}"`;
    await execAsync(segment1Command, { timeout: 2 * 60 * 1000 });
    
    // Segment 2: Pan right-to-left, upper angle
    const segment2Command = `ffmpeg -loop 1 -i "${imagePath}" -vf "${segment2Filter}" -t ${segmentDuration} -pix_fmt yuv420p -c:v libx264 -preset medium -crf 23 "${segment2Path}"`;
    await execAsync(segment2Command, { timeout: 2 * 60 * 1000 });
    
    // Segment 3: Zoom out
    const segment3Command = `ffmpeg -loop 1 -i "${imagePath}" -vf "${segment3Filter}" -t ${segmentDuration} -pix_fmt yuv420p -c:v libx264 -preset medium -crf 23 "${segment3Path}"`;
    await execAsync(segment3Command, { timeout: 2 * 60 * 1000 });
    
    // Segment 4: Pan left-to-right, lower angle
    const segment4Command = `ffmpeg -loop 1 -i "${imagePath}" -vf "${segment4Filter}" -t ${segmentDuration} -pix_fmt yuv420p -c:v libx264 -preset medium -crf 23 "${segment4Path}"`;
    await execAsync(segment4Command, { timeout: 2 * 60 * 1000 });
    
    const concatListPath = join(tmpdir(), `orbix-concat-${Date.now()}.txt`);
    const fs = (await import('fs')).default;
    await fs.promises.writeFile(concatListPath, 
      `file '${segment1Path.replace(/\\/g, '/')}'\n` +
      `file '${segment2Path.replace(/\\/g, '/')}'\n` +
      `file '${segment3Path.replace(/\\/g, '/')}'\n` +
      `file '${segment4Path.replace(/\\/g, '/')}'\n`
    );
    
    // Use concat demuxer to join segments, then trim to exact duration
    const concatCommand = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy -t ${duration} -y "${videoPath}"`;
    await execAsync(concatCommand, { timeout: 2 * 60 * 1000 });
    
    // Cleanup temporary segment files
    try {
      await unlinkAsync(segment1Path);
      await unlinkAsync(segment2Path);
      await unlinkAsync(segment3Path);
      await unlinkAsync(segment4Path);
      await unlinkAsync(concatListPath);
    } catch (cleanupError) {
      console.warn('[Orbix Video Renderer] Warning: Could not cleanup temporary segment files:', cleanupError.message);
    }
    
    console.log(`[Orbix Video Renderer] 4-segment motion pattern applied successfully`);
    return videoPath;
    
  } catch (error) {
    if (error.code === 'ENOENT' || (error.message && (error.message.includes('not recognized') || error.message.includes('not found')))) {
      throw new Error('FFmpeg is not installed or not in your system PATH. Please install FFmpeg:\n\nWindows: Download from https://www.gyan.dev/ffmpeg/builds/ or use: choco install ffmpeg\nMac: brew install ffmpeg\nLinux: sudo apt-get install ffmpeg\n\nAfter installation, restart your development server.');
    }
    console.error('[Orbix Video Renderer] Error applying motion to image:', error);
    throw error;
  }
}

/**
 * Get background image URL from Supabase Storage.
 * Per-channel: use storagePath when set; otherwise legacy global Photo{backgroundId}.png.
 * @param {number} backgroundId - Background image ID (1-12) for display/fallback
 * @param {string|null} [backgroundStoragePath] - Per-channel path (e.g. businessId/channelId/file.png)
 * @returns {Promise<string>} Public URL to the background image
 */
export async function getBackgroundImageUrl(backgroundId, backgroundStoragePath = null) {
  try {
    const path = backgroundStoragePath && backgroundStoragePath.trim()
      ? backgroundStoragePath.trim()
      : `Photo${backgroundId}.png`;

    const result = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    if (!result?.data?.publicUrl) {
      throw new Error(`Failed to generate public URL for background image: ${path}`);
    }

    return result.data.publicUrl;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error getting background image URL:', error);
    console.error('[Orbix Video Renderer] Background ID:', backgroundId, 'Path:', backgroundStoragePath || `Photo${backgroundId}.png`, 'Bucket:', STORAGE_BUCKET);
    throw error;
  }
}

/**
 * Upload completed render video to Supabase Storage so it can be viewed when YouTube upload is skipped.
 * Retries up to 3 times so every completed render gets a view link when possible.
 * @param {string} businessId - Business ID
 * @param {string} renderId - Render UUID
 * @param {string} localPath - Path to the rendered .mp4 file
 * @returns {Promise<string|null>} Public URL to the video, or null on failure
 */
export async function uploadRenderToStorage(businessId, renderId, localPath) {
  const fs = await import('fs');
  const maxAttempts = 3;
  const delayMs = 1500;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const buffer = await fs.default.promises.readFile(localPath);
      const remotePath = `${businessId}/${renderId}.mp4`;
      const { data, error } = await supabaseClient.storage
        .from(RENDERS_BUCKET)
        .upload(remotePath, buffer, { contentType: 'video/mp4', upsert: true });
      if (error) {
        console.error(`[Orbix Video Renderer] Storage upload attempt ${attempt}/${maxAttempts} failed:`, error.message);
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      const { data: urlData } = supabaseClient.storage.from(RENDERS_BUCKET).getPublicUrl(data.path);
      const baseUrl = urlData?.publicUrl ?? null;
      // Append cache-busting param so re-renders (same path) are not served from cache — new code = new video
      const url = baseUrl ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${Date.now()}` : null;
      if (url) return url;
    } catch (error) {
      console.error(`[Orbix Video Renderer] Upload attempt ${attempt}/${maxAttempts} error:`, error?.message || error);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return null;
}

/**
 * Generate audio from script using OpenAI TTS
 * @param {Object} script - Script object with narration text
 * @param {Object} [story] - Optional story; when category is 'psychology', TTS is body-only (no hook, no end question)
 * @returns {Promise<{audioPath: string, duration: number}>} Audio file path and duration
 */
export async function generateAudio(script, story = null) {
  try {
    const OpenAI = (await import('openai')).default;
    const fs = (await import('fs')).default;
    const { pipeline } = (await import('stream')).default;
    const { promisify } = (await import('util')).default;
    const pipelineAsync = promisify(pipeline);
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set');
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const content = script.content_json
      ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
      : {};
    const isPsychology = (story?.category || '').toLowerCase() === 'psychology';

    // Psychology: voice speaks question first (what_happens_next), then body (what_happened + why_it_matters).
    // Speaking the question lets you hear it in audio preview to confirm it's in the video before upload.
    if (isPsychology) {
      const question = (script.what_happens_next || '').trim();
      const bodyOnly = [script.what_happened, script.why_it_matters].filter(Boolean).join(' ').trim();
      if (!bodyOnly) throw new Error('Psychology script missing what_happened or why_it_matters');
      const fullSpoken = [question, bodyOnly].filter(Boolean).join(' ').trim();
      const audioPath = join(tmpdir(), `orbix-audio-${Date.now()}.mp3`);
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: fullSpoken,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.promises.writeFile(audioPath, buffer);
      const { duration } = await execAsync(
        `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
        { timeout: 10000 }
      ).then(result => ({ duration: parseFloat(result.stdout.trim()) }))
      .catch(() => ({ duration: 35 }));
      return { audioPath, duration: duration || 35 };
    }

    // Trivia: voice_script is the full spoken script
    const voiceScript = (content.voice_script || '').trim();
    const hookText = (script.hook || content.hook || '').trim();
    let bodyText = content.narration || content.script || script.narration || '';
    if (!bodyText) {
      bodyText = [script.what_happened, script.why_it_matters, script.what_happens_next].filter(Boolean).join(' ');
    }
    const narrationText = voiceScript || (hookText
      ? (hookText + '. ' + (bodyText || '').trim()).trim()
      : (bodyText || '').trim());
    
    if (!narrationText || narrationText.trim().length === 0) {
      throw new Error('No narration text found in script');
    }
    
    const audioPath = join(tmpdir(), `orbix-audio-${Date.now()}.mp3`);
    
    // Generate speech using OpenAI TTS
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: narrationText,
    });
    
    // Save audio to file
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(audioPath, buffer);
    
    // Get audio duration using ffprobe
    const { duration } = await execAsync(
      `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      { timeout: 10000 }
    ).then(result => ({ duration: parseFloat(result.stdout.trim()) }))
    .catch(() => ({ duration: 35 })); // Default to 35 seconds if ffprobe fails
    
    return {
      audioPath,
      duration: duration || 35
    };
  } catch (error) {
    console.error('[Orbix Video Renderer] Error generating audio:', error);
    throw error;
  }
}

/**
 * Generate trivia audio (12s retention format): hook 0s, question 1s, answer 9s, loop line 10.5s.
 * @param {Object} opts - { hook?, question, answerText, loopTriggerText? }
 * @param {number} totalDuration - Total video duration in seconds (12)
 * @returns {Promise<{audioPath: string, duration: number}>}
 */
export async function generateTriviaAudio(opts, totalDuration = 12) {
  const OpenAI = (await import('openai')).default;
  const fs = (await import('fs')).default;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const hookPhrase = (opts.hook || "Let's test your knowledge.").trim().slice(0, 80);
  const questionPhrase = (opts.question || '').trim().slice(0, 200);
  const answerPhrase = (opts.answerText || '').trim().slice(0, 100);
  const loopPhrase = (opts.loopTriggerText || 'Did you get it right?').trim().slice(0, 80);
  if (!questionPhrase) throw new Error('No question text for trivia TTS');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const hookPath = join(tmpdir(), `trivia-hook-${Date.now()}.mp3`);
  const questionPath = join(tmpdir(), `trivia-q-${Date.now()}.mp3`);
  const answerPath = join(tmpdir(), `trivia-a-${Date.now()}.mp3`);
  const loopPath = join(tmpdir(), `trivia-loop-${Date.now()}.mp3`);
  const mixedPath = join(tmpdir(), `trivia-mixed-${Date.now()}.mp3`);

  const getDur = async (p) => {
    try {
      const r = await execAsync(
        `ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`,
        { timeout: 5000 }
      );
      return parseFloat(r.stdout.trim()) || 0;
    } catch {
      return 0;
    }
  };

  const HOOK_START = 0;
  const QUESTION_START = 1;
  const ANSWER_START = 9;   // answer reveal 9–10.5s
  const LOOP_START = 10.5;  // single loop line 10.5–11.7s
  const answerTtsPhrase = answerPhrase ? `The answer is ${answerPhrase}` : '';

  try {
    const [hookResp, qResp, aResp, loopResp] = await Promise.all([
      openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: hookPhrase }),
      openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: questionPhrase }),
      answerTtsPhrase ? openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: answerTtsPhrase }) : null,
      openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: loopPhrase })
    ]);

    await fs.promises.writeFile(hookPath, Buffer.from(await hookResp.arrayBuffer()));
    await fs.promises.writeFile(questionPath, Buffer.from(await qResp.arrayBuffer()));
    if (aResp) await fs.promises.writeFile(answerPath, Buffer.from(await aResp.arrayBuffer()));
    await fs.promises.writeFile(loopPath, Buffer.from(await loopResp.arrayBuffer()));

    const hookDur = await getDur(hookPath);
    const qDur = await getDur(questionPath);
    const aDur = aResp && answerTtsPhrase ? await getDur(answerPath) : 0;
    const loopDur = await getDur(loopPath);

    const inputs = [hookPath, questionPath];
    const delays = [HOOK_START, QUESTION_START];
    const durs = [hookDur, qDur];
    if (aResp && answerTtsPhrase) {
      inputs.push(answerPath);
      delays.push(ANSWER_START);
      durs.push(aDur);
    }
    inputs.push(loopPath);
    delays.push(LOOP_START);
    durs.push(loopDur);

    const pads = inputs.map((_, i) => Math.max(0, totalDuration - delays[i] - durs[i]));

    const streams = inputs
      .map((_, i) => `[${i}:a]adelay=${Math.round(delays[i] * 1000)}|${Math.round(delays[i] * 1000)},apad=pad_dur=${pads[i]}[s${i}]`)
      .join(';');
    const mixInputs = inputs.map((_, i) => `[s${i}]`).join('');
    const filter = `${streams};${mixInputs}amix=inputs=${inputs.length}:duration=first:dropout_transition=0[aout]`;

    await execAsync(
      `ffmpeg ${inputs.map((p) => `-i "${p}"`).join(' ')} -filter_complex "${filter}" -map "[aout]" -c:a libmp3lame -q:a 2 -t ${totalDuration} -y "${mixedPath}"`,
      { timeout: 90000 }
    );

    return { audioPath: mixedPath, duration: totalDuration };
  } finally {
    for (const p of [hookPath, questionPath, answerPath, loopPath]) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}

/**
 * Generate caption segments from script (body only — no hook).
 * Segments are offset by estimated hook duration and scaled to fill (audioDuration - hookDuration)
 * so captions align with when the body is spoken.
 * @param {Object} script - Script object
 * @param {number} audioDuration - Total audio duration in seconds (from TTS)
 * @param {{ psychologyQuestionHookSeconds?: number }} [options] - If psychologyQuestionHookSeconds set (e.g. 1.75), hook is silent question card; captions start after it; no end question.
 * @returns {Array<{text: string, start: number, end: number}>} Caption segments
 */
export function generateCaptionSegments(script, audioDuration, options = {}) {
  try {
    const content = script.content_json
      ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
      : {};
    const psychologyHookSeconds = options.psychologyQuestionHookSeconds;

    // Body only (no hook, no end question / Comment Now): captions = what_happened + why_it_matters only
    let bodyText = [script.what_happened, script.why_it_matters].filter(Boolean).join(' ');
    if (!bodyText) {
      const fullNarration = (content.narration || content.script || script.narration || '').trim();
      const endQuestion = (script.what_happens_next || '').trim();
      bodyText = fullNarration;
      if (endQuestion && bodyText.toLowerCase().endsWith(endQuestion.toLowerCase())) {
        bodyText = bodyText.slice(0, -endQuestion.length).replace(/[\s.]+$/, '').trim();
      }
    }
    bodyText = (bodyText || '').trim();
    const hookText = (script.hook || content.hook || '').trim();
    if (hookText && bodyText.toLowerCase().startsWith(hookText.toLowerCase())) {
      bodyText = bodyText.slice(hookText.length).replace(/^[\s.]+/, '').trim();
    }
    if (!bodyText) return [];

    const wordsPerSecond = 3.0;
    // Psychology: question is on-screen hook for fixed seconds at start; no spoken hook; body only; no end question.
    const hookDuration = psychologyHookSeconds != null
      ? psychologyHookSeconds
      : (() => {
          const hookWords = hookText ? hookText.split(/\s+/).filter(Boolean).length : 0;
          return Math.min(Math.max((hookWords / wordsPerSecond), 0.5), 10);
        })();
    const bodyDuration = Math.max(audioDuration - hookDuration, 0.5);
    // Psychology: entire body is what_happened + why_it_matters (no question at end). Others: body only portion of spoken body.
    const bodyOnlyWords = bodyText.split(/\s+/).filter(Boolean).length;
    const questionWords = psychologyHookSeconds != null ? 0 : (script.what_happens_next || '').trim().split(/\s+/).filter(Boolean).length;
    const totalSpokenBodyWords = bodyOnlyWords + questionWords;
    const bodyDurationForCaptions = totalSpokenBodyWords > 0
      ? bodyDuration * (bodyOnlyWords / totalSpokenBodyWords)
      : bodyDuration;

    const sentences = bodyText.match(/[^.!?]+[.!?]+/g) || [bodyText];
    const totalBodyWords = bodyText.split(/\s+/).filter(Boolean).length;
    if (totalBodyWords === 0) return [];

    const segments = [];
    let currentTime = hookDuration;

    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
      if (sentenceWords === 0) continue;
      const segmentDuration = (sentenceWords / totalBodyWords) * bodyDurationForCaptions;
      const endTime = Math.min(currentTime + segmentDuration, hookDuration + bodyDurationForCaptions);

      segments.push({
        text: sentence.trim(),
        start: currentTime,
        end: endTime
      });

      currentTime = endTime + 0.05;
      if (currentTime >= audioDuration) break;
    }

    // Clamp last segment end to sped-up caption window and audio duration
    if (segments.length > 0) {
      const maxEnd = Math.min(hookDuration + bodyDurationForCaptions, audioDuration);
      if (segments[segments.length - 1].end > maxEnd) {
        segments[segments.length - 1].end = maxEnd;
      }
    }

    return segments;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error generating caption segments:', error);
    return [];
  }
}

/** Psychology: captions start after the opening question is spoken (0.3s breath + ~2s for a 6–8 word question at TTS pace). */
export const PSYCHOLOGY_QUESTION_HOOK_DURATION = 2.3;

/**
 * Prepend silence to an audio file (e.g. for psychology question-hook at start).
 * Uses adelay so we don't need to match formats (concat required same sample rate/channels).
 * @param {string} audioPath - Path to existing audio file
 * @param {number} silenceSeconds - Seconds of silence to prepend
 * @returns {Promise<{path: string, totalDuration: number}>} New file path and total duration (silence + original)
 */
export async function prependSilenceToAudio(audioPath, silenceSeconds) {
  const outPath = join(tmpdir(), `orbix-audio-padded-${Date.now()}.mp3`);
  const delayMs = Math.round(silenceSeconds * 1000);
  let channels = 1;
  try {
    const probe = await execAsync(
      `ffprobe -i "${audioPath}" -select_streams a:0 -show_entries stream=channels -v quiet -of csv="p=0"`,
      { timeout: 5000 }
    );
    const n = parseInt(probe.stdout?.trim(), 10);
    if (Number.isFinite(n) && n >= 1) channels = n;
  } catch (_) { /* keep default 1 */ }
  // adelay (ms): one value for mono, N values for N channels
  const adelayArg = channels === 1 ? String(delayMs) : Array(channels).fill(delayMs).join('|');
  const adelayFilter = `adelay=${adelayArg}`;
  const cmd = `ffmpeg -i "${audioPath}" -af "${adelayFilter}" -c:a libmp3lame -q:a 2 -y "${outPath}"`;
  await execAsync(cmd, { timeout: 60000 });
  const { duration } = await execAsync(
    `ffprobe -i "${outPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
    { timeout: 10000 }
  ).then(result => ({ duration: parseFloat(result.stdout.trim()) }))
  .catch(() => ({ duration: silenceSeconds + 10 }));
  return { path: outPath, totalDuration: duration || (silenceSeconds + 10) };
}

/** Words-per-second for TTS (match generateCaptionSegments). */
const WPS = 3.0;

/**
 * Estimate audio duration in seconds from script (for caption generation when duration not stored).
 * @param {Object} script - Script object (hook, what_happened, why_it_matters, what_happens_next or content_json)
 * @returns {number} Estimated duration in seconds
 */
export function estimateAudioDurationFromScript(script) {
  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const hook = (script?.hook || content?.hook || '').trim();
  const body = [script?.what_happened, script?.why_it_matters].filter(Boolean).join(' ');
  const question = (script?.what_happens_next || '').trim();
  const totalWords = [hook, body, question]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(5, totalWords / WPS);
}

/**
 * Convert caption segments to SRT format for YouTube captions upload.
 * @param {Array<{text: string, start: number, end: number}>} segments
 * @returns {string} SRT content
 */
export function captionSegmentsToSrt(segments) {
  if (!segments?.length) return '';
  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const ms = Math.round((sec % 1) * 1000);
    const ss = Math.floor(sec);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return segments
    .map((seg, i) => {
      const start = formatTime(seg.start);
      const end = formatTime(seg.end);
      return `${i + 1}\n${start} --> ${end}\n${(seg.text || '').trim()}\n`;
    })
    .join('\n');
}

/**
 * Word-wrap text to fit screen width (fewer chars per line for larger font).
 * Returns string with ASS line breaks \\N between lines.
 */
function wrapHookText(text, maxCharsPerLine = 22) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const lines = [];
  let current = '';
  for (const w of words) {
    const next = current ? current + ' ' + w : w;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w.length <= maxCharsPerLine ? w : w.substring(0, maxCharsPerLine);
    }
  }
  if (current) lines.push(current);
  return lines.join('\\N');
}

/** Format seconds as ASS time HH:MM:SS.cc */
function formatASSTimeFromSeconds(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.round((s % 1) * 100);
  const sec = Math.floor(s);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Trivia 12s timing constants (must match trivia-renderer.js; short loop ending) */
const TRIVIA_HOOK_END = 1.0;
const TRIVIA_READ_END = 5.0;      // question + options visible 1–5s
const TRIVIA_COUNTDOWN_END = 9.0;  // countdown 5–9s
const TRIVIA_REVEAL_END = 10.5;   // answer reveal 9–10.5s (1.5s)
const TRIVIA_LOOP_LINE_DURATION = 1.2; // loop line only 10.5–11.7s, then hard cut
const TRIVIA_LOOP_END = 11.7;     // video end 12s

/**
 * Generate ASS file for trivia layout (12s retention format).
 * 0–1s hook; 1–9s question + countdown + options; 9–10.5s answer; 10.5–11.7s single loop line, hard cut.
 * @param {Object} opts - { category, triviaNumber, question, optionA, optionB, optionC, answerText, correctLetter, loopTriggerText?, hookText? }
 * @param {number} duration - Video duration in seconds (12)
 * @returns {Promise<string>} Path to ASS file
 */
export async function generateTriviaASSFile(opts, duration = 12) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-trivia-${Date.now()}.ass`);
  const esc = (s) => (s || '').toString().replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');

  const categoryDisplay = (opts.category || 'GENERAL').toUpperCase();
  const triviaNum = opts.triviaNumber ?? 1;
  const bannerText = `${categoryDisplay}  #${triviaNum}`;
  const correctLetter = (opts.correctLetter || 'A').toUpperCase().charAt(0);
  const hookDisplay = (opts.hookText || '').trim().slice(0, 60) || `ONLY ${[25, 30, 35, 40][(triviaNum - 1) % 4]}% GET THIS RIGHT.`;
  const loopTriggerText = (opts.loopTriggerText || 'Did you get it right?').trim().slice(0, 80);

  const t = (s) => formatASSTimeFromSeconds(s);
  const questionCaps = (opts.question || '').toUpperCase();
  const questionCenterY = 495;
  const optCenterY = Math.round((910 + 1920) / 2);
  const optY = { A: optCenterY - 80, B: optCenterY, C: optCenterY + 80 };
  // Countdown position: between question (495) and first option (optY.A ~1335) — center of gap
  const countdownY = Math.round((questionCenterY + optY.A) / 2);

  const assContent = `[Script Info]
Title: Orbix Trivia
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Interrupt,Arial,128,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,60,60,10,1
Style: Banner,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,20,20,10,1
Style: BannerBg,Arial,12,&H00FF8000,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Question,Arial,120,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,80,80,10,1
Style: Option,Arial,90,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,20,20,10,1
Style: OptionCorrect,Arial,90,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,20,20,10,1
Style: OptionDim,Arial,90,&H66FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,20,20,10,1
Style: AnswerBig,Arial,168,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,80,80,10,1
Style: LoopTrigger,Arial,96,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,60,60,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];

  // === 0–1s: Hook text ===
  lines.push(`Dialogue: 0,${t(0)},${t(TRIVIA_HOOK_END)},Interrupt,,0,0,0,,{\\an5\\pos(540,960)}${esc(hookDisplay.toUpperCase())}`);

  // === 1–9s: Banner + question + all 3 options (all stay on through countdown) ===
  lines.push(`Dialogue: 1,${t(TRIVIA_HOOK_END)},${t(TRIVIA_COUNTDOWN_END)},BannerBg,,0,0,0,,{\\an7\\pos(0,0)\\p1}m 0 0 l 1080 0 l 1080 80 l 0 80{\\p0}`);
  lines.push(`Dialogue: 1,${t(TRIVIA_HOOK_END)},${t(TRIVIA_COUNTDOWN_END)},Banner,,0,0,0,,{\\an5\\pos(540,40)}${esc(bannerText)}`);
  lines.push(`Dialogue: 1,${t(TRIVIA_HOOK_END)},${t(TRIVIA_COUNTDOWN_END)},Question,,0,0,0,,{\\an5\\pos(540,${questionCenterY})}${esc(questionCaps)}`);

  for (const letter of ['A', 'B', 'C']) {
    const y = optY[letter];
    const text = letter === 'A' ? opts.optionA : letter === 'B' ? opts.optionB : opts.optionC;
    lines.push(`Dialogue: 1,${t(TRIVIA_HOOK_END)},${t(TRIVIA_COUNTDOWN_END)},Option,,0,0,0,,{\\an5\\pos(540,${y})}${esc(text)}`);
  }

  // === 5–9s: 3-2-1 countdown (6,7,8) between question and options ===
  lines.push(`Dialogue: 2,${t(6)},${t(7)},AnswerBig,,0,0,0,,{\\an5\\pos(540,${countdownY})}3`);
  lines.push(`Dialogue: 2,${t(7)},${t(8)},AnswerBig,,0,0,0,,{\\an5\\pos(540,${countdownY})}2`);
  lines.push(`Dialogue: 2,${t(8)},${t(9)},AnswerBig,,0,0,0,,{\\an5\\pos(540,${countdownY})}1`);

  const answerOnly = (opts.answerText || '').replace(/^ANSWER:\s*[ABC]\)\s*/i, '').trim();

  // === 9–10.5s: Answer reveal (1.5s) ===
  lines.push(`Dialogue: 3,${t(TRIVIA_COUNTDOWN_END)},${t(TRIVIA_REVEAL_END)},AnswerBig,,0,0,0,,{\\an5\\pos(540,960)}${esc(answerOnly || opts.answerText || '')}`);

  // === 10.5–11.7s: Single loop line only (1.2s), then hard cut ===
  const loopEnd = Math.min(TRIVIA_LOOP_END, duration);
  lines.push(`Dialogue: 3,${t(TRIVIA_REVEAL_END)},${t(loopEnd)},LoopTrigger,,0,0,0,,{\\an5\\pos(540,960)}${esc(loopTriggerText)}`);

  await fs.promises.writeFile(assPath, assContent + lines.join('\n') + '\n', 'utf8');
  return assPath;
}

/**
 * Generate ASS file for facts layout: one centered fact line (larger font), 2s–28s.
 * @param {Object} opts - { title?, factText }
 * @param {number} duration - Video duration in seconds (default 30)
 * @returns {Promise<string>} Path to ASS file
 */
export async function generateFactsASSFile(opts, duration = 30) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-facts-${Date.now()}.ass`);
  const esc = (s) => (s || '').toString().replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  const t = (s) => formatASSTimeFromSeconds(s);
  const factText = (opts.factText || opts.fact_text || '').trim().slice(0, 200);
  const titleText = (opts.title || 'FACT').toString().slice(0, 60);
  // Wrap fact to ~28 chars per line for readability (larger font)
  const wrapFact = (text, maxChars = 28) => {
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
      const next = current ? current + ' ' + w : w;
      if (next.length <= maxChars) current = next;
      else {
        if (current) lines.push(current);
        current = w.length <= maxChars ? w : w.substring(0, maxChars);
      }
    }
    if (current) lines.push(current);
    return lines.join('\\N');
  };
  const assContent = `[Script Info]
Title: Orbix Facts
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: FactTitle,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,60,60,10,1
Style: FactText,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,80,80,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = [];
  lines.push(`Dialogue: 0,${t(0)},${t(2)},FactTitle,,0,0,0,,{\\an5\\pos(540,200)}${esc(titleText.toUpperCase())}`);
  lines.push(`Dialogue: 0,${t(2)},${t(Math.min(28, duration - 1))},FactText,,0,0,0,,{\\an5\\pos(540,960)}${wrapFact(factText)}`);
  await fs.promises.writeFile(assPath, assContent + lines.join('\n') + '\n', 'utf8');
  return assPath;
}

/**
 * Generate facts TTS: one phrase (tts_script), padded to totalDuration.
 * @param {Object} opts - { tts_script or ttsScript }
 * @param {number} totalDuration - Total video duration in seconds (default 30)
 * @returns {Promise<{audioPath: string, duration: number}>}
 */
export async function generateFactsAudio(opts, totalDuration = 30) {
  const OpenAI = (await import('openai')).default;
  const fs = (await import('fs')).default;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const phrase = (opts.tts_script || opts.ttsScript || '').trim().slice(0, 300);
  if (!phrase) throw new Error('No TTS script for facts audio');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const audioPath = join(tmpdir(), `facts-tts-${Date.now()}.mp3`);
  const resp = await openai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: phrase });
  await fs.promises.writeFile(audioPath, Buffer.from(await resp.arrayBuffer()));
  const getDur = async (p) => {
    try {
      const r = await execAsync(
        `ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`,
        { timeout: 5000 }
      );
      return parseFloat(r.stdout.trim()) || 0;
    } catch {
      return 0;
    }
  };
  const actualDur = await getDur(audioPath);
  const padDur = Math.max(0, totalDuration - actualDur);
  const mixedPath = join(tmpdir(), `facts-mixed-${Date.now()}.mp3`);
  await execAsync(
    `ffmpeg -i "${audioPath}" -af "apad=pad_dur=${padDur}" -t ${totalDuration} -y "${mixedPath}"`,
    { timeout: 30000 }
  );
  try {
    await unlinkAsync(audioPath);
  } catch (_) {}
  return { audioPath: mixedPath, duration: totalDuration };
}

/**
 * Generate ASS file for hook only: center of screen, Arial Bold, all caps, wraps to screen width.
 * Hook is visible only for hookDurationSeconds (while TTS is saying the hook).
 * @param {string} hookTextAllCaps - Hook text (caller must pass already uppercased)
 * @param {number} hookDurationSeconds - How long the hook is spoken (seconds); hook text is shown only during this time
 * @returns {Promise<string>} Path to ASS file
 */
export async function generateHookOnlyASSFile(hookTextAllCaps, hookDurationSeconds) {
  const fs = (await import('fs')).default;
  const assPath = join(tmpdir(), `orbix-hook-only-${Date.now()}.ass`);
  const hookFontSize = 114; // 76 * 1.5 (50% larger)
  const centerX = 540;
  const centerY = 960;
  const assContent = `[Script Info]
Title: Orbix Hook
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial,${hookFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,80,80,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const hookStart = '0:00:00.00';
  const hookEnd = formatASSTimeFromSeconds(Math.max(hookDurationSeconds, 0.5));
  const wrapped = wrapHookText(hookTextAllCaps || '');
  const line = `Dialogue: 0,${hookStart},${hookEnd},Hook,,0,0,0,,{\\an5\\pos(${centerX},${centerY})}${wrapped}\n`;
  await fs.promises.writeFile(assPath, assContent + line, 'utf8');
  return assPath;
}

/**
 * Generate ASS subtitle file
 * @param {Array} captionSegments - Caption segments with timing
 * @param {string} captionY - Caption Y position (e.g., 'h-120')
 * @param {string} hookText - Hook text to display
 * @param {number} hookFontSize - Hook text font size
 * @param {number} hookY - Hook text Y position
 * @param {number} audioDuration - Audio duration in seconds
 * @param {number} [targetDuration] - Video length (audioDuration + tail). If provided with endQuestionText, adds end-question line until end.
 * @param {string} [endQuestionText] - End question + " COMMENT NOW" shown in hook style
 * @param {number} [endQuestionStartSeconds] - When the question starts being spoken (so it appears on screen then). If omitted, uses audioDuration+1.
 * @param {{ captionCenteredLarge?: boolean }} [options] - If captionCenteredLarge true, captions use hook style: large font, center of screen.
 * @returns {Promise<string>} Path to ASS file
 */
export async function generateASSSubtitleFile(captionSegments, captionY, hookText, hookFontSize, hookY, audioDuration, targetDuration = null, endQuestionText = null, endQuestionStartSeconds = null, options = {}) {
  try {
    const fs = (await import('fs')).default;
    const assPath = join(tmpdir(), `orbix-subtitles-${Date.now()}.ass`);
    const captionCenteredLarge = options.captionCenteredLarge === true;
    
    // Parse caption Y position (used only when not captionCenteredLarge)
    const captionYValue = captionY === 'h-100' ? 1820 : captionY === 'h-120' ? 1800 : captionY === 'h-140' ? 1780 : 1800;
    
    const endQuestionFontSize = 114; // Same as hook (Arial Bold, center)
    const centerX = 540;
    const centerY = 960;
    const captionStyleFontSize = captionCenteredLarge ? 114 : 48;
    const captionAlignment = captionCenteredLarge ? 5 : 2; // 5 = center, 2 = top-center
    const captionPos = captionCenteredLarge ? `\\an5\\pos(${centerX},${centerY})` : `\\an2\\pos(540,${captionYValue})`;
    
    // ASS file header - PlayRes must match video size (1080x1920). CaptionCenter = same as hook when captionCenteredLarge.
    let assContent = `[Script Info]
Title: Orbix Network Video
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial,${hookFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
Style: Caption,Arial,${captionStyleFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,${captionAlignment},80,80,10,1
Style: EndQuestion,Arial,${endQuestionFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,5,80,80,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    
    // Add hook text (displayed for entire duration)
    if (hookText && hookText.trim()) {
      const hookStart = '0:00:00.00';
      const hours = Math.floor(audioDuration / 3600);
      const minutes = Math.floor((audioDuration % 3600) / 60);
      const seconds = audioDuration % 60;
      const hookEnd = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds.toFixed(2)).padStart(5, '0')}`;
      
      assContent += `Dialogue: 0,${hookStart},${hookEnd},Hook,,0,0,0,,{\\an2\\pos(540,${hookY})}${hookText}\n`;
    }
    
    // Add caption segments (position and style depend on captionCenteredLarge; wrap when centered so large text fits)
    for (const segment of captionSegments) {
      const startTime = formatASSTime(segment.start);
      const endTime = formatASSTime(segment.end);
      const captionText = captionCenteredLarge ? wrapHookText(segment.text, 22) : segment.text;
      assContent += `Dialogue: 0,${startTime},${endTime},Caption,,0,0,0,,{${captionPos}}${captionText}\n`;
    }
    
    // End question + " COMMENT NOW" in hook style — show when question is spoken (endQuestionStartSeconds) through end of video
    if (endQuestionText != null && endQuestionText !== '' && targetDuration != null && targetDuration > audioDuration) {
      const endQuestionDisplay = (endQuestionText.trim() + ' COMMENT NOW').toUpperCase();
      const wrapped = wrapHookText(endQuestionDisplay);
      const startSeconds = endQuestionStartSeconds != null && endQuestionStartSeconds < targetDuration
        ? endQuestionStartSeconds
        : audioDuration + 1;
      const startTime = formatASSTimeFromSeconds(startSeconds);
      const endTime = formatASSTimeFromSeconds(targetDuration);
      assContent += `Dialogue: 0,${startTime},${endTime},EndQuestion,,0,0,0,,{\\an5\\pos(${centerX},${centerY})}${wrapped}\n`;
    }
    
    await fs.promises.writeFile(assPath, assContent);
    return assPath;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error generating ASS file:', error);
    throw error;
  }
}

/**
 * Format time for ASS file (HH:MM:SS.mm)
 */
function formatASSTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const centiseconds = Math.floor((secs - wholeSecs) * 100);
  
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/**
 * Get random music track for a channel (from per-channel uploads).
 * @param {string} businessId - Business ID
 * @param {string|null} channelId - Orbix channel ID (for per-channel music)
 * @returns {Promise<{name: string, url: string} | null>} Music track info
 */
export async function getRandomMusicTrack(businessId, channelId = null) {
  try {
    if (!businessId || !channelId) return null;
    const tracks = await listChannelMusicTracks(businessId, channelId);
    if (!tracks.length) return null;
    const idx = randomIndex(tracks.length);
    const t = tracks[idx];
    return { name: t.name, url: t.url };
  } catch (error) {
    console.error('[Orbix Video Renderer] Error getting music track:', error);
    return null;
  }
}

/**
 * Prepare music track (download and prepare for mixing)
 * @param {string} url - Music track URL
 * @param {number} duration - Target duration in seconds
 * @returns {Promise<string | null>} Path to prepared music file
 */
export async function prepareMusicTrack(url, duration) {
  try {
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    
    const musicPath = join(tmpdir(), `orbix-music-${Date.now()}.mp3`);
    
    // Download music file
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.promises.writeFile(musicPath, response.data);
    
    // Trim/fade music to match duration
    const trimmedPath = join(tmpdir(), `orbix-music-trimmed-${Date.now()}.mp3`);
    const ffmpegCommand = `ffmpeg -i "${musicPath}" -t ${duration} -af "afade=t=in:st=0:d=0.8,afade=t=out:st=${duration - 0.8}:d=0.8" -y "${trimmedPath}"`;
    await execAsync(ffmpegCommand, { timeout: 30000 });
    
    // Cleanup original
    await unlinkAsync(musicPath).catch(() => {});
    
    return trimmedPath;
  } catch (error) {
    console.error('[Orbix Video Renderer] Error preparing music track:', error);
    return null;
  }
}

/**
 * Process a render job through all steps
 * Orchestrates the complete video rendering pipeline
 */
export async function processRenderJob(render) {
  console.log(`[processRenderJob] START render_id=${render.id} story_id=${render.story_id} script_id=${render.script_id} business_id=${render.business_id || 'n/a'}`);
  writeProgressLog('processRenderJob_START', { renderId: render.id, story_id: render.story_id });
  setCurrentRender(render.id, 'JOB_START');

  // Durable log so we can see "job started" in step_logs when process is killed mid-render (e.g. OOM)
  try {
    const { data: row } = await supabaseClient.from('orbix_renders').select('step_logs').eq('id', render.id).single();
    const logs = row?.step_logs || [];
    const entry = { timestamp: new Date().toISOString(), step: 'JOB', event: 'STARTED', message: 'Render job started', data: null };
    await supabaseClient.from('orbix_renders').update({ step_logs: [...logs, entry].slice(-100) }).eq('id', render.id);
  } catch (_) { /* non-fatal */ }

  try {
    // Import step functions
    const {
      step3Background,
      step4Voice,
      step5HookText,
      step6Captions,
      step7Metadata
    } = await import('./render-steps.js');

    // Fetch story and script from database
    const { data: story, error: storyError } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', render.story_id)
      .single();

    if (storyError || !story) {
      console.error(`[processRenderJob] Story not found render_id=${render.id} story_id=${render.story_id}`, storyError?.message);
      throw new Error(`Story not found: ${storyError?.message || 'Story ID: ' + render.story_id}`);
    }

    let script;
    const isPsychologyStory = (story?.category || '').toLowerCase() === 'psychology';
    // Psychology: use latest script for this story so a rewrite → restart uses the new question-as-hook
    if (isPsychologyStory) {
      const { data: latestScript, error: latestErr } = await supabaseClient
        .from('orbix_scripts')
        .select('*')
        .eq('story_id', render.story_id)
        .eq('business_id', render.business_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (latestErr || !latestScript) {
        const { data: fallback } = await supabaseClient.from('orbix_scripts').select('*').eq('id', render.script_id).single();
        script = fallback;
      } else {
        script = latestScript;
      }
    }
    if (!script) {
      const { data: scriptRow, error: scriptError } = await supabaseClient
        .from('orbix_scripts')
        .select('*')
        .eq('id', render.script_id)
        .single();
      if (scriptError || !scriptRow) {
        console.error(`[processRenderJob] Script not found render_id=${render.id} script_id=${render.script_id}`, scriptError?.message);
        throw new Error(`Script not found: ${scriptError?.message || 'Script ID: ' + render.script_id}`);
      }
      script = scriptRow;
    }

    const psychologyHookPreview = isPsychologyStory && script ? (script.what_happens_next || script.cta_line || script.hook || '').trim().slice(0, 60) : '';
    console.log(`[processRenderJob] Story and script loaded render_id=${render.id} story_title="${story?.title || 'n/a'}" script_id=${script?.id}${isPsychologyStory ? ' (latest for story)' : ''}${psychologyHookPreview ? ` psychology_hook="${psychologyHookPreview}..."` : ''}`);

    // Trivia uses separate pipeline
    if ((story?.category || '').toLowerCase() === 'trivia') {
      const { processTriviaRenderJob } = await import('./trivia-renderer.js');
      return await processTriviaRenderJob(render, story, script);
    }

    // Facts now use the same pipeline as psychology/money (hook, captions, short duration)
    // Psychology: TTS now speaks question first then body. Add a short breath pause (0.3s) before voice starts.
    const cat = (story?.category || '').toLowerCase();
    const isPsychology = cat === 'psychology';
    let audioResult = await generateAudio(script, story);
    let preGeneratedAudioPath = audioResult.audioPath;
    let audioDuration = audioResult.duration;
    if (isPsychology) {
      const padded = await prependSilenceToAudio(preGeneratedAudioPath, 0.3);
      await unlinkAsync(preGeneratedAudioPath).catch(() => {});
      preGeneratedAudioPath = padded.path;
      audioDuration = padded.totalDuration;
    }
    const isShortsRetention = cat === 'psychology' || cat === 'money' || cat === 'facts';
    const tailSeconds = isPsychology ? 0 : (isShortsRetention ? 3 : 5);
    const maxDuration = isShortsRetention ? 20 : 45;
    const targetDuration = isPsychology ? audioDuration : Math.min(audioDuration + tailSeconds, maxDuration);
    console.log(`[processRenderJob] Audio generated: ${audioDuration.toFixed(1)}s, target video length: ${targetDuration.toFixed(1)}s (psychology=${isPsychology}, Shorts retention: ${isShortsRetention})`);
    
    try {
    // STEP 3: Background motion render (length = targetDuration)
    writeProgressLog('STEP_BEFORE', { renderId: render.id, step: 'STEP_3_BACKGROUND' });
    setCurrentRender(render.id, 'STEP_3_BACKGROUND');
    console.log(`[processRenderJob] Starting Step 3: Background motion`);
    const step3Result = await step3Background(render.id, render, script, story, targetDuration);
    writeProgressLog('STEP_AFTER', { renderId: render.id, step: 'STEP_3_BACKGROUND' });
    console.log(`[processRenderJob] Step 3 completed: ${step3Result.outputPath}`);
    
    // STEP 4: Voice and music addition (use pre-generated audio, output length = targetDuration)
    writeProgressLog('STEP_BEFORE', { renderId: render.id, step: 'STEP_4_VOICE' });
    setCurrentRender(render.id, 'STEP_4_VOICE');
    console.log(`[processRenderJob] Starting Step 4: Voice and music`);
    const step4Result = await step4Voice(render.id, render, script, story, step3Result.outputPath, {
      audioPath: preGeneratedAudioPath,
      audioDuration,
      targetDuration
    });
    writeProgressLog('STEP_AFTER', { renderId: render.id, step: 'STEP_4_VOICE' });
    console.log(`[processRenderJob] Step 4 completed: ${step4Result.outputPath}, audio duration: ${step4Result.audioDuration}`);
    
    // STEP 5: Hook text addition (pass step 4 output so we never use stale DB path on re-render)
    writeProgressLog('STEP_BEFORE', { renderId: render.id, step: 'STEP_5_HOOK_TEXT' });
    setCurrentRender(render.id, 'STEP_5_HOOK_TEXT');
    console.log(`[processRenderJob] Starting Step 5: Hook text`);
    const step5Result = await step5HookText(render.id, render, script, story, render.template, step4Result.outputPath, step4Result.audioDuration);
    writeProgressLog('STEP_AFTER', { renderId: render.id, step: 'STEP_5_HOOK_TEXT' });
    console.log(`[processRenderJob] Step 5 completed: ${step5Result.outputPath}`);
    
    // STEP 6: Captions addition (pass step 5 output so we never use stale DB path on re-render)
    writeProgressLog('STEP_BEFORE', { renderId: render.id, step: 'STEP_6_CAPTIONS' });
    setCurrentRender(render.id, 'STEP_6_CAPTIONS');
    console.log(`[processRenderJob] Starting Step 6: Captions`);
    const step6Result = await step6Captions(render.id, render, script, story, render.template, step5Result.outputPath, step4Result.audioDuration, targetDuration);
    writeProgressLog('STEP_AFTER', { renderId: render.id, step: 'STEP_6_CAPTIONS' });
    console.log(`[processRenderJob] Step 6 completed: ${step6Result.outputPath}`);
    
    // STEP 7: Metadata generation
    writeProgressLog('STEP_BEFORE', { renderId: render.id, step: 'STEP_7_METADATA' });
    setCurrentRender(render.id, 'STEP_7_METADATA');
    console.log(`[processRenderJob] Starting Step 7: Metadata`);
    await step7Metadata(render.id, render, script, story);
    writeProgressLog('STEP_AFTER', { renderId: render.id, step: 'STEP_7_METADATA' });
    console.log(`[processRenderJob] Step 7 completed`);

    // STOP BEFORE STEP 8: Upload video to storage and mark READY_FOR_UPLOAD. YouTube upload runs in a separate job (optional 30s delay).
    const storageUrl = await uploadRenderToStorage(render.business_id, render.id, step6Result.outputPath);
    if (!storageUrl) {
      throw new Error('Video rendered but storage upload failed. Please try Restart Render.');
    }
    console.log(`[processRenderJob] Video uploaded to storage; stopping before YouTube upload (separate job).`);

    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'READY_FOR_UPLOAD',
        render_step: 'STEP_7_METADATA',
        step_progress: 100,
        step_completed_at: new Date().toISOString(),
        step_error: null,
        output_url: storageUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', render.id);

    console.log(`[processRenderJob] Render ${render.id} ready for YouTube upload (job 2).`);

    return {
      status: 'RENDER_COMPLETE',
      outputUrl: storageUrl,
      renderId: render.id
    };
    } finally {
      try { if (preGeneratedAudioPath) await unlinkAsync(preGeneratedAudioPath); } catch (e) { /* ignore */ }
    }
  } catch (error) {
    const currentStep = (await supabaseClient.from('orbix_renders').select('render_step').eq('id', render.id).single()).data?.render_step || 'unknown';
    writeProgressLog('processRenderJob_FAILED', { renderId: render.id, at_step: currentStep, error: error?.message });
    setCurrentRender(render.id, `FAILED_${currentStep}`);
    console.error(`[processRenderJob] FAILED render_id=${render.id} at_step=${currentStep} error="${error.message}"`);
    console.error(`[processRenderJob] Stack:`, error.stack);

    // Mark render as failed
    try {
      await supabaseClient
        .from('orbix_renders')
        .update({
          render_status: 'FAILED',
          step_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', render.id);
    } catch (updateError) {
      console.error(`[processRenderJob] Failed to update render status:`, updateError);
    }
    
    return {
      status: 'FAILED',
      error: error.message,
      renderId: render.id
    };
  }
}
