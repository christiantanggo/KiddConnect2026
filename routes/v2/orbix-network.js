import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { google } from 'googleapis';

const router = express.Router();
router.use(authenticate);
router.use(requireBusinessContext);

const MODULE_KEY = 'orbix-network';

/**
 * GET /api/v2/orbix-network/stories
 * List stories (with filters)
 */
router.get('/stories', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { category, status, limit = 50, offset = 0 } = req.query;
    
    let query = supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (category) {
      query = query.eq('category', category);
    }
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: stories, error } = await query;
    
    if (error) throw error;
    
    res.json({ stories: stories || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/stories] Error:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

/**
 * GET /api/v2/orbix-network/stories/:id
 * Get story details
 */
router.get('/stories/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    const { data: story, error } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();
    
    if (error) throw error;
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    res.json({ story });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/stories/:id] Error:', error);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});

/**
 * GET /api/v2/orbix-network/renders
 * List renders
 */
router.get('/renders', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = supabaseClient
      .from('orbix_renders')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('render_status', status);
    }
    
    const { data: renders, error } = await query;
    
    if (error) throw error;
    
    res.json({ renders: renders || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/renders] Error:', error);
    res.status(500).json({ error: 'Failed to fetch renders' });
  }
});

/**
 * GET /api/v2/orbix-network/renders/:id
 * Get render details (including video URL, story, script)
 */
router.get('/renders/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    const { data: render, error } = await supabaseClient
      .from('orbix_renders')
      .select('*, orbix_stories(*), orbix_scripts(*)')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();
    
    if (error) throw error;
    
    if (!render) {
      return res.status(404).json({ error: 'Render not found' });
    }
    
    res.json({ render });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/renders/:id] Error:', error);
    res.status(500).json({ error: 'Failed to fetch render' });
  }
});

/**
 * DELETE /api/v2/orbix-network/renders/:id
 * Cancel/delete a render (only if PENDING or PROCESSING)
 */
router.delete('/renders/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    // Get render to check status
    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('render_status')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();
    
    if (getError) throw getError;
    
    if (!render) {
      return res.status(404).json({ error: 'Render not found' });
    }
    
    // Only allow cancellation of PENDING or PROCESSING renders
    if (render.render_status !== 'PENDING' && render.render_status !== 'PROCESSING') {
      return res.status(400).json({ error: 'Can only cancel PENDING or PROCESSING renders' });
    }
    
    // Delete the render
    const { error: deleteError } = await supabaseClient
      .from('orbix_renders')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    
    if (deleteError) throw deleteError;
    
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/renders/:id] Error:', error);
    res.status(500).json({ error: 'Failed to cancel render' });
  }
});

/**
 * POST /api/v2/orbix-network/renders/:id/restart
 * Restart a render (reset status to PENDING, clear output/error fields)
 * Works for COMPLETED or FAILED renders
 */
router.post('/renders/:id/restart', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    // Get render to check status
    const { data: render, error: getError } = await supabaseClient
      .from('orbix_renders')
      .select('render_status')
      .eq('id', id)
      .eq('business_id', businessId)
      .single();
    
    if (getError) throw getError;
    
    if (!render) {
      return res.status(404).json({ error: 'Render not found' });
    }
    
    // Only allow restarting COMPLETED or FAILED renders
    if (render.render_status !== 'COMPLETED' && render.render_status !== 'FAILED') {
      return res.status(400).json({ error: 'Can only restart COMPLETED or FAILED renders' });
    }
    
    // Reset render status to PENDING and clear output/error fields
    const { data: updatedRender, error: updateError } = await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'PENDING',
        output_url: null,
        error_message: null,
        completed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single();
    
    if (updateError) throw updateError;
    
    res.json({ render: updatedRender });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/renders/:id/restart] Error:', error);
    res.status(500).json({ error: 'Failed to restart render' });
  }
});

/**
 * GET /api/v2/orbix-network/publishes
 * List published videos
 */
router.get('/publishes', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { platform, limit = 50, offset = 0 } = req.query;
    
    let query = supabaseClient
      .from('orbix_publishes')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (platform) {
      query = query.eq('platform', platform);
    }
    
    const { data: publishes, error } = await query;
    
    if (error) throw error;
    
    res.json({ publishes: publishes || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/publishes] Error:', error);
    res.status(500).json({ error: 'Failed to fetch publishes' });
  }
});

/**
 * GET /api/v2/orbix-network/raw-items
 * List raw items (scraped but not yet processed)
 */
router.get('/raw-items', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { status, source_id, limit = 50, offset = 0 } = req.query;
    
    let query = supabaseClient
      .from('orbix_raw_items')
      .select('*, orbix_sources(name, url, type)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (source_id) {
      query = query.eq('source_id', source_id);
    }
    
    const { data: rawItems, error } = await query;
    
    if (error) throw error;
    
    res.json({ raw_items: rawItems || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/raw-items] Error:', error);
    res.status(500).json({ error: 'Failed to fetch raw items' });
  }
});

/**
 * GET /api/v2/orbix-network/sources
 * List sources
 */
router.get('/sources', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    const { data: sources, error } = await supabaseClient
      .from('orbix_sources')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ sources: sources || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/sources] Error:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

/**
 * POST /api/v2/orbix-network/sources
 * Add a new source
 */
