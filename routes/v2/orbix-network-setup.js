import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { Business } from '../../models/Business.js';
import { supabaseClient } from '../../config/database.js';
import { AuditLog } from '../../models/v2/AuditLog.js';

const router = express.Router();
router.use(authenticate);
router.use(requireBusinessContext);

const MODULE_KEY = 'orbix-network';

/**
 * GET /api/v2/orbix-network/setup/status
 * Get setup status and existing data for auto-fill
 */
router.get('/setup/status', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    // Get existing setup state
    const { data: setupState } = await supabaseClient
      .from('module_setup_state')
      .select('*')
      .eq('business_id', businessId)
      .eq('module_key', MODULE_KEY)
      .maybeSingle();
    
    // If setup state says incomplete, still treat as complete when business has at least one channel
    // (e.g. user disconnected one channel but still has another - don't force wizard)
    let isComplete = setupState?.is_complete || false;
    if (!isComplete) {
      const { data: channels } = await supabaseClient
        .from('orbix_channels')
        .select('id')
        .eq('business_id', businessId)
        .limit(1);
      if (channels && channels.length > 0) {
        isComplete = true;
      }
    }
    
    // Get existing business data for auto-fill
    const business = await Business.findById(businessId);
    
    // Get existing module settings (if any)
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    
    // Check what data already exists
    const existingData = {
      youtube_channel_id: moduleSettings?.settings?.youtube?.channel_id || '',
      review_mode_enabled: moduleSettings?.settings?.review_mode?.enabled !== false,
      auto_approve_minutes: moduleSettings?.settings?.review_mode?.auto_approve_minutes || 60,
      youtube_visibility: moduleSettings?.settings?.publishing?.youtube_visibility || 'public',
      enable_rumble: moduleSettings?.settings?.publishing?.enable_rumble || false,
      background_random_mode: moduleSettings?.settings?.backgrounds?.random_mode || 'uniform',
      shock_score_threshold: moduleSettings?.settings?.scoring?.shock_score_threshold || 65,
      daily_video_cap: moduleSettings?.settings?.limits?.daily_video_cap || 5,
      posting_window_start: moduleSettings?.settings?.posting_schedule?.start ?? '07:00',
      posting_window_end: moduleSettings?.settings?.posting_schedule?.end ?? '20:00',
      posting_timezone: moduleSettings?.settings?.posting_schedule?.timezone ?? 'America/New_York',
      auto_upload_enabled: moduleSettings?.settings?.auto_upload_enabled !== false,
      enable_intro_hook: moduleSettings?.settings?.enable_intro_hook === true,
      current_step: setupState?.current_step || 1,
      completed_steps: setupState?.completed_steps || [],
      is_complete: isComplete,
      setup_data: setupState?.setup_data || {}
    };
    
    res.json({
      setup_status: {
        is_complete: isComplete,
        current_step: existingData.current_step,
        completed_steps: existingData.completed_steps
      },
      existing_data: existingData,
      total_steps: 5
    });
  } catch (error) {
    console.error('[GET /api/v2/orbix-network/setup/status] Error:', error);
    res.status(500).json({ error: 'Failed to fetch setup status' });
  }
});

/**
 * POST /api/v2/orbix-network/setup/start
 * Start setup process
 */
router.post('/setup/start', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    // Create or update setup state
    const { data: setupState, error } = await supabaseClient
      .from('module_setup_state')
      .upsert({
        business_id: businessId,
        module_key: MODULE_KEY,
        current_step: 1,
        completed_steps: [],
        setup_data: {},
        is_complete: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'business_id,module_key'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      setup_state: setupState
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/setup/start] Error:', error);
    res.status(500).json({ error: 'Failed to start setup' });
  }
});

/**
 * POST /api/v2/orbix-network/setup/save
 * Save setup step data
 */
