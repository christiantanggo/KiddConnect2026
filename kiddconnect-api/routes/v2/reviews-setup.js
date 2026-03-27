import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { Business } from '../../models/Business.js';
import { supabaseClient } from '../../config/database.js';
import { AuditLog } from '../../models/v2/AuditLog.js';
import { scrapeBusinessContent } from '../../services/business-scraper.js';
import { UsageLog } from '../../models/v2/UsageLog.js';
import { calculateBillingCycle } from '../../services/billing.js';

const router = express.Router();
router.use(authenticate);
router.use(requireBusinessContext);

const MODULE_KEY = 'reviews';

/**
 * GET /api/v2/reviews/setup/status
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
      .single();
    
    // Get existing business data for auto-fill
    const business = await Business.findById(businessId);
    
    // Get existing module settings (if any)
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, MODULE_KEY);
    
    // Check what data already exists
    const existingData = {
      business_name: business.name || '',
      business_email: business.email || '',
      business_phone: business.phone || '',
      business_address: business.address || '',
      industry: moduleSettings?.settings?.custom_branding?.industry || business.industry || '',
      contact_method: moduleSettings?.settings?.custom_branding?.contact_method || business.email || '',
      business_website: moduleSettings?.settings?.business_website || business.website || '',
      facebook_url: moduleSettings?.settings?.social_media?.facebook || '',
      instagram_url: moduleSettings?.settings?.social_media?.instagram || '',
      tiktok_url: moduleSettings?.settings?.social_media?.tiktok || '',
      default_tone: moduleSettings?.settings?.default_tone || 'professional',
      tone_preferences: moduleSettings?.settings?.tone_preferences || {},
      default_length: moduleSettings?.settings?.default_length || 'medium',
      // Brand Voice Profile
      emoji_usage: moduleSettings?.settings?.brand_voice_profile?.emoji_usage || 'none',
      sentence_length: moduleSettings?.settings?.brand_voice_profile?.sentence_length || 'medium',
      perspective: moduleSettings?.settings?.brand_voice_profile?.perspective || 'we',
      sign_off: moduleSettings?.settings?.brand_voice_profile?.sign_off || 'none',
      custom_sign_off: moduleSettings?.settings?.brand_voice_profile?.custom_sign_off || '',
      // Legal & Risk Guardrails
      legal_sensitivity: moduleSettings?.settings?.legal_rules?.legal_sensitivity || 'medium',
      forbidden_phrases: moduleSettings?.settings?.legal_rules?.forbidden_phrases || [],
      preferred_phrases: moduleSettings?.settings?.legal_rules?.preferred_phrases || [],
      apology_behavior: moduleSettings?.settings?.legal_rules?.apology_behavior || 'apologize',
      // Review Reply Strategy
      default_reply_goal: moduleSettings?.settings?.reply_strategy?.default_reply_goal || 'professional',
      auto_severity_detection: moduleSettings?.settings?.reply_strategy?.auto_severity_detection !== false,
      crisis_mode_auto_activation: moduleSettings?.settings?.reply_strategy?.crisis_mode_auto_activation !== false,
      reply_openings: moduleSettings?.settings?.reply_openings || [],
      reply_closings: moduleSettings?.settings?.reply_closings || [],
      apology_tone: moduleSettings?.settings?.apology_tone || 'apologetic',
      legal_awareness_enabled: moduleSettings?.settings?.legal_awareness_enabled !== false,
      jurisdiction: moduleSettings?.settings?.jurisdiction || '',
      // Review Reminders
      reminders_enabled: moduleSettings?.settings?.review_reminders?.enabled !== false,
      reminder_frequency: moduleSettings?.settings?.review_reminders?.frequency || 'daily',
      reminder_day_of_week: moduleSettings?.settings?.review_reminders?.day_of_week || '',
      reminder_time: moduleSettings?.settings?.review_reminders?.time || '09:00',
      reminder_delivery: moduleSettings?.settings?.review_reminders?.delivery_method || ['email'],
      reminder_recipient: moduleSettings?.settings?.review_reminders?.recipient || 'owner',
      reminder_template: moduleSettings?.settings?.review_reminders?.template || 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.',
      current_step: setupState?.current_step || 1,
      completed_steps: setupState?.completed_steps || [],
      is_complete: setupState?.is_complete || false,
      setup_data: setupState?.setup_data || {}
    };
    
    res.json({
      setup_status: {
        is_complete: existingData.is_complete,
        current_step: existingData.current_step,
        completed_steps: existingData.completed_steps
      },
      existing_data: existingData,
      total_steps: 8
    });
  } catch (error) {
    console.error('[GET /api/v2/reviews/setup/status] Error:', error);
    res.status(500).json({ error: 'Failed to fetch setup status' });
  }
});

/**
 * POST /api/v2/reviews/setup/step/:stepNumber
 * Save progress for a specific step
 */
