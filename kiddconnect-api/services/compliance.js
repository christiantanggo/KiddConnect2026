// services/compliance.js
// Compliance checking utilities for SMS campaigns

import { isCanadianNumber, isUSNumber, formatPhoneNumberE164 } from '../utils/phoneFormatter.js';

/**
 * Prohibited content keywords (US & Canada)
 * Based on TCPA (US) and CASL (Canada) requirements
 */
const PROHIBITED_KEYWORDS = {
  // US prohibited content
  us: [
    // Tobacco
    'cigarette', 'cigar', 'tobacco', 'smoking', 'vape', 'vaping', 'nicotine',
    // Alcohol (must be age-gated)
    'alcohol', 'beer', 'wine', 'liquor', 'drunk', 'drinking',
    // Firearms (must be age-gated)
    'gun', 'firearm', 'weapon', 'ammunition', 'ammo',
    // Gambling
    'casino', 'gambling', 'bet', 'wager', 'lottery', 'poker',
    // Adult content
    'porn', 'xxx', 'adult', 'sex', 'nude', 'naked',
  ],
  // Canada prohibited content (CASL)
  canada: [
    // All US prohibited content plus:
    'hate', 'violence', 'illegal', 'fraud', 'scam',
    // Sex, hate, alcohol, firearms, tobacco (explicitly prohibited)
    'sex', 'hate', 'alcohol', 'firearm', 'tobacco',
  ],
};

/**
 * Check if message content contains prohibited keywords
 * @param {string} messageText - Message text to check
 * @param {string} recipientCountry - Country code ('US' or 'CA')
 * @returns {Object} { isProhibited: boolean, keywords: string[], reason: string }
 */
export function checkProhibitedContent(messageText, recipientCountry = 'US') {
  if (!messageText) {
    return { isProhibited: false, keywords: [], reason: '' };
  }

  const text = messageText.toLowerCase();
  const keywords = recipientCountry === 'CA' 
    ? [...PROHIBITED_KEYWORDS.us, ...PROHIBITED_KEYWORDS.canada]
    : PROHIBITED_KEYWORDS.us;

  const foundKeywords = keywords.filter(keyword => text.includes(keyword));

  if (foundKeywords.length > 0) {
    return {
      isProhibited: true,
      keywords: foundKeywords,
      reason: `Message contains prohibited content: ${foundKeywords.join(', ')}. ${recipientCountry === 'CA' ? 'CASL' : 'TCPA'} compliance requires filtering of prohibited content.`,
    };
  }

  return { isProhibited: false, keywords: [], reason: '' };
}

/**
 * Check if a phone number is on Do Not Call registry
 * Note: Express written consent can override DNC status (TCPA/CASL)
 * @param {string} phoneNumber - Phone number to check
 * @param {string} country - Country code ('US' or 'CA')
 * @param {Object} options - Options { hasExpressConsent: boolean, consentTimestamp: string }
 * @returns {Promise<Object>} { isDNC: boolean, source: string, reason: string, canSend: boolean }
 */
export async function checkDNCStatus(phoneNumber, country = 'US', options = {}) {
  const { hasExpressConsent = false, consentTimestamp = null } = options;
  
  // TODO: Integrate with actual DNC APIs
  // US: National Do Not Call Registry API
  // Canada: National Do Not Call List (DNCL) API
  
  // IMPORTANT: Express written consent CAN override DNC status
  // If contact has provided express written consent (e.g., checked box on waiver),
  // they can receive marketing messages even if on DNC registry
  // This is allowed under TCPA (US) and CASL (Canada)
  
  // For now, return false (not on DNC) - actual implementation needed
  // This should be replaced with real API calls:
  // - US: https://telemarketing.donotcall.gov/
  // - Canada: https://www.lnnte-dncl.gc.ca/
  
  // If express consent exists, allow sending even if on DNC (with proper documentation)
  const canSend = hasExpressConsent || false; // Default to false if no consent
  
  return {
    isDNC: false, // Placeholder - will be true when API integration is complete
    source: country === 'CA' ? 'DNCL' : 'DNC',
    reason: hasExpressConsent 
      ? 'Express written consent overrides DNC status (TCPA/CASL compliant)'
      : 'DNC checking not yet implemented - requires API integration',
    canSend: canSend, // Can send if express consent exists
    hasExpressConsent: hasExpressConsent,
    needsImplementation: true,
  };
}

