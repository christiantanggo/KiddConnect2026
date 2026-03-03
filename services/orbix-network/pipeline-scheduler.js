/**
 * Orbix Network Pipeline Scheduler
 * Automated pipeline that runs every 2 hours:
 * 1. Scrape new stories
 * 2. Filter for shock_score >= threshold (default 45)
 * 3. Select up to one story per evergreen category (psychology, money) + one for other news
 * 4. Create video(s) — one per selected story per run
 */

import { scrapeAllSources } from './scraper.js';
import { processRawItem } from './classifier.js';
import { supabaseClient } from '../../config/database.js';
import { selectTemplate, selectBackground } from './video-renderer.js';

const EVERGREEN_CATEGORIES = ['psychology', 'money', 'trivia', 'facts', 'riddle', 'mindteaser', 'dadjoke'];

/**
 * For trivia/facts stories the voice_script is embedded in the raw item's snippet JSON.
 * Extract it and save directly to orbix_scripts so tryRenderStory can find it.
 */
async function ensureTriviaScript(businessId, story) {
  // Check if a script already exists
  const { data: existing } = await supabaseClient
    .from('orbix_scripts')
    .select('id')
    .eq('story_id', story.id)
    .maybeSingle();
  if (existing) {
    console.log(`[Pipeline Scheduler] Script already exists for trivia story ${story.id}`);
    return existing;
  }

  // Fetch the raw item to get the snippet
  const { data: rawItem } = await supabaseClient
    .from('orbix_raw_items')
    .select('snippet, title')
    .eq('id', story.raw_item_id)
    .maybeSingle();

  let voiceScript = null;
  let hook = null;
  let contentJson = null;

  if (rawItem?.snippet) {
    try {
      const parsed = typeof rawItem.snippet === 'string' ? JSON.parse(rawItem.snippet) : rawItem.snippet;
      voiceScript = parsed.voice_script || parsed.tts_script || null;
      hook = parsed.hook || null;
      contentJson = parsed;
    } catch (_) { /* snippet not JSON — use as-is */ }
  }

  // Riddles use riddle_text + answer_text; mindteasers use question + answer; dadjoke uses setup + punchline + voice_script.
  const isRiddle = story.category === 'riddle';
  const isMindTeaser = story.category === 'mindteaser';
  const isDadJoke = story.category === 'dadjoke';
  if (!voiceScript && !isRiddle && !isMindTeaser && !isDadJoke) {
    console.warn(`[Pipeline Scheduler] No voice_script in snippet for story ${story.id} (${story.category}) — skipping script creation`);
    return null;
  }
  if (isRiddle && !contentJson?.riddle_text) {
    console.warn(`[Pipeline Scheduler] No riddle_text in snippet for riddle story ${story.id} — skipping script creation`);
    return null;
  }
  if (isMindTeaser && !contentJson?.question) {
    console.warn(`[Pipeline Scheduler] No question in snippet for mindteaser story ${story.id} — skipping script creation`);
    return null;
  }
  if (isDadJoke && (!contentJson?.setup || !contentJson?.punchline)) {
    console.warn(`[Pipeline Scheduler] No setup/punchline in snippet for dadjoke story ${story.id} — skipping script creation`);
    return null;
  }

  const { data: script, error } = await supabaseClient
    .from('orbix_scripts')
    .insert({
      business_id: businessId,
      story_id: story.id,
      hook: hook || '',
      what_happened: voiceScript,
      why_it_matters: '',
      what_happens_next: '',
      cta_line: '',
      duration_target_seconds: 35,
      content_type: story.category,
      content_json: contentJson || null,
    })
    .select()
    .single();

  if (error) {
    console.error(`[Pipeline Scheduler] Failed to save trivia script for story ${story.id}:`, error.message);
    return null;
  }

  console.log(`[Pipeline Scheduler] Created trivia script ${script.id} for story ${story.id}`);
  return script;
}

