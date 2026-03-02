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
import { publishVideo, SKIP_YOUTUBE_UPLOAD_CODE } from '../../services/orbix-network/youtube-publisher.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { runAutomatedPipeline } from '../../services/orbix-network/pipeline-scheduler.js';

const router = express.Router();

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
  const { data: pending } = await supabaseClient
    .from('orbix_renders')
    .select('*')
    .eq('render_status', 'PENDING')
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

const YOUTUBE_UPLOAD_MAX_ATTEMPTS = 3;
const YOUTUBE_UPLOAD_RETRY_DELAY_MS = Number(process.env.ORBIX_YOUTUBE_UPLOAD_RETRY_DELAY_MS) || 5_000;

/**
 * Process one READY_FOR_UPLOAD render: upload video (from output_url storage) to YouTube.
 * Safe to retry on failure without re-rendering. Retries up to 3 times with delay between attempts.
 * Uses atomic claim (READY_FOR_UPLOAD → PROCESSING + STEP_8) so only one process runs upload per render.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force] - When true, bypasses the auto_upload_enabled toggle (used for manual uploads).
 * @param {string}  [options.renderId] - When provided, only upload this specific render (used for manual uploads).
 */
export async function processOneYouTubeUpload(options = {}) {
  const { force = false, renderId: targetRenderId = null } = options;

  let baseQuery = supabaseClient
    .from('orbix_renders')
    .select('*')
    .eq('render_status', 'READY_FOR_UPLOAD')
    .not('output_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(1);

  // When a specific render ID is requested (manual upload), target only that render
  if (targetRenderId) {
    baseQuery = baseQuery.eq('id', targetRenderId);
  }

  const { data: ready } = await baseQuery.maybeSingle();

  if (!ready) {
    return { processed: false };
  }

  const render = ready;
  const videoUrl = render.output_url;

  // ── Auto-upload toggle ────────────────────────────────────────────────────
  // Only check when NOT a forced manual upload. Automatic scheduled uploads
  // respect the toggle; manual "Force Upload" from the dashboard bypasses it.
  if (!force) {
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(render.business_id, 'orbix-network');
    const autoUploadEnabled = moduleSettings?.settings?.auto_upload_enabled !== false; // default: enabled
    if (!autoUploadEnabled) {
      console.log(`[Orbix YouTube] Auto-upload DISABLED for business ${render.business_id} — render id=${render.id} left in READY_FOR_UPLOAD for manual review`);
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

  const { step8YouTubeUpload } = await import('../../services/orbix-network/render-steps.js');

  let lastError = null;
  for (let attempt = 1; attempt <= YOUTUBE_UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const step8Result = await step8YouTubeUpload(claimedRender.id, claimedRender, videoUrl);
      if (step8Result?.skipped) {
        console.log(`[Orbix YouTube] Upload skipped for render id=${claimedRender.id}`);
        return { processed: true, renderId: claimedRender.id, status: 'SKIPPED' };
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
      await supabaseClient.from('orbix_publishes').insert({
        business_id: claimedRender.business_id,
        render_id: claimedRender.id,
        publish_status: 'PUBLISHED',
        youtube_url: youtubeUrl,
        posted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn(`[Orbix YouTube] Could not write orbix_publishes record: ${error.message}`);
      });

      console.log(`[Orbix YouTube] Upload COMPLETED render id=${claimedRender.id} url=${youtubeUrl} (attempt ${attempt})`);
      return { processed: true, renderId: claimedRender.id, status: 'COMPLETED', url: youtubeUrl };
    } catch (err) {
      lastError = err;
      console.error(`[Orbix YouTube] Upload attempt ${attempt}/${YOUTUBE_UPLOAD_MAX_ATTEMPTS} FAILED render id=${claimedRender.id} error="${err.message}" code=${err?.code || 'n/a'}`);
      if (attempt < YOUTUBE_UPLOAD_MAX_ATTEMPTS) {
        console.log(`[Orbix YouTube] Retrying in ${YOUTUBE_UPLOAD_RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, YOUTUBE_UPLOAD_RETRY_DELAY_MS));
      }
    }
  }

  const errorMessage = lastError?.message || 'Unknown error';
  const fullMessage = `Failed after ${YOUTUBE_UPLOAD_MAX_ATTEMPTS} attempts: ${errorMessage}`;
  console.error(`[Orbix YouTube] Upload FAILED after ${YOUTUBE_UPLOAD_MAX_ATTEMPTS} attempts render id=${claimedRender.id} lastError="${errorMessage}"`);
  // Set back to READY_FOR_UPLOAD so next interval can retry (and step_error for UI)
  await supabaseClient
    .from('orbix_renders')
    .update({
      render_status: 'READY_FOR_UPLOAD',
      render_step: 'STEP_7_METADATA',
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
 * Process one PENDING render, then immediately attempt YouTube upload if render succeeded.
 */
export async function runOneRenderThenUpload() {
  const result = await processOnePendingRender();
  let uploadResult = null;
  if (result.processed && (result.status === 'RENDER_COMPLETE' || result.status === 'COMPLETED')) {
    if (YOUTUBE_UPLOAD_DELAY_MS > 0) {
      await new Promise(r => setTimeout(r, YOUTUBE_UPLOAD_DELAY_MS));
    }
    uploadResult = await processOneYouTubeUpload();
    console.log('[Orbix Jobs] runOneRenderThenUpload: upload result =', uploadResult?.status || 'no-op');
  }
  return { render: result, upload: uploadResult };
}

/**
 * Process a specific render by ID, then immediately attempt YouTube upload if render succeeded.
 */
export async function runRenderByIdThenUpload(renderId) {
  const result = await processRenderById(renderId);
  let uploadResult = null;
  if (result.processed && (result.status === 'RENDER_COMPLETE' || result.status === 'COMPLETED')) {
    if (YOUTUBE_UPLOAD_DELAY_MS > 0) {
      await new Promise(r => setTimeout(r, YOUTUBE_UPLOAD_DELAY_MS));
    }
    uploadResult = await processOneYouTubeUpload();
    console.log('[Orbix Jobs] runRenderByIdThenUpload: upload result =', uploadResult?.status || 'no-op');
  }
  return { render: result, upload: uploadResult };
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
 * Run render job (steps 3–7, stop before YouTube), wait 30s, then run YouTube upload job.
 * Single endpoint for cron; avoids upload hanging the render process.
 */
router.post('/pipeline', async (req, res) => {
  try {
    const renderResult = await runRenderJob();
    if (YOUTUBE_UPLOAD_DELAY_MS > 0) {
      console.log('[Orbix Jobs] Pipeline: render phase done, pausing', YOUTUBE_UPLOAD_DELAY_MS / 1000, 's before YouTube upload...');
      await new Promise(r => setTimeout(r, YOUTUBE_UPLOAD_DELAY_MS));
    }
    const uploadResult = await runYouTubeUploadJob();
    res.json({
      success: true,
      render: renderResult,
      upload: uploadResult
    });
  } catch (error) {
    console.error('[Orbix Jobs] Pipeline error:', error);
    res.status(500).json({ error: 'Pipeline failed', message: error.message });
  }
});

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
 */
function getMinutesSinceMidnightInZone(timezone = 'America/New_York') {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return hour * 60 + minute;
}

/** Parse "HH:mm" to minutes since midnight. */
function parseTimeToMinutes(timeStr) {
  const [h, m] = (timeStr || '07:00').split(':').map(Number);
  return (h || 7) * 60 + (m || 0);
}

/** Default fixed post times (5/day): 8am, 11am, 2pm, 5pm, 8pm. Times in minutes since midnight. */
const DEFAULT_POST_SLOT_MINUTES = [8 * 60, 11 * 60, 14 * 60, 17 * 60, 20 * 60]; // 480, 660, 840, 1020, 1200

/** Default pipeline run times (1 hour before each post): 7am, 10am, 1pm, 4pm, 7pm. */
const DEFAULT_PIPELINE_RUN_MINUTES = [7 * 60, 10 * 60, 13 * 60, 16 * 60, 19 * 60]; // 420, 600, 780, 960, 1140

/** Get post slot times in minutes. Uses posting_schedule.slot_times if set, else default for daily cap 5. */
function getPostSlotMinutes(posting, dailyVideoCap) {
  const slotTimes = posting?.slot_times;
  if (Array.isArray(slotTimes) && slotTimes.length > 0) {
    return slotTimes.map(t => parseTimeToMinutes(typeof t === 'string' ? t : String(t)));
  }
  if (dailyVideoCap === 5) return DEFAULT_POST_SLOT_MINUTES;
  return null; // fallback to spread-evenly
}

/**
 * Get pipeline run times in minutes.
 * Uses posting_schedule.pipeline_run_times if set (user-configured).
 * Otherwise derives them as 1 hour before each post slot.
 */
function getPipelineRunMinutes(posting, dailyVideoCap) {
  // User-configured pipeline run times take priority
  const configured = posting?.pipeline_run_times;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(t => parseTimeToMinutes(typeof t === 'string' ? t : String(t)));
  }
  // Derive from post slots: 1 hour before each
  const postMinutes = getPostSlotMinutes(posting, dailyVideoCap);
  if (postMinutes && postMinutes.length > 0) {
    return postMinutes.map(m => Math.max(0, m - 60));
  }
  if (dailyVideoCap === 5) return DEFAULT_PIPELINE_RUN_MINUTES;
  return null;
}

/**
 * Scheduled pipeline check — catch-up version.
 *
 * Instead of a narrow ±5 min window that breaks on server restarts, this uses a
 * "minimum interval" approach:
 *   1. We know the configured pipeline run times (e.g. 7am, 10am, 1pm, 4pm, 7pm)
 *   2. We calculate the minimum gap between any two consecutive run times
 *   3. If the last pipeline run was more than (gap - 10 min) ago AND we are inside
 *      the posting window AND there is a run time that has passed since last run,
 *      we trigger the pipeline now (catch-up).
 *   4. If the server was down all morning and restarts at 1:03pm, it will immediately
 *      catch up and run — not wait until 4pm.
 *
 * last_pipeline_run_at is stored in module settings so it survives server restarts.
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
        const startStr = posting.start ?? '07:00';
        const endStr = posting.end ?? '20:00';
        const startMinutes = parseTimeToMinutes(startStr);
        const endMinutes = parseTimeToMinutes(endStr);

        const pipelineRunMinutes = getPipelineRunMinutes(posting, dailyVideoCap);
        if (!pipelineRunMinutes || pipelineRunMinutes.length === 0) continue;

        const currentMinutes = getMinutesSinceMidnightInZone(timezone);
        const nowISO = new Date().toISOString();

        // Outside posting window entirely — don't run overnight
        if (currentMinutes < startMinutes || currentMinutes > endMinutes) continue;

        // Calculate min interval between consecutive run times (in minutes)
        const sortedRunMinutes = [...pipelineRunMinutes].sort((a, b) => a - b);
        let minIntervalMins = 180; // fallback 3 hours
        for (let i = 1; i < sortedRunMinutes.length; i++) {
          minIntervalMins = Math.min(minIntervalMins, sortedRunMinutes[i] - sortedRunMinutes[i - 1]);
        }
        // Allow re-run if (interval - 10 min) has elapsed since last run
        const rerunThresholdMins = Math.max(30, minIntervalMins - 10);

        // Check when we last ran the pipeline for this business
        const lastRunISO = moduleSettings?.settings?.last_pipeline_run_at;
        const lastRunMinsAgo = lastRunISO
          ? (Date.now() - new Date(lastRunISO).getTime()) / 60000
          : Infinity;

        // Has a scheduled run time passed that we haven't covered yet?
        const missedRunTime = sortedRunMinutes.some(t => t <= currentMinutes);

        if (!missedRunTime) {
          console.log(`[Orbix Pipeline] Business ${businessId}: no run time has passed yet today (current ${Math.floor(currentMinutes / 60)}:${String(currentMinutes % 60).padStart(2, '0')})`);
          continue;
        }

        if (lastRunMinsAgo < rerunThresholdMins) {
          console.log(`[Orbix Pipeline] Business ${businessId}: ran ${Math.round(lastRunMinsAgo)}min ago, threshold=${rerunThresholdMins}min — skipping`);
          continue;
        }

        console.log(`[Orbix Pipeline] Business ${businessId}: running pipeline (last ran ${lastRunMinsAgo === Infinity ? 'never' : Math.round(lastRunMinsAgo) + 'min ago'}, threshold=${rerunThresholdMins}min, tz=${timezone})`);

        // Save last_pipeline_run_at BEFORE running to prevent double-runs if two instances start simultaneously
        await ModuleSettings.update(businessId, 'orbix-network', {
          ...(moduleSettings?.settings || {}),
          last_pipeline_run_at: nowISO,
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

        // "Today" in the posting timezone so daily cap matches user's calendar day
        const todayISO = getStartOfTodayISOInZone(timezone);
        const { data: todayPublishes, error: publishesCountError } = await supabaseClient
          .from('orbix_publishes')
          .select('id')
          .eq('business_id', businessId)
          .eq('publish_status', 'PUBLISHED')
          .gte('posted_at', todayISO);
        if (publishesCountError) {
          console.error(`[Orbix Jobs] Error counting today's publishes for business ${businessId}:`, publishesCountError);
          continue;
        }
        const publishesToday = todayPublishes?.length ?? 0;
        const publishSlotsLeft = Math.max(0, dailyVideoCap - publishesToday);
        const currentMinutes = getMinutesSinceMidnightInZone(timezone);
        const slotMinutes = getPostSlotMinutes(posting, dailyVideoCap);

        // Find the next slot: start from publishesToday index, but if that slot has
        // already passed (and nothing was published in it), advance to the next future slot.
        // This prevents getting stuck on slotMinutes[0]=8am all day when publishesToday=0.
        let nextSlotMinutes;
        if (slotMinutes && slotMinutes.length > 0) {
          // Find the first slot that is at or past current time (allowing us to post now),
          // starting from the publishesToday position
          const startIdx = Math.min(publishesToday, slotMinutes.length - 1);
          nextSlotMinutes = slotMinutes[startIdx];
          // If that slot is already in the past, try subsequent slots
          for (let si = startIdx; si < slotMinutes.length; si++) {
            if (slotMinutes[si] >= currentMinutes || si === slotMinutes.length - 1) {
              nextSlotMinutes = slotMinutes[si];
              break;
            }
          }
        } else {
          nextSlotMinutes = dailyVideoCap <= 1
            ? startMinutes
            : startMinutes + ((endMinutes - startMinutes) * publishesToday / Math.max(1, dailyVideoCap - 1));
        }

        const currentTimeStr = `${Math.floor(currentMinutes / 60)}:${String(currentMinutes % 60).padStart(2, '0')}`;
        const nextSlotStr = `${Math.floor(nextSlotMinutes / 60)}:${String(Math.round(nextSlotMinutes) % 60).padStart(2, '0')}`;
        console.log(`[Orbix Publish] Business ${businessId}: tz=${timezone} now=${currentTimeStr} window=${startStr}-${endStr} publishesToday=${publishesToday}/${dailyVideoCap} nextSlot=${nextSlotStr}`);

        if (publishSlotsLeft <= 0) {
          console.log(`[Orbix Publish] Business ${businessId}: skip - daily cap reached (${publishesToday}/${dailyVideoCap})`);
          continue;
        }

        // Only publish during posting window (e.g. 7am–8pm), not overnight
        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
          console.log(`[Orbix Publish] Business ${businessId}: skip - outside window (now ${currentTimeStr}, window ${startStr}-${endStr})`);
          continue;
        }

        // Next slot: fixed times (8,11,14,17,20) when slot_times/daily cap 5, else spread evenly. Uses timezone from settings.
        if (currentMinutes < nextSlotMinutes) {
          console.log(`[Orbix Publish] Business ${businessId}: skip - not yet slot time (now ${currentTimeStr}, next slot ${nextSlotStr})`);
          continue;
        }

        // Get completed renders that haven't been published yet; schedule allows only one post per slot
        const { data: allRenders, error: rendersError } = await supabaseClient
          .from('orbix_renders')
          .select('*, orbix_stories(*), orbix_scripts(*)')
          .eq('business_id', businessId)
          .eq('render_status', 'COMPLETED')
          .limit(10);

        if (rendersError) throw rendersError;

        // Take at most 1 so we hit the next slot on a later run (spread evenly through the day)
        const completedRenders = (allRenders || []).filter(r => r.output_url).slice(0, 1);

        if (!completedRenders || completedRenders.length === 0) {
          console.log(`[Orbix Publish] Business ${businessId}: no completed renders to publish`);
          continue;
        }

        for (const render of completedRenders) {
          // Skip if already published
          const { data: existingPublish } = await supabaseClient
            .from('orbix_publishes')
            .select('id')
            .eq('render_id', render.id)
            .eq('publish_status', 'PUBLISHED')
            .maybeSingle();

          if (existingPublish) {
            console.log(`[Orbix Publish] Business ${businessId}: render ${render.id} already published, skipping`);
            continue;
          }

          try {
            const story = render.orbix_stories;
            const script = render.orbix_scripts;
            const orbixChannelId = story?.channel_id || null;
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
            const publishResult = await publishVideo(
              businessId,
              render.id,
              render.output_url,
              { title, description, tags },
              publishOptions
            );

            await supabaseClient
              .from('orbix_publishes')
              .insert({
                business_id: businessId,
                render_id: render.id,
                platform: 'YOUTUBE',
                platform_video_id: publishResult.videoId,
                title,
                description,
                publish_status: 'PUBLISHED',
                posted_at: new Date().toISOString()
              });

            if (story?.id) {
              await supabaseClient
                .from('orbix_stories')
                .update({ status: 'PUBLISHED' })
                .eq('id', story.id);
            }

            console.log(`[Orbix Publish] Business ${businessId}: published render ${render.id} → videoId=${publishResult.videoId}`);
            totalPublished++;
          } catch (publishErr) {
            if (publishErr?.code === SKIP_YOUTUBE_UPLOAD_CODE) {
              console.warn(`[Orbix Publish] Business ${businessId}: skipping render ${render.id} — ${publishErr.message}`);
              await supabaseClient
                .from('orbix_publishes')
                .insert({
                  business_id: businessId,
                  render_id: render.id,
                  platform: 'YOUTUBE',
                  title: 'Skipped',
                  publish_status: 'FAILED',
                  error_message: publishErr.message
                })
                .select()
                .maybeSingle();
            } else {
              console.error(`[Orbix Publish] Business ${businessId}: error publishing render ${render.id}:`, publishErr.message);
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
    const currentMinutes = getMinutesSinceMidnightInZone(timezone);
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
    const currentTimeStr = `${Math.floor(currentMinutes / 60)}:${String(currentMinutes % 60).padStart(2, '0')}`;
    const nextSlotStr = `${Math.floor(nextSlotMinutes / 60)}:${String(Math.round(nextSlotMinutes) % 60).padStart(2, '0')}`;
    const inWindow = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    const atOrPastSlot = currentMinutes >= nextSlotMinutes;
    const { data: completedRenders } = await supabaseClient
      .from('orbix_renders')
      .select('id, output_url, orbix_stories(channel_id)')
      .eq('business_id', businessId)
      .eq('render_status', 'COMPLETED');
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
      would_post_now: !skipReason && publishable.length > 0
    });
  } catch (error) {
    console.error('[Orbix Jobs] Publish diagnostics error:', error);
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

    // TODO: Implement analytics fetching from YouTube API per businessId
    // For now, return success
    return {
      success: true,
      message: 'Analytics job placeholder - implementation pending',
      videos_updated: 0
    };
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
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Automated pipeline error:', error);
    res.status(500).json({ error: 'Automated pipeline failed', message: error.message });
  }
});

export default router;
