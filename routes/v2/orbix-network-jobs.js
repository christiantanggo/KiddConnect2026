/**
 * Orbix Network Background Job Routes
 * These endpoints are called by scheduled tasks or manually by authenticated users
 */

import express from 'express';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay } from 'date-fns';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { scrapeAllSources } from '../../services/orbix-network/scraper.js';
import { processRawItem } from '../../services/orbix-network/classifier.js';
import { generateAndSaveScript } from '../../services/orbix-network/script-generator.js';
import { processRenderJob, selectTemplate, selectBackground } from '../../services/orbix-network/video-renderer.js';
import { publishVideo, getVideoAnalytics, SKIP_YOUTUBE_UPLOAD_CODE } from '../../services/orbix-network/youtube-publisher.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { runAutomatedPipeline } from '../../services/orbix-network/pipeline-scheduler.js';

const router = express.Router();

/** Get enabled channel IDs for a business (used to skip disabled channels in pipeline/publish). */
async function getEnabledChannelIds(businessId) {
  const { data: rows } = await supabaseClient
    .from('orbix_channels')
    .select('id')
    .eq('business_id', businessId)
    .or('enabled.eq.true,enabled.is.null');
  return new Set((rows || []).map(r => r.id));
}

/** Per-channel auto-upload: only true if this channel is explicitly enabled. Default OFF so real channels are safe; enable only for test channels. */
function getChannelAutoUploadEnabledFromSettings(settings, channelId) {
  const s = settings || {};
  if (s.channel_auto_upload && s.channel_auto_upload[channelId] !== undefined) {
    return s.channel_auto_upload[channelId] === true;
  }
  return false; // no per-channel setting = OFF (do not use global; avoid accidental uploads)
}

/** Channel IDs for a business in creation order (matches dropdown). Legacy/null is not in the list; treat as last. */
export async function getChannelOrderForBusiness(businessId) {
  const { data: rows } = await supabaseClient
    .from('orbix_channels')
    .select('id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });
  return (rows || []).map(r => r.id);
}

/** Source type -> story categories that source can produce. Used to validate upload channel matches content. */
const SOURCE_TYPE_TO_CATEGORIES = {
  TRIVIA_GENERATOR: ['trivia'],
  WIKIDATA_FACTS: ['facts'],
  WIKIPEDIA: ['psychology', 'money'],
  RIDDLE_GENERATOR: ['riddle'],
  MIND_TEASER_GENERATOR: ['mindteaser'],
  DAD_JOKE_GENERATOR: ['dadjoke'],
  RSS: ['ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money'],
  HTML: ['ai-automation', 'corporate-collapses', 'tech-decisions', 'laws-rules', 'money-markets', 'psychology', 'money'],
};

/**
 * Get the set of story categories that are allowed for a channel (based on its sources).
 * Prevents uploading e.g. a psychology-format video to the Trivia channel.
 * @param {string} channelId - Orbix channel UUID
 * @returns {Promise<Set<string> | null>} Allowed category codes, or null if channel has no sources (skip check)
 */
export async function getChannelAllowedCategories(channelId) {
  if (!channelId) return null;
  const { data: sources, error } = await supabaseClient
    .from('orbix_sources')
    .select('type')
    .eq('channel_id', channelId);
  if (error || !sources?.length) return null;
  const allowed = new Set();
  for (const s of sources) {
    const type = (s.type || '').toUpperCase();
    const cats = SOURCE_TYPE_TO_CATEGORIES[type];
    if (cats) cats.forEach(c => allowed.add(c));
  }
  return allowed.size ? allowed : null;
}

/**
 * Get today's YouTube upload count per channel (from orbix_publishes, not completed renders).
 * Used to enforce daily cap so we never exceed N uploads per channel per day.
 * @param {string} businessId
 * @param {string} timezone - e.g. 'America/New_York'
 * @returns {Promise<Record<string, number>>} { [channelIdKey]: count } where channelIdKey is channel UUID or '__legacy__'
 */
async function getPublishCountByChannelToday(businessId, timezone) {
  const todayISO = getStartOfTodayISOInZone(timezone);
  const { data: rows, error } = await supabaseClient
    .from('orbix_publishes')
    .select('render_id')
    .eq('business_id', businessId)
    .eq('publish_status', 'PUBLISHED')
    .gte('posted_at', todayISO);
  if (error || !rows?.length) return {};
  const renderIds = rows.map(r => r.render_id).filter(Boolean);
  if (renderIds.length === 0) return {};
  const { data: renders } = await supabaseClient
    .from('orbix_renders')
    .select('id, orbix_stories(channel_id)')
    .eq('business_id', businessId)
    .in('id', renderIds);
  const countByChannel = {};
  for (const r of (renders || [])) {
    const chKey = r.orbix_stories?.channel_id ?? '__legacy__';
    countByChannel[chKey] = (countByChannel[chKey] || 0) + 1;
  }
  return countByChannel;
}

/** First channel ID that has YouTube connected for this business (for legacy renders in auto-upload). */
async function getFirstChannelIdWithYouTube(businessId) {
  const settings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
  const byChannel = settings?.settings?.youtube_by_channel || {};
  for (const [channelId, yt] of Object.entries(byChannel)) {
    if (yt?.access_token) return channelId;
  }
  return null;
}

// Require authentication for manual triggers
router.use(authenticate);
router.use(requireBusinessContext);

// Note: These jobs process ALL businesses with active subscriptions
// For testing, authenticated users can trigger them manually

/**
 * Run scrape job for all businesses with active subscriptions
 * Can be called directly (for scheduled tasks) or via HTTP route
 */
export async function runScrapeJob() {
  try {
    // Get all businesses with active Orbix Network subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    
    if (subError) throw subError;
    
    if (!subscriptions || subscriptions.length === 0) {
      return { 
        success: true, 
        message: 'No active subscriptions',
        businesses_processed: 0 
      };
    }
    
    const businessIds = subscriptions.map(s => s.business_id);
    let totalScraped = 0;
    let totalSaved = 0;
    const sourceResults = [];
    
    for (const businessId of businessIds) {
      try {
        console.log(`[Orbix Jobs] Scraping sources for business ${businessId}...`);
        const result = await scrapeAllSources(businessId);
        totalScraped += result.scraped || 0;
        totalSaved += result.saved || 0;
        if (result.source_results) {
          sourceResults.push(...result.source_results);
        }
        console.log(`[Orbix Jobs] Business ${businessId} results:`, {
          scraped: result.scraped,
          saved: result.saved,
          duplicates_skipped: result.duplicates_skipped,
          sources_processed: result.sources_processed
        });
      } catch (error) {
        console.error(`[Orbix Jobs] Error scraping for business ${businessId}:`, error.message);
        console.error(`[Orbix Jobs] Error stack:`, error.stack);
        // Continue with next business
      }
    }
    
    console.log(`[Orbix Jobs] ========== SCRAPE JOB COMPLETE ==========`);
    console.log(`[Orbix Jobs] Businesses processed: ${businessIds.length}`);
    console.log(`[Orbix Jobs] Total items found: ${totalScraped}`);
    console.log(`[Orbix Jobs] Total items saved: ${totalSaved}`);
    console.log(`[Orbix Jobs] Total duplicates skipped: ${totalScraped - totalSaved}`);
    console.log(`[Orbix Jobs] ==========================================`);
    
    return {
      success: true,
      businesses_processed: businessIds.length,
      total_scraped: totalScraped,
      total_saved: totalSaved,
      duplicates_skipped: totalScraped - totalSaved,
      source_results: sourceResults
    };
  } catch (error) {
    console.error('[Orbix Jobs] Scrape job error:', error);
    throw error;
  }
}

/**
 * POST /api/v2/orbix-network/jobs/scrape
 * Scrape sources. If body.channel_id and active_business_id, scrape only that channel for that business.
 * Otherwise scrape all businesses with active subscriptions (scheduled job behavior).
 */
router.post('/scrape', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const channelId = req.body?.channel_id ?? null;

    let result;
    if (businessId && channelId) {
      const raw = await scrapeAllSources(businessId, channelId);
      result = {
        total_scraped: raw.scraped ?? 0,
        total_saved: raw.saved ?? 0,
        duplicates_skipped: raw.duplicates_skipped ?? (raw.scraped ?? 0) - (raw.saved ?? 0),
        source_results: raw.source_results ?? [],
        sources_processed: raw.sources_processed ?? 0
      };
    } else {
      result = await runScrapeJob();
    }

    const enabledSources = (result.source_results?.length ?? 0) || (result.sources_processed ?? 0);
    const results = [{
      scraped: result.total_scraped ?? 0,
      saved: result.total_saved ?? 0,
      duplicates_skipped: result.duplicates_skipped ?? 0,
      enabled_sources: enabledSources,
      error: result.error ?? null
    }];
    res.json({
      success: true,
      message: (result.total_saved ?? 0) === 0 && (result.total_scraped ?? 0) > 0
        ? `Scrape found ${result.total_scraped} items; all were already in the database (duplicates skipped).`
        : `Scraped ${result.total_scraped} items, saved ${result.total_saved} new.`,
      status: 'completed',
      results
    });
  } catch (error) {
    console.error('[Orbix Jobs] Scrape job error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Scrape job failed'
    });
  }
});

/**
 * Run process job for all businesses with active subscriptions
 */
