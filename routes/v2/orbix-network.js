import express from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { google } from 'googleapis';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB for images/audio
router.use(authenticate);
router.use(requireBusinessContext);

const MODULE_KEY = 'orbix-network';

/** True if YouTube OAuth env vars are all set (so Connect YouTube / uploads can work). */
function isYouTubeOAuthConfigured() {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);
}

/** One-time setup instructions when YouTube OAuth is not configured. baseUrl optional (e.g. from req). */
function getYouTubeSetupInstructions(req = null) {
  let base = process.env.API_URL || process.env.RAILWAY_STATIC_URL || '';
  if (!base && req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    if (host) base = `${proto}://${host}`;
  }
  if (!base) base = 'https://your-backend-domain.com';
  base = base.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const redirectUri = `${base}/api/v2/orbix-network/youtube/callback`;
  return {
    short: 'Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI to your .env (and Railway Environment if deployed).',
    env_lines: [
      'YOUTUBE_CLIENT_ID=your_client_id_from_google_cloud_console',
      'YOUTUBE_CLIENT_SECRET=your_client_secret',
      `YOUTUBE_REDIRECT_URI=${redirectUri}`
    ].join('\n'),
    steps: 'Get credentials: Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application). Set authorized redirect URI to the YOUTUBE_REDIRECT_URI value above. Then restart the server.'
  };
}

/** Get and validate channel_id from query (required for channel-scoped routes). Returns channelId or throws with .status 400/404. */
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

/** Use in catch block: res.status(error.status || 500).json({ error: error.message }) */
function channelErrorStatus(error) {
  return error?.status || 500;
}

/**
 * GET /api/v2/orbix-network/channels
 * List all channels for the active business.
 */
router.get('/channels', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { data: channels, error } = await supabaseClient
      .from('orbix_channels')
      .select('id, name, created_at, enabled')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    console.log('[Orbix] GET /channels', { businessId, count: (channels || []).length });
    res.json({ channels: channels || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/channels] Error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch channels' });
  }
});

/**
 * POST /api/v2/orbix-network/channels
 * Create a new channel. Body: { name }
 */
router.post('/channels', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const name = req.body?.name?.trim() || 'New Channel';
    const { data: channel, error } = await supabaseClient
      .from('orbix_channels')
      .insert({ business_id: businessId, name })
      .select('id, name, created_at, enabled')
      .single();
    if (error) throw error;
    res.status(201).json({ channel });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/channels] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to create channel' });
  }
});

/**
 * PATCH /api/v2/orbix-network/channels/:id
 * Update channel name and/or enabled (publish/scrape for this channel).
 */
router.patch('/channels/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    const name = req.body?.name?.trim();
    const enabled = req.body?.enabled;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (name === undefined && typeof enabled !== 'boolean') return res.status(400).json({ error: 'Provide name and/or enabled' });
    const { data: channel, error } = await supabaseClient
      .from('orbix_channels')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('id, name, created_at, enabled')
      .single();
    if (error) throw error;
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({ channel });
  } catch (error) {
    console.error('[PATCH /api/v2/orbix-network/channels/:id] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to update channel' });
  }
});

/**
 * DELETE /api/v2/orbix-network/channels/:id
 * Delete a channel and its data (sources, raw items, stories cascade or manual).
 */
router.delete('/channels/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    const { data: channel, error: fetchError } = await supabaseClient
      .from('orbix_channels')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();
    if (fetchError || !channel) return res.status(404).json({ error: 'Channel not found' });
    await supabaseClient.from('orbix_sources').delete().eq('channel_id', id);
    await supabaseClient.from('orbix_raw_items').delete().eq('channel_id', id);
    const { data: storyIds } = await supabaseClient.from('orbix_stories').select('id').eq('channel_id', id);
    for (const s of storyIds || []) {
      await supabaseClient.from('orbix_scripts').delete().eq('story_id', s.id);
      await supabaseClient.from('orbix_review_queue').delete().eq('story_id', s.id);
      await supabaseClient.from('orbix_renders').delete().eq('story_id', s.id);
    }
    await supabaseClient.from('orbix_stories').delete().eq('channel_id', id);
    await supabaseClient.from('orbix_channels').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/channels/:id] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete channel' });
  }
});

/**
 * GET /api/v2/orbix-network/stories
 * List stories (with filters). Requires query.channel_id. Use days=7|30|all to see past scraped stories.
 */
router.get('/stories', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { category, status, limit = 50, offset = 0, days } = req.query;

    let query = supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .range(offset, offset + (parseInt(limit, 10) || 50) - 1);
    
    if (days && days !== 'all') {
      const d = parseInt(days, 10);
      if (!isNaN(d) && d > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - d);
        query = query.gte('created_at', cutoff.toISOString());
      }
    }
    
    if (category) {
      query = query.eq('category', category);
    }
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: stories, error } = await query;
    
    if (error) throw error;
    
    console.log('[Orbix] GET /stories', { businessId, channelId, count: (stories || []).length });
    res.json({ stories: stories || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/stories] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch stories' });
  }
});

/**
 * GET /api/v2/orbix-network/stories/:id
 * Get story details. Requires query.channel_id.
 */
router.get('/stories/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { data: story, error } = await supabaseClient
      .from('orbix_stories')
      .select(`
        *,
        orbix_scripts (*)
      `)
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    
    if (error) throw error;
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    // Ensure scripts are newest first (so UI and psychology "latest script" match)
    if (story.orbix_scripts && Array.isArray(story.orbix_scripts)) {
      story.orbix_scripts.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }
    res.json({ story });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/stories/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch story' });
  }
});

/**
 * DELETE /api/v2/orbix-network/stories/:id
 * Delete a story so it doesn't hang in the pipeline. Cascades to scripts, review queue, renders.
 * Optional query: delete_raw_item=true to also discard the underlying raw item.
 * Requires query.channel_id.
 */
router.delete('/stories/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;
    const deleteRawItem = req.query?.delete_raw_item === 'true' || req.body?.delete_raw_item === true;

    const { data: story, error: getError } = await supabaseClient
      .from('orbix_stories')
      .select('id, raw_item_id')
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    if (getError || !story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const storyId = story.id;
    await supabaseClient.from('orbix_scripts').delete().eq('story_id', storyId);
    await supabaseClient.from('orbix_review_queue').delete().eq('story_id', storyId);
    await supabaseClient.from('orbix_renders').delete().eq('story_id', storyId);
    await supabaseClient.from('orbix_stories').delete().eq('id', storyId).eq('business_id', businessId);

    if (deleteRawItem && story.raw_item_id) {
      await supabaseClient
        .from('orbix_raw_items')
        .delete()
        .eq('id', story.raw_item_id)
        .eq('business_id', businessId)
        .eq('channel_id', channelId);
    }

    res.json({ success: true, deleted_story: storyId, deleted_raw_item: deleteRawItem && story.raw_item_id });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/stories/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to delete story' });
  }
});

/**
 * GET /api/v2/orbix-network/renders
 * List renders. Requires query.channel_id (filtered via story -> channel).
 */
router.get('/renders', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { status, limit = 50, offset = 0 } = req.query;

    const { data: channelStories } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('business_id', businessId)
      .eq('channel_id', channelId);
    const storyIds = (channelStories || []).map((s) => s.id);
    if (storyIds.length === 0) {
      return res.json({ renders: [] });
    }

    let query = supabaseClient
      .from('orbix_renders')
      .select('*')
      .eq('business_id', businessId)
      .in('story_id', storyIds)
      .order('created_at', { ascending: false })
      .range(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(limit) || 50) - 1);

    if (status) {
      query = query.eq('render_status', status);
    }
    const { data: renders, error } = await query;
    if (error) throw error;
    res.json({ renders: renders || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/renders] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch renders' });
  }
});

/**
 * GET /api/v2/orbix-network/renders/:id
 * Get render details. Requires query.channel_id (render must belong to channel via story).
 */
router.get('/renders/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { data: render, error } = await supabaseClient
      .from('orbix_renders')
      .select('*, orbix_stories!inner(*), orbix_scripts(*)')
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('orbix_stories.channel_id', channelId)
      .single();

    if (error) throw error;
    if (!render) {
      return res.status(404).json({ error: 'Render not found' });
    }
    // If we have a view URL but DB shows failed + OAuth/config error, treat as completed so UI never shows OAuth error
    const stepErr = (render.step_error || '').toLowerCase();
    const isOAuthError = stepErr && ['youtube', 'oauth', 'not configured', 'credentials', 'client_id', 'client_secret', 'redirect', 'connect your youtube', 'disconnect'].some(t => stepErr.includes(t));
    if (render.output_url && (render.render_status === 'STEP_FAILED' || render.render_status === 'FAILED') && isOAuthError) {
      render.render_status = 'COMPLETED';
      render.step_error = null;
      render.render_step = 'COMPLETED';
      render.step_progress = 100;
    }
    res.json({ render });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/renders/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch render' });
  }
});

/**
 * DELETE /api/v2/orbix-network/renders/:id
 * Cancel/delete a render. Requires query.channel_id.
 * Allows cancel for any non-COMPLETED status (PENDING, PROCESSING, FAILED, STEP_FAILED, etc.) so stuck renders can be cleared.
 */
router.delete('/renders/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('render_status, story_id')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (getError) throw getError;
    if (!render) {
      return res.status(404).json({ error: 'Render not found' });
    }

    const { data: story } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('id', render.story_id)
      .eq('channel_id', channelId)
      .single();
    if (!story) {
      return res.status(404).json({ error: 'Render not found' });
    }

    if (render.render_status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot cancel a completed render. Use Re-Render to run again.' });
    }

    const { error: deleteError } = await supabaseClient
      .from('orbix_renders')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);

    if (deleteError) throw deleteError;
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/renders/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to cancel render' });
  }
});

/**
 * POST /api/v2/orbix-network/renders/:id/reset-upload
 * Reset YouTube upload state so the user can retry. Requires query.channel_id.
 * Allowed when render is stuck in upload (PROCESSING at STEP_8) or failed at STEP_8: sets status to READY_FOR_UPLOAD and clears step_error.
 */
router.post('/renders/:id/reset-upload', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('id, business_id, story_id, render_status, render_step')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();

    if (getError) throw getError;
    if (!render) {
      return res.status(404).json({ error: 'Render not found' });
    }

    const { data: story } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('id', render.story_id)
      .eq('channel_id', channelId)
      .single();
    if (!story) {
      return res.status(404).json({ error: 'Render not found' });
    }

    const atStep8 = render.render_step === 'STEP_8_YOUTUBE_UPLOAD';
    const canReset = atStep8 && (
      render.render_status === 'PROCESSING' ||
      render.render_status === 'STEP_FAILED' ||
      render.render_status === 'READY_FOR_UPLOAD' ||
      render.render_status === 'UPLOAD_FAILED'
    );
    if (!canReset) {
      return res.status(400).json({ error: 'Upload can only be reset when the render is at YouTube upload step (processing, failed, or ready to retry).' });
    }

    const { error: updateError } = await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'READY_FOR_UPLOAD',
        step_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('business_id', businessId);

    if (updateError) throw updateError;
    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/renders/:id/reset-upload] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to reset upload state' });
  }
});

