/**
 * Dad Joke Studio — FFmpeg render (KiddConnect module, not Orbix).
 * shorts_classic_loop: same pipeline as Orbix dad-joke Shorts (dadjoke-renderer.js).
 * Other formats: generic motion background + TTS or silent + optional music.
 */
import { spawn } from 'child_process';
import { unlink } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import axios from 'axios';
import { supabaseClient } from '../../config/database.js';
import {
  applyMotionToImage,
  prepareMusicTrack,
  generateLongformTTS,
} from '../orbix-network/video-renderer.js';
import { renderOrbixStyleDadJokeShortToFile } from '../orbix-network/dadjoke-renderer.js';
import { resolveDadJokeStudioRenderMedia } from './asset-resolver.js';

const unlinkAsync = promisify(unlink);

const RENDERS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_DADJOKE_STUDIO_RENDERS || 'dadjoke-studio-renders';
const ASSETS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_DADJOKE_STUDIO_ASSETS || 'dadjoke-studio-assets';

function runFfmpegSpawn(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => {
      if (code === 0) return resolve();
      const msg = signal ? `ffmpeg exited with signal ${signal}` : `ffmpeg exited with code ${code}`;
      reject(new Error(`${msg}${stderr ? '\n' + stderr.slice(-2000) : ''}`));
    });
  });
}

function wordCount(s) {
  return (String(s || '').trim().split(/\s+/).filter(Boolean).length) || 0;
}

function mergeRenderConfig(formatRow, assetSnapshot) {
  const defaults = formatRow?.render_defaults && typeof formatRow.render_defaults === 'object'
    ? formatRow.render_defaults
    : {};
  const snap = assetSnapshot && typeof assetSnapshot === 'object' ? assetSnapshot : {};
  return {
    font_family: snap.font_family || defaults.font_family || 'Arial',
    text_color: snap.text_color || defaults.text_color || '#ffffff',
    voice_enabled: snap.voice_enabled !== undefined ? !!snap.voice_enabled : (defaults.voice_enabled !== false),
    motion: snap.motion || defaults.motion || 'orbix_vertical',
    music_public_url: snap.music_public_url || null,
    background_public_url: snap.background_public_url || null,
  };
}

async function downloadToTmp(url, ext) {
  const fs = (await import('fs')).default;
  const p = join(tmpdir(), `djs-bg-${Date.now()}.${ext}`);
  const resp = await axios.get(url.split('?')[0], { responseType: 'arraybuffer', timeout: 60000 });
  await fs.promises.writeFile(p, resp.data);
  return p;
}

async function resolveBackgroundLocalFromUrl(url) {
  const u = url && String(url).trim();
  if (!u) throw new Error('Background image URL is required for this format.');
  const pathPart = u.split('?')[0].toLowerCase();
  const ext = pathPart.endsWith('.jpg') || pathPart.endsWith('.jpeg')
    ? 'jpg'
    : pathPart.endsWith('.webp')
      ? 'webp'
      : 'png';
  return downloadToTmp(u, ext);
}

async function resolveBackgroundLocal(businessId, cfg) {
  if (cfg.background_public_url) {
    return downloadToTmp(cfg.background_public_url, 'png');
  }
  const id = 1 + Math.floor(Math.random() * 12);
  const path = `Photo${id}.png`;
  const { data } = supabaseClient.storage.from(BG_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not resolve background URL');
  return downloadToTmp(data.publicUrl, 'png');
}

function estimateSilentDuration(script, targetSec, maxSec) {
  const w = wordCount(script);
  const fromWords = Math.max(8, Math.ceil(w / 2.4));
  return Math.min(maxSec, Math.max(6, Math.max(fromWords, targetSec * 0.6)));
}

async function buildLandscapeVideo(imagePath, duration, width, height) {
  const videoPath = join(tmpdir(), `djs-land-${Date.now()}.mp4`);
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  await runFfmpegSpawn([
    '-loop', '1', '-i', imagePath,
    '-vf', vf,
    '-t', String(duration),
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-y', videoPath,
  ]);
  return videoPath;
}

async function silentAudioMp3(duration, outPath) {
  await runFfmpegSpawn([
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(duration),
    '-c:a', 'libmp3lame', '-b:a', '128k',
    '-y', outPath,
  ]);
}

/** Match Orbix script.content_json fields for dad joke Shorts. */
function parseClassicLoopPayload(content) {
  let cj = content.content_json;
  if (typeof cj === 'string') {
    try { cj = JSON.parse(cj); } catch { cj = {}; }
  }
  if (!cj || typeof cj !== 'object') cj = {};

  let setup = String(cj.setup || '').trim();
  let punchline = String(cj.punchline || '').trim();

  if (!setup || !punchline) {
    const text = (content.script_text || '').trim();
    const punchMatch = text.match(/punchline\s*:\s*(.+?)(?:\n\n|\n*$)/is);
    const setupMatch = text.match(/setup\s*:\s*(.+?)(?:\n\n|punchline\s*:)/is);
    if (setupMatch && punchMatch) {
      setup = setup || setupMatch[1].trim();
      punchline = punchline || punchMatch[1].trim();
    } else {
      const parts = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        setup = setup || parts[0];
        punchline = punchline || parts.slice(1).join(' ');
      }
    }
  }

  const ep = cj.episode_number;
  const episodeNum = typeof ep === 'number' ? ep : (parseInt(ep, 10) || 0);

  return {
    setup,
    punchline,
    voice_script: String(cj.voice_script || '').trim() || undefined,
    hook: String(cj.hook || '').trim() || undefined,
    episode_number: episodeNum,
    backgroundId: cj.background_id != null ? Number(cj.background_id) : 1,
    backgroundStoragePath: cj.background_storage_path ? String(cj.background_storage_path) : null,
  };
}