router.post('/setup/save', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const { step, stepData } = req.body;
    
    if (!step || !stepData) {
      return res.status(400).json({ error: 'Step and stepData are required' });
    }
    
    // Get current setup state (may not exist yet)
    const { data: currentState, error: fetchError } = await supabaseClient
      .from('module_setup_state')
      .select('*')
      .eq('business_id', businessId)
      .eq('module_key', MODULE_KEY)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle no rows
    
    const existingSetupData = currentState?.setup_data || {};
    const existingCompletedSteps = currentState?.completed_steps || [];
    
    // Merge new step data
    const setupData = { ...existingSetupData };
    setupData[`step${step}`] = stepData;
    
    // Add step to completed steps if not already there
    const completedSteps = [...existingCompletedSteps];
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }
    
    // Upsert setup state (create if doesn't exist, update if it does)
    const { data: updatedState, error } = await supabaseClient
      .from('module_setup_state')
      .upsert({
        business_id: businessId,
        module_key: MODULE_KEY,
        setup_data: setupData,
        completed_steps: completedSteps,
        current_step: step + 1,
        is_complete: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'business_id,module_key'
      })
      .select()
      .single();
    
    if (error) throw error;

    // When saving step 3 (review/scoring/toggles), persist critical runtime settings immediately.
    if (step === 3 && stepData) {
      try {
        const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
        const current = existing?.settings || {};
        const next = {
          ...current,
          review_mode: {
            ...(current.review_mode || {}),
            enabled: stepData.review_mode_enabled !== false,
            auto_approve_minutes: stepData.auto_approve_minutes ?? current.review_mode?.auto_approve_minutes ?? 60
          },
          scoring: {
            ...(current.scoring || {}),
            shock_score_threshold: stepData.shock_score_threshold ?? current.scoring?.shock_score_threshold ?? 45
          },
          // Feature toggles — read directly by the render pipeline and upload job
          auto_upload_enabled: stepData.auto_upload_enabled !== false,
          enable_intro_hook: stepData.enable_intro_hook === true
        };
        await ModuleSettings.update(businessId, MODULE_KEY, next);
      } catch (settingsErr) {
        console.error('[POST /api/v2/orbix-network/setup/save] Failed to persist step 3 to module_settings:', settingsErr);
      }
    }

    // When saving step 4 (publishing), persist to module_settings so the YouTube publisher
    // and jobs use the correct youtube_visibility and other settings immediately.
    if (step === 4 && stepData) {
      try {
        const existing = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
        const current = existing?.settings || {};
        const next = {
          ...current,
          publishing: {
            ...(current.publishing || {}),
            youtube_visibility: stepData.youtube_visibility ?? current.publishing?.youtube_visibility ?? 'public',
            enable_rumble: stepData.enable_rumble ?? current.publishing?.enable_rumble ?? false
          },
          limits: {
            ...(current.limits || {}),
            daily_video_cap: stepData.daily_video_cap ?? current.limits?.daily_video_cap ?? 5
          },
          posting_schedule: {
            ...(current.posting_schedule || {}),
            start: stepData.posting_window_start ?? current.posting_schedule?.start ?? '07:00',
            end: stepData.posting_window_end ?? current.posting_schedule?.end ?? '20:00',
            timezone: stepData.posting_timezone ?? current.posting_schedule?.timezone ?? 'America/New_York'
          }
        };
        await ModuleSettings.update(businessId, MODULE_KEY, next);
      } catch (settingsErr) {
        console.error('[POST /api/v2/orbix-network/setup/save] Failed to persist step 4 to module_settings:', settingsErr);
        // Don't fail the request; setup_state was already saved
      }
    }

    res.json({
      success: true,
      setup_state: updatedState
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/setup/save] Error:', error);
    res.status(500).json({ 
      error: 'Failed to save setup step',
      message: error.message 
    });
  }
});

/**
 * POST /api/v2/orbix-network/setup/complete
 * Complete setup and save all settings
 */
router.post('/setup/complete', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    // Get setup state
    const { data: setupState, error: setupStateError } = await supabaseClient
      .from('module_setup_state')
      .select('*')
      .eq('business_id', businessId)
      .eq('module_key', MODULE_KEY)
      .maybeSingle();
    
    if (setupStateError && setupStateError.code !== 'PGRST116') {
      throw setupStateError;
    }
    
    // Get existing module settings (YouTube credentials are stored here from OAuth)
    const existingSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    const existingYoutubeSettings = existingSettings?.settings?.youtube || {};
    
    // Build module settings from setup data, preserving existing YouTube settings
    const moduleSettings = {
      youtube: existingYoutubeSettings, // Preserve YouTube OAuth credentials
      review_mode: {
        enabled: setupState?.setup_data?.step3?.review_mode_enabled !== false,
        auto_approve_minutes: setupState?.setup_data?.step3?.auto_approve_minutes || 60
      },
      publishing: {
        youtube_visibility: setupState?.setup_data?.step4?.youtube_visibility || 'public',
        enable_rumble: setupState?.setup_data?.step4?.enable_rumble || false
      },
      scoring: {
        shock_score_threshold: setupState?.setup_data?.step3?.shock_score_threshold ?? 45
      },
      auto_upload_enabled: setupState?.setup_data?.step3?.auto_upload_enabled !== false,
      enable_intro_hook: setupState?.setup_data?.step3?.enable_intro_hook === true,
      backgrounds: {
        random_mode: setupState?.setup_data?.step5?.background_random_mode || 'uniform'
      },
      limits: {
        daily_video_cap: setupState?.setup_data?.step4?.daily_video_cap || 5
      },
      posting_schedule: {
        start: setupState?.setup_data?.step4?.posting_window_start ?? '07:00',
        end: setupState?.setup_data?.step4?.posting_window_end ?? '20:00',
        timezone: setupState?.setup_data?.step4?.posting_timezone ?? 'America/New_York'
      }
    };
    
    // Save module settings
    await ModuleSettings.update(businessId, MODULE_KEY, moduleSettings);
    
    // Mark setup as complete (create if doesn't exist)
    await supabaseClient
      .from('module_setup_state')
      .upsert({
        business_id: businessId,
        module_key: MODULE_KEY,
        is_complete: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'business_id,module_key'
      });
    
    // Log audit event
    await AuditLog.create({
      business_id: businessId,
      user_id: req.user.id,
      action: 'module_setup_completed',
      resource_type: 'module_setup',
      resource_id: null,
      metadata: { module_key: MODULE_KEY }
    }).catch(err => console.error('[completeSetup] Failed to log audit:', err));
    
    res.json({
      success: true,
      message: 'Setup completed successfully'
    });
  } catch (error) {
    console.error('[POST /api/v2/orbix-network/setup/complete] Error:', error);
    res.status(500).json({ 
      error: 'Failed to complete setup',
      message: error.message
    });
  }
});

export default router;