router.post('/setup/step/:stepNumber', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    const stepNumber = parseInt(req.params.stepNumber);
    const stepData = req.body;
    
    if (stepNumber < 1 || stepNumber > 8) {
      return res.status(400).json({ error: 'Invalid step number' });
    }
    
    // Get existing setup state
    const { data: existingState } = await supabaseClient
      .from('module_setup_state')
      .select('*')
      .eq('business_id', businessId)
      .eq('module_key', MODULE_KEY)
      .single();
    
    const setupData = existingState?.setup_data || {};
    const completedSteps = existingState?.completed_steps || [];
    
    // Merge step data
    setupData[`step${stepNumber}`] = stepData;
    
    if (!completedSteps.includes(stepNumber)) {
      completedSteps.push(stepNumber);
    }
    
    // Upsert setup state
    const { data: updatedState, error } = await supabaseClient
      .from('module_setup_state')
      .upsert({
        business_id: businessId,
        module_key: MODULE_KEY,
        current_step: stepNumber + 1,
        completed_steps: completedSteps,
        setup_data: setupData,
        is_complete: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'business_id,module_key'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // If this is step 8 (last step), auto-complete
    if (stepNumber === 8) {
      try {
        await completeSetup(businessId, setupData, req.user.id);
      } catch (setupError) {
        console.error('[POST /api/v2/reviews/setup/step/8] Error completing setup:', setupError);
        console.error('Setup error stack:', setupError.stack);
        // Still return success for saving step 8, but log the completion error
        // The step data is saved, completion can be retried
        throw setupError; // Re-throw to be caught by outer catch
      }
    }
    
    res.json({
      success: true,
      current_step: updatedState.current_step,
      completed_steps: updatedState.completed_steps
    });
  } catch (error) {
    console.error(`[POST /api/v2/reviews/setup/step/${req.params.stepNumber}] Error:`, error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to save step',
      message: error.message || 'An unknown error occurred',
      code: error.code,
      details: error.details || (process.env.NODE_ENV === 'development' ? error.stack : undefined)
    });
  }
});

/**
 * POST /api/v2/reviews/setup/complete
 * Finalize setup and save all settings
 */