/**
 * POST /api/v2/orbix-network/renders/:id/restart
 * Restart a render. Requires query.channel_id. Works for COMPLETED, FAILED, or PROCESSING (stuck).
 */
router.post('/renders/:id/restart', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    let render = null;
    let renderId = id;

    // Try to find render by ID first
    const { data: renderById, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (getError && getError.code !== 'PGRST116') throw getError;

    if (renderById) {
      // Verify the render belongs to the right channel
      const { data: story } = await supabaseClient
        .from('orbix_stories')
        .select('id')
        .eq('id', renderById.story_id)
        .eq('channel_id', channelId)
        .maybeSingle();
      if (story) render = renderById;
    }

    // If render not found by ID (e.g. was deleted after a script rewrite),
    // find the story via story_id param or look up by channel to get a fresh render
    if (!render) {
      console.log(`[restart] Render ${id} not found — looking for story's current render`);
      // Try to find by story_id from query or from the story linked to this render id via any orphan reference
      const storyId = req.query.story_id || null;
      if (storyId) {
        const { data: latestRender } = await supabaseClient
          .from('orbix_renders')
          .select('*')
          .eq('story_id', storyId)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRender) {
          render = latestRender;
          renderId = latestRender.id;
          console.log(`[restart] Using latest render ${renderId} for story ${storyId}`);
        } else {
          // No render exists at all — create a new one for this story
          const { data: story } = await supabaseClient
            .from('orbix_stories')
            .select('*')
            .eq('id', storyId)
            .eq('business_id', businessId)
            .eq('channel_id', channelId)
            .maybeSingle();
          if (!story) return res.status(404).json({ error: 'Story not found' });

          const storyCat = (story.category || '').toLowerCase();
          const contentType = ['trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke'].includes(storyCat) ? storyCat : null;
          let scriptQuery = supabaseClient
            .from('orbix_scripts')
            .select('id')
            .eq('story_id', storyId)
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(1);
          if (contentType) scriptQuery = scriptQuery.eq('content_type', contentType);
          const { data: script } = await scriptQuery.maybeSingle();
          if (!script) return res.status(400).json({ error: 'No script found for story — generate a script first' });

          const { selectTemplate, selectBackground } = await import('../../services/orbix-network/video-renderer.js');
          const template = selectTemplate(story);
          const background = await selectBackground(businessId, channelId);
          const { data: newRender, error: createErr } = await supabaseClient
            .from('orbix_renders')
            .insert({
              business_id: businessId,
              story_id: storyId,
              script_id: script.id,
              template,
              background_type: background.type,
              background_id: background.id,
              background_storage_path: background.storagePath ?? null,
              render_status: 'PENDING'
            })
            .select()
            .single();
          if (createErr) throw createErr;
          render = newRender;
          renderId = newRender.id;
          console.log(`[restart] Created new render ${renderId} for story ${storyId}`);
        }
      } else {
        return res.status(404).json({ error: 'Render not found. If you rewrote the script, refresh the page and try again.' });
      }
    }

    const allowedStatuses = ['COMPLETED', 'FAILED', 'PROCESSING', 'STEP_FAILED', 'READY_FOR_UPLOAD', 'PENDING'];
    if (!allowedStatuses.includes(render.render_status)) {
      return res.status(400).json({ error: 'Can only restart COMPLETED, FAILED, STEP_FAILED, READY_FOR_UPLOAD, or stuck PROCESSING renders' });
    }

    // Load story so we can restrict "latest script" to same content type (prevents dad joke render from picking a trivia script on restart)
    const { data: storyForRestart, error: storyErr } = await supabaseClient
      .from('orbix_stories')
      .select('id, category')
      .eq('id', render.story_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (storyErr || !storyForRestart) {
      return res.status(404).json({ error: 'Story not found for this render' });
    }
    const storyCategory = (storyForRestart.category || '').toLowerCase();
    const scriptContentType = ['trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke'].includes(storyCategory) ? storyCategory : null;

    // Update the script_id to the latest script for this story (picks up rewrites), matching content_type so we never attach a trivia script to a dad joke render
    let latestScriptQuery = supabaseClient
      .from('orbix_scripts')
      .select('id')
      .eq('story_id', render.story_id)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (scriptContentType) {
      latestScriptQuery = latestScriptQuery.eq('content_type', scriptContentType);
    }
    const { data: latestScript } = await latestScriptQuery.maybeSingle();

    // Re-select background from the story's current channel so we never keep a stale/wrong channel background (e.g. after story move or past bug)
    const { selectBackground } = await import('../../services/orbix-network/video-renderer.js');
    const background = await selectBackground(businessId, channelId);

    // Reset render and clear ALL step paths so the worker runs from step 3 with no stale paths
    const updateData = {
      render_status: 'PENDING',
      output_url: null,
      error_message: null,
      step_error: null,
      completed_at: null,
      render_step: null,
      step_progress: null,
      step_started_at: null,
      step_completed_at: null,
      step_logs: null,
      video_step3_path: null,
      video_step4_voice_path: null,
      video_step4_path: null,
      video_step5_path: null,
      background_type: background.type,
      background_id: background.id,
      background_storage_path: background.storagePath ?? null,
      updated_at: new Date().toISOString()
    };
    if (latestScript) updateData.script_id = latestScript.id;
    
    const { data: updatedRender, error: updateError } = await supabaseClient
      .from('orbix_renders')
      .update(updateData)
      .eq('id', renderId)
      .eq('business_id', businessId)
      .select()
      .single();
    
    if (updateError) throw updateError;
    
    console.log(`[POST /api/v2/orbix-network/renders/:id/restart] Render ${renderId} restarted to PENDING – triggering process now`);
    res.json({ render: updatedRender, render_id: renderId });

    // Process this render immediately then upload to YouTube in one shot
    const { runRenderByIdThenUpload } = await import('./orbix-network-jobs.js');
    runRenderByIdThenUpload(renderId)
      .then((result) => {
        if (result.render?.processed) {
          console.log(`[restart] Render ${renderId} processed:`, result.render.status, result.upload ? 'upload: ' + result.upload.status : 'no upload');
        } else if (result.render?.error) {
          console.warn(`[restart] Could not process render ${renderId}:`, result.render.error);
        }
      })
      .catch((err) => console.error(`[restart] Process error for ${renderId}:`, err?.message));
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/renders/:id/restart] Error:', error);
    res.status(channelErrorStatus(error)).json({
      error: error.message || 'Failed to restart render',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/v2/orbix-network/renders/:id/upload-to-youtube
 * Manually upload a READY_FOR_UPLOAD render to YouTube.
 * Requires query.channel_id.
 */
router.post('/renders/:id/upload-to-youtube', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    // Verify render exists and belongs to this business; allow current channel or legacy (story.channel_id null)
    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('*, orbix_stories!left(id, channel_id, category)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (getError && getError.code !== 'PGRST116') throw getError;
    if (!render) return res.status(404).json({ error: 'Render not found' });
    // Supabase many-to-one embed is single object; guard array from some clients
    const storyRow = Array.isArray(render.orbix_stories) ? render.orbix_stories[0] : render.orbix_stories;
    const storyChannelId = storyRow?.channel_id ?? null;
    if (storyChannelId != null && storyChannelId !== channelId) {
      return res.status(404).json({ error: 'Render not found for this channel' });
    }

    // Log so we can see why 400 happens if it does
    console.log(`[POST renders/:id/upload-to-youtube] render ${id} channel=${channelId} status=${render.render_status} hasOutputUrl=${!!render.output_url}`);

    // No category check for manual upload — user chose the channel and render; trust their choice.

    const allowedStatuses = ['READY_FOR_UPLOAD', 'COMPLETED', 'UPLOAD_FAILED', 'STEP_FAILED', 'FAILED'];
    if (!allowedStatuses.includes(render.render_status)) {
      const msg = `Cannot upload — render status is ${render.render_status}. Only READY_FOR_UPLOAD, COMPLETED, UPLOAD_FAILED, STEP_FAILED, or FAILED (with video) can be uploaded.`;
      console.warn(`[upload-to-youtube] 400 render ${id}: status=${render.render_status} not in allowed list`);
      return res.status(400).json({ error: msg, message: msg });
    }

    if (!render.output_url) {
      console.warn(`[upload-to-youtube] 400 render ${id}: no output_url`);
      return res.status(400).json({ error: 'No video file available to upload. Re-render first.', message: 'No video file available to upload. Re-render first.' });
    }

    console.log(`[POST renders/:id/upload-to-youtube] Triggering MANUAL YouTube upload for render ${id} channel_id=${channelId} (will use Manual-tab OAuth for this channel)`);
    res.json({ message: 'YouTube upload started', render_id: id });

    // Run upload in background after response
    const { processOneYouTubeUpload } = await import('./orbix-network-jobs.js');

    // Mark it READY_FOR_UPLOAD (in case it was COMPLETED) so the upload job picks it up
    if (render.render_status !== 'READY_FOR_UPLOAD') {
      await supabaseClient
        .from('orbix_renders')
        .update({ render_status: 'READY_FOR_UPLOAD', updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    // force: true bypasses the auto_upload_enabled toggle — this is an explicit manual upload.
    // useManual: true so we use the channel's Manual-tab OAuth only (no fallback to Auto).
    // preferredChannelId: channel from request so we use that channel's YouTube (Manual tab).
    processOneYouTubeUpload({ force: true, renderId: id, preferredChannelId: channelId, useManual: true })
      .then((result) => {
        console.log(`[upload-to-youtube] Upload result for ${id}:`, result.status, result.error || '');
      })
      .catch((err) => {
        console.error(`[upload-to-youtube] Upload error for ${id}:`, err?.message);
      });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/renders/:id/upload-to-youtube] Error:', error);
    res.status(channelErrorStatus(error)).json({
      error: error.message || 'Failed to start YouTube upload',
    });
  }
});

/**
 * GET /api/v2/orbix-network/renders/:id/download-video
 * Download the render's video file to the user's computer. Requires query.channel_id.
 */
router.get('/renders/:id/download-video', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('id, output_url, orbix_stories!left(id, channel_id)')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();

    if (getError && getError.code !== 'PGRST116') throw getError;
    if (!render) return res.status(404).json({ error: 'Render not found' });
    const storyRow = Array.isArray(render.orbix_stories) ? render.orbix_stories[0] : render.orbix_stories;
    const storyChannelId = storyRow?.channel_id ?? null;
    if (storyChannelId != null && storyChannelId !== channelId) return res.status(404).json({ error: 'Render not found for this channel' });
    if (!render.output_url) return res.status(404).json({ error: 'No video file available for this render.' });

    const axios = (await import('axios')).default;
    const filename = `orbix-video-${id}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    const streamRes = await axios.get(render.output_url, { responseType: 'stream', timeout: 120000, maxRedirects: 5, validateStatus: () => true });
    if (streamRes.status !== 200) {
      return res.status(502).json({ error: 'Video file could not be fetched from storage.' });
    }
    streamRes.data.pipe(res);
  } catch (error) {
    if (error.status === 400 || error.status === 404) return res.status(error.status).json({ error: error.message });
    console.error('[GET /renders/:id/download-video] Error:', error?.message);
    res.status(500).json({ error: error?.message || 'Failed to download video' });
  }
});

/**
 * Build YouTube title, description, hashtags from story + script (same logic as step7Metadata; psychology uses dedicated rules).
 */
async function buildMetadataFromRender(renderId, story, script) {
  const { buildYouTubeMetadata } = await import('../../services/orbix-network/youtube-metadata.js');
  return buildYouTubeMetadata(story, script, renderId);
}

/**
 * POST /api/v2/orbix-network/renders/:id/upload-youtube
 * Force upload a completed render's video to YouTube. Requires channel_id. Uses render output_url (or step5 path).
 * Backfills title/description/hashtags if missing. Appends hashtags to description. Uploads SRT captions after publish.
 */
router.post('/renders/:id/upload-youtube', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;
    console.log('[POST /renders/:id/upload-youtube] START renderId=', id, 'businessId=', businessId);
    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('id, business_id, story_id, script_id, output_url, video_step5_path, youtube_title, youtube_description, hashtags')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();
    if (getError) throw getError;
    if (!render) {
      console.log('[POST /renders/:id/upload-youtube] 404 render not found');
      return res.status(404).json({ error: 'Render not found' });
    }
    const videoUrlOrPath = render.output_url || render.video_step5_path;
    if (!videoUrlOrPath) {
      console.log('[POST /renders/:id/upload-youtube] 400 no output_url or video_step5_path');
      return res.status(400).json({ error: 'No video URL or path available for this render' });
    }

    let title = render.youtube_title || '';
    let description = render.youtube_description || '';
    let hashtags = (render.hashtags || '').trim();
    if (!title || !description || !hashtags) {
      const { data: story } = await supabaseClient.from('orbix_stories').select('*').eq('id', render.story_id).single();
      const { data: script } = await supabaseClient.from('orbix_scripts').select('*').eq('id', render.script_id).single();
      if (story && script) {
        const built = await buildMetadataFromRender(id, story, script);
        title = title || built.title;
        description = description || built.description;
        hashtags = hashtags || built.hashtags;
        await supabaseClient
          .from('orbix_renders')
          .update({ youtube_title: title, youtube_description: description, hashtags, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('business_id', businessId);
        console.log('[POST /renders/:id/upload-youtube] Backfilled metadata title=', title?.slice(0, 40), 'hashtags=', hashtags?.slice(0, 40));
      }
    }

    const tags = (hashtags || '')
      .split(/\s+/)
      .filter(t => t.startsWith('#') && t.length > 1)
      .map(t => t.replace(/^#/, ''))
      .slice(0, 15);
    const descriptionForYouTube = (description || '').trim() + (hashtags ? '\n\n' + hashtags.trim() : '');
    const metadata = {
      title: title || 'Orbix Short',
      description: descriptionForYouTube,
      tags
    };
    let orbixChannelId = null;
    if (render.story_id) {
      const { data: storyRow } = await supabaseClient.from('orbix_stories').select('channel_id').eq('id', render.story_id).single();
      orbixChannelId = storyRow?.channel_id || null;
    }
    if (orbixChannelId == null && channelId) {
      orbixChannelId = channelId;
      console.log('[POST /renders/:id/upload-youtube] Story has no channel_id; using request channel (so your Custom OAuth is used):', channelId);
    }
    const publishOptions = orbixChannelId ? { orbixChannelId, useManual: true } : {};
    console.log('[POST /renders/:id/upload-youtube] Calling publishVideo (manual OAuth) title=', metadata.title?.slice(0, 40), 'orbixChannelId=', orbixChannelId || 'legacy');
    const { publishVideo, uploadCaptions } = await import('../../services/orbix-network/youtube-publisher.js');
    const result = await publishVideo(businessId, id, videoUrlOrPath, metadata, publishOptions);
    console.log('[POST /renders/:id/upload-youtube] SUCCESS videoId=', result.videoId);

    try {
      const { data: script } = await supabaseClient.from('orbix_scripts').select('*').eq('id', render.script_id).single();
      if (script) {
        const { generateCaptionSegments, estimateAudioDurationFromScript, captionSegmentsToSrt } = await import('../../services/orbix-network/video-renderer.js');
        const estimatedDuration = estimateAudioDurationFromScript(script);
        const segments = generateCaptionSegments(script, estimatedDuration);
        if (segments.length > 0) {
          const srt = captionSegmentsToSrt(segments);
          await uploadCaptions(businessId, result.videoId, srt, 'en', 'English', { ...publishOptions, useManual: true });
          console.log('[POST /renders/:id/upload-youtube] Captions uploaded segments=', segments.length);
        } else {
          console.log('[POST /renders/:id/upload-youtube] No caption segments generated, skipping captions');
        }
      } else {
        console.log('[POST /renders/:id/upload-youtube] No script for captions, skipping');
      }
    } catch (captionErr) {
      console.error('[POST /renders/:id/upload-youtube] Caption upload failed (video already published)', captionErr?.message);
    }

    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'COMPLETED',
        render_step: 'COMPLETED',
        step_progress: 100,
        step_error: null,
        output_url: result.url,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('business_id', businessId);
    res.json({ url: result.url, videoId: result.videoId });
  } catch (error) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const ytMessage = data?.error?.message || error?.message;
    const reason = data?.error?.errors?.[0]?.reason;
    console.error('[POST /renders/:id/upload-youtube] ERROR', error?.message, data);

    if (error?.code === 'SKIP_YOUTUBE_UPLOAD') {
      return res.status(503).json({
        error: 'YouTube upload not available',
        code: 'SKIP_YOUTUBE_UPLOAD',
        message: error?.message || 'YouTube is not configured or not connected in this environment. Add YOUTUBE_* env vars to the server (and render worker if separate) and connect in Settings.'
      });
    }
    if (status === 400 || reason === 'uploadLimitExceeded') {
      const msg = reason === 'uploadLimitExceeded'
        ? "YouTube's daily upload limit reached (per project or per channel). Set Settings → Daily video cap to 5 or 6, or try again tomorrow."
        : (ytMessage || 'YouTube rejected the upload.');
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: error?.message || 'YouTube upload failed' });
  }
});

/**
 * GET /api/v2/orbix-network/publishes
 * List published videos. Requires query.channel_id (filtered via render -> story -> channel).
 */
router.get('/publishes', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { platform, limit = 50, offset = 0 } = req.query;

    const { data: channelStories } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('business_id', businessId)
      .eq('channel_id', channelId);
    const storyIds = (channelStories || []).map((s) => s.id);
    if (storyIds.length === 0) {
      return res.json({ publishes: [] });
    }
    const { data: channelRenders } = await supabaseClient
      .from('orbix_renders')
      .select('id')
      .eq('business_id', businessId)
      .in('story_id', storyIds);
    const renderIds = (channelRenders || []).map((r) => r.id);
    if (renderIds.length === 0) {
      return res.json({ publishes: [] });
    }

    let query = supabaseClient
      .from('orbix_publishes')
      .select('*')
      .eq('business_id', businessId)
      .in('render_id', renderIds)
      .order('created_at', { ascending: false })
      .range(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(limit) || 50) - 1);

    if (platform) {
      query = query.eq('platform', platform);
    }
    const { data: publishes, error } = await query;
    if (error) throw error;
    res.json({ publishes: publishes || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/publishes] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch publishes' });
  }
});

/**
 * GET /api/v2/orbix-network/raw-items
 * List raw items. Requires query.channel_id. Use days=7|30|all to filter by age.
 */
router.get('/raw-items', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { status, source_id, limit = 50, offset = 0, days } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 2000);
    const parsedOffset = parseInt(offset) || 0;

    let query = supabaseClient
      .from('orbix_raw_items')
      .select('*, orbix_sources(name, url, type)')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);

    if (days && days !== 'all') {
      const d = parseInt(days, 10);
      if (!isNaN(d) && d > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - d);
        query = query.gte('created_at', cutoff.toISOString());
      }
    }
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (source_id) {
      query = query.eq('source_id', source_id);
    }
    
    const { data: rawItems, error } = await query;
    
    if (error) {
      console.error('[GET /api/v2/orbix-network/raw-items] Query error:', error);
      throw error;
    }
    res.json({ raw_items: rawItems || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/raw-items] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch raw items' });
  }
});

/**
 * DELETE /api/v2/orbix-network/raw-items/:id
 * Delete a scraped raw item so it doesn't hang in the pipeline.
 * If the raw item has a story, deletes the story (and scripts, review queue, renders) first.
 * Requires query.channel_id.
 */
router.delete('/raw-items/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { data: rawItem, error: getError } = await supabaseClient
      .from('orbix_raw_items')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    if (getError || !rawItem) {
      return res.status(404).json({ error: 'Raw item not found' });
    }

    const { data: story } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('raw_item_id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .maybeSingle();
    if (story) {
      await supabaseClient.from('orbix_scripts').delete().eq('story_id', story.id);
      await supabaseClient.from('orbix_review_queue').delete().eq('story_id', story.id);
      await supabaseClient.from('orbix_renders').delete().eq('story_id', story.id);
      await supabaseClient.from('orbix_stories').delete().eq('id', story.id).eq('business_id', businessId);
    }

    await supabaseClient
      .from('orbix_raw_items')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId);

    res.json({ success: true, deleted_raw_item: id, deleted_story: story?.id ?? null });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/raw-items/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to delete raw item' });
  }
});

/**
 * POST /api/v2/orbix-network/cleanup
 * Delete stories and raw items older than N days for the channel. Requires body.channel_id or query.channel_id.
 */
router.post('/cleanup', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const older_than_days = parseInt(req.body?.older_than_days ?? req.query?.older_than_days ?? 10, 10);
    if (older_than_days < 1) {
      return res.status(400).json({ error: 'older_than_days must be at least 1' });
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - older_than_days);
    const cutoffIso = cutoff.toISOString();

    const { data: oldStories } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .lt('created_at', cutoffIso);
    const storyIds = (oldStories || []).map((s) => s.id);

    let deletedRenders = 0;
    let deletedScripts = 0;
    let deletedStories = 0;
    if (storyIds.length > 0) {
      const { data: deletedRendersData } = await supabaseClient
        .from('orbix_renders')
        .delete()
        .eq('business_id', businessId)
        .in('story_id', storyIds)
        .select('id');
      deletedRenders = deletedRendersData?.length ?? 0;
      const { data: deletedScriptsData } = await supabaseClient
        .from('orbix_scripts')
        .delete()
        .eq('business_id', businessId)
        .in('story_id', storyIds)
        .select('id');
      deletedScripts = deletedScriptsData?.length ?? 0;
      const { data: deletedStoriesData } = await supabaseClient
        .from('orbix_stories')
        .delete()
        .eq('business_id', businessId)
        .eq('channel_id', channelId)
        .lt('created_at', cutoffIso)
        .select('id');
      deletedStories = deletedStoriesData?.length ?? 0;
    }

    const { data: deletedRawData } = await supabaseClient
      .from('orbix_raw_items')
      .delete()
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .lt('created_at', cutoffIso)
      .select('id');
    const deletedRawItems = deletedRawData?.length ?? 0;

    res.json({
      success: true,
      deleted: {
        stories: deletedStories,
        scripts: deletedScripts,
        renders: deletedRenders,
        raw_items: deletedRawItems
      },
      message: `Deleted ${deletedStories} stories, ${deletedRawItems} raw items (older than ${older_than_days} days).`
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/cleanup] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Cleanup failed' });
  }
});

/**
 * GET /api/v2/orbix-network/sources
 * List sources. If query.channel_id is provided, filter by channel; otherwise return all sources for the business (e.g. legacy setup page).
 */
router.get('/sources', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = req.query.channel_id || req.body?.channel_id;

    let query = supabaseClient
      .from('orbix_sources')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (channelId) {
      const { data: channel, error: chError } = await supabaseClient
        .from('orbix_channels')
        .select('id')
        .eq('id', channelId)
        .eq('business_id', businessId)
        .single();
      if (chError || !channel) {
        return res.status(404).json({ error: 'Invalid or unauthorized channel' });
      }
      query = query.eq('channel_id', channelId);
    }

    const { data: sources, error } = await query;
    if (error) throw error;
    res.json({ sources: sources || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/sources] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch sources' });
  }
});

/**
 * POST /api/v2/orbix-network/sources
 * Add a new source. Requires body.channel_id or query.channel_id.
 */
router.post('/sources', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { type, url, name, enabled, fetch_interval_minutes, category_hint } = req.body;

    if (!type || !name) {
      return res.status(400).json({ error: 'type and name are required' });
    }
    const effectiveUrl = (type.toUpperCase() === 'TRIVIA_GENERATOR')
      ? 'trivia://generator'
      : (type.toUpperCase() === 'RIDDLE_GENERATOR')
        ? 'riddle://generator'
        : (type.toUpperCase() === 'MIND_TEASER_GENERATOR')
          ? 'mindteaser://generator'
          : (type.toUpperCase() === 'DAD_JOKE_GENERATOR')
            ? 'dadjoke://generator'
          : (type.toUpperCase() === 'WIKIDATA_FACTS')
          ? (url && url.trim()) || 'facts://'
          : (type.toUpperCase() === 'WIKIPEDIA' && !url)
            ? 'https://en.wikipedia.org/wiki/Psychology'
            : url;
    if (!effectiveUrl) {
      return res.status(400).json({ error: 'url is required for this source type' });
    }

    const { data: source, error } = await supabaseClient
      .from('orbix_sources')
      .insert({
        business_id: businessId,
        channel_id: channelId,
        type: type.toUpperCase(),
        url: effectiveUrl,
        name,
        enabled: enabled !== false,
        fetch_interval_minutes: fetch_interval_minutes || 60,
        category_hint: category_hint || null
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ source });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/sources] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to add source' });
  }
});

/**
 * PUT /api/v2/orbix-network/sources/:id
 * Update a source. Requires query.channel_id.
 */
router.put('/sources/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;
    const { type, url, name, enabled, fetch_interval_minutes, category_hint } = req.body;
    
    const updateData = {};
    if (type !== undefined) updateData.type = type.toUpperCase();
    if (url !== undefined) updateData.url = url;
    if (name !== undefined) updateData.name = name;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (fetch_interval_minutes !== undefined) updateData.fetch_interval_minutes = fetch_interval_minutes;
    if (category_hint !== undefined) updateData.category_hint = category_hint;
    updateData.updated_at = new Date().toISOString();
    
    const { data: source, error } = await supabaseClient
      .from('orbix_sources')
      .update(updateData)
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .select()
      .single();

    if (error) throw error;
    res.json({ source });
  } catch (error) {
    console.error('[PUT /api/v2/orbix-network/sources/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to update source' });
  }
});

/**
 * DELETE /api/v2/orbix-network/sources/:id
 * Delete a source. Requires query.channel_id.
 */
router.delete('/sources/:id', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { error } = await supabaseClient
      .from('orbix_sources')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/sources/:id] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: 'Failed to delete source' });
  }
});

/**
 * GET /api/v2/orbix-network/review-queue
 * Get pending items in review queue. Requires query.channel_id (filtered via story -> channel).
 */
router.get('/review-queue', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;

    const { data: channelStories } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('business_id', businessId)
      .eq('channel_id', channelId);
    const storyIds = (channelStories || []).map((s) => s.id);
    if (storyIds.length === 0) {
      return res.json({ items: [] });
    }

    const { data: queueItems, error } = await supabaseClient
      .from('orbix_review_queue')
      .select('*, orbix_stories(*), orbix_scripts(*)')
      .eq('business_id', businessId)
      .in('story_id', storyIds)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ items: queueItems || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/review-queue] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch review queue' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/generate-script
 * Force generate script for a story (useful for stuck stories)
 */
router.post('/stories/:id/generate-script', async (req, res) => {
  const startTime = Date.now();
  const storyId = req.params.id;

  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;

    const { data: story, error: storyError } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', storyId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    
    if (storyError) {
      console.error(`[Generate Script API] ERROR: Story fetch failed:`, storyError);
      return res.status(404).json({ error: 'Story not found', details: storyError.message });
    }
    
    if (!story) {
      console.error(`[Generate Script API] ERROR: Story not found (no data returned)`);
      return res.status(404).json({ error: 'Story not found' });
    }
    
    console.log(`[Generate Script API] ✓ Story found:`, {
      id: story.id,
      status: story.status,
      raw_item_id: story.raw_item_id,
      category: story.category,
      shock_score: story.shock_score
    });
    
    // If script already exists, delete it so we can regenerate (Rewrite flow)
    console.log(`[Generate Script API] Step 2: Checking for existing script...`);
    const { data: existingScript, error: scriptCheckError } = await supabaseClient
      .from('orbix_scripts')
      .select('id, created_at')
      .eq('story_id', storyId)
      .single();
    
    if (scriptCheckError && scriptCheckError.code !== 'PGRST116') {
      console.error(`[Generate Script API] ERROR: Script check failed:`, scriptCheckError);
    } else if (existingScript) {
      console.log(`[Generate Script API] Deleting existing script for rewrite:`, existingScript.id);
      const { error: deleteError } = await supabaseClient
        .from('orbix_scripts')
        .delete()
        .eq('id', existingScript.id)
        .eq('story_id', storyId)
        .eq('business_id', businessId);
      if (deleteError) {
        console.error(`[Generate Script API] ERROR: Failed to delete existing script:`, deleteError);
        return res.status(500).json({ error: 'Failed to replace existing script', details: deleteError.message });
      }
      console.log(`[Generate Script API] ✓ Existing script removed, proceeding with generation...`);
    } else {
      console.log(`[Generate Script API] ✓ No existing script found, proceeding with generation...`);
    }
    
    // Generate script for the story
    console.log(`[Generate Script API] Step 3: Importing generateAndSaveScript function...`);
    const { generateAndSaveScript } = await import('../../services/orbix-network/script-generator.js');
    console.log(`[Generate Script API] ✓ Function imported`);
    
    console.log(`[Generate Script API] Step 4: Calling generateAndSaveScript...`);
    const scriptGenerationStartTime = Date.now();
    
    try {
      const script = await generateAndSaveScript(businessId, story);
      const scriptGenerationDuration = Date.now() - scriptGenerationStartTime;
      
      console.log(`[Generate Script API] ✓ Script generated successfully in ${scriptGenerationDuration}ms`);
      console.log(`[Generate Script API] Script details:`, {
        id: script?.id,
        story_id: script?.story_id,
        created_at: script?.created_at
      });
      
      // Verify script was saved
      console.log(`[Generate Script API] Step 5: Verifying script was saved to database...`);
      const { data: verifiedScript, error: verifyError } = await supabaseClient
        .from('orbix_scripts')
        .select('*')
        .eq('id', script.id)
        .single();
      
      if (verifyError) {
        console.error(`[Generate Script API] ⚠ WARNING: Script verification failed:`, verifyError);
      } else {
        console.log(`[Generate Script API] ✓ Script verified in database`);
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`[Generate Script API] ========== SUCCESS (${totalDuration}ms) ==========`);
      
      res.json({ 
        success: true, 
        script: script,
        message: 'Script generated successfully',
        duration: totalDuration
      });
    } catch (scriptError) {
      const scriptGenerationDuration = Date.now() - scriptGenerationStartTime;
      console.error(`[Generate Script API] ERROR: Script generation failed after ${scriptGenerationDuration}ms:`, scriptError);
      console.error(`[Generate Script API] Error stack:`, scriptError.stack);
      res.status(500).json({ 
        error: 'Failed to generate script', 
        message: scriptError.message,
        details: scriptError.stack
      });
    }
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Generate Script API] ========== ERROR (${totalDuration}ms) ==========`);
    console.error(`[Generate Script API] Error:`, error);
    console.error(`[Generate Script API] Error stack:`, error.stack);
    res.status(500).json({ error: 'Failed to generate script', message: error.message, stack: error.stack });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/start-render
 * Create and start a render for a story (from Step 2)
 */
router.post('/stories/:id/start-render', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const storyId = req.params.id;

    const { data: story, error: storyError } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', storyId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    
    if (storyError || !story) {
      console.error(`[Start Render API] ERROR: Story not found:`, storyError);
      return res.status(404).json({ error: 'Story not found' });
    }
    
    console.log(`[Start Render API] ✓ Story found:`, {
      id: story.id,
      status: story.status,
      shock_score: story.shock_score
    });
    
    // Check if script exists
    const { data: script, error: scriptError } = await supabaseClient
      .from('orbix_scripts')
      .select('id')
      .eq('story_id', storyId)
      .single();
    
    if (scriptError || !script) {
      console.error(`[Start Render API] ERROR: Script not found for story:`, scriptError);
      return res.status(400).json({ error: 'Script not found for this story. Please generate a script first.' });
    }
    
    console.log(`[Start Render API] ✓ Script found:`, script.id);
    
    // Check if render already exists
    const { data: existingRender, error: renderCheckError } = await supabaseClient
      .from('orbix_renders')
      .select('id, render_status')
      .eq('story_id', storyId)
      .eq('business_id', businessId)
      .single();
    
    if (existingRender) {
      console.log(`[Start Render API] ⚠ Render already exists:`, existingRender.id);
      return res.status(400).json({ 
        error: 'Render already exists for this story',
        render_id: existingRender.id,
        render_status: existingRender.render_status
      });
    }
    
    // Select template and background (per-channel images when channel has uploads)
    console.log(`[Start Render API] Step 1: Selecting template and background...`);
    const { selectTemplate, selectBackground } = await import('../../services/orbix-network/video-renderer.js');
    const template = selectTemplate(story);
    const backgroundSelection = await selectBackground(businessId, channelId);
    
    console.log(`[Start Render API] ✓ Template: ${template}, Background ID: ${backgroundSelection.id}`);
    
    // Create render record - set to STEP_3_BACKGROUND_VIDEO immediately so it shows in Step 3
    console.log(`[Start Render API] Step 2: Creating render record...`);
    const { data: render, error: renderError } = await supabaseClient
      .from('orbix_renders')
      .insert({
        business_id: businessId,
        story_id: storyId,
        script_id: script.id,
        template: template,
        background_type: backgroundSelection.type,
        background_id: backgroundSelection.id,
        background_storage_path: backgroundSelection.storagePath ?? null,
        render_status: 'PENDING',
        render_step: 'STEP_3_BACKGROUND'
      })
      .select()
      .single();
    
    if (renderError) {
      console.error(`[Start Render API] ERROR: Failed to create render:`, renderError);
      return res.status(500).json({ error: 'Failed to create render', details: renderError.message });
    }
    
    console.log(`[Start Render API] ✓ Render created:`, render.id, '– worker will process');
    res.json({
      success: true,
      render: render,
      message: 'Render started successfully'
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/start-render] Error:', error);
    res.status(500).json({ 
      error: 'Failed to start render', 
      message: error.message 
    });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/force-render
 * Force start the render pipeline for a story: ensure script exists (generate if missing), then create render if none.
 * Requires query.channel_id. Used when a story is stuck in Story Creation.
 */
router.post('/stories/:id/force-render', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const storyId = req.params.id;

    const { data: story, error: storyError } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', storyId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();

    if (storyError || !story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Ensure script exists (generate if missing)
    let { data: script, error: scriptError } = await supabaseClient
      .from('orbix_scripts')
      .select('id')
      .eq('story_id', storyId)
      .single();

    if (scriptError || !script) {
      try {
        const { generateAndSaveScript } = await import('../../services/orbix-network/script-generator.js');
        const newScript = await generateAndSaveScript(businessId, story);
        script = { id: newScript.id };
      } catch (genErr) {
        console.error('[force-render] Script generation failed:', genErr);
        return res.status(400).json({ error: 'Script not found and generation failed. Try "Force Generate Script" first.' });
      }
    }

    // If render already exists, return success (pipeline already started)
    const { data: existingRender, error: renderCheckError } = await supabaseClient
      .from('orbix_renders')
      .select('id, render_status')
      .eq('story_id', storyId)
      .eq('business_id', businessId)
      .single();

    if (existingRender) {
      return res.json({
        success: true,
        render_id: existingRender.id,
        message: 'Render already exists; pipeline is running or completed.'
      });
    }

    // Create render (same as start-render)
    const { selectTemplate, selectBackground } = await import('../../services/orbix-network/video-renderer.js');
    const template = selectTemplate(story);
    const backgroundSelection = await selectBackground(businessId, channelId);

    const { data: render, error: renderError } = await supabaseClient
      .from('orbix_renders')
      .insert({
        business_id: businessId,
        story_id: storyId,
        script_id: script.id,
        template,
        background_type: backgroundSelection.type,
        background_id: backgroundSelection.id,
        background_storage_path: backgroundSelection.storagePath ?? null,
        render_status: 'PENDING',
        render_step: 'STEP_3_BACKGROUND'
      })
      .select()
      .single();

    if (renderError) {
      console.error('[force-render] Failed to create render:', renderError);
      return res.status(500).json({ error: 'Failed to create render', details: renderError.message });
    }

    // Run full pipeline for this specific render immediately (render → 30s → YouTube upload)
    const { runRenderByIdThenUpload } = await import('./orbix-network-jobs.js');
    runRenderByIdThenUpload(render.id)
      .then((out) => {
        if (out?.render?.processed) {
          console.log('[force-render] Pipeline run finished:', out.render.status, out?.upload ? 'upload ran' : '');
        }
      })
      .catch((err) => console.error('[force-render] Pipeline error:', err?.message || err));

    res.json({
      success: true,
      render_id: render.id,
      render,
      message: 'Render created; pipeline (render → upload) running in background.'
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/force-render] Error:', error);
    res.status(error?.status || 500).json({
      error: error?.message || 'Failed to force render',
      details: error?.message
    });
  }
});

/**
 * POST /api/v2/orbix-network/stories/approve-all
 * Approve all PENDING stories for the channel one at a time so the system can run.
 * Requires query or body channel_id.
 */
router.post('/stories/approve-all', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    let approved = 0;

    for (;;) {
      const { data: one, error: fetchError } = await supabaseClient
        .from('orbix_stories')
        .select('id')
        .eq('business_id', businessId)
        .eq('channel_id', channelId)
        .in('status', ['PENDING', 'QUEUED'])
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!one) break;

      const { error: storyError } = await supabaseClient
        .from('orbix_stories')
        .update({ status: 'APPROVED' })
        .eq('id', one.id)
        .eq('business_id', businessId)
        .eq('channel_id', channelId);

      if (storyError) throw storyError;

      await supabaseClient
        .from('orbix_review_queue')
        .update({
          status: 'APPROVED',
          reviewed_at: new Date().toISOString()
        })
        .eq('story_id', one.id)
        .eq('business_id', businessId);

      approved++;
    }

    res.json({ success: true, approved });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/approve-all] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to approve all stories' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/approve
 * Approve a story. Requires query or body channel_id.
 */
router.post('/stories/:id/approve', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { error: storyError } = await supabaseClient
      .from('orbix_stories')
      .update({ status: 'APPROVED' })
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId);

    if (storyError) throw storyError;

    await supabaseClient
      .from('orbix_review_queue')
      .update({
        status: 'APPROVED',
        reviewed_at: new Date().toISOString()
      })
      .eq('story_id', id)
      .eq('business_id', businessId);

    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/approve] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to approve story' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/reject
 * Reject a story. Requires query or body channel_id.
 */
router.post('/stories/:id/reject', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;

    const { error: storyError } = await supabaseClient
      .from('orbix_stories')
      .update({ status: 'REJECTED' })
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId);

    if (storyError) throw storyError;

    await supabaseClient
      .from('orbix_review_queue')
      .update({
        status: 'REJECTED',
        reviewed_at: new Date().toISOString()
      })
      .eq('story_id', id)
      .eq('business_id', businessId);

    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/reject] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to reject story' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/script/edit-hook
 * Edit the hook (opening line) of a script. Requires query or body channel_id.
 */
router.post('/stories/:id/script/edit-hook', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { id } = req.params;
    const { hook } = req.body;

    if (!hook || typeof hook !== 'string') {
      return res.status(400).json({ error: 'Hook text is required' });
    }

    const { data: story } = await supabaseClient
      .from('orbix_stories')
      .select('id')
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const { data: script, error: scriptError } = await supabaseClient
      .from('orbix_scripts')
      .select('*')
      .eq('story_id', id)
      .single();
    
    // Update script hook
    const scriptContent = script.content_json || {};
    scriptContent.hook = hook;
    
    const { error: updateError } = await supabaseClient
      .from('orbix_scripts')
      .update({ content_json: scriptContent })
      .eq('id', script.id)
      .eq('story_id', id);
    
    if (updateError) throw updateError;
    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/script/edit-hook] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to edit script hook' });
  }
});

