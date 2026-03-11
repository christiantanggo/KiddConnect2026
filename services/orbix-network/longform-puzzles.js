/**
 * Orbix Long-Form: puzzle library and long-form video records.
 * Additive only — does not modify existing Shorts pipeline, renderers, or publish flow.
 */

import { supabaseClient } from '../../config/database.js';

/**
 * List puzzles for a channel with long-form usage count and video titles.
 * @param {string} businessId
 * @param {string} channelId
 * @param {{ type?: string, family?: string, used_in_longform?: boolean }} filters
 */
export async function listPuzzles(businessId, channelId, filters = {}) {
  let q = supabaseClient
    .from('orbix_puzzles')
    .select(
      'id, story_id, raw_item_id, script_id, puzzle_number, type, family, question, answer, hook, short_render_id, short_video_url, created_at'
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (channelId) q = q.eq('channel_id', channelId);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.family) q = q.eq('family', filters.family);

  const { data: puzzles, error } = await q;
  if (error) throw error;
  if (!puzzles?.length) return { puzzles: [], usageMap: {} };

  const puzzleIds = puzzles.map((p) => p.id);
  const { data: links } = await supabaseClient
    .from('orbix_longform_video_puzzles')
    .select('puzzle_id, longform_video_id')
    .in('puzzle_id', puzzleIds);
  const { data: videos } = await supabaseClient
    .from('orbix_longform_videos')
    .select('id, title')
    .in(
      'id',
      [...new Set((links || []).map((l) => l.longform_video_id))]
    );

  const videoById = (videos || []).reduce((acc, v) => {
    acc[v.id] = v;
    return acc;
  }, {});
  const usageMap = {};
  puzzleIds.forEach((id) => {
    usageMap[id] = { count: 0, videoTitles: [] };
  });
  (links || []).forEach((l) => {
    if (!usageMap[l.puzzle_id]) return;
    usageMap[l.puzzle_id].count++;
    const v = videoById[l.longform_video_id];
    if (v?.title && !usageMap[l.puzzle_id].videoTitles.includes(v.title)) {
      usageMap[l.puzzle_id].videoTitles.push(v.title);
    }
  });

  if (filters.used_in_longform === true) {
    return {
      puzzles: puzzles.filter((p) => (usageMap[p.id]?.count || 0) > 0),
      usageMap,
    };
  }
  if (filters.used_in_longform === false) {
    return {
      puzzles: puzzles.filter((p) => (usageMap[p.id]?.count || 0) === 0),
      usageMap,
    };
  }
  return { puzzles, usageMap };
}

/**
 * Get one puzzle by id (and optional business/channel check).
 */
export async function getPuzzleById(puzzleId, businessId, channelId = null) {
  let q = supabaseClient
    .from('orbix_puzzles')
    .select('*')
    .eq('id', puzzleId)
    .eq('business_id', businessId);
  if (channelId) q = q.eq('channel_id', channelId);
  const { data, error } = await q.single();
  if (error) throw error;
  return data;
}

/**
 * Get explanation for a puzzle if it exists.
 */
export async function getPuzzleExplanation(puzzleId) {
  const { data, error } = await supabaseClient
    .from('orbix_puzzle_explanations')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * List long-form videos for a channel (puzzle and dad joke).
 */
export async function listLongformVideos(businessId, channelId) {
  let q = supabaseClient
    .from('orbix_longform_videos')
    .select('id, title, subtitle, hook_text, thumbnail_path, video_path, render_status, total_puzzles, duration_seconds, longform_type, generated_background_url, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (channelId) q = q.eq('channel_id', channelId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Get one long-form video with its puzzle links (puzzle type) or dad joke script (dadjoke type).
 */
export async function getLongformVideoById(videoId, businessId, channelId = null) {
  let q = supabaseClient
    .from('orbix_longform_videos')
    .select('*')
    .eq('id', videoId)
    .eq('business_id', businessId);
  if (channelId) q = q.eq('channel_id', channelId);
  const { data: video, error: videoErr } = await q.single();
  if (videoErr || !video) throw videoErr || new Error('Long-form video not found');

  const longformType = (video.longform_type || 'puzzle').toLowerCase();

  if (longformType === 'dadjoke') {
    const { data: dadjokeRow } = await supabaseClient
      .from('orbix_longform_dadjoke_data')
      .select('story_id, script_json, generated_at')
      .eq('longform_video_id', videoId)
      .maybeSingle();
    return {
      ...video,
      puzzles: [],
      dadjoke_data: dadjokeRow ? { story_id: dadjokeRow.story_id, script_json: dadjokeRow.script_json || {}, generated_at: dadjokeRow.generated_at } : null,
    };
  }

  const { data: links } = await supabaseClient
    .from('orbix_longform_video_puzzles')
    .select('*')
    .eq('longform_video_id', videoId)
    .order('display_order', { ascending: true });
  const puzzleIds = (links || []).map((l) => l.puzzle_id);
  const { data: puzzles } = await supabaseClient
    .from('orbix_puzzles')
    .select('id, question, answer, type, family, hook')
    .in('id', puzzleIds);
  const puzzleById = (puzzles || []).reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {});

  const items = (links || []).map((l) => ({
    ...l,
    puzzle: puzzleById[l.puzzle_id] || null,
  }));
  return { ...video, puzzles: items };
}

/**
 * Create a long-form video record and link puzzles (display_order, per-puzzle settings).
 * Does not start render; only writes DB. Validates that all puzzle_ids belong to same business_id and channel_id.
 */
export async function createLongformVideo(businessId, channelId, payload) {
  const {
    title,
    subtitle,
    hook_text,
    description,
    puzzle_ids = [],
    puzzle_settings = {},
  } = payload;

  if (puzzle_ids.length) {
    const { data: existing } = await supabaseClient
      .from('orbix_puzzles')
      .select('id')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .in('id', puzzle_ids);
    const foundIds = (existing || []).map((p) => p.id);
    const missing = puzzle_ids.filter((id) => !foundIds.includes(id));
    if (missing.length) {
      const err = new Error('Some puzzle_ids are invalid or do not belong to this channel');
      err.status = 400;
      throw err;
    }
  }

  const { data: video, error: videoErr } = await supabaseClient
    .from('orbix_longform_videos')
    .insert({
      business_id: businessId,
      channel_id: channelId,
      title: title || null,
      subtitle: subtitle || null,
      hook_text: hook_text || null,
      description: description || null,
      render_status: 'PENDING',
      total_puzzles: puzzle_ids.length,
    })
    .select('id')
    .single();
  if (videoErr) throw videoErr;
  if (!puzzle_ids.length) return video;

  const rows = puzzle_ids.map((puzzle_id, i) => {
    const s = puzzle_settings[puzzle_id] || {};
    return {
      longform_video_id: video.id,
      puzzle_id,
      display_order: i,
      include_puzzle: s.include_puzzle !== false,
      include_timer: s.include_timer !== false,
      timer_seconds: s.timer_seconds ?? 3,
      reveal_answer_before_explanation: s.reveal_answer_before_explanation !== false,
      include_explanation: s.include_explanation !== false,
      narration_style: s.narration_style || null,
    };
  });
  const { error: linkErr } = await supabaseClient
    .from('orbix_longform_video_puzzles')
    .insert(rows);
  if (linkErr) throw linkErr;
  return video;
}
