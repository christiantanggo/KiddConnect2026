/**
 * Orbix Dad Jokes LONG-FORM render pipeline (6–10 min).
 * One background + motion, full-script TTS (chunked), optional music, no captions.
 * Updates orbix_longform_videos only (no orbix_renders). Dad Jokes channel only.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { supabaseClient } from '../../config/database.js';
import {
  getBackgroundImageUrl,
  getRandomMusicTrack,
  prepareMusicTrack,
  generateLongformTTS,
  uploadLongformVideoToStorage,
  applyMotionToImage,
} from './video-renderer.js';
import { generateLongformDadJokeBackgroundImage } from './longform-dadjoke-image-prompts.js';
import { LONGFORM_SCENE_KEYS } from './longform-dadjoke-image-prompts.js';
import { sanitizeScriptForTTS } from './longform-script-sanitizer.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

/** Map our 5 image segment keys to script segment_markers keys for word-count duration. */
const SEGMENT_TEXT_KEYS = {
  cold_open: ['cold_open', 'story_introduction'],
  act_1_setup: ['act_1_setup'],
  act_2_escalation: ['act_2_escalation'],
  act_3_chaos: ['act_3_absurd_chaos'],
  final_reset: ['final_reset', 'final_joke', 'outro_cta'],
};

function wordCount(s) {
  return (String(s || '').trim().split(/\s+/).filter(Boolean).length) || 0;
}

/**
 * Compute duration in seconds for each of the 5 segments from script segment_markers (word-count ratio).
 * @param {Object} scriptJson - script_json with full_script and segment_markers
 * @param {number} totalDuration - Total TTS duration in seconds
 * @returns {{ [key: string]: number }} Segment key -> duration in seconds
 */
function getSegmentDurations(scriptJson, totalDuration) {
  const markers = scriptJson?.segment_markers && typeof scriptJson.segment_markers === 'object'
    ? scriptJson.segment_markers
    : {};
  const totalWords = wordCount(scriptJson?.full_script);
  const durations = {};
  let assigned = 0;
  if (totalWords > 0) {
    for (const key of LONGFORM_SCENE_KEYS) {
      const textKeys = SEGMENT_TEXT_KEYS[key] || [key];
      const segmentWords = textKeys.reduce((sum, k) => sum + wordCount(markers[k]), 0);
      durations[key] = Math.max(1, (segmentWords / totalWords) * totalDuration);
      assigned += durations[key];
    }
    // Normalize so sum equals totalDuration
    if (assigned > 0 && Math.abs(assigned - totalDuration) > 0.5) {
      const scale = totalDuration / assigned;
      for (const k of LONGFORM_SCENE_KEYS) {
        durations[k] = Math.max(1, Math.round(durations[k] * scale * 2) / 2);
      }
    }
  }
  if (Object.keys(durations).length === 0 || assigned === 0) {
    const fallback = totalDuration / LONGFORM_SCENE_KEYS.length;
    LONGFORM_SCENE_KEYS.forEach((k) => { durations[k] = Math.max(1, Math.round(fallback * 2) / 2); });
  }
  return durations;
}

/** Resolve channel for dad joke music (same as shorts). */
async function resolveDadJokeMusicChannelId(businessId, channelId) {
  try {
    const { data: sources } = await supabaseClient
      .from('orbix_sources')
      .select('channel_id')
      .eq('business_id', businessId)
      .eq('type', 'DAD_JOKE_GENERATOR')
      .eq('enabled', true)
      .not('channel_id', 'is', null)
      .limit(1);
    if (sources?.length && sources[0].channel_id) return sources[0].channel_id;
  } catch (_) {}
  return channelId;
}

/**
 * Process one dad joke long-form video: TTS from full_script, background + motion, mix, upload.
 * @param {Object} video - orbix_longform_videos row (id, business_id, channel_id, ...)
 * @param {Object} dadjokeData - orbix_longform_dadjoke_data row (script_json)
 * @returns {Promise<{ status: 'COMPLETED' | 'FAILED', outputUrl?: string, error?: string }>}
 */