/**
 * POST /api/v2/orbix-network/raw-items/:id/force-score
 * Run classifier + shock scorer on a raw item and save score (no story created).
 * Use when background scoring never ran or failed.
 */
router.post('/raw-items/:id/force-score', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const rawItemId = req.params.id;

    const { data: rawItem, error: rawItemError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('id', rawItemId)
      .eq('business_id', businessId)
      .single();

    if (rawItemError || !rawItem) {
      return res.status(404).json({ error: 'Raw item not found' });
    }

    if (rawItem.status !== 'NEW' && rawItem.status !== 'DISCARDED') {
      return res.status(400).json({ error: 'Raw item has already been processed' });
    }

    const { classifyStory, scoreShock } = await import('../../services/orbix-network/classifier.js');

    const category = await classifyStory(rawItem);
    if (!category || category === 'REJECT') {
      if (rawItem.status === 'NEW') {
        await supabaseClient
          .from('orbix_raw_items')
          .update({ status: 'DISCARDED', discard_reason: 'Classification rejected' })
          .eq('id', rawItemId)
          .eq('business_id', businessId);
      }
      return res.json({
        success: true,
        discarded: true,
        message: 'Item was rejected by classifier',
        raw_item: (await supabaseClient.from('orbix_raw_items').select('*').eq('id', rawItemId).eq('business_id', businessId).eq('channel_id', channelId).single()).data
      });
    }

    const scoreResult = await scoreShock({
      category,
      title: rawItem.title,
      snippet: rawItem.snippet,
      url: rawItem.url
    });

    const { data: updated, error: updateError } = await supabaseClient
      .from('orbix_raw_items')
      .update({
        category,
        shock_score: scoreResult.score,
        factors_json: scoreResult.factors || null
      })
      .eq('id', rawItemId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      raw_item: updated,
      message: `Scored: ${scoreResult.score}/100 (${category})`
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/raw-items/:id/force-score] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to score raw item' });
  }
});