export async function runProcessJob() {
  try {
    // Get all businesses with active subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    
    if (subError) throw subError;
    
    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, stories_created: 0 };
    }
    
    const businessIds = subscriptions.map(s => s.business_id);
    let totalProcessed = 0;
    let totalStories = 0;
    
    for (const businessId of businessIds) {
      try {
        // Get NEW raw items for this business
        const { data: rawItems, error: rawError } = await supabaseClient
          .from('orbix_raw_items')
          .select('*')
          .eq('business_id', businessId)
          .eq('status', 'NEW')
          .limit(10); // Process 10 at a time per business
        
        if (rawError) throw rawError;
        
        if (!rawItems || rawItems.length === 0) continue;
        
        for (const rawItem of rawItems) {
          try {
            // Process raw item (classify, score, create story if passes threshold)
            const story = await processRawItem(businessId, rawItem);
            
            if (story) {
              // Generate script for the story
              await generateAndSaveScript(businessId, story);
              
              // Check if review mode is enabled
              const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
              const reviewEnabled = moduleSettings?.settings?.review_mode?.enabled !== false;
              
              if (reviewEnabled) {
                // Add to review queue
                const { data: script } = await supabaseClient
                  .from('orbix_scripts')
                  .select('id')
                  .eq('story_id', story.id)
                  .single();
                
                if (script) {
                  await supabaseClient
                    .from('orbix_review_queue')
                    .insert({
                      business_id: businessId,
                      story_id: story.id,
                      script_id: script.id,
                      status: 'PENDING'
                    });
                }
              } else {
                // Auto-approve and mark for rendering
                await supabaseClient
                  .from('orbix_stories')
                  .update({ status: 'APPROVED' })
                  .eq('id', story.id);
              }
              
              totalStories++;
            }
            
            totalProcessed++;
          } catch (error) {
            console.error(`[Orbix Jobs] Error processing raw item ${rawItem.id}:`, error.message);
            // Continue with next item
          }
        }
      } catch (error) {
        console.error(`[Orbix Jobs] Error processing for business ${businessId}:`, error.message);
        // Continue with next business
      }
    }
    
    return {
      success: true,
      items_processed: totalProcessed,
      stories_created: totalStories
    };
  } catch (error) {
    console.error('[Orbix Jobs] Process job error:', error);
    throw error;
  }
}

/**
 * POST /api/v2/orbix-network/jobs/process
 * Process raw items: classify, score, generate scripts
 */
router.post('/process', async (req, res) => {
  try {
    const result = await runProcessJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Process job error:', error);
    res.status(500).json({ error: 'Process job failed', message: error.message });
  }
});

/**
 * Run review queue job for all businesses with active subscriptions
 */
export async function runReviewQueueJob() {
  try {
    // Get all businesses with active subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    
    if (subError) throw subError;
    
    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, approved: 0 };
    }
    
    const businessIds = subscriptions.map(s => s.business_id);
    let totalApproved = 0;
    
    for (const businessId of businessIds) {
      try {
        const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
        const reviewEnabled = moduleSettings?.settings?.review_mode?.enabled !== false;
        const autoApproveMinutes = moduleSettings?.settings?.review_mode?.auto_approve_minutes || 60;
        
        if (!reviewEnabled) continue; // Skip if review disabled
        
        // Get pending items past auto-approve time
        const autoApproveTime = new Date();
        autoApproveTime.setMinutes(autoApproveTime.getMinutes() - autoApproveMinutes);
        
        const { data: pendingItems, error: pendingError } = await supabaseClient
          .from('orbix_review_queue')
          .select('*')
          .eq('business_id', businessId)
          .eq('status', 'PENDING')
          .lt('created_at', autoApproveTime.toISOString());
        
        if (pendingError) throw pendingError;
        
        if (!pendingItems || pendingItems.length === 0) continue;
        
        for (const item of pendingItems) {
          // Auto-approve
          await supabaseClient
            .from('orbix_review_queue')
            .update({
              status: 'APPROVED',
              reviewed_at: new Date().toISOString()
            })
            .eq('id', item.id);
          
          // Update story status
          await supabaseClient
            .from('orbix_stories')
            .update({ status: 'APPROVED' })
            .eq('id', item.story_id);
          
          totalApproved++;
        }
      } catch (error) {
        console.error(`[Orbix Jobs] Error processing review queue for business ${businessId}:`, error.message);
        // Continue with next business
      }
    }
    
    return {
      success: true,
      approved: totalApproved
    };
  } catch (error) {
    console.error('[Orbix Jobs] Review queue job error:', error);
    throw error;
  }
}

/**
 * POST /api/v2/orbix-network/jobs/review-queue
 * Process review queue: auto-approve items past auto-approve time
 */
router.post('/review-queue', async (req, res) => {
  try {
    const result = await runReviewQueueJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Review queue job error:', error);
    res.status(500).json({ error: 'Review queue job failed', message: error.message });
  }
});

/**
 * Run render job for all businesses with active subscriptions
 */
export async function runRenderJob() {
  try {
    // Get all businesses with active subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    
    if (subError) throw subError;
    
    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, renders_created: 0, renders_processed: 0 };
    }
    
    const businessIds = subscriptions.map(s => s.business_id);
    let totalRendersCreated = 0;

    for (const businessId of businessIds) {
      try {
        // Get module settings to check daily video cap (use posting timezone so "today" matches user's day)
        const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
        const dailyVideoCap = moduleSettings?.settings?.limits?.daily_video_cap || 5;
        const postingTz = moduleSettings?.settings?.posting_schedule?.timezone ?? 'America/New_York';
        const todayISO = getStartOfTodayISOInZone(postingTz);
        
        const { data: todayRenders, error: rendersCountError } = await supabaseClient
          .from('orbix_renders')
          .select('id')
          .eq('business_id', businessId)
          .eq('render_status', 'COMPLETED')
          .gte('completed_at', todayISO);
        
        if (rendersCountError) {
          console.error(`[Orbix Jobs] Error counting today's renders for business ${businessId}:`, rendersCountError);
          continue; // Skip this business if we can't check the count
        }
        
        const rendersToday = todayRenders?.length || 0;
        const remainingSlots = dailyVideoCap - rendersToday;
        
        if (remainingSlots <= 0) {
          console.log(`[Orbix Jobs] Business ${businessId} has reached daily video cap (${rendersToday}/${dailyVideoCap}), skipping render creation`);
          continue; // Skip creating new renders if cap is reached
        }
        
        // Get approved stories that haven't been rendered yet, ordered by shock_score DESC (highest first)
        // Limit to remaining slots to respect daily cap
        const { data: approvedStories, error: storiesError } = await supabaseClient
          .from('orbix_stories')
          .select('*')
          .eq('business_id', businessId)
          .eq('status', 'APPROVED')
          .order('shock_score', { ascending: false }) // Highest shock scores first
          .limit(remainingSlots); // Only create renders up to the daily cap
        
        if (storiesError) throw storiesError;
        
        if (!approvedStories || approvedStories.length === 0) continue;
        
        for (const story of approvedStories) {
          try {
            // Get script for this story
            const { data: script, error: scriptError } = await supabaseClient
              .from('orbix_scripts')
              .select('*')
              .eq('story_id', story.id)
              .single();
            
            if (scriptError || !script) {
              console.error(`[Orbix Jobs] No script found for story ${story.id}`);
              continue;
            }
            
            // Check if render already exists
            const { data: existingRender } = await supabaseClient
              .from('orbix_renders')
              .select('id')
              .eq('story_id', story.id)
              .single();
            
            if (existingRender) continue; // Already has render
            
            // Select template and background (per-channel images when channel has uploads)
            const template = selectTemplate(story);
            const channelId = story.channel_id ?? null;
            const backgroundSelection = await selectBackground(businessId, channelId);
            
            // Create render job
            const { data: render, error: renderError } = await supabaseClient
              .from('orbix_renders')
              .insert({
                business_id: businessId,
                story_id: story.id,
                script_id: script.id,
                template: template,
                background_type: backgroundSelection.type,
                background_id: backgroundSelection.id,
                background_storage_path: backgroundSelection.storagePath ?? null,
                render_status: 'PENDING'
              })
              .select()
              .single();
            
            if (renderError) throw renderError;
            
            totalRendersCreated++;
            
            // Process the render (if FFmpeg is available)
            // Note: Actual rendering will be implemented when FFmpeg/audio generation is ready
            // For now, we just create the render job
            
          } catch (error) {
            console.error(`[Orbix Jobs] Error creating render for story ${story.id}:`, error.message);
            // Continue with next story
          }
        }
        
        // Reset any stuck PROCESSING renders to PENDING so they can be picked up
        const { data: stuckReset, error: resetError } = await supabaseClient
          .from('orbix_renders')
          .update({
            render_status: 'PENDING',
            error_message: null,
            step_error: null,
            updated_at: new Date().toISOString()
          })
          .eq('business_id', businessId)
          .eq('render_status', 'PROCESSING')
          .select('id');
        if (!resetError && stuckReset?.length > 0) {
          console.log(`[Orbix Jobs] Reset ${stuckReset.length} stuck PROCESSING render(s) to PENDING for business ${businessId}`);
        }

        // Actual rendering is done by the dedicated worker (scripts/orbix-render-worker.js).
        // Web server only creates PENDING jobs and resets stuck PROCESSING so worker can retry.
      } catch (error) {
        console.error(`[Orbix Jobs] Error processing renders for business ${businessId}:`, error.message);
        // Continue with next business
      }
    }
    
    console.log('[Orbix Jobs] ========== RENDER JOB (CREATE+RESET) COMPLETE ==========');
    console.log('[Orbix Jobs] Renders created:', totalRendersCreated);

    return {
      success: true,
      renders_created: totalRendersCreated
    };
  } catch (error) {
    console.error('[Orbix Jobs] Render job error:', error);
    throw error;
  }
}

/**
 * Run the full pipeline on an already-claimed render (status PROCESSING). Shared by processOnePendingRender and processRenderById.
 */
