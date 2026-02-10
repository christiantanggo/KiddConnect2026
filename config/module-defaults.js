/**
 * Module Default Configuration
 * Centralized default values for all modules
 */

export const REVIEWS_DEFAULTS = {
  default_tone: 'professional',
  default_length: 'medium',
  include_resolution_by_default: true,
  risk_detection_enabled: true,
  max_review_text_length: 5000,
  min_review_text_length: 10,
};

export const MODULE_DEFAULTS = {
  reviews: REVIEWS_DEFAULTS,
};

/**
 * Get default settings for a module
 */
export function getModuleDefaults(moduleKey) {
  return MODULE_DEFAULTS[moduleKey] || {};
}