/**
 * POST /api/v2/orbix-network/raw-items/:id/force-process
 * Force process a raw item into a story (bypasses automated pipeline)
 */
router.post('/raw-items/:id/force-process', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const rawItemId = req.params.id;

    const { data: rawItem, error: rawItemError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('id', rawItemId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();
    
    if (rawItemError || !rawItem) {
      return res.status(404).json({ error: 'Raw item not found' });
    }

    // If already marked processed/discarded but user wants to re-run (e.g. no story or failed), reset and remove existing story
    if (rawItem.status !== 'NEW') {
      await supabaseClient
        .from('orbix_stories')
        .delete()
        .eq('raw_item_id', rawItemId)
        .eq('business_id', businessId);
      await supabaseClient
        .from('orbix_raw_items')
        .update({ status: 'NEW', discard_reason: null })
        .eq('id', rawItemId);
      rawItem.status = 'NEW';
    }

    // Process the raw item into a story
    const { processRawItem } = await import('../../services/orbix-network/classifier.js');
    const { generateAndSaveScript } = await import('../../services/orbix-network/script-generator.js');
    
    const story = await processRawItem(businessId, rawItem);
    
    if (!story) {
      return res.status(400).json({ error: 'Failed to create story from raw item (score may be too low)' });
    }
    
    // Mark this story as manually forced by the user
    await supabaseClient
      .from('orbix_stories')
      .update({ is_manual_force: true })
      .eq('id', story.id);
    
    // Generate script for the story (this happens automatically in pipeline, but we need it here too)
    try {
      await generateAndSaveScript(businessId, story);
    } catch (scriptError) {
      console.error('[Force Process] Error generating script:', scriptError);
      // Don't fail the request, script generation can happen later
    }
    
    // Fetch updated story with is_manual_force flag
    const { data: updatedStory } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', story.id)
      .single();
    
    res.json({ 
      success: true, 
      story: updatedStory || story,
      message: 'Raw item processed into story successfully' 
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/raw-items/:id/force-process] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to force process raw item' });
  }
});

/**
 * Internal: promote one DISCARDED raw item to a story. Uses targetChannelId for the story.
 * Returns { story } or null if skipped/failed.
 */
async function allowOneRawItemAsStory(businessId, targetChannelId, rawItemId) {
  const { data: rawItem, error: rawItemError } = await supabaseClient
    .from('orbix_raw_items')
    .select('*')
    .eq('id', rawItemId)
    .eq('business_id', businessId)
    .single();

  if (rawItemError || !rawItem || rawItem.status !== 'DISCARDED') return null;

  const { classifyStory, scoreShock } = await import('../../services/orbix-network/classifier.js');
  const { generateAndSaveScript } = await import('../../services/orbix-network/script-generator.js');

  let category = rawItem.category;
  let shockScore = rawItem.shock_score;
  let factorsJson = rawItem.factors_json;

  // Dad joke (and other evergreen) raw items may have been saved without category; detect by url
  const isDadJokeByUrl = rawItem.url && String(rawItem.url).startsWith('dadjoke://');
  if (isDadJokeByUrl && !category) {
    category = 'dadjoke';
    shockScore = shockScore ?? 70;
    factorsJson = factorsJson || { source: 'dad_joke_generator' };
  }

  if (!category || shockScore == null) {
    const classified = await classifyStory(rawItem);
    if (!classified) return null;
    category = classified;
    const scoreResult = await scoreShock({
      category,
      title: rawItem.title,
      snippet: rawItem.snippet,
      url: rawItem.url
    });
    shockScore = scoreResult.score;
    factorsJson = scoreResult.factors || null;
    await supabaseClient
      .from('orbix_raw_items')
      .update({ category, shock_score: shockScore, factors_json: factorsJson })
      .eq('id', rawItemId)
      .eq('business_id', businessId);
  }

  const evergreenCategories = ['psychology', 'money', 'trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke'];
  const storyStatus = evergreenCategories.includes(category) ? 'APPROVED' : 'PENDING';

  const { data: story, error: storyError } = await supabaseClient
    .from('orbix_stories')
    .insert({
      business_id: businessId,
      channel_id: targetChannelId,
      raw_item_id: rawItem.id,
      category,
      shock_score: shockScore,
      factors_json: factorsJson ?? {},
      status: storyStatus,
      is_manual_force: true
    })
    .select()
    .single();

  if (storyError) throw storyError;

  await supabaseClient
    .from('orbix_raw_items')
    .update({ status: 'PROCESSED' })
    .eq('id', rawItemId)
    .eq('business_id', businessId);

  try {
    await generateAndSaveScript(businessId, story);
  } catch (scriptError) {
    console.error('[Allow Story] Error generating script:', scriptError);
  }
  return story;
}

/**
 * POST /api/v2/orbix-network/raw-items/allow-all
 * Allow all DISCARDED raw items for the channel (promote to stories), then approve all PENDING stories.
 * One call = allow all + approve all for the current channel. Must be defined before /:id routes.
 */
router.post('/raw-items/allow-all', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;

    const { data: discarded, error: fetchError } = await supabaseClient
      .from('orbix_raw_items')
      .select('id')
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('status', 'DISCARDED')
      .limit(100);

    if (fetchError) throw fetchError;
    const ids = (discarded || []).map((r) => r.id);
    let allowed = 0;
    for (const id of ids) {
      try {
        const story = await allowOneRawItemAsStory(businessId, channelId, id);
        if (story) allowed++;
      } catch (err) {
        console.error('[allow-all] Error allowing raw item', id, err.message);
      }
    }

    // Approve all PENDING/QUEUED stories for this channel (one at a time until none left)
    let approved = 0;
    for (;;) {
      const { data: one, error: e } = await supabaseClient
        .from('orbix_stories')
        .select('id')
        .eq('business_id', businessId)
        .eq('channel_id', channelId)
        .in('status', ['PENDING', 'QUEUED'])
        .limit(1)
        .maybeSingle();
      if (e || !one) break;
      await supabaseClient
        .from('orbix_stories')
        .update({ status: 'APPROVED' })
        .eq('id', one.id)
        .eq('business_id', businessId)
        .eq('channel_id', channelId);
      await supabaseClient
        .from('orbix_review_queue')
        .update({ status: 'APPROVED', reviewed_at: new Date().toISOString() })
        .eq('story_id', one.id)
        .eq('business_id', businessId);
      approved++;
    }

    res.json({ success: true, allowed, approved });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/raw-items/allow-all] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to allow all' });
  }
});

