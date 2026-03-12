/**
 * Orbix Facts Render Pipeline
 * 30s format: background + motion, centered fact text (larger font), TTS for fact, optional music.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { supabaseClient } from '../../config/database.js';
import { ffmpegPath } from './ffmpeg-path.js';
import {
  getBackgroundImageUrl,
  getRandomMusicTrack,
  prepareMusicTrack,
  applyMotionToImage,
  generateFactsASSFile,
  generateFactsAudio,
  uploadRenderToStorage
} from './video-renderer.js';
import { buildYouTubeMetadata } from './youtube-metadata.js';
import { writeProgressLog, setCurrentRender } from '../../utils/crash-and-progress-log.js';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

const DURATION = 30;

/**
 * Process a facts render job (separate pipeline from news/psychology/trivia).
 */
export async function processFactsRenderJob(render, story, script) {
  const renderId = render.id;
  const businessId = render.business_id;
  const channelId = story?.channel_id ?? null;

  writeProgressLog('FACTS_RENDER_START', { renderId });
  setCurrentRender(renderId, 'FACTS_RENDER');

  const content = script?.content_json
    ? (typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json)
    : {};
  const title = (content?.title || script?.hook || 'Did you know?').trim().slice(0, 60);
  const factText = (content?.fact_text || script?.what_happened || '').trim().slice(0, 200);
  const ttsScript = (content?.tts_script || factText || '').trim().slice(0, 300);

  const backgroundStoragePath = render.background_storage_path ?? null;
  const backgroundId = render.background_id ?? 1;

  let bgPath;
  let motionPath;
  let audioPath;
  let musicPath;
  let baseVideoPath;
  let finalVideoPath;

  try {
    // 1. Download background
    const imageUrl = await getBackgroundImageUrl(backgroundId, backgroundStoragePath);
    const axios = (await import('axios')).default;
    const fs = (await import('fs')).default;
    bgPath = join(tmpdir(), `facts-bg-${renderId}-${Date.now()}.png`);
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.promises.writeFile(bgPath, imgResp.data);

    // 2. Apply motion to background (creates 30s video)
    motionPath = await applyMotionToImage(bgPath, DURATION);

    // 3. Generate ASS overlay (centered fact text)
    const assFilePath = await generateFactsASSFile(
      { title, factText },
      DURATION
    );

    const simpleAssPath = join(tmpdir(), `facts-ass-${renderId}-${Date.now()}.ass`);
    await fs.promises.copyFile(assFilePath, simpleAssPath);
    const simpleAssPathEscaped = simpleAssPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // No black overlay — text uses heavy outline+shadow for readability over any background colour
    baseVideoPath = join(tmpdir(), `facts-base-${renderId}-${Date.now()}.mp4`);
    const filterComplex = `[0:v]ass='${simpleAssPathEscaped}'[vout]`;
    await execAsync(
      `"${ffmpegPath}" -i "${motionPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset medium -crf 23 -c:a copy -t ${DURATION} -pix_fmt yuv420p -y "${baseVideoPath}"`,
      { timeout: 120000 }
    );

    try { await unlinkAsync(assFilePath); } catch (_) {}
    try { await unlinkAsync(simpleAssPath); } catch (_) {}

    // 5. Generate facts TTS
    const audioResult = await generateFactsAudio(
      { tts_script: ttsScript },
      DURATION
    );
    audioPath = audioResult.audioPath;
    const audioDuration = audioResult.duration;

    // 6. Mix voice + optional music
    const padDur = Math.max(0, DURATION - audioDuration);
    finalVideoPath = join(tmpdir(), `facts-final-${renderId}-${Date.now()}.mp4`);

    const musicTrack = await getRandomMusicTrack(businessId, channelId);
    if (musicTrack) {
      musicPath = await prepareMusicTrack(musicTrack.url, DURATION);
    }

    if (musicPath) {
      await execAsync(
        `"${ffmpegPath}" -i "${baseVideoPath}" -i "${audioPath}" -i "${musicPath}" -filter_complex "[1:a]apad=pad_len=${Math.round(padDur * 24000)},volume=1.5625[voice];[2:a]volume=0.140625[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    } else {
      await execAsync(
        `"${ffmpegPath}" -i "${baseVideoPath}" -i "${audioPath}" -filter_complex "[1:a]apad=pad_len=${Math.round(padDur * 24000)},volume=1.5625[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t ${DURATION} -y "${finalVideoPath}"`,
        { timeout: 60000 }
      );
    }

    // 7. Metadata
    const { title: ytTitle, description, hashtags } = buildYouTubeMetadata(story, script, renderId);
    await supabaseClient
      .from('orbix_renders')
      .update({
        youtube_title: ytTitle,
        youtube_description: description,
        hashtags: hashtags,
        render_step: 'FACTS_RENDER',
        step_progress: 100,
        step_completed_at: new Date().toISOString()
      })
      .eq('id', renderId);

    // 8. Upload to storage
    const storageUrl = await uploadRenderToStorage(businessId, renderId, finalVideoPath);
    if (!storageUrl) throw new Error('Storage upload failed');

    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'READY_FOR_UPLOAD',
        output_url: storageUrl,
        step_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', renderId);

    writeProgressLog('FACTS_RENDER_DONE', { renderId, url: storageUrl });
    return { status: 'RENDER_COMPLETE', outputUrl: storageUrl, renderId };
  } catch (error) {
    console.error(`[Facts Renderer] FAILED render_id=${renderId}`, error.message);
    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'STEP_FAILED',
        step_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', renderId);
    throw error;
  } finally {
    for (const p of [bgPath, motionPath, audioPath, musicPath, baseVideoPath, finalVideoPath].filter(Boolean)) {
      try { await unlinkAsync(p); } catch (_) {}
    }
  }
}