async function runPipelineOnClaimedRender(render) {
  try {
    const { writeProgressLog, setCurrentRender } = await import('../../utils/crash-and-progress-log.js');
    writeProgressLog('PIPELINE_CLAIMED', { renderId: render.id, story_id: render.story_id });
    setCurrentRender(render.id, 'PIPELINE_START');
  } catch (_) { /* progress log non-fatal */ }

  try {
    const processPromise = processRenderJob(render);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Render timeout after 30 minutes')), 30 * 60 * 1000)
    );
    const result = await Promise.race([processPromise, timeoutPromise]);

    if (result.status === 'COMPLETED') {
      await supabaseClient
        .from('orbix_renders')
        .update({
          render_status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          output_url: result.outputUrl ?? undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', render.id);
      console.log(`[Orbix Process] Pipeline COMPLETED render id=${render.id} output_url=${result.outputUrl ? 'set' : 'n/a'}`);
      return { processed: true, renderId: render.id, status: 'COMPLETED' };
    }

    if (result.status === 'RENDER_COMPLETE') {
      console.log(`[Orbix Process] Render READY_FOR_UPLOAD id=${render.id} (YouTube upload in separate job)`);
      return { processed: true, renderId: render.id, status: 'RENDER_COMPLETE' };
    }

    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'FAILED',
        error_message: result?.error || 'Unknown error',
        updated_at: new Date().toISOString()
      })
      .eq('id', render.id);
    console.error(`[Orbix Process] Pipeline FAILED render id=${render.id} error="${result?.error || 'Unknown'}"`);
    return { processed: true, renderId: render.id, status: 'FAILED' };
  } catch (err) {
    try {
      const { writeProgressLog, setCurrentRender } = await import('../../utils/crash-and-progress-log.js');
      writeProgressLog('PIPELINE_THREW', { renderId: render.id, error: err?.message, stack: err?.stack?.split('\n').slice(0, 8) });
      setCurrentRender(render.id, `THREW_${(err?.message || '').slice(0, 40)}`);
    } catch (_) { /* non-fatal */ }
    console.error(`[Orbix Process] Pipeline threw render id=${render.id} error="${err.message}" stack=${err.stack?.split('\n')[1]?.trim() || 'n/a'}`);
    await supabaseClient
      .from('orbix_renders')
      .update({
        render_status: 'FAILED',
        error_message: err.message || 'Unknown error',
        updated_at: new Date().toISOString()
      })
      .eq('id', render.id);
    return { processed: true, renderId: render.id, status: 'FAILED' };
  }
}

/**
 * Process one PENDING render. Safe to call from both the dedicated worker and the web server
 * (when no worker is running). Uses atomic claim: only the first caller to set PENDING→PROCESSING wins.
 */
export async function processOnePendingRender() {
  // Only process renders created in the last 2 hours — prevents a backlog building up overnight
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: pending } = await supabaseClient
    .from('orbix_renders')
    .select('*')
    .eq('render_status', 'PENDING')
    .gte('created_at', twoHoursAgo)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { processed: false };
  }

  const render = pending;
  console.log(`[Orbix Process] Found PENDING render id=${render.id} story_id=${render.story_id || 'n/a'} created_at=${render.created_at}`);

  const { data: claimed, error: updateError } = await supabaseClient
    .from('orbix_renders')
    .update({ render_status: 'PROCESSING', updated_at: new Date().toISOString() })
    .eq('id', render.id)
    .eq('render_status', 'PENDING')
    .select()
    .maybeSingle();

  if (updateError || !claimed) {
    if (!claimed) {
      console.log(`[Orbix Process] Could not claim render id=${render.id} (already claimed by another process)`);
      return { processed: false };
    }
    console.error(`[Orbix Process] Failed to set PROCESSING for render id=${render.id}:`, updateError?.message);
    return { processed: false };
  }

  console.log(`[Orbix Process] Claimed render id=${render.id} — starting pipeline (story ${render.story_id})`);
  return runPipelineOnClaimedRender(claimed);
}

/**
 * Process a specific render by ID immediately. Used when Restart Render or Force Render is clicked
 * so the flow runs right away instead of waiting for the scheduled poll.
 * @param {string} renderId - UUID of the render to process
 * @returns {{ processed: boolean, renderId?: string, status?: string, error?: string }}
 */
export async function processRenderById(renderId) {
  const { data: render, error: fetchError } = await supabaseClient
    .from('orbix_renders')
    .select('*')
    .eq('id', renderId)
    .single();

  if (fetchError || !render) {
    return { processed: false, error: 'Render not found' };
  }
  if (render.render_status !== 'PENDING') {
    return { processed: false, error: `Render is ${render.render_status}, not PENDING` };
  }

  const { data: claimed, error: updateError } = await supabaseClient
    .from('orbix_renders')
    .update({ render_status: 'PROCESSING', updated_at: new Date().toISOString() })
    .eq('id', renderId)
    .eq('render_status', 'PENDING')
    .select()
    .maybeSingle();

  if (updateError || !claimed) {
    return { processed: false, error: 'Could not claim render (already claimed or state changed)' };
  }

  console.log(`[Orbix Process] Processing render id=${renderId} immediately (restart/force-render)`);
  return runPipelineOnClaimedRender(claimed);
}

/**
 * POST /api/v2/orbix-network/jobs/render
 * Process render queue: render approved stories into videos (stops before YouTube upload; video saved to storage as READY_FOR_UPLOAD).
 */
router.post('/render', async (req, res) => {
  try {
    const result = await runRenderJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Render job error:', error);
    res.status(500).json({ error: 'Render job failed', message: error.message });
  }
});

const YOUTUBE_UPLOAD_MAX_ATTEMPTS = 2; // First try + one backup; then send failure email
const YOUTUBE_UPLOAD_RETRY_DELAY_MS = Number(process.env.ORBIX_YOUTUBE_UPLOAD_RETRY_DELAY_MS) || 5_000;

/** Send failure email to business (display name ORBIX-NETWORK FAILURE, includes channel and reason). */
async function sendOrbixUploadFailureEmail(businessId, channelId, errorMessage) {
  try {
    const { default: Business } = await import('../../models/Business.js');
    const business = await Business.findById(businessId);
    if (!business?.email) {
      console.warn('[Orbix] No business email, cannot send upload failure email');
      return;
    }
    let channelName = channelId ? null : 'Legacy';
    if (channelId) {
      const { data: ch } = await supabaseClient.from('orbix_channels').select('name').eq('id', channelId).single();
      channelName = ch?.name || channelId;
    } else {
      channelName = 'Legacy';
    }
    const subject = `Orbix Network: YouTube upload failed — ${channelName}`;
    const bodyText = `Channel: ${channelName}\nReason: ${errorMessage}\n\nPlease check Orbix Network settings and YouTube connection for this channel.`;
    const bodyHtml = `<p><strong>Channel:</strong> ${channelName}</p><p><strong>Reason:</strong> ${errorMessage}</p><p>Please check Orbix Network settings and YouTube connection for this channel.</p>`;
    const { sendEmail } = await import('../../services/notifications.js');
    await sendEmail(business.email, subject, bodyText, bodyHtml, 'ORBIX-NETWORK FAILURE', businessId);
    console.log(`[Orbix] Upload failure email sent to ${business.email} for channel ${channelName}`);
  } catch (err) {
    console.error('[Orbix] Failed to send upload failure email:', err.message);
  }
}

/**
 * Process one READY_FOR_UPLOAD render: upload video (from output_url storage) to YouTube.
 * Safe to retry on failure without re-rendering. Retries up to 3 times with delay between attempts.
 * Uses atomic claim (READY_FOR_UPLOAD → PROCESSING + STEP_8) so only one process runs upload per render.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force] - When true, bypasses the auto_upload_enabled toggle (used for manual uploads).
 * @param {string}  [options.renderId] - When provided, only upload this specific render (used for manual uploads).
 * @param {string}  [options.preferredChannelId] - When the render's story has no channel_id (legacy), use this channel's YouTube (e.g. from Force Upload).
 * @param {boolean} [options.useManual] - When true, use manual OAuth slot for upload (Force Upload = separate quota from auto).
 */