/**
 * Check frequency limits for a contact
 * @param {Object} contact - Contact object with frequency tracking fields
 * @param {Object} limits - Frequency limits { maxPerDay, maxPerWeek, maxPerMonth }
 * @returns {Object} { allowed: boolean, reason: string, nextAllowedAt: Date }
 */
export function checkFrequencyLimits(contact, limits = {}) {
  const {
    maxPerDay = 1,
    maxPerWeek = 3,
    maxPerMonth = 10,
  } = limits;

  const now = new Date();
  const lastSent = contact.last_sms_sent_at ? new Date(contact.last_sms_sent_at) : null;

  // Check daily limit
  if (lastSent) {
    const hoursSinceLastSent = (now - lastSent) / (1000 * 60 * 60);
    if (hoursSinceLastSent < 24 && contact.sms_message_count_this_week >= maxPerDay) {
      const nextAllowed = new Date(lastSent);
      nextAllowed.setHours(nextAllowed.getHours() + 24);
      return {
        allowed: false,
        reason: `Daily limit exceeded (${maxPerDay} per day). Next allowed: ${nextAllowed.toLocaleString()}`,
        nextAllowedAt: nextAllowed,
      };
    }
  }

  // Check weekly limit
  if (contact.sms_message_count_this_week >= maxPerWeek) {
    // Calculate next week reset (7 days from first message this week)
    const nextAllowed = new Date(now);
    nextAllowed.setDate(nextAllowed.getDate() + 7);
    return {
      allowed: false,
      reason: `Weekly limit exceeded (${maxPerWeek} per week). Next allowed: ${nextAllowed.toLocaleString()}`,
      nextAllowedAt: nextAllowed,
    };
  }

  // Check monthly limit
  if (contact.sms_message_count_this_month >= maxPerMonth) {
    // Calculate next month reset
    const nextAllowed = new Date(now);
    nextAllowed.setMonth(nextAllowed.getMonth() + 1);
    return {
      allowed: false,
      reason: `Monthly limit exceeded (${maxPerMonth} per month). Next allowed: ${nextAllowed.toLocaleString()}`,
      nextAllowedAt: nextAllowed,
    };
  }

  return { allowed: true, reason: '', nextAllowedAt: null };
}

/**
 * Check if contact has valid consent
 * @param {Object} contact - Contact object
 * @param {string} country - Country code ('US' or 'CA')
 * @returns {Object} { hasConsent: boolean, reason: string }
 */
export function checkConsent(contact, country = 'US') {
  if (!contact) {
    return { hasConsent: false, reason: 'Contact not found' };
  }

  // Check if consent is explicitly set
  if (contact.sms_consent === false || contact.sms_consent === null) {
    return {
      hasConsent: false,
      reason: country === 'CA' 
        ? 'CASL requires express consent for SMS. Contact has not consented.'
        : 'TCPA requires express written consent for SMS. Contact has not consented.',
    };
  }

  // Check if consent timestamp exists (required for compliance)
  if (!contact.sms_consent_timestamp) {
    return {
      hasConsent: false,
      reason: 'Consent timestamp missing. Cannot prove compliance without timestamp.',
    };
  }

  // Check if double opt-in is required and verified
  // (Some industries require double opt-in, but not all)
  // For now, single opt-in is sufficient if sms_consent is true

  return { hasConsent: true, reason: '' };
}

/**
 * Detect country from phone number
 * @param {string} phoneNumber - Phone number
 * @returns {string} Country code ('US', 'CA', or 'UNKNOWN')
 */
export function detectCountry(phoneNumber) {
  if (isCanadianNumber(phoneNumber)) return 'CA';
  if (isUSNumber(phoneNumber)) return 'US';
  return 'UNKNOWN';
}

