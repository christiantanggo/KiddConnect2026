/**
 * Orbix Long-Form API: puzzle library and long-form video CRUD.
 * Mounted at /api/v2/orbix-network/longform — additive only, no changes to existing Orbix Shorts routes.
 * Dad joke long-form: /longform/dadjoke/* (jokes, generate-script, videos, start-render, reset-render).
 */

import express from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import {
  listPuzzles,
  getPuzzleById,
  getPuzzleExplanation,
  listLongformVideos,
  getLongformVideoById,
  createLongformVideo,
} from '../../services/orbix-network/longform-puzzles.js';
import {
  listDadJokesForLongform,
  generateLongformDadJokeScript,
  createLongformDadJokeVideo,
  updateLongformDadJokeScript,
  generateAndSaveLongformDadJokeBackground,
  uploadLongformDadJokeSegmentImage,
} from '../../services/orbix-network/longform-dadjoke.js';
import { sanitizeScriptForTTS } from '../../services/orbix-network/longform-script-sanitizer.js';
import { buildYouTubeMetadata } from '../../services/orbix-network/youtube-metadata.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB for segment images
const router = express.Router();
router.use(authenticate);
router.use(requireBusinessContext);

async function requireChannelId(req) {
  const channelId = req.query.channel_id || req.body?.channel_id;
  if (!channelId) {
    const err = new Error('channel_id is required (query or body)');
    err.status = 400;
    throw err;
  }
  const businessId = req.active_business_id;
  const { data: channel, error } = await supabaseClient
    .from('orbix_channels')
    .select('id')
    .eq('id', channelId)
    .eq('business_id', businessId)
    .single();
  if (error || !channel) {
    const err = new Error('Invalid or unauthorized channel');
    err.status = 404;
    throw err;
  }
  return channelId;
}

/**
 * GET /api/v2/orbix-network/longform/puzzles
 * List puzzles for the channel (puzzle library). Query: channel_id, type?, family?, used_in_longform? (true|false)
 */