export async function processDadJokeLongformRenderJob(video, dadjokeData) {
  const videoId = video.id;
  const businessId = video.business_id;
  const channelId = video.channel_id;

  writeProgressLog('DADJOKE_LONGFORM_RENDER_START', { videoId });
  setCurrentRender(videoId, 'DADJOKE_LONGFORM_RENDER');

  const scriptJson = dadjokeData?.script_json && typeof dadjokeData.script_json === 'object'
    ? dadjokeData.script_json
    : (typeof dadjokeData?.script_json === 'string' ? (() => { try { return JSON.parse(dadjokeData.script_json); } catch { return {}; } })() : {});
  const rawScript = (scriptJson.full_script || '').trim();
  const fullScript = sanitizeScriptForTTS(rawScript);
  if (!fullScript) {
    await supabaseClient.from('orbix_longform_videos').update({
      render_status: 'FAILED',
      render_error: 'No full_script in script_json',
      updated_at: new Date().toISOString(),
    }).eq('id', videoId);
    return { status: 'FAILED', error: 'No full_script in script_json' };
  }

  let bgPath, motionPath, audioPath, musicPath, finalVideoPath;

  try {
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;

    await supabaseClient.from('orbix_longform_videos').update({
      render_status: 'PROCESSING',
      render_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId);

    // 1. Generate TTS for full script (chunked)
    const audioResult = await generateLongformTTS(fullScript);
    audioPath = audioResult.audioPath;
    const duration = Math.max(60, Math.ceil((audioResult.duration || 0) * 2) / 2);
    if (duration > 900) {
      throw new Error('Generated audio over 15 minutes; aborting.');
    }

    const segmentUrls = video.generated_background_urls && typeof video.generated_background_urls === 'object'
      ? video.generated_background_urls
      : {};
    const hasSegmentImages = LONGFORM_SCENE_KEYS.some((k) => segmentUrls[k]);

    if (hasSegmentImages) {
      // Segment-based render: one image per script section, then concat
      const segmentDurations = getSegmentDurations(scriptJson, duration);
      const fallbackImageUrl = video.generated_background_url || (await getBackgroundImageUrl(1, null));
      const segmentPaths = [];
      const timestamp = Date.now();
      for (const key of LONGFORM_SCENE_KEYS) {
        const segDuration = segmentDurations[key] || Math.max(1, duration / 5);
        const imageUrl = segmentUrls[key] || fallbackImageUrl;
        const imgPath = join(tmpdir(), `dadjoke-seg-${videoId}-${key}-${timestamp}.png`);
        const segVideoPath = join(tmpdir(), `dadjoke-seg-video-${videoId}-${key}-${timestamp}.mp4`);
        let segMotion = null;
        try {
          const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
          await fs.promises.writeFile(imgPath, imgResp.data);
          segMotion = await applyMotionToImage(imgPath, segDuration);
          await execAsync(
            `"ffmpeg" -i "${segMotion}" -c:v copy -t ${segDuration} -y "${segVideoPath}"`,
            { timeout: 120000, windowsHide: true }
          );
          segmentPaths.push(segVideoPath);
        } finally {
          await unlinkAsync(imgPath).catch(() => {});
          if (segMotion) await unlinkAsync(segMotion).catch(() => {});
        }
      }
      const concatListPath = join(tmpdir(), `dadjoke-concat-${videoId}-${timestamp}.txt`);
      await fs.promises.writeFile(
        concatListPath,
        segmentPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      );
      motionPath = join(tmpdir(), `dadjoke-motion-${videoId}-${timestamp}.mp4`);
      await execAsync(
        `"ffmpeg" -f concat -safe 0 -i "${concatListPath}" -c copy -t ${duration} -y "${motionPath}"`,
        { timeout: 120000, windowsHide: true }
      );
      for (const p of [...segmentPaths, concatListPath]) {
        await unlinkAsync(p).catch(() => {});
      }
      writeProgressLog('DADJOKE_LONGFORM_SEGMENT_VIDEO', { videoId });
    } else {
      // Single background image (legacy or one uploaded/generated image)
      if (video.generated_background_url) {
        bgPath = join(tmpdir(), `dadjoke-longform-bg-${videoId}-${Date.now()}.png`);
        const imgResp = await axios.get(video.generated_background_url, { responseType: 'arraybuffer', timeout: 30000 });
        await fs.promises.writeFile(bgPath, imgResp.data);
        writeProgressLog('DADJOKE_LONGFORM_BG_STORED', { videoId });
      } else {
        const rawHint = [scriptJson.dad_activity, scriptJson.visual_suggestions?.act_1_setup, scriptJson.visual_suggestions?.cold_open]
          .filter(Boolean)[0];
        const sceneHint = typeof rawHint === 'string' ? rawHint.slice(0, 200) : '';
        try {
          bgPath = await generateLongformDadJokeBackgroundImage({ sceneHint, videoId });
          writeProgressLog('DADJOKE_LONGFORM_BG_GENERATED', { videoId });
        } catch (imgErr) {
          console.warn('[Dad Joke Long-form] Background image generation failed, using fallback:', imgErr?.message);
          const imageUrl = await getBackgroundImageUrl(1, null);
          bgPath = join(tmpdir(), `dadjoke-longform-bg-${videoId}-${Date.now()}.png`);
          const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
          await fs.promises.writeFile(bgPath, imgResp.data);
        }
      }
      motionPath = await applyMotionToImage(bgPath, duration);
    }

    // 4. Combine video + voice; optional music
    finalVideoPath = join(tmpdir(), `dadjoke-longform-final-${videoId}-${Date.now()}.mp4`);
    const musicChannelId = await resolveDadJokeMusicChannelId(businessId, channelId);
    const musicTrack = await getRandomMusicTrack(businessId, musicChannelId);
    if (musicTrack) musicPath = await prepareMusicTrack(musicTrack.url, duration);

    const voiceFilter = `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=1.2`;
    if (musicPath) {
      await execAsync(
        `"ffmpeg" -i "${motionPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "${voiceFilter}[voice];[2:a]volume=0.12[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${duration} -y "${finalVideoPath}"`,
        { timeout: 600000, windowsHide: true }
      );
    } else {
      await execAsync(
        `"ffmpeg" -i "${motionPath}" -i "${audioPath}" -filter_complex "${voiceFilter}[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${duration} -y "${finalVideoPath}"`,
        { timeout: 600000, windowsHide: true }
      );
    }

    const storageUrl = await uploadLongformVideoToStorage(businessId, videoId, finalVideoPath);
    if (!storageUrl) throw new Error('Long-form storage upload failed');

    await supabaseClient.from('orbix_longform_videos').update({
      render_status: 'COMPLETED',
      video_path: storageUrl,
      video_storage_path: `${businessId}/longform/${videoId}.mp4`,
      duration_seconds: duration,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId);

    writeProgressLog('DADJOKE_LONGFORM_RENDER_DONE', { videoId, url: storageUrl });
    return { status: 'COMPLETED', outputUrl: storageUrl };
  } catch (error) {
    const errMsg = error?.message || 'Render failed';
    console.error(`[Dad Joke Long-form Renderer] FAILED video_id=${videoId}`, errMsg);
    const renderError = String(errMsg).slice(0, 2000);
    await supabaseClient.from('orbix_longform_videos').update({
      render_status: 'FAILED',
      render_error: renderError,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId);
    return { status: 'FAILED', error: errMsg };
  } finally {
    for (const p of [bgPath, motionPath, audioPath, musicPath, finalVideoPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
