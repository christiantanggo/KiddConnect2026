/**
 * Orbix Long-Form API: puzzle library and long-form video CRUD.
 * Dad Jokes long-form: only for channels with DAD_JOKE_GENERATOR source (longform tab, dad channel only).
 * Mounted at /api/v2/orbix-network/longform — additive only, no changes to existing Orbix Shorts routes.
 */

import express from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
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
  generateAndSaveLongformDadJokeBackground,
  uploadLongformDadJokeSegmentImage,
} from '../../services/orbix-network/longform-dadjoke.js';
import { processDadJokeLongformRenderJob } from '../../services/orbix-network/dadjoke-longform-renderer.js';

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

/** Ensure channel has DAD_JOKE_GENERATOR source (dad joke long-form only). */
async function requireDadJokeChannel(req) {
  const channelId = await requireChannelId(req);
  const businessId = req.active_business_id;
  const { data: sources, error } = await supabaseClient
    .from('orbix_sources')
    .select('id')
    .eq('channel_id', channelId)
    .eq('business_id', businessId)
    .eq('type', 'DAD_JOKE_GENERATOR')
    .limit(1);
  if (error || !sources?.length) {
    const err = new Error('This channel is not a Dad Jokes channel. Dad joke long-form is only available for channels with a Dad Joke Generator source.');
    err.status = 400;
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
        longform_usage_count: usageMap[p.id]?.count ?? 0,
        longform_video_titles: usageMap[p.id]?.videoTitles ?? [],
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
 * Get one long-form video with linked puzzles and settings. Query: channel_id (required)
 */
router.get('/videos/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireChannelId(req);
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

// ——— Dad Jokes long-form only (channel must have DAD_JOKE_GENERATOR source) ———

/**
 * GET /api/v2/orbix-network/longform/dadjoke/jokes
 * List dad jokes (from shorts) that can be used as punchline for a long-form video. Query: channel_id
 */
router.get('/dadjoke/jokes', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const jokes = await listDadJokesForLongform(businessId, channelId);
    res.json({ jokes });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/generate-script
 * Generate long-form script (story then punchline). Body: channel_id, story_id, dad_activity? (optional)
 * Does not save; returns script for preview or for use in POST dadjoke/videos.
 */
router.post('/dadjoke/generate-script', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const script = await generateLongformDadJokeScript(businessId, channelId, req.body);
    res.json(script);
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Failed to generate script';
    console.error('[longform/dadjoke/generate-script]', status, message);
    if (err?.stack) console.error(err.stack);
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos
 * Create a dad joke long-form video record. Body: channel_id, story_id, title?, subtitle?, hook_text?, description?, script_json (from generate-script)
 */
router.post('/dadjoke/videos', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const video = await createLongformDadJokeVideo(businessId, channelId, req.body);
    res.status(201).json(video);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/generate-background
 * Generate background image (DALL-E 3) for this video, upload to storage, save URL. User can approve before render.
 * Query: channel_id (required). Same endpoint for "Generate" and "Regenerate" (overwrites).
 */
router.post('/dadjoke/videos/:id/generate-background', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const videoId = req.params.id;
    const result = await generateAndSaveLongformDadJokeBackground(videoId, businessId, channelId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/segment-image
 * Upload an image for one script segment (cold_open, act_1_setup, act_2_escalation, act_3_chaos, final_reset).
 * Body: multipart form with "file" (image) and "segment_key" (string). Query: channel_id (required).
 */
router.post('/dadjoke/videos/:id/segment-image', upload.single('file'), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const videoId = req.params.id;
    const segmentKey = (req.body?.segment_key || '').trim();
    if (!segmentKey) {
      return res.status(400).json({ error: 'segment_key is required (cold_open, act_1_setup, act_2_escalation, act_3_chaos, final_reset)' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'file is required' });
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
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/start-render
 * Start render for one dad joke long-form video. Returns 202 immediately and runs the render in the background
 * (6–10 min videos can take 10+ minutes). Poll GET /videos/:id for render_status.
 * Query: channel_id (required). Video must be PENDING and belong to this channel.
 */
router.post('/dadjoke/videos/:id/start-render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const videoId = req.params.id;

    const { data: video, error: videoErr } = await supabaseClient
      .from('orbix_longform_videos')
      .select('*')
      .eq('id', videoId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('longform_type', 'dadjoke')
      .single();
    if (videoErr || !video) {
      return res.status(404).json({ error: 'Long-form video not found or not a dad joke video' });
    }
    if (video.render_status !== 'PENDING') {
      return res.status(400).json({ error: `Video render status is ${video.render_status}; only PENDING can be rendered` });
    }

    const { data: dadjokeRow, error: dataErr } = await supabaseClient
      .from('orbix_longform_dadjoke_data')
      .select('story_id, script_json, generated_at')
      .eq('longform_video_id', videoId)
      .maybeSingle();
    if (dataErr || !dadjokeRow) {
      return res.status(400).json({ error: 'No script data for this long-form video' });
    }

    await supabaseClient
      .from('orbix_longform_videos')
      .update({ render_status: 'RENDERING', updated_at: new Date().toISOString() })
      .eq('id', videoId);

    res.status(202).json({
      success: true,
      status: 'RENDERING',
      message: 'Render started. This may take several minutes. Refresh or keep the page open to see progress.',
    });

    const videoForJob = { ...video, render_status: 'RENDERING' };
    processDadJokeLongformRenderJob(videoForJob, dadjokeRow)
      .then((result) => {
        if (result.status !== 'COMPLETED') {
          console.error(`[longform start-render] Video ${videoId} render failed:`, result.error);
        }
      })
      .catch((err) => {
        console.error(`[longform start-render] Video ${videoId} job error:`, err);
        supabaseClient
          .from('orbix_longform_videos')
          .update({ render_status: 'FAILED', updated_at: new Date().toISOString() })
          .eq('id', videoId);
      });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/orbix-network/longform/dadjoke/videos/:id/reset-render
 * Set render_status to FAILED for a stuck RENDERING/PROCESSING video so the user can retry.
 * Query: channel_id (required).
 */
router.post('/dadjoke/videos/:id/reset-render', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = await requireDadJokeChannel(req);
    const videoId = req.params.id;

    const { data: video, error: videoErr } = await supabaseClient
      .from('orbix_longform_videos')
      .select('id, render_status')
      .eq('id', videoId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('longform_type', 'dadjoke')
      .single();
    if (videoErr || !video) {
      return res.status(404).json({ error: 'Long-form video not found or not a dad joke video' });
    }
    if (video.render_status !== 'RENDERING' && video.render_status !== 'PROCESSING') {
      return res.status(400).json({
        error: `Can only reset when stuck; current status is ${video.render_status}. Use Start render for PENDING/FAILED.`,
      });
    }

    await supabaseClient
      .from('orbix_longform_videos')
      .update({ render_status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', videoId);

    res.json({ success: true, status: 'FAILED', message: 'Render reset. You can click Start render to try again.' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