export async function processOneYouTubeUpload(options = {}) {
  const { force = false, renderId: targetRenderId = null, preferredChannelId = null, useManual = false } = options;

  // When targeting a specific render (forced/manual), fetch only that one
  if (targetRenderId) {
    const { data: ready } = await supabaseClient
      .from('orbix_renders')
      .select('*')
      .eq('render_status', 'READY_FOR_UPLOAD')
      .not('output_url', 'is', null)
      .eq('id', targetRenderId)
      .maybeSingle();
    if (!ready) return { processed: false };
    // Fall through with this render selected (pass preferredChannelId for legacy renders, useManual for Force Upload)
    return _uploadRender(ready, force, preferredChannelId, useManual);
  }

  // Fetch candidates. Exclude any render that has EVER been sent to YouTube (any orbix_publishes row) so we never double-upload the same video.
  let { data: candidates } = await supabaseClient
    .from('orbix_renders')
    .select('*, orbix_stories(channel_id)')
    .eq('render_status', 'READY_FOR_UPLOAD')
    .not('output_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(50);

  if (!candidates || candidates.length === 0) return { processed: false };

  const { data: alreadyAttempted } = await supabaseClient
    .from('orbix_publishes')
    .select('render_id')
    .in('render_id', candidates.map(c => c.id));
  const attemptedRenderIds = new Set((alreadyAttempted || []).map(p => p.render_id));
  candidates = candidates.filter(c => !attemptedRenderIds.has(c.id));
  if (candidates.length === 0) return { processed: false };

  // Sort by channel creation order (same as dropdown), then oldest first
  const businessIds = [...new Set(candidates.map(c => c.business_id))];
  const channelOrders = {};
  for (const bid of businessIds) {
    channelOrders[bid] = await getChannelOrderForBusiness(bid);
  }
  candidates = [...candidates].sort((a, b) => {
    if (a.business_id !== b.business_id) return a.business_id.localeCompare(b.business_id);
    const order = channelOrders[a.business_id] || [];
    const chA = a.orbix_stories?.channel_id ?? null;
    const chB = b.orbix_stories?.channel_id ?? null;
    const iA = chA == null ? 1e9 : order.indexOf(chA);
    const iB = chB == null ? 1e9 : order.indexOf(chB);
    if (iA !== iB) return iA - iB;
    return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
  });

  /** Minimum seconds between auto-uploads per business so we don't spam one channel (30s job + publish job both running). */
  const UPLOAD_COOLDOWN_SECONDS = 5 * 60; // 5 minutes

  // Find the first candidate whose channel is enabled and hasn't hit today's cap
  let render = null;
  for (const candidate of candidates) {
    const businessId = candidate.business_id;
    const channelId = candidate.orbix_stories?.channel_id ?? null;
    const channelIdKey = channelId || '__legacy__';

    const enabledIds = await getEnabledChannelIds(businessId);
    if (channelId != null && !enabledIds.has(channelId)) {
      console.log(`[Orbix YouTube] Channel ${channelId} is disabled, skipping render ${candidate.id}`);
      continue;
    }

    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    if (!getChannelAutoUploadEnabledFromSettings(moduleSettings?.settings, channelId)) {
      console.log(`[Orbix YouTube] Channel ${channelId} has auto-upload OFF (per-channel), skipping render ${candidate.id}`);
      continue;
    }

    // Avoid spamming: skip if this business had any upload in the last 5 min (from 30s job or publish job)
    const since = new Date(Date.now() - UPLOAD_COOLDOWN_SECONDS * 1000).toISOString();
    const { data: businessRenders } = await supabaseClient
      .from('orbix_renders')
      .select('id')
      .eq('business_id', businessId)
      .order('updated_at', { ascending: false })
      .limit(100);
    const renderIds = (businessRenders || []).map(r => r.id);
    if (renderIds.length > 0) {
      const { data: recentPublish } = await supabaseClient
        .from('orbix_publishes')
        .select('id')
        .eq('publish_status', 'PUBLISHED')
        .gte('posted_at', since)
        .in('render_id', renderIds)
        .limit(1)
        .maybeSingle();
      if (recentPublish) {
        continue; // this business had an upload in last 5 min, skip
      }
    }

    const dailyVideoCap = moduleSettings?.settings?.limits?.daily_video_cap ?? 5;
    const posting = moduleSettings?.settings?.posting_schedule || {};
    const timezone = posting.timezone ?? 'America/New_York';
    const todayISO = getStartOfTodayISOInZone(timezone);

    // Auto-upload only: must be inside posting window AND within a post slot (slot runs from that time until the next post time, e.g. 8am–11am)
    if (!isWithinUploadSlot(posting, dailyVideoCap, timezone)) {
      continue;
    }

    // Cap = actual YouTube uploads today per channel (orbix_publishes), NOT completed renders
    const publishCountByChannel = await getPublishCountByChannelToday(businessId, timezone);
    const countForChannel = publishCountByChannel[channelIdKey] || 0;

    if (countForChannel >= dailyVideoCap) {
      console.log(`[Orbix YouTube] Channel ${channelIdKey} upload cap reached (${countForChannel}/${dailyVideoCap} uploads today), skipping render ${candidate.id}`);
      continue;
    }

    render = candidate;
    break;
  }

  if (!render) return { processed: false };

  // Legacy renders (story has no channel_id): use first channel with YouTube so auto-upload can still run
  const storyChannelId = render.orbix_stories?.channel_id ?? null;
  const fallbackChannelId = storyChannelId == null
    ? await getFirstChannelIdWithYouTube(render.business_id)
    : null;
  if (storyChannelId == null && fallbackChannelId) {
    console.log(`[Orbix YouTube] Legacy render ${render.id} — using first channel with YouTube: ${fallbackChannelId}`);
  }

  try {
    return await _uploadRender(render, force, fallbackChannelId, false);
  } catch (err) {
    if (err?.code === SKIP_YOUTUBE_UPLOAD_CODE) {
      console.warn(`[Orbix YouTube] Upload skipped for render ${render.id}: ${err.message}`);
      return { processed: true, renderId: render.id, status: 'SKIPPED', message: err.message };
    }
    throw err;
  }
}

async function _uploadRender(render, force, legacyChannelId = null, useManual = false) {
  const videoUrl = render.output_url;

  // ── Channel vs story category: prevent wrong-format uploads (e.g. 30s psychology to Trivia channel) ──
  const { data: storyRow } = await supabaseClient
    .from('orbix_stories')
    .select('id, channel_id, category')
    .eq('id', render.story_id)
    .maybeSingle();
  const uploadChannelId = storyRow?.channel_id ?? legacyChannelId;
  if (uploadChannelId && storyRow?.category) {
    const allowed = await getChannelAllowedCategories(uploadChannelId);
    if (allowed && !allowed.has((storyRow.category || '').toLowerCase())) {
      const msg = `Upload blocked: this video is "${storyRow.category}" content but the channel only has sources for: ${[...allowed].join(', ')}. Wrong-format uploads are not allowed.`;
      console.warn(`[Orbix YouTube] ${msg} render id=${render.id}`);
      throw Object.assign(new Error(msg), { code: SKIP_YOUTUBE_UPLOAD_CODE });
    }
  }

  // ── Per-channel auto-upload toggle ────────────────────────────────────────
  // Only check when NOT a forced manual upload. Manual "Force Upload" bypasses this.
  if (!force) {
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(render.business_id, 'orbix-network');
    const autoUploadEnabled = getChannelAutoUploadEnabledFromSettings(moduleSettings?.settings, uploadChannelId);
    if (!autoUploadEnabled) {
      console.log(`[Orbix YouTube] Auto-upload OFF for channel ${uploadChannelId || 'legacy'} — render id=${render.id} left in READY_FOR_UPLOAD (use Force Upload or enable per-channel in Settings)`);
      return { processed: false, skippedAutoUploadDisabled: true, renderId: render.id };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Atomic claim: only we run upload; others will skip this render
  const { data: claimed, error: claimError } = await supabaseClient
    .from('orbix_renders')
    .update({
      render_status: 'PROCESSING',
      render_step: 'STEP_8_YOUTUBE_UPLOAD',
      updated_at: new Date().toISOString()
    })
    .eq('id', render.id)
    .eq('render_status', 'READY_FOR_UPLOAD')
    .select()
    .maybeSingle();

  if (claimError || !claimed) {
    if (!claimed) {
      console.log(`[Orbix YouTube] Render id=${render.id} already claimed by another process, skipping`);
    }
    return { processed: false };
  }

  const claimedRender = claimed;
  console.log(`[Orbix YouTube] Claimed READY_FOR_UPLOAD render id=${claimedRender.id} videoUrl=${videoUrl ? 'set' : 'MISSING'} (max ${YOUTUBE_UPLOAD_MAX_ATTEMPTS} attempts)`);

  /** Record a failed attempt so we stop re-picking this render and runPublishJob skips this channel for 24h. Avoids spamming the channel. */
  async function recordLimitOrQuotaFailure(message) {
    const errMsg = (message || 'Upload limit or quota exceeded').slice(0, 500);
    const row = {
      business_id: claimedRender.business_id,
      render_id: claimedRender.id,
      platform: 'YOUTUBE',
      title: (claimedRender.youtube_title || 'Orbix Video').toString().slice(0, 255),
      publish_status: 'FAILED',
      error_message: errMsg,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabaseClient.from('orbix_publishes').upsert(row, { onConflict: 'render_id,platform' });
    if (error) console.warn(`[Orbix YouTube] Could not record FAILED publish: ${error.message}`);
    else console.log(`[Orbix YouTube] Recorded FAILED publish for render ${claimedRender.id} — channel skipped 24h, no more auto-attempts for this render`);
  }

  const { step8YouTubeUpload } = await import('../../services/orbix-network/render-steps.js');
  const step8Options = { ...(legacyChannelId ? { preferredChannelId: legacyChannelId } : {}), ...(useManual ? { useManual: true } : {}) };

  let lastError = null;
  for (let attempt = 1; attempt <= YOUTUBE_UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const step8Result = await step8YouTubeUpload(claimedRender.id, claimedRender, videoUrl, step8Options);
      if (step8Result?.skipped) {
        console.log(`[Orbix YouTube] Upload skipped for render id=${claimedRender.id} — reason: ${step8Result?.message || 'unknown'}`);
        return { processed: true, renderId: claimedRender.id, status: 'SKIPPED' };
      }
      if (step8Result?.readyForUpload) {
        console.log(`[Orbix YouTube] Upload limit/quota — recording failure and stopping so we do not spam the channel`);
        await recordLimitOrQuotaFailure(step8Result?.message);
        return { processed: true, renderId: claimedRender.id, status: 'READY_FOR_UPLOAD', message: step8Result?.message };
      }
      const youtubeUrl = step8Result?.url ?? null;
      if (!youtubeUrl) {
        throw new Error('Step 8 returned no URL');
      }
      await supabaseClient
        .from('orbix_renders')
        .update({
          render_status: 'COMPLETED',
          render_step: 'COMPLETED',
          step_progress: 100,
          step_completed_at: new Date().toISOString(),
          step_error: null,
          output_url: youtubeUrl,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', claimedRender.id);

      // Write an orbix_publishes record so publishesToday counts this upload correctly
      const videoIdFromUrl = (url) => {
        if (!url || typeof url !== 'string') return null;
        try { return new URL(url).searchParams.get('v') || url.match(/[?&]v=([^&]+)/)?.[1] || null; } catch { return null; }
      };
      const platformVideoId = videoIdFromUrl(youtubeUrl);
      const publishTitle = (claimedRender.youtube_title || '').trim() || 'Orbix Video';
      await supabaseClient.from('orbix_publishes').insert({
        business_id: claimedRender.business_id,
        render_id: claimedRender.id,
        platform: 'YOUTUBE',
        platform_video_id: platformVideoId,
        title: publishTitle.slice(0, 255),
        publish_status: 'PUBLISHED',
        posted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn(`[Orbix YouTube] Could not write orbix_publishes record: ${error.message}`);
      });

      console.log(`[Orbix YouTube] Upload COMPLETED render id=${claimedRender.id} url=${youtubeUrl} (attempt ${attempt})`);
      return { processed: true, renderId: claimedRender.id, status: 'COMPLETED', url: youtubeUrl };
    } catch (err) {
      lastError = err;
      const msg = (err?.message || '').toLowerCase();
      const isLimitOrQuota = msg.includes('upload limit') || msg.includes('exceeded') || msg.includes('quota') || (err?.response?.data?.error?.errors?.some?.(e => e.reason === 'uploadLimitExceeded' || e.reason === 'quotaExceeded'));
      console.error(`[Orbix YouTube] Upload attempt ${attempt}/${YOUTUBE_UPLOAD_MAX_ATTEMPTS} FAILED render id=${claimedRender.id} error="${err.message}" code=${err?.code || 'n/a'}`);
      if (isLimitOrQuota) {
        console.log(`[Orbix YouTube] Limit/quota error — NOT retrying (would spam channel). Recording failure and stopping.`);
        await recordLimitOrQuotaFailure(err.message);
        await supabaseClient.from('orbix_renders').update({
          render_status: 'READY_FOR_UPLOAD',
          render_step: 'STEP_8_YOUTUBE_UPLOAD',
          step_error: err.message?.slice(0, 500),
          updated_at: new Date().toISOString()
        }).eq('id', claimedRender.id);
        return { processed: true, renderId: claimedRender.id, status: 'READY_FOR_UPLOAD', message: err.message };
      }
      if (attempt < YOUTUBE_UPLOAD_MAX_ATTEMPTS) {
        console.log(`[Orbix YouTube] Retrying in ${YOUTUBE_UPLOAD_RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, YOUTUBE_UPLOAD_RETRY_DELAY_MS));
      }
    }
  }

  const errorMessage = lastError?.message || 'Unknown error';
  const fullMessage = `Failed after ${YOUTUBE_UPLOAD_MAX_ATTEMPTS} attempts: ${errorMessage}`;
  console.error(`[Orbix YouTube] Upload FAILED after ${YOUTUBE_UPLOAD_MAX_ATTEMPTS} attempts render id=${claimedRender.id} lastError="${errorMessage}"`);
  await sendOrbixUploadFailureEmail(claimedRender.business_id, legacyChannelId || null, errorMessage);
  // Set to UPLOAD_FAILED (not READY_FOR_UPLOAD) so it stops retrying automatically — manual retry available in UI
  await supabaseClient
    .from('orbix_renders')
    .update({
      render_status: 'UPLOAD_FAILED',
      render_step: 'STEP_8_YOUTUBE_UPLOAD',
      step_error: fullMessage,
      updated_at: new Date().toISOString()
    })
    .eq('id', claimedRender.id);
  return { processed: true, renderId: claimedRender.id, status: 'FAILED', error: fullMessage };
}

/**
 * Run YouTube upload job: process READY_FOR_UPLOAD queue (one per call, or loop until empty).
 * Call after render job with optional 30s delay to avoid upload hangs.
 */
export async function runYouTubeUploadJob() {
  let processed = 0;
  let last = null;
  while (true) {
    const result = await processOneYouTubeUpload();
    if (!result.processed) break;
    processed++;
    last = result;
  }
  return {
    success: true,
    processed,
    last: last ?? null
  };
}

const YOUTUBE_UPLOAD_DELAY_MS = Number(process.env.ORBIX_YOUTUBE_UPLOAD_DELAY_MS) || 0; // 0 = start upload immediately after render

/**
 * Process one PENDING render. Renders are left READY_FOR_UPLOAD; only the publish job (at post times) uploads to YouTube.
 */
export async function runOneRenderThenUpload() {
  const result = await processOnePendingRender();
  return { render: result, upload: null };
}

/**
 * Process a specific render by ID. Leaves render READY_FOR_UPLOAD; use Force Upload in UI or wait for publish job at post times.
 */
export async function runRenderByIdThenUpload(renderId) {
  const result = await processRenderById(renderId);
  return { render: result, upload: null };
}

/**
 * POST /api/v2/orbix-network/jobs/youtube-upload
 * Process READY_FOR_UPLOAD queue: upload stored videos to YouTube (run after /render, e.g. after 30s delay).
 */
router.post('/youtube-upload', async (req, res) => {
  try {
    const result = await runYouTubeUploadJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] YouTube upload job error:', error);
    res.status(500).json({ error: 'YouTube upload job failed', message: error.message });
  }
});

/**
 * POST /api/v2/orbix-network/jobs/pipeline
 * Run render job (steps 3–7). Uploads happen only at post times via publish job (and manual Force Upload).
 */
router.post('/pipeline', async (req, res) => {
  try {
    const renderResult = await runRenderJob();
    res.json({
      success: true,
      render: renderResult
    });
  } catch (error) {
    console.error('[Orbix Jobs] Pipeline error:', error);
    res.status(500).json({ error: 'Pipeline failed', message: error.message });
  }
});

/**
 * Current wall-clock time in the given IANA timezone.
 * Uses date-fns-tz so behavior is consistent regardless of server TZ or Intl support.
 */
function getNowInZone(timezone = 'America/New_York') {
  const now = new Date();
  const zoned = toZonedTime(now, timezone);
  return {
    hours: zoned.getHours(),
    minutes: zoned.getMinutes(),
    minutesSinceMidnight: zoned.getHours() * 60 + zoned.getMinutes()
  };
}

/**
 * Start of today (midnight) in the given timezone, as ISO string for DB comparison.
 * Used so "today" for daily caps matches the user's calendar day, not UTC.
 */
function getStartOfTodayISOInZone(timezone = 'America/New_York') {
  const now = new Date();
  const localDate = toZonedTime(now, timezone);
  const startOfLocalDay = startOfDay(localDate);
  const startUtc = fromZonedTime(startOfLocalDay, timezone);
  return startUtc.toISOString();
}

/**
 * Get current time in a timezone as minutes since midnight (00:00 in that zone).
 * Uses date-fns-tz so it always reflects the USER's selected timezone, not server/UTC.
 */
function getMinutesSinceMidnightInZone(timezone = 'America/New_York') {
  return getNowInZone(timezone).minutesSinceMidnight;
}

/** Parse "HH:mm" to minutes since midnight. */
function parseTimeToMinutes(timeStr) {
  const [h, m] = (timeStr || '07:00').split(':').map(Number);
  return (h || 7) * 60 + (m || 0);
}

/** Default fixed post times (5/day): 8am, 11am, 2pm, 5pm, 8pm. Times in minutes since midnight in user's timezone. */
const DEFAULT_POST_SLOT_MINUTES = [8 * 60, 11 * 60, 14 * 60, 17 * 60, 20 * 60]; // 480, 660, 840, 1020, 1200

/** Default pipeline run times: same as post times (8am, 11am, 2pm, 5pm, 8pm). Scrape, render, and upload all happen at that time. */
const DEFAULT_PIPELINE_RUN_MINUTES = [8 * 60, 11 * 60, 14 * 60, 17 * 60, 20 * 60]; // same as DEFAULT_POST_SLOT_MINUTES

/**
 * Build evenly-spaced slot times for a given daily cap within the posting window.
 * Used when slot_times is empty but dailyVideoCap != 5.
 */
function buildDefaultSlots(dailyVideoCap, windowStartMinutes = 8 * 60, windowEndMinutes = 20 * 60) {
  const cap = Math.max(1, dailyVideoCap);
  if (cap === 1) return [windowStartMinutes];
  const step = Math.floor((windowEndMinutes - windowStartMinutes) / (cap - 1));
  return Array.from({ length: cap }, (_, i) => windowStartMinutes + i * step);
}

/**
 * Get post slot times in minutes.
 * Priority: user-configured slot_times → default 8/11/2/5/8 (cap=5) → evenly spaced for other caps.
 */
function getPostSlotMinutes(posting, dailyVideoCap) {
  const slotTimes = posting?.slot_times;
  if (Array.isArray(slotTimes) && slotTimes.length > 0) {
    return slotTimes.map(t => parseTimeToMinutes(typeof t === 'string' ? t : String(t)));
  }
  // No slot_times configured — use defaults
  if (dailyVideoCap === 5) return DEFAULT_POST_SLOT_MINUTES;
  // For any other cap, build evenly-spaced slots across the posting window
  const startMins = parseTimeToMinutes(posting?.start ?? '08:00');
  const endMins   = parseTimeToMinutes(posting?.end   ?? '20:00');
  return buildDefaultSlots(dailyVideoCap, startMins, endMins);
}

/**
 * Get pipeline run times in minutes (in user's timezone).
 * Uses posting_schedule.pipeline_run_times if set (user-configured, e.g. ["07:00","10:00","13:00","16:00","19:00"]).
 * Otherwise uses DEFAULT_PIPELINE_RUN_MINUTES (same as post times: 8am, 11am, 2pm, 5pm, 8pm in user's timezone).
 */
function getPipelineRunMinutes(posting, dailyVideoCap) {
  const configured = posting?.pipeline_run_times;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(t => parseTimeToMinutes(typeof t === 'string' ? t : String(t)));
  }
  return [...DEFAULT_PIPELINE_RUN_MINUTES];
}

/**
 * True only when (1) current time is inside the posting window (from UI: start–end + grace)
 * and (2) current time is within one of the upload intervals defined by the UI slot times.
 * Each slot extends from its time until the next slot (or window end). No hardcoded durations.
 */
function isWithinUploadSlot(posting, dailyVideoCap, timezone) {
  const startStr = posting?.start ?? '07:00';
  const endStr = posting?.end ?? '20:00';
  const startMinutes = parseTimeToMinutes(startStr);
  const endMinutes = parseTimeToMinutes(endStr);
  const gracePastEnd = endMinutes + 90;
  const nowInZone = getNowInZone(timezone);
  const currentMinutes = nowInZone.minutesSinceMidnight;
  if (currentMinutes < startMinutes || currentMinutes > gracePastEnd) return false;
  const slotMinutes = getPostSlotMinutes(posting, dailyVideoCap);
  if (slotMinutes.length === 0) return false;
  // Slot intervals: from each slot time until the next slot (or window end). All from UI.
  for (let i = 0; i < slotMinutes.length; i++) {
    const slotStart = Math.max(slotMinutes[i], startMinutes);
    const slotEnd = i < slotMinutes.length - 1
      ? slotMinutes[i + 1]
      : Math.min(gracePastEnd, 24 * 60);
    if (currentMinutes >= slotStart && currentMinutes < slotEnd) return true;
  }
  return false;
}

/**
 * Scheduled pipeline check — catch-up version.
 *
 * Instead of a narrow ±5 min window that breaks on server restarts, this uses a
 * Simple slot-based scheduler:
 *   - Every 5 min the server checks which pipeline slots are configured for today.
 *   - It tracks which slots it has already run TODAY in module_settings.pipeline_runs_today
 *     (an array of "HH:MM" strings, reset each calendar day).
 *   - If a slot time has passed and is not in pipeline_runs_today → run it now.
 *   - No intervals, no gaps, no thresholds. Just "did I run this slot today?"
 *   - Server restarts catch up automatically within 5 minutes.
 */
export async function runScheduledPipelineCheck() {
  try {
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) return { success: true, pipelines_run: 0 };

    const businessIds = subscriptions.map(s => s.business_id);
    let pipelinesRun = 0;

    for (const businessId of businessIds) {
      try {
        const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
        const dailyVideoCap = moduleSettings?.settings?.limits?.daily_video_cap ?? 5;
        const posting = moduleSettings?.settings?.posting_schedule || {};
        const timezone = posting.timezone ?? 'America/New_York';

        const pipelineRunMinutes = getPipelineRunMinutes(posting, dailyVideoCap);
        if (!pipelineRunMinutes || pipelineRunMinutes.length === 0) continue;

        const nowInZone = getNowInZone(timezone);
        const currentMinutes = nowInZone.minutesSinceMidnight;
        const currentTimeStr = `${String(nowInZone.hours).padStart(2, '0')}:${String(nowInZone.minutes).padStart(2, '0')}`;
        const todayStr = getStartOfTodayISOInZone(timezone).slice(0, 10); // "YYYY-MM-DD"
        const nowISO = new Date().toISOString();

        // Which slots have passed so far today (in the user's timezone)?
        const slotsPassed = pipelineRunMinutes.filter(m => m <= currentMinutes);
        if (slotsPassed.length === 0) {
          const nextM = pipelineRunMinutes.find(m => m > currentMinutes);
          const nextStr = nextM != null ? `${String(Math.floor(nextM / 60)).padStart(2, '0')}:${String(nextM % 60).padStart(2, '0')}` : 'none';
          console.log(`[Orbix Pipeline] Business ${businessId}: tz=${timezone} now=${currentTimeStr} (local) — no slot passed yet. Next: ${nextStr}`);
          continue;
        }

        // Load which slots we already ran today from settings
        const runsRecord = moduleSettings?.settings?.pipeline_runs_today || {};
        const alreadyRanToday = runsRecord.date === todayStr ? (runsRecord.slots || []) : [];

        // Find the latest slot that has passed but hasn't been run yet
        const slotsToRun = slotsPassed.filter(m => {
          const slotKey = `${Math.floor(m / 60).toString().padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          return !alreadyRanToday.includes(slotKey);
        });

        if (slotsToRun.length === 0) {
          const nextSlot = pipelineRunMinutes.find(m => m > currentMinutes);
          const nextStr = nextSlot != null
            ? `${String(Math.floor(nextSlot / 60)).padStart(2, '0')}:${String(nextSlot % 60).padStart(2, '0')}`
            : 'none today';
          console.log(`[Orbix Pipeline] Business ${businessId}: tz=${timezone} now=${currentTimeStr} (local) — all passed slots already ran. Next: ${nextStr}`);
          continue;
        }

        // Run for the latest missed slot (catches up if server was down)
        const slotToRun = Math.max(...slotsToRun);
        const slotKey = `${String(Math.floor(slotToRun / 60)).padStart(2, '0')}:${String(slotToRun % 60).padStart(2, '0')}`;

        console.log(`[Orbix Pipeline] Business ${businessId}: RUNNING slot ${slotKey} (tz=${timezone}, now=${currentTimeStr} local)`);

        // Mark slot as ran BEFORE running to prevent double-runs
        const updatedSlots = [...alreadyRanToday, slotKey];
        await ModuleSettings.update(businessId, 'orbix-network', {
          ...(moduleSettings?.settings || {}),
          last_pipeline_run_at: nowISO,
          pipeline_runs_today: { date: todayStr, slots: updatedSlots },
        });

        await runReviewQueueJob();
        await runAutomatedPipeline(businessId);
        pipelinesRun++;
      } catch (error) {
        console.error(`[Orbix Jobs] Scheduled pipeline error for business ${businessId}:`, error.message);
      }
    }

    return { success: true, pipelines_run: pipelinesRun };
  } catch (error) {
    console.error('[Orbix Jobs] runScheduledPipelineCheck error:', error);
    throw error;
  }
}

/**
 * Run publish job for all businesses with active subscriptions.
 * Posts only between posting_window start and end (default 7am–8pm), with slots spread evenly by daily cap.
 */
export async function runPublishJob() {
  try {
    // Get all businesses with active subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    
    if (subError) throw subError;
    
    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, published: 0 };
    }
    
    const businessIds = subscriptions.map(s => s.business_id);
    let totalPublished = 0;
    
    for (const businessId of businessIds) {
      try {
        // Respect daily video cap and posting window (7am–8pm by default, no overnight)
        const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
        const dailyVideoCap = moduleSettings?.settings?.limits?.daily_video_cap ?? 5;
        const posting = moduleSettings?.settings?.posting_schedule || {};
        const startStr = posting.start ?? '07:00';
        const endStr = posting.end ?? '20:00';
        const timezone = posting.timezone ?? 'America/New_York';
        const startMinutes = parseTimeToMinutes(startStr);
        const endMinutes = parseTimeToMinutes(endStr);

        // "Today" and "current time" in the USER's timezone (not server/UTC)
        const todayISO = getStartOfTodayISOInZone(timezone);
        const nowInZone = getNowInZone(timezone);
        const currentMinutes = nowInZone.minutesSinceMidnight;
        const currentTimeStr = `${String(nowInZone.hours).padStart(2, '0')}:${String(nowInZone.minutes).padStart(2, '0')}`;

        // Only block overnight — don't post while everyone is asleep.
        // Allow a 90-minute grace period past window end.
        const gracePastEnd = endMinutes + 90;
        if (currentMinutes < startMinutes || currentMinutes > gracePastEnd) {
          console.log(`[Orbix Publish] Business ${businessId}: skip - outside window (now ${currentTimeStr}, window ${startStr}-${endStr})`);
          continue;
        }

        // Only upload during a post slot (each slot runs until the next post time, e.g. 8am–11am, 11am–2pm — no narrow window)
        if (!isWithinUploadSlot(posting, dailyVideoCap, timezone)) {
          console.log(`[Orbix Publish] Business ${businessId}: skip - outside upload slot (now ${currentTimeStr}, upload only at slot times)`);
          continue;
        }

        // Count actual YouTube uploads today PER CHANNEL (orbix_publishes), NOT completed renders — prevents burning quota
        const publishCountByChannel = await getPublishCountByChannelToday(businessId, timezone);
        const totalPublishesToday = Object.values(publishCountByChannel).reduce((a, b) => a + b, 0);
        console.log(`[Orbix Publish] Business ${businessId}: tz=${timezone} now=${currentTimeStr} (local) window=${startStr}-${endStr} uploadsToday=${totalPublishesToday} cap=${dailyVideoCap}/channel perChannel=${JSON.stringify(publishCountByChannel)}`);

        // No slot-time gate — upload immediately whenever a render is ready.

        // Channels that hit YouTube upload quota in the last 24h — skip them to avoid 20+ repeated failures
        const quotaFailedSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: quotaFailedPublishes } = await supabaseClient
          .from('orbix_publishes')
          .select('render_id')
          .eq('business_id', businessId)
          .eq('publish_status', 'FAILED')
          .gte('created_at', quotaFailedSince)
          .ilike('error_message', '%exceeded%');
        const quotaFailedRenderIds = [...new Set((quotaFailedPublishes || []).map(p => p.render_id).filter(Boolean))];
        let channelIdsQuotaExceeded = new Set();
        if (quotaFailedRenderIds.length > 0) {
          const { data: rendersWithStory } = await supabaseClient
            .from('orbix_renders')
            .select('story_id')
            .in('id', quotaFailedRenderIds)
            .eq('business_id', businessId);
          const storyIds = (rendersWithStory || []).map(r => r.story_id).filter(Boolean);
          if (storyIds.length > 0) {
            const { data: stories } = await supabaseClient
              .from('orbix_stories')
              .select('channel_id')
              .in('id', storyIds);
            channelIdsQuotaExceeded = new Set((stories || []).map(s => s.channel_id).filter(Boolean));
            if (channelIdsQuotaExceeded.size > 0) {
              console.log(`[Orbix Publish] Business ${businessId}: skipping ${channelIdsQuotaExceeded.size} channel(s) that hit YouTube upload quota in last 24h`);
            }
          }
        }

        // Get renders ready for upload or already completed that haven't been published yet
        const { data: allRenders, error: rendersError } = await supabaseClient
          .from('orbix_renders')
          .select('*, orbix_stories(*), orbix_scripts(*)')
          .eq('business_id', businessId)
          .in('render_status', ['READY_FOR_UPLOAD', 'COMPLETED'])
          .limit(50);

        if (rendersError) throw rendersError;

        // Only consider enabled channels; then one render per channel that hasn't hit its daily cap
        const enabledChannelIds = await getEnabledChannelIds(businessId);
        const seen = new Set();
        const completedRenders = [];
        for (const r of (allRenders || []).filter(r => r.output_url)) {
          const chId = r.orbix_stories?.channel_id ?? null;
          const chIdKey = chId || '__legacy__';
          if (chId != null && channelIdsQuotaExceeded.has(chId)) continue; // quota hit recently, skip until tomorrow
          if (chId != null && !enabledChannelIds.has(chId)) continue; // skip disabled channels
          if (!getChannelAutoUploadEnabledFromSettings(moduleSettings?.settings, chId)) continue; // per-channel auto-upload OFF
          if (seen.has(chIdKey)) continue; // already queuing one for this channel this run
          const countForChannel = publishCountByChannel[chIdKey] || 0;
          if (countForChannel >= dailyVideoCap) {
            console.log(`[Orbix Publish] Business ${businessId}: channel ${chIdKey} cap reached (${countForChannel}/${dailyVideoCap}), skipping`);
            continue;
          }
          seen.add(chIdKey);
          completedRenders.push(r);
        }

        if (!completedRenders || completedRenders.length === 0) {
          console.log(`[Orbix Publish] Business ${businessId}: no completed renders to publish`);
          continue;
        }

        // Process in channel creation order (same as dropdown)
        const channelOrder = await getChannelOrderForBusiness(businessId);
        completedRenders.sort((a, b) => {
          const chA = a.orbix_stories?.channel_id ?? null;
          const chB = b.orbix_stories?.channel_id ?? null;
          const iA = chA == null ? 1e9 : channelOrder.indexOf(chA);
          const iB = chB == null ? 1e9 : channelOrder.indexOf(chB);
          return iA - iB;
        });

        for (const render of completedRenders) {
          // Never auto-upload a render we already attempted (any status). Prevents 72x duplicate uploads; only manual Force Upload can retry.
          const { data: existingPublish } = await supabaseClient
            .from('orbix_publishes')
            .select('id, publish_status, platform_video_id')
            .eq('render_id', render.id)
            .maybeSingle();

          if (existingPublish) {
            if (existingPublish.platform_video_id) {
              const url = `https://www.youtube.com/watch?v=${existingPublish.platform_video_id}`;
              console.log(`[Orbix Publish] Business ${businessId}: render ${render.id} already published at ${url}, skipping`);
            } else {
              console.log(`[Orbix Publish] Business ${businessId}: render ${render.id} already has a publish attempt (status=${existingPublish.publish_status}), skipping — use Force Upload in UI to retry`);
            }
            continue;
          }

          try {
            const story = render.orbix_stories;
            const script = render.orbix_scripts;
            const orbixChannelId = story?.channel_id || null;
            const storyCategory = (story?.category || '').toLowerCase();
            if (orbixChannelId && storyCategory) {
              const allowed = await getChannelAllowedCategories(orbixChannelId);
              if (allowed && !allowed.has(storyCategory)) {
                console.log(`[Orbix Publish] Business ${businessId}: skipping render ${render.id} — story category "${story.category}" not allowed for channel (allowed: ${[...allowed].join(', ')})`);
                continue;
              }
            }
            const channelSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
            const byChannel = channelSettings?.settings?.youtube_by_channel || {};
            const legacyYt = channelSettings?.settings?.youtube;
            const hasCreds = (orbixChannelId && byChannel[orbixChannelId]?.access_token) || legacyYt?.access_token;

            if (!hasCreds) {
              console.log(`[Orbix Publish] Business ${businessId}: YouTube not connected${orbixChannelId ? ` for channel ${orbixChannelId}` : ''}, skipping render ${render.id}`);
              continue;
            }

            const title = (render.youtube_title || script?.hook || story?.title || 'Orbix Network Video').trim();
            const description = (render.youtube_description || `${script?.what_happened || ''}\n\n${script?.why_it_matters || ''}\n\n${script?.what_happens_next || ''}`).trim();
            const tags = render.hashtags ? render.hashtags.split(/\s+/).map(t => t.replace(/^#/, '')) : [story?.category || 'news'];
            const publishOptions = orbixChannelId ? { orbixChannelId } : {};

            console.log(`[Orbix Publish] Business ${businessId}: uploading render ${render.id} to YouTube (channel ${orbixChannelId || 'legacy'})`);
            // Claim this render with a PENDING row. Unique (render_id, platform) ensures only one replica uploads; others skip.
            const { error: insertErr } = await supabaseClient
              .from('orbix_publishes')
              .insert({
                business_id: businessId,
                render_id: render.id,
                platform: 'YOUTUBE',
                title: title?.slice(0, 255) || 'Uploading',
                publish_status: 'PENDING'
              });

            if (insertErr) {
              if (insertErr.code === '23505') {
                console.log(`[Orbix Publish] Business ${businessId}: render ${render.id} already claimed by another replica, skipping`);
              } else {
                console.warn(`[Orbix Publish] Business ${businessId}: failed to claim render ${render.id}:`, insertErr.message);
              }
              continue;
            }

            let publishResult = null;
            let lastPublishErr = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                publishResult = await publishVideo(
                  businessId,
                  render.id,
                  render.output_url,
                  { title, description, tags },
                  publishOptions
                );
                break;
              } catch (e) {
                lastPublishErr = e;
                console.warn(`[Orbix Publish] Business ${businessId} attempt ${attempt}/2 failed:`, e.message);
                if (attempt < 2) {
                  await new Promise(r => setTimeout(r, YOUTUBE_UPLOAD_RETRY_DELAY_MS));
                }
              }
            }

            if (publishResult) {
              await supabaseClient
                .from('orbix_publishes')
                .update({
                  platform_video_id: publishResult.videoId,
                  description,
                  publish_status: 'PUBLISHED',
                  posted_at: new Date().toISOString()
                })
                .eq('render_id', render.id)
                .eq('publish_status', 'PENDING');

              if (story?.id) {
                await supabaseClient
                  .from('orbix_stories')
                  .update({ status: 'PUBLISHED' })
                  .eq('id', story.id);
              }

              console.log(`[Orbix Publish] Business ${businessId}: published render ${render.id} → videoId=${publishResult.videoId}`);
              totalPublished++;
            } else if (lastPublishErr) {
              await sendOrbixUploadFailureEmail(businessId, orbixChannelId || null, lastPublishErr.message);
              await supabaseClient
                .from('orbix_publishes')
                .update({
                  publish_status: 'FAILED',
                  error_message: lastPublishErr.message?.slice(0, 500)
                })
                .eq('render_id', render.id)
                .eq('publish_status', 'PENDING');
            }
          } catch (publishErr) {
            if (publishErr?.code === SKIP_YOUTUBE_UPLOAD_CODE) {
              console.warn(`[Orbix Publish] Business ${businessId}: skipping render ${render.id} — ${publishErr.message}`);
              await supabaseClient
                .from('orbix_publishes')
                .update({
                  publish_status: 'FAILED',
                  error_message: (publishErr?.message || 'Skipped')?.slice(0, 500)
                })
                .eq('render_id', render.id)
                .eq('publish_status', 'PENDING');
            } else {
              console.error(`[Orbix Publish] Business ${businessId}: error publishing render ${render.id}:`, publishErr.message);
              const msg = publishErr?.message || '';
              await supabaseClient
                .from('orbix_publishes')
                .update({
                  publish_status: 'FAILED',
                  error_message: msg.slice(0, 500)
                })
                .eq('render_id', render.id)
                .eq('publish_status', 'PENDING');
              const isQuotaLimit = msg.includes('exceeded the number of videos') || (publishErr?.responseData && String(publishErr.responseData).includes('uploadLimitExceeded'));
              if (isQuotaLimit) {
                console.warn(`[Orbix Publish] Business ${businessId}: YouTube daily upload limit hit for this channel — will skip this channel for 24h to avoid repeated failures`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Orbix Jobs] Error publishing for business ${businessId}:`, error.message);
      }
    }
    
    return {
      success: true,
      published: totalPublished
    };
  } catch (error) {
    console.error('[Orbix Jobs] Publish job error:', error);
    throw error;
  }
}

/** 24h window in ms — channels that hit limit are skipped until this long after last failure. */
const CHANNEL_QUOTA_SKIP_MS = 24 * 60 * 60 * 1000;

/**
 * Get per-channel "last upload limit hit" for this business. Used so user can see when each channel can upload again.
 * Returns { channel_id, channel_name, last_limit_hit_at_iso, can_upload_after_iso, skipped }.
 */
async function getChannelQuotaSkipStatus(businessId) {
  const since = new Date(Date.now() - CHANNEL_QUOTA_SKIP_MS).toISOString();
  const { data: failedPublishes } = await supabaseClient
    .from('orbix_publishes')
    .select('render_id, created_at')
    .eq('business_id', businessId)
    .eq('publish_status', 'FAILED')
    .gte('created_at', since)
    .ilike('error_message', '%exceeded%')
    .order('created_at', { ascending: false });
  if (!failedPublishes?.length) return [];
  const renderIds = [...new Set(failedPublishes.map(p => p.render_id).filter(Boolean))];
  const { data: renders } = await supabaseClient
    .from('orbix_renders')
    .select('id, story_id')
    .in('id', renderIds)
    .eq('business_id', businessId);
  const storyIds = [...new Set((renders || []).map(r => r.story_id).filter(Boolean))];
  if (storyIds.length === 0) return [];
  const { data: stories } = await supabaseClient
    .from('orbix_stories')
    .select('id, channel_id')
    .in('id', storyIds);
  const renderToChannel = {};
  for (const r of renders || []) {
    const s = (stories || []).find(st => st.id === r.story_id);
    if (s?.channel_id) renderToChannel[r.id] = s.channel_id;
  }
  const channelToLatestHit = {};
  for (const p of failedPublishes) {
    const chId = renderToChannel[p.render_id];
    if (!chId) continue;
    const at = p.created_at;
    if (!channelToLatestHit[chId] || at > channelToLatestHit[chId]) channelToLatestHit[chId] = at;
  }
  const channelIds = Object.keys(channelToLatestHit);
  if (channelIds.length === 0) return [];
  const { data: channels } = await supabaseClient
    .from('orbix_channels')
    .select('id, name')
    .in('id', channelIds);
  const nameById = Object.fromEntries((channels || []).map(c => [c.id, c.name || c.id]));
  const now = Date.now();
  return channelIds.map(chId => {
    const lastHit = channelToLatestHit[chId];
    const canUploadAfter = new Date(new Date(lastHit).getTime() + CHANNEL_QUOTA_SKIP_MS).toISOString();
    const skipped = now < new Date(canUploadAfter).getTime();
    return {
      channel_id: chId,
      channel_name: nameById[chId] || chId,
      last_limit_hit_at_iso: lastHit,
      can_upload_after_iso: canUploadAfter,
      skipped
    };
  });
}

/**
 * GET /api/v2/orbix-network/jobs/publish-diagnostics
 * Returns why publish might be skipping (for current business). Use to debug "nothing posted".
 */
router.get('/publish-diagnostics', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    const dailyVideoCap = moduleSettings?.settings?.limits?.daily_video_cap ?? 5;
    const posting = moduleSettings?.settings?.posting_schedule || {};
    const timezone = posting.timezone ?? 'America/New_York';
    const startStr = posting.start ?? '07:00';
    const endStr = posting.end ?? '20:00';
    const startMinutes = parseTimeToMinutes(startStr);
    const endMinutes = parseTimeToMinutes(endStr);
    const todayISO = getStartOfTodayISOInZone(timezone);
    const nowInZone = getNowInZone(timezone);
    const currentMinutes = nowInZone.minutesSinceMidnight;
    const currentTimeStr = `${String(nowInZone.hours).padStart(2, '0')}:${String(nowInZone.minutes).padStart(2, '0')}`;
    const windowMinutes = endMinutes - startMinutes;
    const { data: todayPublishes } = await supabaseClient
      .from('orbix_publishes')
      .select('id')
      .eq('business_id', businessId)
      .eq('publish_status', 'PUBLISHED')
      .gte('posted_at', todayISO);
    const publishesToday = todayPublishes?.length ?? 0;
    const slotMinutes = getPostSlotMinutes(posting, dailyVideoCap);
    const nextSlotMinutes = slotMinutes && publishesToday < slotMinutes.length
      ? slotMinutes[publishesToday]
      : (dailyVideoCap <= 1 ? startMinutes : startMinutes + (windowMinutes * publishesToday / Math.max(1, dailyVideoCap - 1)));
    const nextSlotStr = `${String(Math.floor(nextSlotMinutes / 60)).padStart(2, '0')}:${String(Math.round(nextSlotMinutes) % 60).padStart(2, '0')}`;
    const inWindow = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    const atOrPastSlot = currentMinutes >= nextSlotMinutes;
    const { data: completedRenders } = await supabaseClient
      .from('orbix_renders')
      .select('id, output_url, orbix_stories(channel_id)')
      .eq('business_id', businessId)
      .in('render_status', ['READY_FOR_UPLOAD', 'COMPLETED']);
    const withUrl = (completedRenders || []).filter(r => r.output_url);
    const { data: alreadyPublished } = await supabaseClient
      .from('orbix_publishes')
      .select('render_id')
      .eq('business_id', businessId);
    const publishedRenderIds = new Set((alreadyPublished || []).map(p => p.render_id));
    const publishable = withUrl.filter(r => !publishedRenderIds.has(r.id));
    const byChannel = moduleSettings?.settings?.youtube_by_channel || {};
    const channelsWithYoutube = Object.keys(byChannel).filter(cid => byChannel[cid]?.access_token);
    let skipReason = null;
    if (publishesToday >= dailyVideoCap) skipReason = 'Daily cap reached';
    else if (!inWindow) skipReason = 'Outside posting window (7am–8pm)';
    else if (!atOrPastSlot) skipReason = 'Not yet next slot time';
    else if (publishable.length === 0) skipReason = withUrl.length === 0 ? 'No completed renders with output_url' : 'All completed renders already published';
    else if (publishable.length > 0) {
      const chId = publishable[0].orbix_stories?.channel_id;
      const hasYt = chId && byChannel[chId]?.access_token;
      if (!hasYt) skipReason = `YouTube not connected for channel ${chId || 'null'}`;
    }
    const channelQuotaSkipStatus = await getChannelQuotaSkipStatus(businessId);
    res.json({
      business_id: businessId,
      timezone,
      current_time_in_zone: currentTimeStr,
      posting_window: `${startStr}–${endStr}`,
      publishes_today: publishesToday,
      daily_video_cap: dailyVideoCap,
      next_slot_time: nextSlotStr,
      in_posting_window: inWindow,
      at_or_past_next_slot: atOrPastSlot,
      completed_renders_total: (completedRenders || []).length,
      completed_renders_with_output_url: withUrl.length,
      publishable_count: publishable.length,
      youtube_connected_channel_ids: channelsWithYoutube,
      skip_reason: skipReason,
      would_post_now: !skipReason && publishable.length > 0,
      channel_quota_skip_status: channelQuotaSkipStatus
    });
  } catch (error) {
    console.error('[Orbix Jobs] Publish diagnostics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v2/orbix-network/jobs/upload-limit-status
 * Per-channel "when did we hit the upload limit" so user can see when they can upload again (24h skip).
 */
router.get('/upload-limit-status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const channelQuotaSkipStatus = await getChannelQuotaSkipStatus(businessId);
    res.json({ channel_quota_skip_status: channelQuotaSkipStatus });
  } catch (error) {
    console.error('[Orbix Jobs] Upload limit status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v2/orbix-network/jobs/publish
 * Publish completed renders to YouTube
 */
router.post('/publish', async (req, res) => {
  try {
    const result = await runPublishJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Publish job error:', error);
    res.status(500).json({ error: 'Publish job failed', message: error.message });
  }
});

/**
 * Scheduled analytics check: runs analytics at 2:00 AM in each business's timezone.
 * Uses posting_schedule.timezone from settings — NOT UTC.
 */
export async function runScheduledAnalyticsCheck() {
  try {
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) return { success: true, analytics_run: 0 };

    const businessIds = subscriptions.map(s => s.business_id);
    let analyticsRun = 0;

    for (const businessId of businessIds) {
      try {
        const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
        const posting = moduleSettings?.settings?.posting_schedule || {};
        const timezone = posting.timezone ?? 'America/New_York';
        const currentMinutes = getMinutesSinceMidnightInZone(timezone);
        // 2:00 AM = 120 minutes; allow 5-min window (2:00-2:05)
        if (currentMinutes < 120 || currentMinutes > 125) continue;

        console.log(`[Orbix Jobs] Scheduled analytics run for business ${businessId} at ${timezone} (2am)`);
        await runAnalyticsJob(businessId);
        analyticsRun++;
      } catch (error) {
        console.error(`[Orbix Jobs] Scheduled analytics error for business ${businessId}:`, error.message);
      }
    }

    return { success: true, analytics_run: analyticsRun };
  } catch (error) {
    console.error('[Orbix Jobs] runScheduledAnalyticsCheck error:', error);
    throw error;
  }
}

/**
 * Run analytics job for a specific business. When businessId is omitted, runs for all (backwards compat).
 * Fetches views/likes/comments from YouTube Data API and upserts into orbix_analytics_daily for today.
 */
export async function runAnalyticsJob(businessId = null) {
  try {
    let businessIds = [];
    if (businessId) {
      businessIds = [businessId];
    } else {
      const { data: subscriptions, error: subError } = await supabaseClient
        .from('subscriptions')
        .select('business_id')
        .eq('module_key', 'orbix-network')
        .eq('status', 'active');
      if (subError) throw subError;
      businessIds = (subscriptions || []).map(s => s.business_id);
    }
    if (businessIds.length === 0) return { success: true, videos_updated: 0 };

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
    let videosUpdated = 0;

    for (const bid of businessIds) {
      const { data: publishes, error: pubError } = await supabaseClient
        .from('orbix_publishes')
        .select('id, platform_video_id')
        .eq('business_id', bid)
        .eq('publish_status', 'PUBLISHED')
        .not('platform_video_id', 'is', null);
      if (pubError || !publishes?.length) continue;

      const seen = new Set();
      for (const p of publishes) {
        const videoId = (p.platform_video_id || '').trim();
        if (!videoId || seen.has(videoId)) continue;
        seen.add(videoId);
        try {
          const stats = await getVideoAnalytics(bid, videoId);
          const { error: upsertErr } = await supabaseClient
            .from('orbix_analytics_daily')
            .upsert(
              {
                business_id: bid,
                platform_video_id: videoId,
                date: today,
                views: stats.views ?? 0,
                likes: stats.likes ?? 0,
                comments: stats.comments ?? 0,
                avg_watch_time_seconds: 0,
                completion_rate: 0,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'business_id,platform_video_id,date' }
            );
          if (!upsertErr) videosUpdated++;
        } catch (err) {
          if (err?.code === SKIP_YOUTUBE_UPLOAD_CODE) continue;
          console.warn(`[Orbix Jobs] Analytics skip video ${videoId} (${bid}):`, err?.message || err);
        }
      }
    }

    return { success: true, videos_updated: videosUpdated };
  } catch (error) {
    console.error('[Orbix Jobs] Analytics job error:', error);
    throw error;
  }
}

/**
 * POST /api/v2/orbix-network/jobs/analytics
 * Fetch analytics for published videos
 */
router.post('/analytics', async (req, res) => {
  try {
    const result = await runAnalyticsJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Analytics job error:', error);
    res.status(500).json({ error: 'Analytics job failed', message: error.message });
  }
});

/**
 * POST /api/v2/orbix-network/jobs/automated-pipeline
 * Run the full automated pipeline: scrape → process → filter → render (only one video per run)
 */
router.post('/automated-pipeline', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    if (!businessId) {
      return res.status(400).json({ error: 'Business ID required' });
    }
    
    console.log(`[Orbix Jobs] Running automated pipeline for business ${businessId}`);
    const result = await runAutomatedPipeline(businessId);
    // Uploads happen only via publish job at post times (and manual Force Upload in UI). No upload here.
    res.json({ ...result, uploads: 0 });
  } catch (error) {
    console.error('[Orbix Jobs] Automated pipeline error:', error);
    res.status(500).json({ error: 'Automated pipeline failed', message: error.message });
  }
});

export default router;
