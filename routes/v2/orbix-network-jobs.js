/**
 * Orbix Network Background Job Routes
 * These endpoints are called by scheduled tasks or manually by authenticated users
 */

import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { scrapeAllSources } from '../../services/orbix-network/scraper.js';
import { processRawItem } from '../../services/orbix-network/classifier.js';
import { generateAndSaveScript } from '../../services/orbix-network/script-generator.js';
import { processRenderJob, selectTemplate, selectBackground } from '../../services/orbix-network/video-renderer.js';
import { publishVideo } from '../../services/orbix-network/youtube-publisher.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

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
        const result = await scrapeAllSources(businessId);
        totalScraped += result.scraped || 0;
        totalSaved += result.saved || 0;
        if (result.source_results) {
          sourceResults.push(...result.source_results);
        }
      } catch (error) {
        console.error(`[Orbix Jobs] Error scraping for business ${businessId}:`, error.message);
        // Continue with next business
      }
    }
    
    return {
      success: true,
      businesses_processed: businessIds.length,
      total_scraped: totalScraped,
      total_saved: totalSaved,
      source_results: sourceResults
    };
  } catch (error) {
    console.error('[Orbix Jobs] Scrape job error:', error);
    throw error;
  }
}

/**
 * POST /api/v2/orbix-network/jobs/scrape
 * Scrape all enabled sources for all businesses with active subscriptions
 */
