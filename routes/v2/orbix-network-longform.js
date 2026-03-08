/**
 * Orbix Long-Form API: puzzle library and long-form video CRUD.
 * Mounted at /api/v2/orbix-network/longform — additive only, no changes to existing Orbix Shorts routes.
 */

import express from 'express';
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

export default router;