/**
 * Try to create and queue a render for one story. Returns { rendered: 0|1, render_id? }.
 */
async function tryRenderStory(businessId, story) {
  const { data: script, error: scriptError } = await supabaseClient
    .from('orbix_scripts')
    .select('*')
    .eq('story_id', story.id)
    .single();
  if (scriptError || !script) {
    console.log(`[Pipeline Scheduler] No script for story ${story.id} (${story.category}) - skip`);
    return { rendered: 0 };
  }
  const { data: existingRender } = await supabaseClient
    .from('orbix_renders')
    .select('id')
    .eq('story_id', story.id)
    .single();
  if (existingRender) {
    console.log(`[Pipeline Scheduler] Render already exists for story ${story.id}`);
    return { rendered: 0 };
  }
  const template = selectTemplate(story);
  const channelId = story.channel_id ?? null;
  const background = await selectBackground(businessId, channelId);
  const { data: render, error: renderError } = await supabaseClient
    .from('orbix_renders')
    .insert({
      business_id: businessId,
      story_id: story.id,
      script_id: script.id,
      template: template,
      background_type: background.type,
      background_id: background.id,
      background_storage_path: background.storagePath ?? null,
      render_status: 'PENDING'
    })
    .select()
    .single();
  if (renderError) throw renderError;
  console.log(`[Pipeline Scheduler] Created render ${render.id} for story ${story.id} (${story.category}) – worker will process`);
  return { rendered: 1, render_id: render.id };
}

/**
 * Run the automated pipeline. Should be called every 2 hours.
 */