/**
 * POST /api/v2/orbix-network/raw-items/:id/allow-story
 * Promote a DISCARDED raw item into a story (ignore threshold) so it appears in the pipeline.
 */
router.post('/raw-items/:id/allow-story', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const rawItemId = req.params.id;

    const { data: rawItem, error: rawItemError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('id', rawItemId)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .single();

    if (rawItemError || !rawItem) {
      return res.status(404).json({ error: 'Raw item not found' });
    }

    if (rawItem.status !== 'DISCARDED') {
      return res.status(400).json({ error: 'Only discarded items can be allowed as story. Use Force process for NEW items.' });
    }

    const story = await allowOneRawItemAsStory(businessId, channelId, rawItemId);
    if (!story) {
      return res.status(400).json({ error: 'Item was rejected by classifier and cannot be allowed as story' });
    }

    res.json({
      success: true,
      story,
      message: 'Story allowed and added to pipeline'
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/raw-items/:id/allow-story] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to allow story' });
  }
});

/**
 * GET /api/v2/orbix-network/pipeline
 * Get pipeline view - raw items for Step 1, single active story for Steps 2-7. Requires query.channel_id.
 */
router.get('/pipeline', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { limit = 100, offset = 0 } = req.query;

    const threshold = (await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY))?.settings?.scoring?.shock_score_threshold ?? 45;

    const rawItemSelect = 'id, title, snippet, url, status, category, shock_score, factors_json, discard_reason, created_at';
    const rawItemLimit = Math.min(Number(limit) || 100, 200);
    // Include all NEW raw items in Step 1 so "already in database" items are visible; order by score (high first) so above-threshold appear first
    const { data: eligibleRawItems, error: rawItemsError } = await supabaseClient
      .from('orbix_raw_items')
      .select(rawItemSelect)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('status', 'NEW')
      .order('shock_score', { ascending: false, nullsFirst: false })
      .range(offset, offset + rawItemLimit - 1);

    if (rawItemsError) throw rawItemsError;

    const discardedSince = new Date();
    discardedSince.setDate(discardedSince.getDate() - 7);
    const { data: discardedRawItems, error: discardedError } = await supabaseClient
      .from('orbix_raw_items')
      .select(rawItemSelect)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .eq('status', 'DISCARDED')
      .gte('created_at', discardedSince.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (discardedError) throw discardedError;

    const pendingLimit = Math.min(Number(limit) || 50, 100);
    const { data: pendingStoriesData, error: pendingError } = await supabaseClient
      .from('orbix_stories')
      .select(`
        *,
        orbix_renders (
          id,
          render_status,
          render_step,
          step_progress,
          step_error,
          step_logs,
          created_at,
          updated_at,
          completed_at,
          output_url
        ),
        orbix_scripts (
          id,
          created_at
        )
      `)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .in('status', ['PENDING', 'QUEUED'])
      .order('is_manual_force', { ascending: false, nullsFirst: false })
      .order('shock_score', { ascending: false, nullsLast: true })
      .order('created_at', { ascending: false })
      .limit(pendingLimit);

    if (pendingError) throw pendingError;
    const pendingStories = pendingStoriesData || [];

    const activeLimit = Math.min(Number(limit) || 50, 100);
    const { data: activeStories, error: storiesError } = await supabaseClient
      .from('orbix_stories')
      .select(`
        *,
        orbix_renders (
          id,
          render_status,
          render_step,
          step_progress,
          step_error,
          step_logs,
          created_at,
          updated_at,
          completed_at,
          output_url
        )
      `)
      .eq('business_id', businessId)
      .eq('channel_id', channelId)
      .in('status', ['APPROVED', 'RENDERED', 'PUBLISHED'])
      .order('created_at', { ascending: false })
      .limit(activeLimit);

    if (storiesError) throw storiesError;
    
    // Transform raw items to pipeline format (Step 1): NEW items first, then DISCARDED (rejected)
    const toStep1Row = (rawItem, rejected = false) => {
      const score = rawItem.shock_score;
      const numScore = (score != null && score !== '') ? Number(score) : null;
      return {
      raw_item_id: rawItem.id,
      story_id: null,
      story_title: rawItem.title || 'Untitled',
      story_status: null,
      story_category: rawItem.category,
      story_shock_score: (numScore >= 0 && numScore <= 100) ? numScore : null,
      shock_score: (numScore >= 0 && numScore <= 100) ? numScore : null, // allow frontend to read either key
      story_created_at: rawItem.created_at,
      snippet: rawItem.snippet,
      render_id: null,
      render_status: null,
      render_step: null,
      step_progress: null,
      step_error: null,
      step_logs: null,
      output_url: null,
      render_created_at: null,
      render_updated_at: null,
      rejected: rejected || false,
      discard_reason: rejected ? (rawItem.discard_reason || 'Rejected') : null
    };
    };
    const rawItemsPipeline = [
      ...(eligibleRawItems || []).map(r => toStep1Row(r, false)),
      ...(discardedRawItems || []).map(r => toStep1Row(r, true))
    ];
    
    // Get raw item IDs from pending and active stories so we can show real titles (stories table has no title)
    const allRawItemIds = [...new Set([
      ...(pendingStories || []).map(s => s.raw_item_id),
      ...(activeStories || []).map(s => s.raw_item_id)
    ].filter(id => id !== null))];
    
    let rawItemTitlesMap = {};
    if (allRawItemIds.length > 0) {
      const { data: rawItems, error: rawItemsError } = await supabaseClient
        .from('orbix_raw_items')
        .select('id, title')
        .in('id', allRawItemIds);
      
      if (!rawItemsError && rawItems) {
        rawItemTitlesMap = rawItems.reduce((acc, item) => {
          acc[item.id] = item.title;
          return acc;
        }, {});
      }
    }
    
    const isOAuthStepError = (stepError) => {
      if (!stepError) return false;
      const s = String(stepError).toLowerCase();
      return ['youtube', 'oauth', 'not configured', 'credentials', 'client_id', 'client_secret', 'redirect', 'connect your youtube', 'disconnect'].some(t => s.includes(t));
    };
    const sanitizeRenderForDisplay = (render) => {
      if (!render) return render;
      if (render.output_url && (render.render_status === 'STEP_FAILED' || render.render_status === 'FAILED') && isOAuthStepError(render.step_error)) {
        return { ...render, render_status: 'COMPLETED', step_error: null, render_step: 'COMPLETED', step_progress: 100 };
      }
      return render;
    };

    // Transform pending stories to pipeline format (Step 2)
    const pendingStoriesPipeline = (pendingStories || []).map(story => {
      const render = sanitizeRenderForDisplay(story.orbix_renders && story.orbix_renders.length > 0 ? story.orbix_renders[0] : null);
      const script = story.orbix_scripts && story.orbix_scripts.length > 0 ? story.orbix_scripts[0] : null;
      const title = (story.title && String(story.title).trim()) ? String(story.title).trim() : (story.raw_item_id ? (rawItemTitlesMap[story.raw_item_id] || 'Untitled') : 'Untitled');
      return {
        raw_item_id: story.raw_item_id || null,
        story_id: story.id,
        story_title: title,
        story_status: story.status,
        story_category: story.category,
        story_shock_score: story.shock_score,
        story_created_at: story.created_at,
        script_id: script?.id || null,
        render_id: render?.id || null,
        render_status: render?.render_status || null,
        render_step: render?.render_step || null,
        step_progress: render?.step_progress || null,
        step_error: render?.step_error || null,
        step_logs: render?.step_logs || null,
        output_url: render?.output_url || null,
        render_created_at: render?.created_at || null,
        render_updated_at: render?.updated_at || null
      };
    });

    // Transform active stories to pipeline format (Steps 3-7)
    const activeStoriesPipeline = (activeStories || []).map(story => {
      const render = sanitizeRenderForDisplay(story.orbix_renders && story.orbix_renders.length > 0 ? story.orbix_renders[0] : null);
      const storyTitle = (story.title && String(story.title).trim()) ? String(story.title).trim() : (story.raw_item_id ? (rawItemTitlesMap[story.raw_item_id] || 'Untitled') : 'Untitled');
      return {
        raw_item_id: story.raw_item_id || null,
        story_id: story.id,
        story_title: storyTitle,
        story_status: story.status,
        story_category: story.category,
        story_shock_score: story.shock_score,
        story_created_at: story.created_at,
        render_id: render?.id || null,
        render_status: render?.render_status || null,
        render_step: render?.render_step || null,
        step_progress: render?.step_progress || null,
        step_error: render?.step_error || null,
        step_logs: render?.step_logs || null,
        output_url: render?.output_url || null,
        render_created_at: render?.created_at || null,
        render_updated_at: render?.updated_at || null
      };
    });
    
    // Combine: raw items (Step 1), pending stories (Step 2), then active stories (Steps 3-7)
    const pipeline = [...rawItemsPipeline, ...pendingStoriesPipeline, ...activeStoriesPipeline];
    
    res.json({ pipeline });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/pipeline] Error:', error);
    res.status(channelErrorStatus(error)).json({ error: error.message || 'Failed to fetch pipeline data' });
  }
});