router.post('/setup/complete', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    
    // Get setup state
    const { data: setupState } = await supabaseClient
      .from('module_setup_state')
      .select('*')
      .eq('business_id', businessId)
      .eq('module_key', MODULE_KEY)
      .single();
    
    if (!setupState) {
      return res.status(400).json({ error: 'Setup not started' });
    }
    
    // Complete setup
    await completeSetup(businessId, setupState.setup_data, req.user.id);
    
    res.json({
      success: true,
      message: 'Setup completed successfully'
    });
  } catch (error) {
    console.error('[POST /api/v2/reviews/setup/complete] Error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to complete setup',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Helper: Complete setup and save all data
 */
async function completeSetup(businessId, setupData, userId) {
  try {
    console.log('[completeSetup] Starting setup completion for business:', businessId);
    console.log('[completeSetup] Setup data keys:', Object.keys(setupData || {}));
    try {
      const setupDataStr = JSON.stringify(setupData, null, 2).substring(0, 1000);
      console.log('[completeSetup] Setup data:', setupDataStr);
    } catch (logError) {
      console.log('[completeSetup] Could not serialize setup data for logging (may contain circular refs)');
    }
    
    if (!setupData || typeof setupData !== 'object') {
      throw new Error('Invalid setup data: setupData is missing or not an object');
    }
    
    // Build module settings from setup data
    const moduleSettings = {
      default_tone: setupData.step3?.default_tone || 'professional',
      tone_preferences: setupData.step3?.tone_preferences || {}, // Store user's tone preference examples
      default_length: setupData.step3?.sentence_length || 'medium', // Use sentence_length from step3 as default_length
      include_resolution_by_default: setupData.step6?.include_resolution_step !== false,
      risk_detection_enabled: true, // Always enabled
      // Brand Voice Profile
      brand_voice_profile: {
        emoji_usage: setupData.step3?.emoji_usage || 'none',
        sentence_length: setupData.step3?.sentence_length || 'medium',
        perspective: setupData.step3?.perspective || 'we',
        sign_off: setupData.step3?.sign_off || 'none',
        custom_sign_off: setupData.step3?.custom_sign_off || ''
      },
      // Legal & Risk Guardrails
      legal_rules: {
        legal_sensitivity: setupData.step4?.legal_sensitivity || 'medium',
        forbidden_phrases: Array.isArray(setupData.step4?.forbidden_phrases) 
          ? setupData.step4.forbidden_phrases 
          : (typeof setupData.step4?.forbidden_phrases === 'string' && setupData.step4.forbidden_phrases.trim() 
            ? setupData.step4.forbidden_phrases.split('\n').filter(p => p.trim()).map(p => p.trim())
            : []),
        preferred_phrases: Array.isArray(setupData.step4?.preferred_phrases) 
          ? setupData.step4.preferred_phrases 
          : (typeof setupData.step4?.preferred_phrases === 'string' && setupData.step4.preferred_phrases.trim()
            ? setupData.step4.preferred_phrases.split('\n').filter(p => p.trim()).map(p => p.trim())
            : []),
        apology_behavior: setupData.step4?.apology_behavior || 'apologize'
      },
      // Review Reply Strategy
      reply_strategy: {
        default_reply_goal: setupData.step5?.default_reply_goal || 'professional',
        auto_severity_detection: setupData.step5?.auto_severity_detection !== false,
        crisis_mode_auto_activation: setupData.step5?.crisis_mode_auto_activation !== false
      },
      // AI Customization options (old step 5, now step 6)
      reply_openings: setupData.step6?.reply_openings || [],
      reply_closings: setupData.step6?.reply_closings || [],
      apology_tone: setupData.step6?.apology_tone || 'apologetic',
      legal_awareness_enabled: setupData.step6?.legal_awareness_enabled !== false,
      jurisdiction: setupData.step6?.jurisdiction || '',
      // Review Reminders
      review_reminders: {
        enabled: setupData.step7?.reminders_enabled !== false,
        frequency: setupData.step7?.reminder_frequency || 'daily',
        day_of_week: setupData.step7?.reminder_day_of_week || '',
        time: setupData.step7?.reminder_time || '09:00',
        delivery_method: Array.isArray(setupData.step7?.reminder_delivery) ? setupData.step7.reminder_delivery : ['email'],
        recipient: setupData.step7?.reminder_recipient || 'owner',
        template: setupData.step7?.reminder_template || 'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.'
      },
      // Business information for AI context (use from step1 since it's collected there)
      business_website: setupData.step1?.business_website || '',
      social_media: {
        facebook: setupData.step2?.facebook_url || '',
        instagram: setupData.step2?.instagram_url || '',
        tiktok: setupData.step2?.tiktok_url || ''
      },
      custom_branding: {
        company_name: setupData.step1?.business_name || '',
        industry: setupData.step2?.industry || '',
        brand_voice: setupData.step3?.default_tone || 'professional',
        contact_method: setupData.step2?.contact_method || ''
      }
    };
    
    console.log('[completeSetup] Saving module settings for business:', businessId);
    try {
      // Try to stringify for logging (may fail on circular refs)
      const settingsStr = JSON.stringify(moduleSettings, null, 2).substring(0, 500);
      console.log('[completeSetup] Module settings structure:', settingsStr);
    } catch (logError) {
      console.log('[completeSetup] Could not log module settings structure (may contain circular refs)');
    }
    
    // Save module settings
    try {
      await ModuleSettings.update(businessId, MODULE_KEY, moduleSettings);
      console.log('[completeSetup] Module settings saved successfully');
    } catch (settingsError) {
      console.error('[completeSetup] Error saving module settings:', settingsError);
      console.error('[completeSetup] Settings error message:', settingsError.message);
      console.error('[completeSetup] Settings error code:', settingsError.code);
      console.error('[completeSetup] Settings error details:', settingsError.details);
      console.error('[completeSetup] Settings error stack:', settingsError.stack);
      throw new Error(`Failed to save module settings: ${settingsError.message || 'Unknown error'}`);
    }
    
    // Update business table with new information (if provided)
    // Note: Only update if columns exist - these are optional enhancements
    const businessUpdates = {};
    const websiteUrl = setupData.step1?.business_website;
    if (websiteUrl) {
      businessUpdates.website = websiteUrl;
    }
    if (setupData.step2?.industry) {
      businessUpdates.industry = setupData.step2.industry;
    }
    
    if (Object.keys(businessUpdates).length > 0) {
      console.log('[completeSetup] Updating business with:', businessUpdates);
      try {
        await Business.update(businessId, businessUpdates);
        console.log('[completeSetup] Business updated successfully');
      } catch (businessError) {
        // If columns don't exist, log warning but don't fail setup
        // These are optional enhancements, not critical for setup completion
        console.warn('[completeSetup] Warning: Could not update business (columns may not exist):', businessError.message);
        console.warn('[completeSetup] This is non-critical - setup will continue');
        // Don't throw - allow setup to complete even if business update fails
        // throw new Error(`Failed to update business: ${businessError.message}`);
      }
    }

    // Trigger website/social media scraping job (async, don't wait)
    if (websiteUrl || setupData.step2?.facebook_url || setupData.step2?.instagram_url || setupData.step2?.tiktok_url) {
      // Scrape content in background (non-blocking)
      scrapeBusinessContent(businessId, {
        website: websiteUrl,
        facebook: setupData.step2?.facebook_url,
        instagram: setupData.step2?.instagram_url,
        tiktok: setupData.step2?.tiktok_url
      }).catch(err => console.error('[completeSetup] Failed to scrape business content:', err));
    }
    
    // Mark setup as complete
    console.log('[completeSetup] Marking setup as complete');
    const { error: updateError } = await supabaseClient
      .from('module_setup_state')
      .update({
        is_complete: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('business_id', businessId)
      .eq('module_key', MODULE_KEY);
    
    if (updateError) {
      console.error('[completeSetup] Error updating setup state:', updateError);
      console.error('[completeSetup] Update error details:', JSON.stringify(updateError, null, 2));
      throw new Error(`Failed to update setup state: ${updateError.message}`);
    }
    console.log('[completeSetup] Setup state marked as complete');
    
    // Log audit
    await AuditLog.create({
      business_id: businessId,
      user_id: userId,
      action: 'reviews.setup_completed',
      resource_type: 'module_setup',
      metadata: {
        module_key: MODULE_KEY,
        steps_completed: 8
      }
    }).catch(err => console.error('[completeSetup] Failed to log audit:', err));
    console.log('[completeSetup] Setup completed successfully');
  } catch (error) {
    console.error('[completeSetup] Error in completeSetup:', error);
    console.error('[completeSetup] Error stack:', error.stack);
    throw error;
  }
}

/**
 * GET /api/v2/reviews/usage
 * Get usage statistics (also available in setup router for when main router fails to load)
 */
router.get('/usage', async (req, res) => {
  try {
    const { Subscription } = await import('../../models/v2/Subscription.js');
    const subscription = await Subscription.findByBusinessAndModule(req.active_business_id, 'reviews');
    
    if (!subscription || !subscription.usage_limit) {
      return res.json({
        usage: {
          used: 0,
          limit: null,
          remaining: null,
          percent_used: 0,
          reset_date: null
        },
        billing_cycle: null
      });
    }
    
    // Use business billing cycle
    const billingCycle = calculateBillingCycle(req.business);
    
    // Query usage
    const usageData = await UsageLog.getTotalUsage(
      req.active_business_id,
      'reviews',
      billingCycle.start.toISOString(),
      billingCycle.end.toISOString()
    );
    
    const totalUsed = usageData.total || 0;
    const limit = subscription.usage_limit;
    const remaining = Math.max(0, limit - totalUsed);
    const percentUsed = limit > 0 ? (totalUsed / limit) * 100 : 0;
    
    res.json({
      usage: {
        used: totalUsed,
        limit: limit,
        remaining: remaining,
        percent_used: percentUsed,
        reset_date: billingCycle.end.toISOString()
      },
      billing_cycle: {
        start: billingCycle.start.toISOString(),
        end: billingCycle.end.toISOString()
      }
    });
  } catch (error) {
    console.error('[GET /api/v2/reviews/usage] Error:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

export default router;

