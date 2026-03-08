/**
 * Backfill orbix_puzzles from existing approved mindteaser stories.
 * Safe to run multiple times: upserts by story_id so existing rows are updated.
 * Does not modify any existing orbix_stories, orbix_raw_items, orbix_scripts, or orbix_renders.
 *
 * Usage: node scripts/backfill-orbix-puzzles.js
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabaseClient } from '../config/database.js';

async function backfillPuzzles() {
  console.log('[Backfill] Fetching approved mindteaser stories...');
  const { data: stories, error: storiesError } = await supabaseClient
    .from('orbix_stories')
    .select('id, business_id, channel_id, raw_item_id, status, created_at')
    .eq('category', 'mindteaser')
    .in('status', ['APPROVED', 'RENDERED', 'PUBLISHED']);

  if (storiesError) {
    console.error('[Backfill] Error fetching stories:', storiesError.message);
    process.exit(1);
  }
  if (!stories?.length) {
    console.log('[Backfill] No approved mindteaser stories found. Nothing to backfill.');
    process.exit(0);
  }
  console.log(`[Backfill] Found ${stories.length} approved mindteaser story(ies).`);

  const storyIds = stories.map((s) => s.id);
  const rawItemIds = [...new Set(stories.map((s) => s.raw_item_id).filter(Boolean))];

  let rawItems = [];
  if (rawItemIds.length) {
    const { data: raw, error: rawErr } = await supabaseClient
      .from('orbix_raw_items')
      .select('id, snippet')
      .in('id', rawItemIds);
    if (!rawErr && raw) rawItems = raw;
  }

  const { data: scripts, error: scriptsError } = await supabaseClient
    .from('orbix_scripts')
    .select('id, story_id, content_json, hook')
    .in('story_id', storyIds);

  if (scriptsError) {
    console.error('[Backfill] Error fetching scripts:', scriptsError.message);
    process.exit(1);
  }
  const scriptByStoryId = (scripts || []).reduce((acc, s) => {
    acc[s.story_id] = s;
    return acc;
  }, {});

  const { data: renders, error: rendersError } = await supabaseClient
    .from('orbix_renders')
    .select('id, story_id, output_url, render_status')
    .in('story_id', storyIds)
    .in('render_status', ['COMPLETED', 'READY_FOR_UPLOAD']);

  const renderByStoryId = {};
  if (!rendersError && renders) {
    renders.forEach((r) => {
      if (!renderByStoryId[r.story_id] || r.output_url) renderByStoryId[r.story_id] = r;
    });
  }

  const rawById = rawItems.reduce((acc, r) => {
    acc[r.id] = r;
    return acc;
  }, {});

  let inserted = 0;
  for (const story of stories) {
    const script = scriptByStoryId[story.id];
    const raw = story.raw_item_id ? rawById[story.raw_item_id] : null;
    let question = '';
    let answer = '';
    let type = null;
    let family = null;
    let hook = null;

    if (script?.content_json) {
      const c = typeof script.content_json === 'string' ? JSON.parse(script.content_json) : script.content_json;
      question = (c.question || '').trim().slice(0, 1000) || '';
      answer = (c.answer || '').trim().slice(0, 500) || '';
      type = c.type || null;
      family = c.family || null;
      hook = (c.hook || script.hook || '').trim().slice(0, 255) || null;
    }
    if (!question && raw?.snippet) {
      try {
        const sn = typeof raw.snippet === 'string' ? JSON.parse(raw.snippet) : raw.snippet;
        question = (sn.question || '').trim().slice(0, 1000) || '';
        answer = (sn.answer || '').trim().slice(0, 500) || '';
        type = sn.type || null;
        family = sn.family || null;
        hook = (sn.hook || '').trim().slice(0, 255) || null;
      } catch (_) {}
    }
    if (!question) question = 'Question not found';
    if (!answer) answer = 'Answer not found';

    const render = renderByStoryId[story.id];
    const row = {
      business_id: story.business_id,
      channel_id: story.channel_id || null,
      raw_item_id: story.raw_item_id || null,
      story_id: story.id,
      script_id: script?.id || null,
      type,
      family,
      question,
      answer,
      hook,
      short_render_id: render?.id || null,
      short_video_url: render?.output_url || null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabaseClient
      .from('orbix_puzzles')
      .upsert(row, { onConflict: 'story_id', ignoreDuplicates: false });

    if (upsertErr) {
      console.error('[Backfill] Upsert failed for story', story.id, upsertErr.message);
      continue;
    }
    inserted++;
  }
  console.log('[Backfill] Done. Upserted', inserted, 'puzzle(s).');
}

backfillPuzzles().catch((err) => {
  console.error('[Backfill] Fatal:', err);
  process.exit(1);
});