router.post('/sources', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { type, url, name, enabled, fetch_interval_minutes, category_hint } = req.body;
    
    if (!type || !url || !name) {
      return res.status(400).json({ error: 'type, url, and name are required' });
    }
    
    const { data: source, error } = await supabaseClient
      .from('orbix_sources')
      .insert({
        business_id: businessId,
        type: type.toUpperCase(), // RSS or HTML
        url,
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
    res.status(500).json({ error: 'Failed to add source', message: error.message });
  }
});

/**
 * PUT /api/v2/orbix-network/sources/:id
 * Update a source
 */
router.put('/sources/:id', async (req, res) => {
  try {
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
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ source });
  } catch (error) {
    console.error('[PUT /api/v2/orbix-network/sources/:id] Error:', error);
    res.status(500).json({ error: 'Failed to update source', message: error.message });
  }
});

/**
 * DELETE /api/v2/orbix-network/sources/:id
 * Delete a source
 */
router.delete('/sources/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    const { error } = await supabaseClient
      .from('orbix_sources')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/v2/orbix-network/sources/:id] Error:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

/**
 * GET /api/v2/orbix-network/review-queue
 * Get pending items in review queue
 */
router.get('/review-queue', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    const { data: queueItems, error } = await supabaseClient
      .from('orbix_review_queue')
      .select('*, orbix_stories(*), orbix_scripts(*)')
      .eq('business_id', businessId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    res.json({ items: queueItems || [] });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/review-queue] Error:', error);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/approve
 * Approve a story (move to approved status)
 */
router.post('/stories/:id/approve', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    // Update story status
    const { error: storyError } = await supabaseClient
      .from('orbix_stories')
      .update({ status: 'APPROVED' })
      .eq('id', id)
      .eq('business_id', businessId);
    
    if (storyError) throw storyError;
    
    // Update review queue if exists
    const { error: queueError } = await supabaseClient
      .from('orbix_review_queue')
      .update({
        status: 'APPROVED',
        reviewed_at: new Date().toISOString()
      })
      .eq('story_id', id)
      .eq('business_id', businessId);
    
    // Queue error is not critical, continue
    
    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/approve] Error:', error);
    res.status(500).json({ error: 'Failed to approve story' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/reject
 * Reject a story
 */
router.post('/stories/:id/reject', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    
    // Update story status
    const { error: storyError } = await supabaseClient
      .from('orbix_stories')
      .update({ status: 'REJECTED' })
      .eq('id', id)
      .eq('business_id', businessId);
    
    if (storyError) throw storyError;
    
    // Update review queue if exists
    const { error: queueError } = await supabaseClient
      .from('orbix_review_queue')
      .update({
        status: 'REJECTED',
        reviewed_at: new Date().toISOString()
      })
      .eq('story_id', id)
      .eq('business_id', businessId);
    
    // Queue error is not critical, continue
    
    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/stories/:id/reject] Error:', error);
    res.status(500).json({ error: 'Failed to reject story' });
  }
});

/**
 * POST /api/v2/orbix-network/stories/:id/script/edit-hook
 * Edit the hook (opening line) of a script
 */
router.post('/stories/:id/script/edit-hook', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { id } = req.params;
    const { hook } = req.body;
    
    if (!hook || typeof hook !== 'string') {
      return res.status(400).json({ error: 'Hook text is required' });
    }
    
    // Get script for this story
    const { data: script, error: scriptError } = await supabaseClient
      .from('orbix_scripts')
      .select('*')
      .eq('story_id', id)
      .single();
    
    if (scriptError || !script) {
      return res.status(404).json({ error: 'Script not found for this story' });
    }
    
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
    res.status(500).json({ error: 'Failed to edit script hook' });
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
 * Get YouTube OAuth authorization URL
 */
router.get('/youtube/auth-url', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) {
      return res.status(500).json({ 
        error: 'YouTube OAuth not configured',
        message: 'Please configure YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI environment variables'
      });
    }
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );
    
    // Generate authorization URL
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to get refresh token
      state: businessId // Include business ID in state for callback verification
    });
    
    res.json({ auth_url: authUrl });
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

/**
 * GET /api/v2/orbix-network/youtube/channel
 * Get connected YouTube channel information
 */
router.get('/youtube/channel', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    
    if (!moduleSettings?.settings?.youtube?.channel_id) {
      return res.json({ 
        connected: false,
        channel: null
      });
    }
    
    res.json({
      connected: true,
      channel: {
        id: moduleSettings.settings.youtube.channel_id,
        title: moduleSettings.settings.youtube.channel_title || ''
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/youtube/channel] Error:', error);
    res.status(500).json({ error: 'Failed to fetch channel info' });
  }
});

/**
 * POST /api/v2/orbix-network/youtube/disconnect
 * Disconnect YouTube account
 */
router.post('/youtube/disconnect', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    if (!moduleSettings) {
      return res.json({ success: true });
    }
    
    const settings = moduleSettings.settings || {};
    settings.youtube = {
      channel_id: '',
      channel_title: '',
      access_token: '',
      refresh_token: '',
      token_expiry: null
    };
    
    await ModuleSettings.update(businessId, MODULE_KEY, settings);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/youtube/disconnect] Error:', error);
    res.status(500).json({ error: 'Failed to disconnect YouTube' });
  }
});

export default router;