export async function runAutomatedPipeline(businessId) {
  console.log(`[Pipeline Scheduler] ========== AUTOMATED PIPELINE START ==========`);
  console.log(`[Pipeline Scheduler] Business ID: ${businessId}`);
  console.log(`[Pipeline Scheduler] Time: ${new Date().toISOString()}`);
  
  try {
    // STEP 1: Scrape new stories
    console.log(`[Pipeline Scheduler] STEP 1: Scraping new stories...`);
    const scrapeResult = await scrapeAllSources(businessId);
    console.log(`[Pipeline Scheduler] Scraped ${scrapeResult.scraped} items, saved ${scrapeResult.saved} new items`);
    
    // STEP 2: Process NEW raw items (not yet processed)
    console.log(`[Pipeline Scheduler] STEP 2: Processing new raw items...`);
    const { data: newRawItems, error: rawItemsError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'NEW')
      .order('created_at', { ascending: false })
      .limit(50); // Process up to 50 new items
    
    if (rawItemsError) throw rawItemsError;
    
    const processedStories = [];
    for (const rawItem of newRawItems || []) {
      try {
        const story = await processRawItem(businessId, rawItem);
        if (story) {
          processedStories.push(story);
        }
      } catch (error) {
        console.error(`[Pipeline Scheduler] Error processing raw item ${rawItem.id}:`, error.message);
        // Continue with next item
      }
    }
    
    console.log(`[Pipeline Scheduler] Processed ${processedStories.length} stories`);

    // Generate scripts for newly created stories (so they can be rendered this run)
    for (const story of processedStories) {
      try {
        // Trivia/facts stories already have their script embedded in the raw item snippet —
        // extract it directly instead of calling the LLM script generator (which requires a raw_item_id).
        if (story.category === 'trivia' || story.category === 'facts' || story.category === 'riddle' || story.category === 'mindteaser') {
          await ensureTriviaScript(businessId, story);
        } else {
          const { generateAndSaveScript } = await import('./script-generator.js');
          await generateAndSaveScript(businessId, story);
        }
      } catch (scriptErr) {
        console.error(`[Pipeline Scheduler] Script generation failed for story ${story.id}:`, scriptErr?.message);
      }
    }
    
    const { ModuleSettings } = await import('../../models/v2/ModuleSettings.js');
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    const threshold = moduleSettings?.settings?.scoring?.shock_score_threshold ?? 45;
    const reviewModeEnabled = moduleSettings?.settings?.review_mode?.enabled !== false;

    // AUTO-APPROVE: When review mode is OFF, immediately approve all freshly-created PENDING
    // stories so they are available for rendering in the same pipeline run.
    // Without this, stories created in Step 2 would always miss Step 3 and require a second run.
    if (!reviewModeEnabled && processedStories.length > 0) {
      const pendingIds = processedStories.map(s => s.id);
      const { error: approveError } = await supabaseClient
        .from('orbix_stories')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .in('id', pendingIds)
        .eq('status', 'PENDING'); // only update ones still PENDING (trivia/facts may already be APPROVED)
      if (approveError) {
        console.error('[Pipeline Scheduler] Auto-approve error:', approveError.message);
      } else {
        console.log(`[Pipeline Scheduler] Review mode OFF — auto-approved ${pendingIds.length} freshly-classified stories`);
        // Update our local copies so Step 3 sees them as APPROVED
        for (const story of processedStories) {
          story.status = 'APPROVED';
        }
      }
    } else if (reviewModeEnabled) {
      console.log(`[Pipeline Scheduler] Review mode ON — ${processedStories.length} new stories need approval before rendering`);
    }

    // STEP 3: Filter for shock_score >= threshold (or evergreen: psychology/money) and select highest
    console.log(`[Pipeline Scheduler] STEP 3: Filtering stories (shock_score >= ${threshold} or category psychology/money)...`);
    
    // Get all eligible stories: approved, and either shock_score >= threshold OR evergreen category (psychology, money)
    const { data: allEligibleStories, error: storiesError1 } = await supabaseClient
      .from('orbix_stories')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'APPROVED')
      .or(`shock_score.gte.${threshold},category.eq.psychology,category.eq.money,category.eq.trivia,category.eq.facts,category.eq.riddle,category.eq.mindteaser`)
      .order('shock_score', { ascending: false });
    
    if (storiesError1) throw storiesError1;

    // Only consider stories in enabled channels (skip disabled channels to save quota)
    const { data: enabledChannels } = await supabaseClient
      .from('orbix_channels')
      .select('id')
      .eq('business_id', businessId)
      .or('enabled.eq.true,enabled.is.null');
    const enabledChannelIds = new Set((enabledChannels || []).map(c => c.id));
    const channelEligibleStories = (allEligibleStories || []).filter(
      s => s.channel_id == null || enabledChannelIds.has(s.channel_id)
    );
    
    // Get rendered story IDs
    const { data: renderedStories } = await supabaseClient
      .from('orbix_renders')
      .select('story_id')
      .eq('business_id', businessId)
      .not('story_id', 'is', null);
    
    const renderedStoryIds = new Set(renderedStories?.map(r => r.story_id) || []);
    
    // Filter out already-rendered stories (use channel-filtered list)
    const eligibleStories = channelEligibleStories.filter(story => !renderedStoryIds.has(story.id));

    // Select one top story per evergreen category (psychology, money), then one for other news
    const storiesToRender = [];
    for (const cat of EVERGREEN_CATEGORIES) {
      const top = eligibleStories.filter(s => s.category === cat).sort((a, b) => (b.shock_score || 0) - (a.shock_score || 0))[0];
      if (top) storiesToRender.push(top);
    }
    const other = eligibleStories.filter(s => !EVERGREEN_CATEGORIES.includes(s.category))[0];
    if (other && !storiesToRender.includes(other)) storiesToRender.push(other);

    // FALLBACK: If no stories selected, try creating one from highest-scoring raw item
    if (storiesToRender.length === 0) {
      console.log(`[Pipeline Scheduler] No eligible stories (score >= ${threshold}); trying fallback: highest-scoring raw item...`);
      const { data: existingStoryRawIds } = await supabaseClient
        .from('orbix_stories')
        .select('raw_item_id')
        .eq('business_id', businessId)
        .not('raw_item_id', 'is', null);
      const usedRawIds = (existingStoryRawIds || []).map(r => r.raw_item_id).filter(Boolean);

      const { data: fallbackRawItems, error: fallbackError } = await supabaseClient
        .from('orbix_raw_items')
        .select('*')
        .eq('business_id', businessId)
        .in('status', ['NEW', 'DISCARDED'])
        .not('shock_score', 'is', null)
        .order('shock_score', { ascending: false })
        .limit(20);

      if (fallbackError) throw fallbackError;

      const available = (fallbackRawItems || []).filter(r => !usedRawIds.includes(r.id));
      const fallbackRaw = available[0];

      if (fallbackRaw) {
        const { generateAndSaveScript } = await import('./script-generator.js');
        const { data: newStory, error: storyInsertError } = await supabaseClient
          .from('orbix_stories')
          .insert({
            business_id: businessId,
            raw_item_id: fallbackRaw.id,
            category: fallbackRaw.category,
            shock_score: fallbackRaw.shock_score,
            factors_json: fallbackRaw.factors_json || null,
            status: 'PENDING',
            is_manual_force: true
          })
          .select()
          .single();

        if (storyInsertError) throw storyInsertError;

        await supabaseClient
          .from('orbix_raw_items')
          .update({ status: 'PROCESSED' })
          .eq('id', fallbackRaw.id)
          .eq('business_id', businessId);

        try {
          if (newStory.category === 'trivia' || newStory.category === 'facts' || newStory.category === 'riddle' || newStory.category === 'mindteaser') {
            await ensureTriviaScript(businessId, { ...newStory, raw_item_id: fallbackRaw.id });
          } else {
            await generateAndSaveScript(businessId, newStory);
          }
        } catch (scriptError) {
          console.error('[Pipeline Scheduler] Fallback: script generation error:', scriptError?.message);
        }

        await supabaseClient
          .from('orbix_stories')
          .update({ status: 'APPROVED' })
          .eq('id', newStory.id)
          .eq('business_id', businessId);

        storiesToRender.push({ ...newStory, status: 'APPROVED' });
        console.log(`[Pipeline Scheduler] Fallback: created and approved story ${newStory.id} from raw item ${fallbackRaw.id} (shock_score: ${fallbackRaw.shock_score})`);
      } else {
        console.log(`[Pipeline Scheduler] No eligible stories and no fallback raw items with scores`);
        return {
          success: true,
          message: 'No eligible stories to render',
          scraped: scrapeResult.saved,
          processed: processedStories.length,
          rendered: 0
        };
      }
    }

    let totalRendered = 0;
    const renderIds = [];
    for (const story of storiesToRender) {
      try {
        const result = await tryRenderStory(businessId, story);
        totalRendered += result.rendered;
        if (result.render_id) renderIds.push(result.render_id);
      } catch (err) {
        console.error(`[Pipeline Scheduler] Error rendering story ${story.id}:`, err?.message);
      }
    }

    console.log(`[Pipeline Scheduler] ========== AUTOMATED PIPELINE SUCCESS ==========`);
    return {
      success: true,
      message: totalRendered > 0 ? `Rendered ${totalRendered} video(s)` : 'No eligible stories to render',
      scraped: scrapeResult.saved,
      processed: processedStories.length,
      rendered: totalRendered,
      render_ids: renderIds.length ? renderIds : undefined
    };
  } catch (error) {
    console.error('[Pipeline Scheduler] ========== AUTOMATED PIPELINE ERROR ==========');
    console.error('[Pipeline Scheduler] Error:', error);
    console.error('[Pipeline Scheduler] Error message:', error.message);
    console.error('[Pipeline Scheduler] Error stack:', error.stack);
    throw error;
  }
}