router.get('/puzzles', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const usedFilter = req.query.used_in_longform;
    const filters = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.family) filters.family = req.query.family;
    if (usedFilter === 'true') filters.used_in_longform = true;
    if (usedFilter === 'false') filters.used_in_longform = false;
    const { puzzles, usageMap } = await listPuzzles(businessId, channelId, filters);
    res.json({
      puzzles: puzzles.map((p) => ({
        ...p,
        longform_usage_count: (usageMap[p.id] && usageMap[p.id].count != null) ? usageMap[p.id].count : 0,
        longform_video_titles: (usageMap[p.id] && usageMap[p.id].videoTitles != null) ? usageMap[p.id].videoTitles : [],
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/v2/orbix-network/longform/puzzles/:id
 * Get one puzzle and optional explanation. Query: channel_id (required)
 */
router.get('/puzzles/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const puzzle = await getPuzzleById(req.params.id, businessId, channelId);
    const explanation = await getPuzzleExplanation(req.params.id);
    res.json({ puzzle, explanation: explanation || null });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/v2/orbix-network/longform/videos
 * List long-form videos for the channel. Query: channel_id
 */
router.get('/videos', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videos = await listLongformVideos(businessId, channelId);
    res.json({ videos });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/v2/orbix-network/longform/videos/:id
 * Get one long-form video with linked puzzles and settings. Query: channel_id (optional; when provided, video must belong to that channel or have null channel)
 */
router.get('/videos/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = req.query.channel_id || req.body?.channel_id || null;
    const video = await getLongformVideoById(req.params.id, businessId, channelId);
    res.json(video);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/videos
 * Create a long-form video record and link puzzles. Body: channel_id, title?, subtitle?, hook_text?, description?, puzzle_ids[], puzzle_settings? { [puzzle_id]: { include_puzzle, include_timer, timer_seconds, reveal_answer_before_explanation, include_explanation, narration_style } }
 */
router.post('/videos', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const video = await createLongformVideo(businessId, channelId, req.body);
    res.status(201).json(video);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ——— Dad joke long-form (Dad Jokes channel only) ———

/**
 * GET /api/v2/orbix-network/longform/dadjoke/jokes
 * List dad joke stories (setup/punchline) for this channel to pick as long-form punchline.
 */
router.get('/dadjoke/jokes', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const jokes = await listDadJokesForLongform(businessId, channelId);
    res.json({ jokes });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/generate-script
 * Body: channel_id, story_id, dad_activity? (optional)
 */
router.post('/dadjoke/generate-script', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const body = req.body || {};
    const script = await generateLongformDadJokeScript(businessId, channelId, {
      story_id: body.story_id,
      dad_activity: body.dad_activity,
    });
    res.json(script);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos
 * Body: channel_id, story_id, title?, subtitle?, hook_text?, description?, script_json?
 */
router.post('/dadjoke/videos', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const video = await createLongformDadJokeVideo(businessId, channelId, req.body);
    res.status(201).json(video);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/generate-background
 * Generate 5 DALL-E background images for the video.
 */
router.post('/dadjoke/videos/:id/generate-background', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videoId = req.params.id;
    const result = await generateAndSaveLongformDadJokeBackground(videoId, businessId, channelId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/segment-image
 * Multipart: file, segment_key (e.g. cold_open, act_1_setup).
 */
router.post('/dadjoke/videos/:id/segment-image', upload.single('file'), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videoId = req.params.id;
    const segmentKey = req.body?.segment_key || req.body?.segmentKey;
    if (!segmentKey || !req.file?.buffer) {
      return res.status(400).json({ error: 'file and segment_key are required' });
    }
    const result = await uploadLongformDadJokeSegmentImage(
      videoId,
      businessId,
      channelId,
      segmentKey,
      req.file.buffer,
      req.file.mimetype || 'image/png'
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * PATCH /api/v2/orbix-network/longform/dadjoke/videos/:id/script
 * Update full_script in script_json for this video. Body: { full_script: string }. Query/body: channel_id.
 */
router.patch('/dadjoke/videos/:id/script', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = req.query.channel_id || (req.body && req.body.channel_id != null ? req.body.channel_id : null);
    const videoId = req.params.id;
    const full_script = req.body?.full_script;
    if (typeof full_script !== 'string') {
      return res.status(400).json({ error: 'full_script (string) is required' });
    }
    const result = await updateLongformDadJokeScript(videoId, businessId, channelId, { full_script });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/rewrite-script
 * Rewrite full_script by removing labels (Cold Open, Act 1, Beat, [pause], etc.) so they are not spoken by TTS.
 * Saves the cleaned script and returns updated script_json. Query: channel_id.
 */
router.post('/dadjoke/videos/:id/rewrite-script', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videoId = req.params.id;
    const { data: video, error: videoErr } = await supabaseClient
      .from('orbix_longform_videos')
      .select('id')
      .eq('id', videoId)
      .eq('business_id', businessId)
      .single();
    if (videoErr || !video) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    const { data: dadjokeRow, error: dataErr } = await supabaseClient
      .from('orbix_longform_dadjoke_data')
      .select('script_json')
      .eq('longform_video_id', videoId)
      .maybeSingle();
    if (dataErr || !dadjokeRow?.script_json) {
      return res.status(400).json({ error: 'Video has no script. Generate a script first.' });
    }
    const scriptJson = typeof dadjokeRow.script_json === 'object'
      ? dadjokeRow.script_json
      : (() => { try { return JSON.parse(dadjokeRow.script_json); } catch { return {}; } })();
    const rawScript = (scriptJson.full_script || '').trim();
    if (!rawScript) {
      return res.status(400).json({ error: 'Script has no full_script to rewrite.' });
    }
    const cleanedScript = sanitizeScriptForTTS(rawScript);
    const result = await updateLongformDadJokeScript(videoId, businessId, channelId, { full_script: cleanedScript });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/start-render
 * Set status to PROCESSING and run the long-form render job (can take many minutes).
 * Finds video by id + business + channel (or null channel). Treats as dad joke if longform_type is 'dadjoke' or has orbix_longform_dadjoke_data.
 */
router.post('/dadjoke/videos/:id/start-render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videoId = req.params.id;
    const { data: video, error: videoErr } = await supabaseClient
      .from('orbix_longform_videos')
      .select('*')
      .eq('id', videoId)
      .eq('business_id', businessId)
      .single();
    if (videoErr || !video) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    if (video.channel_id != null && video.channel_id !== channelId) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    let dadjokeRow;
    try {
      const { data, error: dataErr } = await supabaseClient
        .from('orbix_longform_dadjoke_data')
        .select('script_json')
        .eq('longform_video_id', videoId)
        .maybeSingle();
      if (dataErr || !data) {
        return res.status(400).json({ error: 'Video has no script data. Generate script and create video first.' });
      }
      dadjokeRow = data;
    } catch (tableErr) {
      console.error('[longform/dadjoke start-render] orbix_longform_dadjoke_data query failed:', tableErr?.message || tableErr);
      return res.status(500).json({
        error: 'Could not load video script data. Ensure migration add_orbix_longform_dadjoke.sql has been run.',
        details: tableErr?.message || String(tableErr),
      });
    }
    if (video.render_status === 'PROCESSING' || video.render_status === 'RENDERING') {
      return res.status(409).json({ error: 'Render already in progress. Use "Reset render" to cancel and try again.' });
    }
    // Run render in a separate process so the main server never loads the heavy renderer (avoids 503 on import)
    const { spawn } = await import('child_process');
    const pathMod = await import('path');
    const path = pathMod.default || pathMod;
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = path.resolve(__dirname, '../../scripts/run-longform-dadjoke-render.js');
    const child = spawn(process.execPath, [scriptPath, videoId], {
      cwd: path.resolve(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      windowsHide: true,
      env: { ...process.env },
    });
    child.unref();
    child.stdout?.on('data', (chunk) => console.log('[longform-render]', chunk.toString().trim()));
    child.stderr?.on('data', (chunk) => console.error('[longform-render]', chunk.toString().trim()));
    child.on('error', (err) => {
      console.error('[longform/dadjoke start-render] Spawn error:', err?.message || err);
    });
    res.status(202).json({ success: true, message: 'Render started. This may take several minutes.' });
  } catch (err) {
    console.error('[longform/dadjoke start-render] Error:', err?.message || err);
    res.status(err.status || 500).json({ error: err.message || 'Start render failed' });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/upload-to-youtube
 * Upload the completed long-form video to YouTube (channel's Manual-tab OAuth).
 * Uses same metadata as shorts: buildYouTubeMetadata (dad joke title/description/hashtags), tags from hashtags. Query: channel_id.
 */
router.post('/dadjoke/videos/:id/upload-to-youtube', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videoId = req.params.id;
    const { data: video, error: videoErr } = await supabaseClient
      .from('orbix_longform_videos')
      .select('id, video_path, title, subtitle, hook_text, description, channel_id')
      .eq('id', videoId)
      .eq('business_id', businessId)
      .single();
    if (videoErr || !video) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    if (video.channel_id != null && video.channel_id !== channelId) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    if (!video.video_path?.trim()) {
      return res.status(400).json({ error: 'No video file to upload. Render the video first.' });
    }
    // Build metadata the same way shorts do: title, description, hashtags from youtube-metadata (dad joke rules)
    const { title: builtTitle, description: builtShortDescription, hashtags } = buildYouTubeMetadata(
      { category: 'dadjoke', title: video.title },
      {},
      videoId
    );
    const title = (builtTitle || video.title || 'Dad Joke').trim().slice(0, 100);
    const descParts = [video.subtitle, video.hook_text, video.description].filter(Boolean);
    const descriptionBody = descParts.length ? descParts.join('\n\n').trim().slice(0, 4500) : builtShortDescription;
    const descriptionForYouTube = (descriptionBody || '').trim() + (hashtags ? '\n\n' + hashtags.trim() : '');
    const tags = (hashtags || '')
      .split(/\s+/)
      .filter(t => t.startsWith('#') && t.length > 1)
      .map(t => t.replace(/^#/, ''))
      .slice(0, 15);
    const metadata = { title, description: descriptionForYouTube, tags };
    res.status(202).json({ message: 'YouTube upload started. This may take a few minutes.' });
    const { publishVideo } = await import('../../services/orbix-network/youtube-publisher.js');
    publishVideo(businessId, videoId, video.video_path, metadata, { useManual: true, orbixChannelId: channelId })
      .then((result) => {
        console.log('[longform/upload-to-youtube] Done', videoId, result?.videoId, result?.url);
      })
      .catch((err) => {
        console.error('[longform/upload-to-youtube] Failed', videoId, err?.message || err);
      });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Upload failed' });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/reset-render
 * Set render_status to FAILED so user can click "Start render" again. Use when stuck in PROCESSING.
 * Matches video by id + business + channel (or null channel); does not require longform_type so older videos work.
 */
router.post('/dadjoke/videos/:id/reset-render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
    const videoId = req.params.id;
    const { data: existing } = await supabaseClient
      .from('orbix_longform_videos')
      .select('id')
      .eq('id', videoId)
      .eq('business_id', businessId)
      .single();
    if (!existing) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    const { data: row } = await supabaseClient
      .from('orbix_longform_videos')
      .select('channel_id')
      .eq('id', videoId)
      .single();
    if (row?.channel_id != null && row.channel_id !== channelId) {
      return res.status(404).json({ error: 'Long-form video not found' });
    }
    const { error } = await supabaseClient
      .from('orbix_longform_videos')
      .update({
        render_status: 'FAILED',
        render_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)
      .eq('business_id', businessId);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
