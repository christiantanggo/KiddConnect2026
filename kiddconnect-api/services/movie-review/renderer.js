/**
 * Movie Review Studio — FFmpeg Renderer
 * Renders a 1080x1920 vertical Short from:
 *  - voice recording (mandatory)
 *  - image clips with motion presets
 *  - text overlays with time ranges
 *  - optional background music
 *
 * Output: uploaded to Supabase Storage → movie-review-renders bucket
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { supabaseClient } from '../../config/database.js';

const execAsync = promisify(exec);
const writeAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const readAsync  = promisify(readFile);

const RENDER_BUCKET = 'movie-review-renders';
const WIDTH  = 1080;
const HEIGHT = 1920;
const FPS    = 30;

// ─── Progress helper ──────────────────────────────────────────────────────────

async function setProgress(renderId, progress, status) {
  try {
    await supabaseClient
      .from('movie_review_renders')
      .update({ progress, ...(status ? { status } : {}), updated_at: new Date().toISOString() })
      .eq('id', renderId);
  } catch (e) {
    console.warn('[MovieReview Renderer] setProgress failed:', e.message);
  }
}

// ─── Duration via ffprobe ─────────────────────────────────────────────────────

async function getDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams "${filePath}"`
    );
    const info = JSON.parse(stdout);
    const stream = info.streams?.find(s => s.duration) || info.streams?.[0];
    return stream?.duration ? parseFloat(stream.duration) : null;
  } catch {
    return null;
  }
}

// ─── Download file from URL to tmp ───────────────────────────────────────────

async function downloadToTmp(url, ext) {
  const tmpPath = join(tmpdir(), `mr-${randomUUID()}.${ext}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${url} → ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeAsync(tmpPath, buf);
  return tmpPath;
}

// ─── Motion preset → FFmpeg zoompan/crop filter ──────────────────────────────

function motionFilter(preset, duration) {
  const frames = Math.ceil(duration * FPS);
  // Scale to fill (cover) the frame first so no black bars appear, then apply motion.
  // force_original_aspect_ratio=increase ensures the image covers the full canvas,
  // then crop trims any overflow from the centre.
  const coverScale = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`;
  switch (preset) {
    case 'ZOOM_OUT':
      return `scale=8000:-1,zoompan=z='if(lte(zoom,1.0),1.3,max(1.0,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
    case 'PAN_LEFT':
      return `${coverScale},scale=${WIDTH * 2}:${HEIGHT},crop=${WIDTH}:${HEIGHT}:'t/${duration}*(iw-${WIDTH})':0`;
    case 'PAN_RIGHT':
      return `${coverScale},scale=${WIDTH * 2}:${HEIGHT},crop=${WIDTH}:${HEIGHT}:'(iw-${WIDTH})-(t/${duration}*(iw-${WIDTH}))':0`;
    case 'ZOOM_IN':
    default:
      return `scale=8000:-1,zoompan=z='min(zoom+0.0015,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
  }
}

// ─── Text overlay → drawtext filter string ───────────────────────────────────

function drawtextFilter(item, overlayOn) {
  const safeText = (item.text_content || '').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\n/g, ' ');
  const yMap = { TOP: 'h*0.08', CENTER: '(h-text_h)/2', BOTTOM: 'h*0.80' };
  const y = yMap[item.position_preset] || '(h-text_h)/2';
  const enable = `between(t,${item.start_time},${item.end_time})`;
  return `drawtext=text='${safeText}':fontsize=64:fontcolor=white:borderw=4:bordercolor=black@0.8:x=(w-text_w)/2:y=${y}:enable='${enable}'`;
}

// ─── Main render function ─────────────────────────────────────────────────────

export async function renderMovieReviewShort(renderId, projectId, businessId) {
  const tmpFiles = [];
  const cleanup = () => { tmpFiles.forEach(f => unlinkAsync(f).catch(() => {})); };

  console.log(`[MovieReview Renderer] Starting renderId=${renderId} projectId=${projectId}`);

  try {
    await setProgress(renderId, 2, 'RENDERING');

    // ── Load project + assets + timeline ──────────────────────────────────────
    const { data: project } = await supabaseClient
      .from('movie_review_projects')
      .select('*')
      .eq('id', projectId)
      .single();
    if (!project) throw new Error('Project not found');

    const { data: allAssets } = await supabaseClient
      .from('movie_review_assets')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index');

    const { data: timelineItems } = await supabaseClient
      .from('movie_review_timeline_items')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index');

    const assets = allAssets || [];
    const timeline = timelineItems || [];

    // Find voice asset
    const voiceAsset = assets.find(a => a.id === project.voice_asset_id);
    if (!voiceAsset?.public_url) throw new Error('Voice recording not found');

    // Find music asset
    const musicAsset = project.music_asset_id
      ? assets.find(a => a.id === project.music_asset_id)
      : null;

    await setProgress(renderId, 8);

    // ── Download voice to tmp ─────────────────────────────────────────────────
    const voiceExt = voiceAsset.public_url.split('.').pop()?.split('?')[0] || 'webm';
    const voicePath = await downloadToTmp(voiceAsset.public_url, voiceExt);
    tmpFiles.push(voicePath);

    const voiceDuration = await getDuration(voicePath) || project.max_duration_seconds;
    const duration = Math.min(voiceDuration, project.max_duration_seconds);

    await setProgress(renderId, 15);

    // ── Determine image clips from timeline ───────────────────────────────────
    const imageItems = timeline.filter(t => t.type === 'IMAGE');
    const textItems  = timeline.filter(t => t.type === 'TEXT');

    // If no timeline image items, fall back to all image assets evenly distributed
    let imageClips = []; // { assetId, url, startTime, endTime, motionPreset }
    if (imageItems.length > 0) {
      for (const item of imageItems) {
        const asset = assets.find(a => a.id === item.asset_id);
        if (asset?.public_url) {
          imageClips.push({
            assetId: asset.id,
            url: asset.public_url,
            startTime: item.start_time,
            endTime: Math.min(item.end_time, duration),
            motionPreset: item.motion_preset || 'ZOOM_IN',
          });
        }
      }
    } else {
      // Auto-distribute images
      const imageAssets = assets.filter(a => a.type === 'IMAGE');
      if (imageAssets.length > 0) {
        const segLen = duration / imageAssets.length;
        imageAssets.forEach((a, i) => {
          const motions = ['ZOOM_IN','ZOOM_OUT','PAN_LEFT','PAN_RIGHT'];
          imageClips.push({
            assetId: a.id,
            url: a.public_url,
            startTime: i * segLen,
            endTime: (i + 1) * segLen,
            motionPreset: motions[i % motions.length],
          });
        });
      }
    }

    await setProgress(renderId, 20);

    // ── If no images at all, generate a dark background ───────────────────────
    let inputs = [];
    let filterLines = [];
    let inputIdx = 0;

    // Voice input
    inputs.push(`-i "${voicePath}"`);
    const voiceInputIdx = inputIdx++;

    // ── Build image segments ──────────────────────────────────────────────────
    const segVideos = []; // tmp paths of per-clip motion videos

    for (let i = 0; i < imageClips.length; i++) {
      const clip = imageClips[i];
      const clipDur = Math.max(0.1, clip.endTime - clip.startTime);
      const imgExt = clip.url.split('.').pop()?.split('?')[0] || 'jpg';
      const imgPath = await downloadToTmp(clip.url, imgExt);
      tmpFiles.push(imgPath);

      const segPath = join(tmpdir(), `mr-seg-${randomUUID()}.mp4`);
      tmpFiles.push(segPath);

      const motion = motionFilter(clip.motionPreset, clipDur);
      const cmd = [
        'ffmpeg -y',
        `-loop 1 -t ${clipDur.toFixed(3)} -i "${imgPath}"`,
        `-vf "${motion},setsar=1"`,
        `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p`,
        `-t ${clipDur.toFixed(3)}`,
        `"${segPath}"`,
      ].join(' ');

      await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });
      segVideos.push({ path: segPath, startTime: clip.startTime, endTime: clip.endTime });

      await setProgress(renderId, 20 + Math.floor((i + 1) / imageClips.length * 35));
    }

    // ── Concatenate segment videos ────────────────────────────────────────────
    let bgVideoPath;
    if (segVideos.length > 0) {
      if (segVideos.length === 1) {
        bgVideoPath = segVideos[0].path;
      } else {
        // Create concat list file
        const listPath = join(tmpdir(), `mr-list-${randomUUID()}.txt`);
        tmpFiles.push(listPath);
        const listContent = segVideos.map(s => `file '${s.path.replace(/\\/g, '/')}'`).join('\n');
        await writeAsync(listPath, listContent);

        bgVideoPath = join(tmpdir(), `mr-bg-${randomUUID()}.mp4`);
        tmpFiles.push(bgVideoPath);
        await execAsync(
          `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${bgVideoPath}"`,
          { maxBuffer: 100 * 1024 * 1024 }
        );
      }
    } else {
      // Solid dark background
      bgVideoPath = join(tmpdir(), `mr-bg-${randomUUID()}.mp4`);
      tmpFiles.push(bgVideoPath);
      await execAsync(
        `ffmpeg -y -f lavfi -i color=c=0x1a1a2e:size=${WIDTH}x${HEIGHT}:rate=${FPS} -t ${duration.toFixed(3)} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${bgVideoPath}"`,
        { maxBuffer: 100 * 1024 * 1024 }
      );
    }

    await setProgress(renderId, 60);

    // ── Build final composite ─────────────────────────────────────────────────
    const outputPath = join(tmpdir(), `mr-out-${randomUUID()}.mp4`);
    tmpFiles.push(outputPath);

    // Build drawtext filters for text overlays
    const textFilters = textItems
      .filter(t => t.text_content?.trim())
      .map(t => drawtextFilter(t, '[vtmp]'))
      .join(',');

    // Inputs for final composite
    const finalInputs = [`-i "${bgVideoPath}"`, `-i "${voicePath}"`];
    let musicInputIdx = null;
    if (musicAsset?.public_url) {
      const musicExt = musicAsset.public_url.split('.').pop()?.split('?')[0] || 'mp3';
      const musicPath = await downloadToTmp(musicAsset.public_url, musicExt);
      tmpFiles.push(musicPath);
      finalInputs.push(`-i "${musicPath}"`);
      musicInputIdx = 2;
    }

    // Build video filter chain
    let vFilter = `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1`;
    if (textFilters) {
      vFilter += `,${textFilters}`;
    }
    vFilter += `[vout]`;

    // Build audio filter
    let aFilter;
    if (musicInputIdx !== null) {
      aFilter = `[1:a]volume=1.0[voice];[${musicInputIdx}:a]volume=0.15,apad[music];[voice][music]amix=inputs=2:duration=first[aout]`;
    } else {
      aFilter = `[1:a]volume=1.0[aout]`;
    }

    const filterComplex = `${vFilter};${aFilter}`;

    const finalCmd = [
      'ffmpeg -y',
      ...finalInputs,
      `-filter_complex "${filterComplex}"`,
      `-map "[vout]" -map "[aout]"`,
      `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p`,
      `-c:a aac -b:a 128k`,
      `-t ${duration.toFixed(3)}`,
      `-movflags +faststart`,
      `"${outputPath}"`,
    ].join(' ');

    await execAsync(finalCmd, { maxBuffer: 200 * 1024 * 1024 });

    await setProgress(renderId, 85);

    // ── Upload to Supabase Storage ────────────────────────────────────────────
    const videoBuffer = await readAsync(outputPath);
    const storagePath = `${businessId}/${projectId}/${renderId}.mp4`;

    const { error: uploadErr } = await supabaseClient.storage
      .from(RENDER_BUCKET)
      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabaseClient.storage.from(RENDER_BUCKET).getPublicUrl(storagePath);

    // ── Update records ────────────────────────────────────────────────────────
    await supabaseClient
      .from('movie_review_renders')
      .update({
        status: 'DONE',
        progress: 100,
        output_url: publicUrl,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', renderId);

    await supabaseClient
      .from('movie_review_projects')
      .update({
        status: 'READY',
        render_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    console.log(`[MovieReview Renderer] Done renderId=${renderId} url=${publicUrl}`);
    return publicUrl;

  } catch (err) {
    console.error(`[MovieReview Renderer] FAILED renderId=${renderId}:`, err.message);
    await supabaseClient
      .from('movie_review_renders')
      .update({
        status: 'FAILED',
        error_message: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', renderId);
    await supabaseClient
      .from('movie_review_projects')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', projectId);
    throw err;
  } finally {
    cleanup();
  }
}