/**
 * GET /api/v2/orbix-network/analytics
 * Get analytics data
 */
router.get('/analytics', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { start_date, end_date } = req.query;
    
    // Get published videos with analytics
    let query = supabaseClient
      .from('orbix_publishes')
      .select('*, orbix_renders(*, orbix_stories(*))')
      .eq('business_id', businessId)
      .eq('publish_status', 'PUBLISHED');
    
    if (start_date) {
      query = query.gte('posted_at', start_date);
    }
    if (end_date) {
      query = query.lte('posted_at', end_date);
    }
    
    const { data: publishes, error } = await query;
    
    if (error) throw error;
    
    // Get daily analytics
    const { data: dailyAnalytics, error: analyticsError } = await supabaseClient
      .from('orbix_analytics_daily')
      .select('*')
      .eq('business_id', businessId)
      .order('date', { ascending: false })
      .limit(30); // Last 30 days
    
    // Analytics error is not critical
    
    res.json({
      publishes: publishes || [],
      daily_analytics: dailyAnalytics || []
    });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/analytics] Error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/v2/orbix-network/youtube/auth-url
 * Optional query: channel_id, from_setup, usage=auto|manual (manual = second OAuth for Force Upload).
 * Uses per-channel OAuth client (auto or manual slot) when set; else global env.
 */
