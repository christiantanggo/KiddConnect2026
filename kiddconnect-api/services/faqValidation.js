// services/faqValidation.js
// FAQ validation and tier-based limit enforcement

import { Business } from "../models/Business.js";

/**
 * Get FAQ limit by plan tier
 */
export function getFaqLimitByTier(planTier) {
  // Normalize tier names (handle both "Tier 1" and "starter" formats)
  const tierMap = {
    'Tier 1': 'starter',
    'Tier 2': 'core',
    'Tier 3': 'pro',
    'starter': 'starter',
    'core': 'core',
    'pro': 'pro',
  };
  
  const normalizedTier = tierMap[planTier] || 'starter';
  
  const limits = {
    starter: 5,
    core: 10,
    pro: 20,
  };
  return limits[normalizedTier] || 5;
}

/**
 * Validate FAQ limit
 */
export async function validateFaqLimit(businessId, currentFaqCount, newFaqCount) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const limit = getFaqLimitByTier(business.plan_tier);
  
  if (newFaqCount > limit) {
    return {
      valid: false,
      limit,
      current: currentFaqCount,
      requested: newFaqCount,
      message: `Your plan supports up to ${limit} FAQs. You currently have ${currentFaqCount} and are trying to add ${newFaqCount - currentFaqCount} more.`,
    };
  }

  return {
    valid: true,
    limit,
    current: currentFaqCount,
    requested: newFaqCount,
  };
}

/**
 * Validate FAQ content structure
 */
export function validateFaqContent(faq) {
  if (!faq || typeof faq !== "object") {
    return {
      valid: false,
      error: "FAQ must be an object with question and answer",
    };
  }

  if (!faq.question || typeof faq.question !== "string" || faq.question.trim().length === 0) {
    return {
      valid: false,
      error: "FAQ question is required and must be a non-empty string",
    };
  }

  if (!faq.answer || typeof faq.answer !== "string" || faq.answer.trim().length === 0) {
    return {
      valid: false,
      error: "FAQ answer is required and must be a non-empty string",
    };
  }

  // Check answer length (max 1000 characters)
  if (faq.answer.length > 1000) {
    return {
      valid: false,
      error: "FAQ answer must be 1000 characters or less",
    };
  }

  return {
    valid: true,
  };
}

/**
 * Update FAQ count in business record
 */
export async function updateFaqCount(businessId, faqCount) {
  return Business.update(businessId, { faq_count: faqCount });
}