async function finalizeStudioRender({
  renderOutputId,
  content,
  formatRow,
  localFilePath,
  durationSec,
  width,
  height,
}) {
  const fs = (await import('fs')).default;
  const buffer = await fs.promises.readFile(localFilePath);
  const remotePath = `${content.business_id}/${content.id}/${renderOutputId}.mp4`;
  const { data: up, error: upErr } = await supabaseClient.storage
    .from(RENDERS_BUCKET)
    .upload(remotePath, buffer, { contentType: 'video/mp4', upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data: pub } = supabaseClient.storage.from(RENDERS_BUCKET).getPublicUrl(up.path);
  const outputUrl = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;

  await supabaseClient
    .from('dadjoke_studio_rendered_outputs')
    .update({
      render_status: 'READY',
      output_url: outputUrl,
      output_storage_path: up.path,
      duration_sec: durationSec,
      width,
      height,
      fps: Number(formatRow.default_fps) || 30,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', renderOutputId);

  await supabaseClient
    .from('dadjoke_studio_generated_content')
    .update({
      status: 'RENDERED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', content.id);

  return { outputUrl, durationSec };
}

/**
 * @param {string} renderOutputId
 */
export async function processDadJokeStudioRender(renderOutputId) {
  const { data: renderRow, error: rErr } = await supabaseClient
    .from('dadjoke_studio_rendered_outputs')
    .select('*')
    .eq('id', renderOutputId)
    .single();
  if (rErr || !renderRow) throw new Error('Render row not found');

  const { data: content, error: cErr } = await supabaseClient
    .from('dadjoke_studio_generated_content')
    .select('*')
    .eq('id', renderRow.generated_content_id)
    .single();
  if (cErr || !content) throw new Error('Generated content not found');

  const { data: formatRow, error: fErr } = await supabaseClient
    .from('dadjoke_studio_formats')
    .select('*')
    .eq('id', content.format_id)
    .single();
  if (fErr || !formatRow) throw new Error('Format not found');

  const businessId = content.business_id;

  await supabaseClient
    .from('dadjoke_studio_rendered_outputs')
    .update({ render_status: 'RENDERING', updated_at: new Date().toISOString() })
    .eq('id', renderOutputId);

  await supabaseClient
    .from('dadjoke_studio_generated_content')
    .update({ status: 'RENDERING', updated_at: new Date().toISOString() })
    .eq('id', content.id);

  const markFailed = async (msg) => {
    await supabaseClient
      .from('dadjoke_studio_rendered_outputs')
      .update({ render_status: 'FAILED', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', renderOutputId);
    await supabaseClient
      .from('dadjoke_studio_generated_content')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', content.id);
  };

  // ─── Classic Loop: same TTS timing as Orbix; ASS uses dashboard preview style ───
  if (formatRow.format_key === 'shorts_classic_loop') {
    if (!process.env.OPENAI_API_KEY) {
      await markFailed('OPENAI_API_KEY is required for Classic Loop (Orbix-style TTS timing).');
      throw new Error('OPENAI_API_KEY is required for Classic Loop.');
    }
    const parsed = parseClassicLoopPayload(content);
    if (!parsed.setup || !parsed.punchline) {
      await markFailed('Classic Loop needs setup + punchline in content_json (generate with Classic format) or script_text with Setup:/Punchline: blocks.');
      throw new Error('Classic Loop requires setup and punchline.');
    }
    let localPath = null;
    try {
      const media = await resolveDadJokeStudioRenderMedia({
        supabaseClient,
        assetsBucket: ASSETS_BUCKET,
        businessId,
        content,
      });
      const { localPath: lp, duration } = await renderOrbixStyleDadJokeShortToFile({
        businessId,
        setup: parsed.setup,
        punchline: parsed.punchline,
        voice_script: parsed.voice_script,
        hook: parsed.hook,
        episode_number: parsed.episode_number,
        backgroundId: parsed.backgroundId,
        backgroundStoragePath: null,
        backgroundImageUrl: media.background_public_url,
        musicTrackUrl: media.music_public_url || null,
        orbixChannelIdForMusic: null,
        allowOrbixBackgroundFallback: false,
        allowOrbixMusicFallback: false,
        assStyle: 'dashboard',
        tempId: `djs-${renderOutputId}`,
      });
      localPath = lp;
      const out = await finalizeStudioRender({
        renderOutputId,
        content,
        formatRow,
        localFilePath: localPath,
        durationSec: duration,
        width: 1080,
        height: 1920,
      });
      console.log(`[DadJokeStudio Renderer] Classic Loop done render_output_id=${renderOutputId}`);
      return out;
    } catch (err) {
      console.error(`[DadJokeStudio Renderer] Classic Loop FAILED ${renderOutputId}`, err.message);
      await markFailed(err.message);
      throw err;
    } finally {
      if (localPath) {
        try { await unlinkAsync(localPath); } catch (_) {}
      }
    }
  }

  // ─── Generic formats ───
  const script = (content.script_text || '').trim();
  if (!script) {
    await markFailed('No script text to render');
    throw new Error('No script text to render');
  }

  const media = await resolveDadJokeStudioRenderMedia({
    supabaseClient,
    assetsBucket: ASSETS_BUCKET,
    businessId,
    content,
  });
  const cfg = mergeRenderConfig(formatRow, {
    ...(content.asset_snapshot && typeof content.asset_snapshot === 'object' ? content.asset_snapshot : {}),
    background_public_url: media.background_public_url,
    music_public_url: media.music_public_url || null,
  });
  const target = Number(formatRow.target_duration_sec) || 30;
  const maxDur = Number(formatRow.max_duration_sec) || 60;
  const w = Number(formatRow.default_width) || 1080;
  const h = Number(formatRow.default_height) || 1920;
  const orientation = formatRow.orientation;

  let bgLocal = null;
  let baseVideoPath = null;
  let audioPath = null;
  let musicPath = null;
  let finalPath = null;
  let silentMp3 = null;

  try {
    bgLocal = await resolveBackgroundLocalFromUrl(cfg.background_public_url);

    let durationSec;
    const voiceOn = cfg.voice_enabled && !!process.env.OPENAI_API_KEY;

    if (voiceOn) {
      const tts = await generateLongformTTS(script);
      audioPath = tts.audioPath;
      durationSec = Math.min(maxDur, Math.max(5, tts.duration || estimateSilentDuration(script, target, maxDur)));
      if (tts.duration > maxDur + 1) {
        const trimmed = join(tmpdir(), `djs-audio-trim-${Date.now()}.mp3`);
        await runFfmpegSpawn(['-i', audioPath, '-t', String(maxDur), '-y', trimmed]);
        try { await unlinkAsync(audioPath); } catch (_) {}
        audioPath = trimmed;
        durationSec = maxDur;
      }
    } else {
      durationSec = estimateSilentDuration(script, target, maxDur);
      durationSec = Math.min(maxDur, durationSec);
      silentMp3 = join(tmpdir(), `djs-silent-${Date.now()}.mp3`);
      await silentAudioMp3(durationSec, silentMp3);
      audioPath = silentMp3;
    }

    if (orientation === 'vertical_9_16') {
      baseVideoPath = await applyMotionToImage(bgLocal, durationSec);
    } else {
      baseVideoPath = await buildLandscapeVideo(bgLocal, durationSec, w, h);
    }

    if (cfg.music_public_url) {
      musicPath = await prepareMusicTrack(cfg.music_public_url, durationSec);
    }

    finalPath = join(tmpdir(), `djs-final-${Date.now()}.mp4`);
    if (musicPath) {
      await runFfmpegSpawn([
        '-i', baseVideoPath,
        '-i', audioPath,
        '-i', musicPath,
        '-filter_complex',
        '[1:a]volume=1[voice];[2:a]volume=0.14[mus];[voice][mus]amix=inputs=2:duration=first:dropout_transition=2[aout]',
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', String(durationSec),
        '-y', finalPath,
      ]);
    } else {
      await runFfmpegSpawn([
        '-i', baseVideoPath,
        '-i', audioPath,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-y', finalPath,
      ]);
    }

    const out = await finalizeStudioRender({
      renderOutputId,
      content,
      formatRow,
      localFilePath: finalPath,
      durationSec,
      width: w,
      height: h,
    });
    console.log(`[DadJokeStudio Renderer] Done render_output_id=${renderOutputId}`);
    return out;
  } catch (err) {
    console.error(`[DadJokeStudio Renderer] FAILED ${renderOutputId}`, err.message);
    await markFailed(err.message);
    throw err;
  } finally {
    const paths = [bgLocal, baseVideoPath, musicPath, finalPath, silentMp3].filter(Boolean);
    for (const p of paths) {
      try { await unlinkAsync(p); } catch (_) {}
    }
    if (audioPath && audioPath !== silentMp3) {
      try { await unlinkAsync(audioPath); } catch (_) {}
    }
  }
}