router.get('/youtube/auth-url', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const orbixChannelId = req.query.channel_id || null;
    const fromSetup = req.query.from_setup === 'true' || req.query.from_setup === true;
    const usage = (req.query.usage || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';

    let channelEntry = null;
    if (orbixChannelId) {
      const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
      const byChannel = moduleSettings?.settings?.youtube_by_channel || {};
      channelEntry = byChannel[orbixChannelId] || null;
    }
    const { resolveOAuthCredentials } = await import('../../services/orbix-network/youtube-publisher.js');
    const { clientId, clientSecret } = resolveOAuthCredentials(
      channelEntry,
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      usage
    );
    if (!clientId || !clientSecret) {
      const instructions = getYouTubeSetupInstructions(req);
      console.log('[Orbix auth-url] configured=false: no clientId/clientSecret for channel', orbixChannelId || 'global');
      return res.status(200).json({
        configured: false,
        auth_url: null,
        error: 'YouTube OAuth not configured',
        message: orbixChannelId
          ? 'Set global YOUTUBE_CLIENT_ID/SECRET in env, or add a custom OAuth app for this channel in Settings (Client ID + Secret).'
          : instructions.short,
        setup_instructions: instructions
      });
    }

    // Per-channel OAuth (custom client_id for auto, or manual_client_id for manual) uses riddle callback URL for separate quota.
    // Use the same getRiddleYoutubeRedirectUri() the callback uses so redirect_uri is identical (avoids mismatch errors).
    const hasCustomClient = orbixChannelId && (usage === 'manual' ? channelEntry?.manual_client_id : channelEntry?.client_id);
    let redirectUri;
    if (hasCustomClient) {
      const { getRiddleYoutubeRedirectUri } = await import('./riddle-youtube-callback.js');
      redirectUri = getRiddleYoutubeRedirectUri();
    } else {
      const redirectUriRaw = process.env.YOUTUBE_REDIRECT_URI || '';
      redirectUri = redirectUriRaw.startsWith('http') ? redirectUriRaw : `https://${redirectUriRaw}`;
    }
    if (!redirectUri || redirectUri === 'https://') {
      const instructions = getYouTubeSetupInstructions(req);
      return res.status(200).json({
        configured: false,
        auth_url: null,
        error: 'YouTube OAuth not configured',
        message: 'YOUTUBE_REDIRECT_URI is required.',
        setup_instructions: instructions
      });
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];
    let state = orbixChannelId ? `${businessId}:${orbixChannelId}` : businessId;
    if (usage === 'manual') state = `${state}:manual`;
    if (fromSetup) state = `${state}:setup`;
    const frontendOrigin = (req.query.frontend_origin || '').toString().trim();
    if (frontendOrigin && (frontendOrigin.startsWith('https://') || frontendOrigin.startsWith('http://'))) {
      state = `${state}|${frontendOrigin}`;
    }
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state
    });

    console.log('[Orbix auth-url] redirect_uri=', redirectUri, 'orbixChannelId=', orbixChannelId || 'none', 'usage=', usage, 'customOAuth=', !!hasCustomClient);
    res.json({ configured: true, auth_url: authUrl, redirect_uri: redirectUri });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/youtube/auth-url] Error:', error);
    console.error('[GET /api/v2/orbix-network/youtube/auth-url] Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to generate OAuth URL',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

function clientIdPreview(idStr) {
  if (!idStr || typeof idStr !== 'string') return null;
  const id = idStr.trim();
  const suffix = '.apps.googleusercontent.com';
  if (id.endsWith(suffix)) {
    const prefix = id.slice(0, -suffix.length);
    return prefix.length > 20 ? `${prefix.slice(0, 20)}…` : prefix;
  }
  return id.length > 12 ? `…${id.slice(-12)}` : (id ? '…' : null);
}

/**
 * GET /api/v2/orbix-network/youtube/channel
 * Get connected YouTube channel. Optional query channel_id = Orbix channel (per-channel); omit for legacy.
 * Per-channel: returns both auto (pipeline) and manual (Force Upload) connection status.
 */
router.get('/youtube/channel', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const orbixChannelId = req.query.channel_id || null;

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings || {};
    const yt = orbixChannelId && settings.youtube_by_channel?.[orbixChannelId]
      ? settings.youtube_by_channel[orbixChannelId]
      : settings.youtube;

    const connected = !!(yt?.channel_id && yt?.access_token);
    const channelAutoUploadEarly = (settings.channel_auto_upload && orbixChannelId && settings.channel_auto_upload[orbixChannelId] !== undefined)
      ? settings.channel_auto_upload[orbixChannelId] === true
      : false;
    if (!connected && !(orbixChannelId && yt?.manual_channel_id && yt?.manual_access_token)) {
      return res.json({
        connected: false,
        channel: null,
        custom_oauth: !!(yt?.client_id && orbixChannelId),
        credentials_source: null,
        client_id_preview: null,
        connected_manual: false,
        channel_manual: null,
        manual_custom_oauth: !!(orbixChannelId && yt?.manual_client_id),
        manual_client_id_preview: orbixChannelId ? clientIdPreview(yt?.manual_client_id) : null,
        auto_upload_enabled: orbixChannelId ? channelAutoUploadEarly : false
      });
    }

    const customOAuth = !!(yt?.client_id && orbixChannelId);
    const credentialsSource = customOAuth ? 'custom_oauth' : 'global';
    const connected_manual = !!(orbixChannelId && yt?.manual_access_token);
    const channel_manual = connected_manual && yt.manual_channel_id
      ? { id: yt.manual_channel_id, title: yt.manual_channel_title || '' }
      : null;

    const channelAutoUpload = (settings.channel_auto_upload && orbixChannelId && settings.channel_auto_upload[orbixChannelId] !== undefined)
      ? settings.channel_auto_upload[orbixChannelId] === true
      : false;

    res.json({
      connected,
      channel: yt?.channel_id ? { id: yt.channel_id, title: yt.channel_title || '' } : null,
      custom_oauth: customOAuth,
      credentials_source: credentialsSource,
      client_id_preview: clientIdPreview(yt?.client_id),
      connected_manual,
      channel_manual,
      manual_custom_oauth: !!(orbixChannelId && yt?.manual_client_id),
      manual_client_id_preview: orbixChannelId ? clientIdPreview(yt?.manual_client_id) : null,
        auto_upload_enabled: orbixChannelId ? channelAutoUpload : false
    });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/youtube/channel] Error:', error);
    res.status(500).json({ error: 'Failed to fetch channel info' });
  }
});

/**
 * POST /api/v2/orbix-network/settings/channel-auto-upload
 * Body: { channel_id, auto_upload_enabled: boolean }. Sets per-channel auto-upload for YouTube (default OFF so only test channels need enabling).
 */
router.post('/settings/channel-auto-upload', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = req.body?.channel_id;
    const enabled = req.body?.auto_upload_enabled === true;
    if (!channelId) {
      return res.status(400).json({ error: 'channel_id required' });
    }
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = { ...(moduleSettings?.settings || {}) };
    settings.channel_auto_upload = { ...(settings.channel_auto_upload || {}), [channelId]: enabled };
    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    res.json({ ok: true, channel_id: channelId, auto_upload_enabled: enabled });
  } catch (error) {
    console.error('[POST /settings/channel-auto-upload] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to save' });
  }
});

/**
 * GET /api/v2/orbix-network/youtube/diagnostic
 * End-to-end check for YouTube upload: credentials, tokens, redirect URI. No secrets in response.
 * Query: channel_id = Orbix channel to check (required for per-channel upload).
 */
