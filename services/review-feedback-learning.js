/**
 * Review Feedback Learning Service
 * Aggregates user feedback to improve future AI responses
 * Stores learning signals (not full text) for bias adjustments
 */

import { supabaseClient } from '../config/database.js';
import { ModuleSettings } from '../models/v2/ModuleSettings.js';

/**
 * Record feedback and update learning signals
 */
export async function recordFeedback(businessId, reviewOutputId, userId, feedbackType, adjustmentType = null, selectedReplyOption = null) {
  try {
    // Record feedback
    const { error: insertError } = await supabaseClient
      .from('review_feedback')
      .insert({
        business_id: businessId,
        review_output_id: reviewOutputId,
        user_id: userId,
        feedback_type: feedbackType,
        adjustment_type: adjustmentType,
        selected_reply_option: selectedReplyOption
      });

    if (insertError) {
      throw insertError;
    }

    // Update output counts (use model methods instead)
    const { ReviewsOutput } = await import('../models/v2/ReviewsOutput.js');
    try {
      if (feedbackType === 'like') {
        await ReviewsOutput.incrementLikeCount(reviewOutputId);
      } else if (feedbackType === 'regenerate') {
        await ReviewsOutput.incrementRegenerateCount(reviewOutputId);
      }
    } catch (updateError) {
      console.error('[recordFeedback] Failed to update output counts:', updateError);
    }

    // Update learning signals
    await updateLearningSignals(businessId, feedbackType, adjustmentType);

    return true;
  } catch (error) {
    console.error('[recordFeedback] Error:', error);
    throw error;
  }
}

/**
 * Aggregate feedback and update module settings with learning signals
 */
async function updateLearningSignals(businessId, feedbackType, adjustmentType) {
  try {
    // Get recent feedback (last 100 responses)
    const { data: recentFeedback, error } = await supabaseClient
      .from('review_feedback')
      .select('feedback_type, adjustment_type')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Aggregate feedback
    const signals = {
      total_feedback: recentFeedback.length,
      likes: recentFeedback.filter(f => f.feedback_type === 'like').length,
      regenerates: recentFeedback.filter(f => f.feedback_type === 'regenerate').length,
      adjustments: {
        more_friendly: 0,
        more_professional: 0,
        more_firm: 0,
        shorter: 0,
        more_detailed: 0
      },
      last_updated: new Date().toISOString()
    };

    // Count adjustment types
    recentFeedback
      .filter(f => f.adjustment_type)
      .forEach(f => {
        if (signals.adjustments[f.adjustment_type] !== undefined) {
          signals.adjustments[f.adjustment_type]++;
        }
      });

    // Calculate biases
    const biases = calculateBiases(signals);

    // Get current module settings
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'reviews');
    const currentSettings = moduleSettings?.settings || {};

    // Update with learning signals and biases
    const updatedSettings = {
      ...currentSettings,
      feedback_learnings: {
        signals,
        biases,
        learning_enabled: true
      }
    };

    await ModuleSettings.update(businessId, 'reviews', updatedSettings);

    return biases;
  } catch (error) {
    console.error('[updateLearningSignals] Error:', error);
    throw error;
  }
}

/**
 * Calculate biases based on feedback signals
 */
function calculateBiases(signals) {
  const biases = {
    tone_adjustment: 0, // -1 (more friendly) to +1 (more firm), 0 = neutral
    length_preference: 'medium', // short, medium, long
    style_preference: 'professional' // friendly, professional, firm
  };

  if (signals.total_feedback === 0) {
    return biases;
  }

  // Calculate tone adjustment based on regenerate adjustments
  const totalAdjustments = Object.values(signals.adjustments).reduce((sum, val) => sum + val, 0);
  
  if (totalAdjustments > 0) {
    const friendlyScore = signals.adjustments.more_friendly / totalAdjustments;
    const firmScore = signals.adjustments.more_firm / totalAdjustments;
    const professionalScore = signals.adjustments.more_professional / totalAdjustments;

    if (friendlyScore > 0.4) {
      biases.tone_adjustment = -1;
      biases.style_preference = 'friendly';
    } else if (firmScore > 0.4) {
      biases.tone_adjustment = 1;
      biases.style_preference = 'firm';
    } else if (professionalScore > 0.4) {
      biases.tone_adjustment = 0;
      biases.style_preference = 'professional';
    }
  }

  // Calculate length preference
  const shorterCount = signals.adjustments.shorter;
  const detailedCount = signals.adjustments.more_detailed;
  
  if (shorterCount > detailedCount && shorterCount >= 3) {
    biases.length_preference = 'short';
  } else if (detailedCount > shorterCount && detailedCount >= 3) {
    biases.length_preference = 'long';
  }

  return biases;
}

/**
 * Get current learning biases for a business
 */
export async function getLearningBiases(businessId) {
  try {
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'reviews');
    return moduleSettings?.settings?.feedback_learnings?.biases || {
      tone_adjustment: 0,
      length_preference: 'medium',
      style_preference: 'professional'
    };
  } catch (error) {
    console.error('[getLearningBiases] Error:', error);
    return {
      tone_adjustment: 0,
      length_preference: 'medium',
      style_preference: 'professional'
    };
  }
}