router.post('/scrape', async (req, res) => {
  try {
    const result = await runScrapeJob();
    res.json(result);
  } catch (error) {
    console.error('[Orbix Jobs] Scrape job error:', error);
    res.status(500).json({ error: 'Scrape job failed', message: error.message });
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
    let totalRendersProcessed = 0;
    
    for (const businessId of businessIds) {
      try {
        // Get module settings to check daily video cap
        const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
        const dailyVideoCap = moduleSettings?.settings?.limits?.daily_video_cap || 5;
        
        // Check how many renders were completed today (since midnight UTC)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        
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
            
            // Select template and background
            const template = selectTemplate(story);
            const backgroundSelection = await selectBackground(businessId);
            
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
        
        // Process pending renders (limited for now - rendering is resource-intensive)
        const { data: pendingRenders, error: rendersError } = await supabaseClient
          .from('orbix_renders')
          .select('*, orbix_stories(*), orbix_scripts(*)')
          .eq('business_id', businessId)
          .eq('render_status', 'PENDING')
          .limit(1); // Process 1 at a time (rendering is resource-intensive)
        
        if (rendersError) throw rendersError;
        
        if (pendingRenders && pendingRenders.length > 0) {
          for (const render of pendingRenders) {
            console.log(`[Orbix Jobs] ========== PROCESSING RENDER ${render.id} ==========`);
            console.log(`[Orbix Jobs] Render details:`, {
              id: render.id,
              story_id: render.story_id,
              script_id: render.script_id,
              business_id: render.business_id,
              current_status: render.render_status,
              created_at: render.created_at,
              updated_at: render.updated_at
            });
            
            try {
              // Update status to PROCESSING
              console.log(`[Orbix Jobs] Updating render ${render.id} to PROCESSING...`);
              const { error: updateError } = await supabaseClient
                .from('orbix_renders')
                .update({ 
                  render_status: 'PROCESSING',
                  updated_at: new Date().toISOString()
                })
                .eq('id', render.id);
              
              if (updateError) {
                throw new Error(`Failed to update render status: ${updateError.message}`);
              }
              
              console.log(`[Orbix Jobs] Render ${render.id} status updated to PROCESSING`);
              console.log(`[Orbix Jobs] Calling processRenderJob for render ${render.id}...`);
              const startTime = Date.now();
              
              // Process the render with timeout (30 minutes max)
              const processPromise = processRenderJob(render);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Render timeout after 30 minutes')), 30 * 60 * 1000)
              );
              
              const result = await Promise.race([processPromise, timeoutPromise]);
              const duration = Date.now() - startTime;
              
              console.log(`[Orbix Jobs] processRenderJob completed for render ${render.id} in ${duration}ms`);
              console.log(`[Orbix Jobs] Result:`, {
                status: result?.status,
                outputUrl: result?.outputUrl ? 'present' : 'missing',
                error: result?.error || null
              });
              
              if (result.status === 'COMPLETED' && result.outputUrl) {
                // Update render with output URL and mark as COMPLETED
                console.log(`[Orbix Jobs] Updating render ${render.id} to COMPLETED...`);
                await supabaseClient
                  .from('orbix_renders')
                  .update({
                    render_status: 'COMPLETED',
                    output_url: result.outputUrl,
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', render.id);
                
                totalRendersProcessed++;
                console.log(`[Orbix Jobs] ✅ Render ${render.id} completed successfully`);
              } else {
                // Mark as FAILED
                console.log(`[Orbix Jobs] Updating render ${render.id} to FAILED (result status: ${result?.status})`);
                await supabaseClient
                  .from('orbix_renders')
                  .update({
                    render_status: 'FAILED',
                    error_message: result?.error || 'Unknown error during rendering',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', render.id);
                
                console.error(`[Orbix Jobs] ❌ Render ${render.id} failed:`, result?.error || 'No error message');
              }
            } catch (renderError) {
              console.error(`[Orbix Jobs] ❌ ERROR processing render ${render.id}:`, renderError);
              console.error(`[Orbix Jobs] Error message:`, renderError.message);
              console.error(`[Orbix Jobs] Error stack:`, renderError.stack);
              
              // Mark as FAILED
              await supabaseClient
                .from('orbix_renders')
                .update({
                  render_status: 'FAILED',
                  error_message: renderError.message || 'Unknown error',
                  updated_at: new Date().toISOString()
                })
                .eq('id', render.id);
              
              console.error(`[Orbix Jobs] Render ${render.id} marked as FAILED`);
            }
            
            console.log(`[Orbix Jobs] ========== FINISHED PROCESSING RENDER ${render.id} ==========`);
          }
        }
        
      } catch (error) {
        console.error(`[Orbix Jobs] Error processing renders for business ${businessId}:`, error.message);
        // Continue with next business
      }
    }
    
    return {
      success: true,
      renders_created: totalRendersCreated,
      renders_processed: totalRendersProcessed
    };
  } catch (error) {
    console.error('[Orbix Jobs] Render job error:', error);
    throw error;
  }
}

/**
 * POST /api/v2/orbix-network/jobs/render
 * Process render queue: render approved stories into videos
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

/**
 * Run publish job for all businesses with active subscriptions
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
        // Get completed renders that haven't been published yet
        const { data: allRenders, error: rendersError } = await supabaseClient
          .from('orbix_renders')
          .select('*, orbix_stories(*), orbix_scripts(*)')
          .eq('business_id', businessId)
          .eq('render_status', 'COMPLETED')
          .limit(10); // Get more to filter
        
        if (rendersError) throw rendersError;
        
        // Filter to only renders with output_url
        const completedRenders = (allRenders || []).filter(r => r.output_url).slice(0, 5);
        
        if (!completedRenders || completedRenders.length === 0) continue;
        
        // Check if already published
        for (const render of completedRenders) {
          const { data: existingPublish } = await supabaseClient
            .from('orbix_publishes')
            .select('id')
            .eq('render_id', render.id)
            .single();
          
          if (existingPublish) continue; // Already published
          
          try {
            // Get module settings for publishing preferences
            const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
            
            if (!moduleSettings?.settings?.youtube?.access_token) {
              console.log(`[Orbix Jobs] YouTube not connected for business ${businessId}`);
              continue; // Skip if YouTube not connected
            }
            
            // Build video metadata
            const story = render.orbix_stories;
            const script = render.orbix_scripts;
            
            const title = script?.hook || story?.title || 'Orbix Network Video';
            const description = `${script?.what_happened || ''}\n\n${script?.why_it_matters || ''}\n\n${script?.what_happens_next || ''}`.trim();
            
            // Publish to YouTube
            const publishResult = await publishVideo(
              businessId,
              render.id,
              render.output_url,
              {
                title: title,
                description: description,
                tags: [story?.category || 'news']
              }
            );
            
            // Create publish record
            await supabaseClient
              .from('orbix_publishes')
              .insert({
                business_id: businessId,
                render_id: render.id,
                platform: 'YOUTUBE',
                platform_video_id: publishResult.videoId,
                title: title,
                description: description,
                publish_status: 'PUBLISHED',
                posted_at: new Date().toISOString()
              });
            
            // Update story status
            await supabaseClient
              .from('orbix_stories')
              .update({ status: 'PUBLISHED' })
              .eq('id', story.id);
            
            totalPublished++;
          } catch (error) {
            console.error(`[Orbix Jobs] Error publishing render ${render.id}:`, error.message);
            
            // Record failure
            await supabaseClient
              .from('orbix_publishes')
              .insert({
                business_id: businessId,
                render_id: render.id,
                platform: 'YOUTUBE',
                title: script?.hook || 'Failed to publish',
                publish_status: 'FAILED',
                error_message: error.message
              });
            
            // Continue with next render
          }
        }
      } catch (error) {
        console.error(`[Orbix Jobs] Error publishing for business ${businessId}:`, error.message);
        // Continue with next business
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
 * Run analytics job for all businesses with active subscriptions
 */
export async function runAnalyticsJob() {
  try {
    // Get all businesses with active subscriptions
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('business_id')
      .eq('module_key', 'orbix-network')
      .eq('status', 'active');
    
    if (subError) throw subError;
    
    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, videos_updated: 0 };
    }
    
    // TODO: Implement analytics fetching from YouTube API
    // This will require YouTube Analytics API access
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

export default router;