router.get('/youtube/diagnostic', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const orbixChannelId = channelId;

    const { resolveOAuthCredentials } = await import('../../services/orbix-network/youtube-publisher.js');
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = moduleSettings?.settings || {};
    const byChannel = settings.youtube_by_channel || {};
    const channelEntry = byChannel[orbixChannelId] || null;

    const result = {
      channel_id: orbixChannelId,
      module_settings_exists: !!moduleSettings,
      youtube_entry_exists: !!channelEntry,
      has_access_token: !!(channelEntry?.access_token),
      has_refresh_token: !!(channelEntry?.refresh_token),
      client_credentials_source: 'none',
      redirect_uri_configured: false,
      redirect_uri_value: null,
      token_test: null,
      token_test_message: null,
      ready_for_upload: false,
      errors: []
    };

    const rawRedirect = (process.env.YOUTUBE_REDIRECT_URI || '').trim();
    result.redirect_uri_configured = !!rawRedirect;
    if (rawRedirect) {
      result.redirect_uri_value = rawRedirect.startsWith('http') ? rawRedirect : `https://${rawRedirect}`;
      if (channelEntry?.client_id) {
        result.redirect_uri_value = result.redirect_uri_value.replace(/\/api\/v2\/.*$/, '') + '/api/v2/riddle/youtube/callback';
      }
    }

    const { clientId, clientSecret } = resolveOAuthCredentials(channelEntry, process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
    if (channelEntry?.client_id && clientId) result.client_credentials_source = 'channel';
    else if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) result.client_credentials_source = 'env';
    else result.client_credentials_source = 'none';

    if (!result.module_settings_exists) result.errors.push('No Orbix module settings for this business.');
    if (!result.youtube_entry_exists) result.errors.push('No YouTube entry for this channel. Connect YouTube in Orbix Network → Settings (select this channel first).');
    if (!result.has_access_token) result.errors.push('Channel has no access_token. Connect YouTube in Settings, or disconnect and connect again to re-authorize.');
    if (!result.has_refresh_token) result.errors.push('No refresh_token — long-lived uploads may fail. Disconnect YouTube and connect again, and approve all permissions.');
    if (result.client_credentials_source === 'none') result.errors.push('No OAuth client: set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in env, or add a custom OAuth app for this channel in Settings.');
    if (!result.redirect_uri_configured) result.errors.push('YOUTUBE_REDIRECT_URI is not set in server env (e.g. https://api.tavarios.com or full callback URL).');

    result.ready_for_upload =
      result.module_settings_exists &&
      result.youtube_entry_exists &&
      result.has_access_token &&
      result.client_credentials_source !== 'none' &&
      result.redirect_uri_configured;

    if (result.ready_for_upload && channelEntry?.access_token && channelEntry?.refresh_token && clientId && clientSecret) {
      try {
        const { google } = await import('googleapis');
        const redirectUri = result.redirect_uri_value || process.env.YOUTUBE_REDIRECT_URI;
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        oauth2Client.setCredentials({
          access_token: channelEntry.access_token,
          refresh_token: channelEntry.refresh_token,
          ...(channelEntry.token_expiry ? { expiry_date: new Date(channelEntry.token_expiry).getTime() } : {})
        });
        const { credentials } = await oauth2Client.refreshAccessToken();
        result.token_test = credentials?.access_token ? 'ok' : 'error';
        result.token_test_message = result.token_test === 'ok' ? 'Token refresh succeeded.' : 'Token refresh returned no access token.';
      } catch (tokenErr) {
        result.token_test = 'error';
        const msg = tokenErr?.message || '';
        result.token_test_message = msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')
          ? 'Token revoked or expired. Disconnect YouTube for this channel in Settings, then connect again.'
          : msg.substring(0, 200);
        if (result.ready_for_upload) result.errors.push(result.token_test_message);
      }
    } else if (result.ready_for_upload && !result.has_refresh_token) {
      result.token_test = 'error';
      result.token_test_message = 'No refresh_token — cannot test. Reconnect YouTube and approve all permissions.';
    }

    res.json(result);
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/youtube/diagnostic] Error:', error);
    res.status(500).json({
      error: error.message || 'Diagnostic failed',
      channel_id: req.query?.channel_id || null
    });
  }
});

/**
 * POST /api/v2/orbix-network/youtube/custom-oauth
 * Set or clear per-channel OAuth app (separate Google Cloud project = separate quota).
 * Body: { channel_id, client_id?, client_secret?, usage?: 'auto'|'manual' }. usage=manual = second OAuth for Force Upload.
 * If client_id is empty for that usage, clears that slot.
 */
router.post('/youtube/custom-oauth', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const orbixChannelId = req.body?.channel_id || req.query?.channel_id;
    if (!orbixChannelId) {
      return res.status(400).json({ error: 'channel_id is required' });
    }
    const usage = (req.body?.usage || req.query?.usage || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const { data: channel } = await supabaseClient
      .from('orbix_channels')
      .select('id')
      .eq('id', orbixChannelId)
      .eq('business_id', businessId)
      .single();
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const settings = { ...(moduleSettings?.settings || {}) };
    settings.youtube_by_channel = settings.youtube_by_channel || {};
    const existing = settings.youtube_by_channel[orbixChannelId] || {};

    const clientId = (req.body?.client_id ?? '').trim();
    const clientSecret = (req.body?.client_secret ?? '').trim();

    if (usage === 'manual') {
      if (!clientId) {
        delete existing.manual_client_id;
        delete existing.manual_client_secret;
      } else {
        existing.manual_client_id = clientId;
        if (clientSecret) existing.manual_client_secret = clientSecret;
      }
    } else {
      if (!clientId) {
        delete existing.client_id;
        delete existing.client_secret;
      } else {
        existing.client_id = clientId;
        if (clientSecret) existing.client_secret = clientSecret;
      }
    }
    settings.youtube_by_channel[orbixChannelId] = { ...existing };

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    const slotLabel = usage === 'manual' ? 'Manual upload' : 'Auto upload';
    res.json({
      success: true,
      custom_oauth: !!clientId,
      usage,
      message: clientId ? `${slotLabel} OAuth app saved. Use "Connect YouTube (${usage})" to authorize.` : `${slotLabel} OAuth cleared.`
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/youtube/custom-oauth] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to save custom OAuth' });
  }
});

/**
 * POST /api/v2/orbix-network/youtube/disconnect
 * Disconnect YouTube. Body or query: channel_id, usage=auto|manual (manual = disconnect only manual OAuth slot).
 * Omit channel_id for legacy single disconnect. Omit usage to disconnect auto (or legacy).
 */
router.post('/youtube/disconnect', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const orbixChannelId = req.body?.channel_id || req.query?.channel_id || null;
    const usage = (req.body?.usage || req.query?.usage || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    if (!moduleSettings) {
      return res.json({ success: true });
    }
    
    const settings = { ...(moduleSettings.settings || {}) };
    if (orbixChannelId) {
      settings.youtube_by_channel = settings.youtube_by_channel || {};
      const existing = settings.youtube_by_channel[orbixChannelId] || {};
      if (usage === 'manual') {
        // Clear only manual tokens; keep manual_client_id/secret and auto slot
        settings.youtube_by_channel[orbixChannelId] = {
          ...existing,
          manual_access_token: '',
          manual_refresh_token: '',
          manual_channel_id: '',
          manual_channel_title: '',
          manual_token_expiry: null
        };
      } else {
        const { client_id, client_secret } = existing;
        settings.youtube_by_channel[orbixChannelId] = {
          ...(client_id && { client_id }),
          ...(client_secret && { client_secret }),
          ...(existing.manual_client_id && { manual_client_id: existing.manual_client_id }),
          ...(existing.manual_client_secret && { manual_client_secret: existing.manual_client_secret }),
          ...(existing.manual_access_token && { manual_access_token: existing.manual_access_token, manual_refresh_token: existing.manual_refresh_token, manual_channel_id: existing.manual_channel_id, manual_channel_title: existing.manual_channel_title, manual_token_expiry: existing.manual_token_expiry })
        };
      }
    } else {
      settings.youtube = {
        channel_id: '',
        channel_title: '',
        access_token: '',
        refresh_token: '',
        token_expiry: null
      };
    }

    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/youtube/disconnect] Error:', error);
    res.status(500).json({ error: 'Failed to disconnect YouTube' });
  }
});

/**
 * GET /api/v2/orbix-network/backgrounds
 * List background images for a channel. Requires query channel_id.
 */
router.get('/backgrounds', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { listChannelBackgrounds } = await import('../../services/orbix-network/video-renderer.js');
    const names = await listChannelBackgrounds(businessId, channelId);
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
    const items = names.map((name) => {
      const path = `${businessId}/${channelId}/${name}`;
      const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
      return { name, path, url: data?.publicUrl };
    });
    res.json({ backgrounds: items });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[GET /api/v2/orbix-network/backgrounds] Error:', error);
    res.status(500).json({ error: 'Failed to list backgrounds' });
  }
});

/**
 * POST /api/v2/orbix-network/backgrounds
 * Upload a background image for a channel. Requires body channel_id and multipart file (field: file).
 */
router.post('/backgrounds', upload.single('file'), async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Use multipart field "file".' });
    }
    const ext = (req.file.originalname && /\.(png|jpg|jpeg|webp)$/i.test(req.file.originalname))
      ? req.file.originalname.replace(/.*\./i, '').toLowerCase()
      : 'png';
    const name = `bg_${Date.now()}.${ext}`;
    const path = `${businessId}/${channelId}/${name}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
    const contentType = req.file.mimetype?.startsWith('image/') ? req.file.mimetype : `image/${ext}`;
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .upload(path, req.file.buffer, { contentType, upsert: true });
    if (error) {
      console.error('[POST /api/v2/orbix-network/backgrounds] Upload error:', error);
      return res.status(500).json({ error: error.message || 'Upload failed' });
    }
    const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
    res.status(201).json({ name, path: data.path, url: urlData?.publicUrl });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[POST /api/v2/orbix-network/backgrounds] Error:', error);
    res.status(500).json({ error: 'Failed to upload background' });
  }
});

/**
 * DELETE /api/v2/orbix-network/backgrounds
 * Delete a specific background image for a channel.
 * Body: { channel_id, path } where path is the full storage path e.g. businessId/channelId/bg_xxx.png
 */
router.delete('/backgrounds', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path is required' });

    // Safety: ensure the path belongs to this business and channel
    const expectedPrefix = `${businessId}/${channelId}/`;
    if (!filePath.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: 'Cannot delete files outside your channel folder' });
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_BACKGROUNDS || 'orbix-network-backgrounds';
    const { error } = await supabaseClient.storage.from(bucket).remove([filePath]);
    if (error) {
      console.error('[DELETE /api/v2/orbix-network/backgrounds] Storage error:', error);
      return res.status(500).json({ error: error.message || 'Delete failed' });
    }
    res.json({ success: true, path: filePath });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[DELETE /api/v2/orbix-network/backgrounds] Error:', error);
    res.status(500).json({ error: 'Failed to delete background' });
  }
});

/**
 * GET /api/v2/orbix-network/music
 * List music tracks for a channel. Requires query channel_id.
 */
router.get('/music', async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    const { listChannelMusicTracks } = await import('../../services/orbix-network/video-renderer.js');
    const tracks = await listChannelMusicTracks(businessId, channelId);
    res.json({ music: tracks });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[GET /api/v2/orbix-network/music] Error:', error);
    res.status(500).json({ error: 'Failed to list music' });
  }
});

/**
 * POST /api/v2/orbix-network/music
 * Upload a music track for a channel. Requires body channel_id and multipart file (field: file).
 */
router.post('/music', upload.single('file'), async (req, res) => {
  try {
    const channelId = await requireChannelId(req);
    const businessId = req.active_business_id;
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Use multipart field "file".' });
    }
    const ext = (req.file.originalname && /\.(mp3|m4a|wav|aac)$/i.test(req.file.originalname))
      ? req.file.originalname.replace(/.*\./i, '').toLowerCase()
      : 'mp3';
    const name = `music_${Date.now()}.${ext}`;
    const path = `${businessId}/${channelId}/${name}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_ORBIX_MUSIC || 'orbix-network-music';
    const contentType = req.file.mimetype?.startsWith('audio/') ? req.file.mimetype : `audio/${ext === 'm4a' ? 'mp4' : ext}`;
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .upload(path, req.file.buffer, { contentType, upsert: true });
    if (error) {
      console.error('[POST /api/v2/orbix-network/music] Upload error:', error);
      return res.status(500).json({ error: error.message || 'Upload failed' });
    }
    const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
    res.status(201).json({ name, path: data.path, url: urlData?.publicUrl });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[POST /api/v2/orbix-network/music] Error:', error);
    res.status(500).json({ error: 'Failed to upload music' });
  }
});

export default router;

