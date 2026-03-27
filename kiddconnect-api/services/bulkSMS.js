// services/bulkSMS.js
// Bulk SMS campaign service with rate limiting and multi-number support

import { parse } from 'csv-parse/sync';
import { sendSMSDirect, addBusinessIdentification } from './notifications.js';
import { 
  validatePhoneNumbersForBulk, 
  formatPhoneNumberE164,
  isCanadianNumber,
  isUSNumber,
  isTollFree,
  getNumberCountry
} from '../utils/phoneFormatter.js';
import { 
  checkConsent, 
  checkFrequencyLimits, 
  checkProhibitedContent, 
  detectCountry,
  checkDNCStatus 
} from './compliance.js';
import { 
  getTimezoneFromPhoneNumber, 
  checkQuietHours 
} from '../utils/timezoneDetector.js';
import { SMSCampaign } from '../models/SMSCampaign.js';
import { SMSCampaignRecipient } from '../models/SMSCampaignRecipient.js';
import { SMSOptOut } from '../models/SMSOptOut.js';
import { Business } from '../models/Business.js';
import { BusinessPhoneNumber } from '../models/BusinessPhoneNumber.js';
import { Contact } from '../models/Contact.js';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = 'https://api.telnyx.com/v2';

/**
 * Rate limits by number type (messages per minute)
 * Based on Telnyx official rate limits:
 * - Long Code (A2P/P2P): 2 messages/minute per number
 * - Toll-Free: 1,200 messages/minute per number
 * - Short Code: 60,000 messages/minute per number
 * - Account Limit: 3,000 messages/minute across all numbers
 */
const RATE_LIMITS = {
  'CA_LOCAL': 2,        // Canadian local (Long Code): 2 messages/minute (Telnyx standard)
  'US_LOCAL_UNREGISTERED': 2,  // US local (Long Code, unregistered): 2 messages/minute
  'US_LOCAL_10DLC': 2,  // US local (Long Code, 10DLC registered): 2 messages/minute (Telnyx standard, not higher for 10DLC)
  'TOLL_FREE_VERIFIED': 1200,  // Toll-free (verified): 1,200 messages/minute (Telnyx official limit)
  'TOLL_FREE_UNVERIFIED': 0,   // Toll-free (unverified): Cannot send
  'SHORT_CODE': 60000,  // Short Code: 60,000 messages/minute (Telnyx official limit)
};

/**
 * Parse CSV file and extract contact information
 * Supports both comma and semicolon delimiters
 * Expected format: EMAIL;LASTNAME;FIRSTNAME;SMS or EMAIL,LASTNAME,FIRSTNAME,SMS
 * @param {Buffer} fileBuffer - CSV file buffer
 * @returns {Array} Array of contact objects { email, last_name, first_name, phone_number }
 */
export function parseCSV(fileBuffer) {
  try {
    // Detect delimiter (semicolon or comma)
    const text = fileBuffer.toString('utf-8');
    const firstLine = text.split('\n')[0];
    const hasSemicolon = firstLine.includes(';');
    const delimiter = hasSemicolon ? ';' : ',';
    
    const records = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: delimiter,
    });
    
    // Extract contact information
    const contacts = [];
    for (const record of records) {
      // Try to find fields - handle case-insensitive column names
      const recordLower = {};
      Object.keys(record).forEach(key => {
        recordLower[key.toLowerCase()] = record[key];
      });
      
      // Look for email, lastname/firstname, sms/phone columns
      let email = recordLower.email || recordLower['e-mail'] || '';
      let lastName = recordLower.lastname || recordLower['last name'] || recordLower.lname || '';
      let firstName = recordLower.firstname || recordLower['first name'] || recordLower.fname || '';
      let phoneNumber = recordLower.sms || recordLower.phone || recordLower['phone number'] || recordLower.phone_number || '';
      
      // If columns are not named, try to infer from position
      // Format: EMAIL;LASTNAME;FIRSTNAME;SMS
      const values = Object.values(record);
      if (values.length >= 4 && !email && !phoneNumber) {
        // Assume positional: [0]=email, [1]=lastname, [2]=firstname, [3]=sms
        email = values[0] || '';
        lastName = values[1] || '';
        firstName = values[2] || '';
        phoneNumber = values[3] || '';
      } else if (values.length >= 1) {
        // Try to find phone number in any field
        for (const value of values) {
          if (value && typeof value === 'string') {
            const digits = value.replace(/\D/g, '');
            if (digits.length >= 10 && !phoneNumber) {
              phoneNumber = value.trim();
            }
            // Check if it looks like an email
            if (value.includes('@') && !email) {
              email = value.trim();
            }
          }
        }
      }
      
      // Only add if we have at least a phone number
      if (phoneNumber && phoneNumber.trim()) {
        contacts.push({
          email: email ? email.trim() : null,
          last_name: lastName ? lastName.trim() : null,
          first_name: firstName ? firstName.trim() : null,
          phone_number: phoneNumber.trim(),
        });
      }
    }
    
    return contacts;
  } catch (error) {
    console.error('[BulkSMS] CSV parsing error:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Detect number type and calculate rate limit
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {boolean} isVerified - Whether toll-free number is verified (default: true for now)
 * @returns {Object} { type: string, country: string, rateLimit: number, rateUnit: string }
 */
export function detectNumberType(phoneNumber, isVerified = true) {
  const country = getNumberCountry(phoneNumber);
  const isTollFreeNum = isTollFree(phoneNumber);
  
  let type;
  let rateLimit;
  
  if (isTollFreeNum) {
    if (isVerified) {
      type = 'TOLL_FREE_VERIFIED';
      rateLimit = RATE_LIMITS.TOLL_FREE_VERIFIED;
    } else {
      type = 'TOLL_FREE_UNVERIFIED';
      rateLimit = RATE_LIMITS.TOLL_FREE_UNVERIFIED;
    }
  } else if (country === 'CA') {
    type = 'CA_LOCAL';
    rateLimit = RATE_LIMITS.CA_LOCAL;
  } else if (country === 'US') {
    // For now, assume unregistered. In future, check 10DLC status
    type = 'US_LOCAL_UNREGISTERED';
    rateLimit = RATE_LIMITS.US_LOCAL_UNREGISTERED;
  } else {
    // Default to US unregistered if unknown
    type = 'US_LOCAL_UNREGISTERED';
    rateLimit = RATE_LIMITS.US_LOCAL_UNREGISTERED;
  }
  
  return {
    type,
    country: country || 'US',
    rateLimit,
    rateUnit: 'messages_per_minute',
  };
}

/**
 * Get all SMS-capable numbers for a business
 * @param {string} businessId - Business ID
 * @returns {Promise<Array>} Array of number objects with type and rate limit
 */
export async function getAvailableSMSNumbers(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error('Business not found');
  }
  
  const numbers = [];
  
  // Get all active phone numbers from business_phone_numbers table (new system)
  try {
    const businessPhoneNumbers = await BusinessPhoneNumber.findActiveByBusinessId(businessId);
    
    if (businessPhoneNumbers.length > 0) {
      // Use numbers from business_phone_numbers table
      for (const bpn of businessPhoneNumbers) {
        // Only check verification status for toll-free numbers (local numbers don't need verification)
        // Skip verification check if rate limited to avoid 429 errors
        let isVerified = true; // Default to verified
        const isTollFreeNum = isTollFree(bpn.phone_number);
        
        // Only check verification for toll-free numbers
        if (isTollFreeNum) {
          try {
            const { getVerificationStatus } = await import('./telnyxVerification.js');
            const verificationStatus = await getVerificationStatus(bpn.phone_number);
            isVerified = verificationStatus.verified || false;
          } catch (verifyError) {
            // Handle rate limiting gracefully - skip verification check if 429
            if (verifyError.response?.status === 429) {
              console.warn(`[BulkSMS] Rate limited (429) when checking verification for ${bpn.phone_number} - skipping check, assuming verified`);
              isVerified = true; // Assume verified to avoid blocking sends
            } else {
              console.warn(`[BulkSMS] Could not check verification status for ${bpn.phone_number}:`, verifyError.message);
              isVerified = true; // Default to verified to avoid blocking sends
            }
          }
        } else {
          // Local numbers don't need verification - always verified
          isVerified = true;
        }
        
        const numberInfo = detectNumberType(bpn.phone_number, isVerified);
        numbers.push({
          phone_number: bpn.phone_number,
          ...numberInfo,
          verified: isVerified,
          is_primary: bpn.is_primary,
        });
      }
      console.log(`[BulkSMS] Found ${numbers.length} phone number(s) from business_phone_numbers table`);
    } else {
      // Fallback to legacy telnyx_number field
      if (business.telnyx_number) {
        const numberInfo = detectNumberType(business.telnyx_number, true);
        numbers.push({
          phone_number: business.telnyx_number,
          ...numberInfo,
          verified: true,
          is_primary: true,
        });
        console.log(`[BulkSMS] Using legacy telnyx_number field: ${business.telnyx_number}`);
      }
    }
  } catch (error) {
    console.warn('[BulkSMS] Error loading from business_phone_numbers table (may not exist yet):', error.message);
    // Fallback to legacy telnyx_number field
    if (business.telnyx_number) {
      const numberInfo = detectNumberType(business.telnyx_number, true);
      numbers.push({
        phone_number: business.telnyx_number,
        ...numberInfo,
        verified: true,
        is_primary: true,
      });
    }
  }
  
  if (numbers.length === 0) {
    console.warn(`[BulkSMS] ⚠️  No SMS-capable phone numbers found for business ${businessId}`);
  }
  
  return numbers;
}

/**
 * Calculate total throughput for multiple numbers
 * @param {Array} numbers - Array of number objects with rateLimit
 * @returns {Object} { totalRate: number, unit: string }
 */
export function calculateTotalThroughput(numbers) {
  const totalRate = numbers.reduce((sum, num) => {
    return sum + (num.rateLimit || 0);
  }, 0);
  
  return {
    totalRate,
    unit: 'messages_per_minute',
    totalPerHour: totalRate * 60,
  };
}

/**
 * Load balance messages across multiple numbers
 * @param {Array} phoneNumbers - Array of recipient phone numbers
 * @param {Array} availableNumbers - Array of available sender numbers
 * @returns {Array} Array of { phoneNumber, fromNumber } assignments
 */
export function loadBalanceMessages(phoneNumbers, availableNumbers) {
  if (availableNumbers.length === 0) {
    throw new Error('No SMS-capable numbers available');
  }
  
  const assignments = [];
  let numberIndex = 0;
  
  for (const phoneNumber of phoneNumbers) {
    // Round-robin assignment
    const fromNumber = availableNumbers[numberIndex % availableNumbers.length];
    assignments.push({
      phoneNumber,
      fromNumber: fromNumber.phone_number,
      numberInfo: fromNumber,
    });
    numberIndex++;
  }
  
  return assignments;
}

/**
 * Send bulk SMS campaign
 * @param {string} campaignId - Campaign ID
 * @param {string} businessId - Business ID
 * @param {string} messageText - SMS message text
 * @param {Array} phoneNumbers - Array of recipient phone numbers
 */
/**
 * Check if current time is within allowed SMS sending hours for a recipient
 * Applies STRICTEST rules across US and Canada for full compliance
 * - US Federal (TCPA): 8 AM - 9 PM
 * - US Florida: 8 AM - 8 PM
 * - US Texas: 9 AM - 9 PM (Mon-Sat)
 * - Canada (CASL): No specific rule, but best practice 8 AM - 9 PM
 * - STRICTEST RULE: 9 AM - 8 PM (covers all US states and Canada best practice)
 * 
 * Uses BUSINESS timezone (universal timezone) from settings, not recipient timezone
 * 
 * @param {string} phoneNumber - Recipient phone number
 * @param {Object} business - Business object with SMS time settings
 * @returns {Object} { allowed: boolean, reason: string, timezone: string, currentTime: string, country: string }
 */
function checkRecipientQuietHours(phoneNumber, business) {
  // If SMS business hours are disabled, always allow sending
  if (!business.sms_business_hours_enabled) {
    return {
      allowed: true,
      reason: 'quiet_hours_disabled',
      message: 'SMS time restrictions are disabled',
    };
  }

  // Detect recipient country for country-specific rules
  const recipientCountry = getNumberCountry(phoneNumber);
  const isCanadian = isCanadianNumber(phoneNumber);
  const isUS = isUSNumber(phoneNumber);
  
  // Use BUSINESS timezone from settings (universal timezone), not recipient timezone
  const businessTimezone = business.sms_timezone || business.timezone || 'America/New_York';
  
  // Apply STRICTEST quiet hours across US and Canada
  // Default: 9 AM - 8 PM (covers all US states including Texas, and Canada best practice)
  let startTime = business.sms_allowed_start_time || '09:00:00'; // 9 AM (strictest)
  let endTime = business.sms_allowed_end_time || '20:00:00'; // 8 PM (strictest - covers Florida)
  
  // Future: Could add state/province detection for even stricter rules
  // For now, 9 AM - 8 PM is the strictest that covers all jurisdictions
  
  const [startHour] = startTime.split(':').map(Number);
  const [endHour] = endTime.split(':').map(Number);
  
  // Check quiet hours for BUSINESS timezone (universal timezone)
  const quietHoursCheck = checkQuietHours(businessTimezone, startHour, endHour);
  
  return {
    allowed: quietHoursCheck.isWithinAllowedHours,
    reason: quietHoursCheck.isWithinQuietHours ? 'quiet_hours' : 'allowed',
    timezone: businessTimezone,
    country: recipientCountry || (isCanadian ? 'CA' : isUS ? 'US' : 'UNKNOWN'),
    currentTime: quietHoursCheck.currentTime.toLocaleTimeString(),
    message: quietHoursCheck.message,
    quietHoursCheck,
  };
}

export async function sendBulkSMS(campaignId, businessId, messageText, phoneNumbers, options = {}) {
  const { overrideQuietHours = false } = options;
  console.log(`[BulkSMS] ========== FUNCTION CALLED ==========`);
  console.log(`[BulkSMS] Function entry point reached`);
  console.log(`[BulkSMS] Parameters received:`, {
    campaignId,
    businessId,
    messageTextLength: messageText?.length || 0,
    phoneNumbersLength: phoneNumbers?.length || 0,
  });
  
  // Validate inputs
  if (!campaignId) {
    throw new Error('campaignId is required');
  }
  if (!businessId) {
    throw new Error('businessId is required');
  }
  if (!messageText) {
    throw new Error('messageText is required');
  }
  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    throw new Error('phoneNumbers must be a non-empty array');
  }
  
  const startTime = Date.now();
  console.log(`[BulkSMS] ========== STARTING CAMPAIGN ${campaignId} ==========`);
  console.log(`[BulkSMS] Business ID: ${businessId}`);
  console.log(`[BulkSMS] Total recipients: ${phoneNumbers.length}`);
  console.log(`[BulkSMS] Message length: ${messageText.length} characters`);
  console.log(`[BulkSMS] Start time: ${new Date().toISOString()}`);
  
  // Get business to check SMS time settings
  console.log(`[BulkSMS] Fetching business ${businessId}...`);
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error(`Business ${businessId} not found`);
  }
  console.log(`[BulkSMS] ✅ Business found: ${business.name}`);
  
  // Check quiet hours for all recipients before sending
  // This enforces TCPA compliance by checking each recipient's timezone
  const quietHoursViolations = [];
  const quietHoursStats = {
    total: phoneNumbers.length,
    allowed: 0,
    blocked: 0,
    timezones: {},
  };
  
  if (business.sms_business_hours_enabled && !overrideQuietHours) {
    console.log(`[BulkSMS] 🔍 Checking quiet hours for ${phoneNumbers.length} recipients...`);
    
    for (const phoneNumber of phoneNumbers) {
      const check = checkRecipientQuietHours(phoneNumber, business);
      
      // Track timezone distribution
      if (!quietHoursStats.timezones[check.timezone]) {
        quietHoursStats.timezones[check.timezone] = { allowed: 0, blocked: 0 };
      }
      
      if (check.allowed) {
        quietHoursStats.allowed++;
        quietHoursStats.timezones[check.timezone].allowed++;
      } else {
        quietHoursStats.blocked++;
        quietHoursStats.timezones[check.timezone].blocked++;
        quietHoursViolations.push({
          phoneNumber,
          timezone: check.timezone,
          currentTime: check.currentTime,
          reason: check.message,
        });
      }
    }
    
    console.log(`[BulkSMS] 📊 Quiet Hours Check Results:`);
    console.log(`[BulkSMS]   Total recipients: ${quietHoursStats.total}`);
    console.log(`[BulkSMS]   Allowed: ${quietHoursStats.allowed}`);
    console.log(`[BulkSMS]   Blocked (quiet hours): ${quietHoursStats.blocked}`);
    Object.entries(quietHoursStats.timezones).forEach(([tz, stats]) => {
      console.log(`[BulkSMS]   ${tz}: ${stats.allowed} allowed, ${stats.blocked} blocked`);
    });
    
    // If all recipients are in quiet hours, block the entire campaign
    if (quietHoursStats.blocked === quietHoursStats.total && quietHoursStats.total > 0) {
      const errorMessage = `🚫 All recipients are in quiet hours. SMS sending is blocked to comply with TCPA regulations. Allowed hours: ${business.sms_allowed_start_time || '09:00'} - ${business.sms_allowed_end_time || '20:00'} (recipient's local time). Use overrideQuietHours option to bypass (admin only).`;
      console.error(`[BulkSMS] ${errorMessage}`);
      await SMSCampaign.updateStatus(campaignId, 'failed');
      throw new Error(errorMessage);
    }
    
    // If some recipients are in quiet hours, log warning but continue with allowed recipients
    if (quietHoursStats.blocked > 0) {
      console.warn(`[BulkSMS] ⚠️  ${quietHoursStats.blocked} recipient(s) are in quiet hours and will be skipped`);
      console.warn(`[BulkSMS] ⚠️  Sample violations:`, quietHoursViolations.slice(0, 3));
    }
  } else if (overrideQuietHours) {
    console.warn(`[BulkSMS] ⚠️  Quiet hours override enabled - sending despite quiet hours restrictions (admin override)`);
  } else {
    console.log(`[BulkSMS] ✅ SMS time restrictions are disabled - sending allowed at any time`);
  }
  
  // Update campaign status to processing
  console.log(`[BulkSMS] Updating campaign status to 'processing'...`);
  await SMSCampaign.updateStatus(campaignId, 'processing');
  console.log(`[BulkSMS] ✅ Campaign status updated to 'processing'`);
  
  try {
    // Get available numbers
    console.log(`[BulkSMS] Getting available SMS numbers for business ${businessId}...`);
    const allNumbers = await getAvailableSMSNumbers(businessId);
    console.log(`[BulkSMS] Found ${allNumbers.length} number(s) total:`);
    allNumbers.forEach((num, idx) => {
      console.log(`[BulkSMS]   ${idx + 1}. ${num.phone_number} (${num.type}, ${num.rateLimit} msg/min, ${num.country}, verified: ${num.verified})`);
    });
    
    // Filter out unverified toll-free numbers (compliance requirement - cannot send from unverified toll-free)
    const availableNumbers = allNumbers.filter(num => {
      // Safety check: skip if phone_number is missing
      if (!num.phone_number) {
        console.warn(`[BulkSMS] ⚠️  Skipping number with missing phone_number`);
        return false;
      }
      
      // Check if it's an unverified toll-free number
      const isTollFreeNum = isTollFree(num.phone_number);
      if (num.type === 'TOLL_FREE_UNVERIFIED' || (isTollFreeNum && !num.verified)) {
        console.warn(`[BulkSMS] ⚠️  Skipping unverified toll-free number ${num.phone_number} - cannot send SMS until verified`);
        return false;
      }
      
      // Also filter out numbers with rateLimit of 0 (shouldn't happen, but safety check)
      if (num.rateLimit === 0) {
        console.warn(`[BulkSMS] ⚠️  Skipping number ${num.phone_number} with rateLimit of 0`);
        return false;
      }
      return true;
    });
    
    console.log(`[BulkSMS] After filtering unverified toll-free numbers: ${availableNumbers.length} available number(s):`);
    availableNumbers.forEach((num, idx) => {
      console.log(`[BulkSMS]   ${idx + 1}. ${num.phone_number} (${num.type}, ${num.rateLimit} msg/min, ${num.country})`);
    });
    
    if (availableNumbers.length === 0) {
      const unverifiedTollFree = allNumbers.filter(num => num.phone_number && isTollFree(num.phone_number) && !num.verified);
      if (unverifiedTollFree.length > 0) {
        throw new Error(`Cannot send SMS: All available numbers are unverified toll-free numbers. Toll-free numbers must be verified before sending SMS. Please verify your toll-free number(s) in Telnyx dashboard or contact support.`);
      }
      throw new Error('No SMS-capable numbers available for this business');
    }
    
    console.log(`[BulkSMS] Available numbers: ${availableNumbers.length}`);
    availableNumbers.forEach((num, idx) => {
      console.log(`[BulkSMS]   ${idx + 1}. ${num.phone_number} (${num.type}, ${num.rateLimit} msg/min)`);
    });
    
    // Calculate total throughput
    const throughput = calculateTotalThroughput(availableNumbers);
    console.log(`[BulkSMS] Total throughput: ${throughput.totalRate} msg/min = ${throughput.totalPerHour} msg/hour`);
    
    // Get recipients with contact info from database (if phoneNumbers not provided)
    const recipientPhoneNumbers = phoneNumbers && phoneNumbers.length > 0 
      ? phoneNumbers 
      : (await SMSCampaignRecipient.findByCampaignId(campaignId)).map(r => r.phone_number);
    
    // Filter out recipients in quiet hours (if enabled) and queue them for later
    let allowedRecipients = recipientPhoneNumbers;
    const quietHoursBlockedSet = new Set();
    const queuedRecipients = []; // Store recipients to queue for later sending
    
    if (business.sms_business_hours_enabled && quietHoursStats.blocked > 0) {
      console.log(`[BulkSMS] 🔍 Filtering out ${quietHoursStats.blocked} recipient(s) in quiet hours...`);
      
      // Get all recipient records from database to update their status
      const allRecipientRecords = await SMSCampaignRecipient.findByCampaignId(campaignId);
      const recipientRecordMap = new Map(allRecipientRecords.map(r => [r.phone_number, r]));
      
      allowedRecipients = recipientPhoneNumbers.filter(phoneNumber => {
        const check = checkRecipientQuietHours(phoneNumber, business);
        if (!check.allowed) {
          quietHoursBlockedSet.add(phoneNumber);
          
          // Calculate next allowed send time (9 AM in business timezone)
          const businessTimezone = check.timezone; // This is now business timezone, not recipient
          const startTime = business.sms_allowed_start_time || '09:00:00';
          const [startHour] = startTime.split(':').map(Number);
          
          // Get current time in business timezone
          const now = new Date();
          const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: businessTimezone }));
          const currentHour = timeInTimezone.getHours();
          
          // Calculate scheduled send time: next 9 AM in business timezone
          const scheduledSend = new Date(timeInTimezone);
          scheduledSend.setHours(startHour, 0, 0, 0);
          
          // If current time is before 9 AM today, schedule for today
          // If current time is after 8 PM, schedule for tomorrow
          if (currentHour >= (parseInt(business.sms_allowed_end_time?.split(':')[0]) || 20)) {
            scheduledSend.setDate(scheduledSend.getDate() + 1);
          }
          
          // Store recipient record for queuing
          const recipientRecord = recipientRecordMap.get(phoneNumber);
          if (recipientRecord) {
            queuedRecipients.push({
              recipientId: recipientRecord.id,
              phoneNumber,
              scheduledSendAt: scheduledSend.toISOString(),
              timezone: businessTimezone,
            });
          }
          
          return false;
        }
        return true;
      });
      
      // Queue blocked recipients for later sending
      if (queuedRecipients.length > 0) {
        console.log(`[BulkSMS] 📅 Queuing ${queuedRecipients.length} recipient(s) for scheduled sending...`);
        for (const queued of queuedRecipients) {
          try {
            await SMSCampaignRecipient.updateStatus(queued.recipientId, 'queued', {
              scheduled_send_at: queued.scheduledSendAt,
            });
            console.log(`[BulkSMS]   Queued ${queued.phoneNumber} for ${queued.scheduledSendAt} (business timezone: ${queued.timezone})`);
          } catch (error) {
            console.error(`[BulkSMS] Error queuing recipient ${queued.phoneNumber}:`, error.message);
          }
        }
        console.log(`[BulkSMS] ✅ Queued ${queuedRecipients.length} recipient(s) - they will be sent automatically when quiet hours end`);
      }
      
      console.log(`[BulkSMS] ✅ ${allowedRecipients.length} recipient(s) allowed after quiet hours filter`);
    }
    
    // Load balance messages (only for allowed recipients)
    const assignments = loadBalanceMessages(allowedRecipients, availableNumbers);
    
    // Check opt-outs - normalize phone numbers for comparison
    const optOuts = await SMSOptOut.findByBusinessId(businessId);
    const optOutSet = new Set();
    
    // Normalize opt-out phone numbers to E.164 format
    for (const optOut of optOuts) {
      try {
        const normalized = formatPhoneNumberE164(optOut.phone_number);
        if (normalized) {
          optOutSet.add(normalized);
          // Also add original format for robustness
          optOutSet.add(optOut.phone_number);
        } else {
          optOutSet.add(optOut.phone_number); // Fallback to original if normalization fails
        }
      } catch (error) {
        console.warn(`[BulkSMS] Could not normalize opt-out number ${optOut.phone_number}:`, error.message);
        optOutSet.add(optOut.phone_number); // Fallback to original
      }
    }
    
    // Filter out opted-out numbers - normalize recipient numbers too
    const validAssignments = assignments.filter(a => {
      // Skip if in quiet hours
      if (quietHoursBlockedSet.has(a.phoneNumber)) {
        return false;
      }
      
      try {
        const normalizedPhone = formatPhoneNumberE164(a.phoneNumber);
        // Check both normalized and original format
        const isOptedOut = optOutSet.has(a.phoneNumber) || (normalizedPhone && optOutSet.has(normalizedPhone));
        return !isOptedOut;
      } catch (error) {
        // If normalization fails, just check original format
        return !optOutSet.has(a.phoneNumber);
      }
    });
    
    const filteredCount = assignments.length - validAssignments.length;
    const optedOutCount = filteredCount - (quietHoursStats.blocked || 0);
    
    if (quietHoursStats.blocked > 0) {
      console.log(`[BulkSMS] ✅ Filtered out ${quietHoursStats.blocked} recipient(s) in quiet hours - TCPA compliance`);
    }
    if (optedOutCount > 0) {
      console.log(`[BulkSMS] ✅ Filtered out ${optedOutCount} opted-out number(s) - they will NOT receive messages`);
    }
    
    // Track last send time per number to enforce rate limits
    const numberLastSend = {};
    const numberSendCounts = {};
    
    // Initialize tracking
    availableNumbers.forEach(num => {
      numberLastSend[num.phone_number] = 0;
      numberSendCounts[num.phone_number] = 0;
    });
    
    // Log initial distribution plan
    console.log(`[BulkSMS] 📊 Load Balancing Plan:`);
    console.log(`[BulkSMS]   Total messages: ${validAssignments.length}`);
    console.log(`[BulkSMS]   Available numbers: ${availableNumbers.length}`);
    const distribution = {};
    validAssignments.forEach(a => {
      distribution[a.fromNumber] = (distribution[a.fromNumber] || 0) + 1;
    });
    Object.entries(distribution).forEach(([num, count]) => {
      const percent = ((count / validAssignments.length) * 100).toFixed(1);
      console.log(`[BulkSMS]   ${num}: ${count} messages (${percent}%)`);
    });
    
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];
    
    // Pre-fetch all recipients for efficient lookup
    const allRecipients = await SMSCampaignRecipient.findByCampaignId(campaignId);
    const recipientMap = new Map(allRecipients.map(r => [r.phone_number, r]));
    
    console.log(`[BulkSMS] ========== STARTING TO SEND MESSAGES ==========`);
    console.log(`[BulkSMS] Processing ${validAssignments.length} messages with rate limiting`);
    
    // Process messages with rate limiting
    let lastLogTime = Date.now();
    for (let i = 0; i < validAssignments.length; i++) {
      const assignment = validAssignments[i];
      const { phoneNumber, fromNumber, numberInfo } = assignment;
      
      // Log progress every 10 messages or every 30 seconds
      const now = Date.now();
      if (i % 10 === 0 || (now - lastLogTime) > 30000) {
        const elapsed = ((now - startTime) / 1000).toFixed(1);
        const rate = sentCount > 0 ? (sentCount / (elapsed / 60)).toFixed(1) : 0;
        console.log(`[BulkSMS] Progress: ${i + 1}/${validAssignments.length} (${((i + 1) / validAssignments.length * 100).toFixed(1)}%) | Sent: ${sentCount} | Failed: ${failedCount} | Rate: ${rate} msg/min | Elapsed: ${elapsed}s`);
        lastLogTime = now;
      }
      
      // Check if we need to wait for rate limit
      const lastSend = numberLastSend[fromNumber] || 0;
      const rateLimit = numberInfo.rateLimit; // messages per minute
      const minInterval = (60 * 1000) / rateLimit; // milliseconds between messages
      
      if (lastSend > 0) {
        const timeSinceLastSend = now - lastSend;
        if (timeSinceLastSend < minInterval) {
          const waitTime = minInterval - timeSinceLastSend;
          if (waitTime > 100) { // Only log if waiting more than 100ms
            console.log(`[BulkSMS] Rate limit: Waiting ${waitTime.toFixed(0)}ms before sending from ${fromNumber} (limit: ${rateLimit} msg/min)`);
          }
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      // Send SMS
      try {
        // Find recipient record
        const recipient = recipientMap.get(phoneNumber);
        if (!recipient) {
          console.warn(`[BulkSMS] No recipient record found for ${phoneNumber}`);
          continue;
        }
        
        // Prepare message with business identification
        const compliantMessage = addBusinessIdentification(messageText, business.name);
        
        // Check prohibited content (TCPA/CASL compliance)
        const country = detectCountry(phoneNumber);
        const contentCheck = checkProhibitedContent(compliantMessage, country);
        if (contentCheck.isProhibited) {
          console.error(`[BulkSMS] ❌ Prohibited content detected for ${phoneNumber}: ${contentCheck.reason}`);
          await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
            error_message: contentCheck.reason,
          });
          failedCount++;
          continue; // Skip this message
        }
        
        // Check DNC status (express consent can override DNC status)
        // Find contact to check for express consent
        let hasExpressConsent = false;
        let consentTimestamp = null;
        try {
          const contact = await Contact.findByPhone(businessId, phoneNumber);
          if (contact && contact.sms_consent && contact.sms_consent_timestamp) {
            hasExpressConsent = true;
            consentTimestamp = contact.sms_consent_timestamp;
          }
        } catch (contactError) {
          console.warn(`[BulkSMS] Could not check consent for ${phoneNumber}:`, contactError.message);
        }
        
        const dncCheck = await checkDNCStatus(phoneNumber, country, {
          hasExpressConsent,
          consentTimestamp,
        });
        
        // Only block if on DNC AND no express consent
        if (dncCheck.isDNC && !dncCheck.hasExpressConsent) {
          console.warn(`[BulkSMS] ⚠️  Phone number ${phoneNumber} is on ${dncCheck.source} registry and has no express consent`);
          await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
            error_message: `Number is on ${dncCheck.source} registry and no express consent found`,
          });
          failedCount++;
          continue; // Skip this message
        } else if (dncCheck.isDNC && dncCheck.hasExpressConsent) {
          console.log(`[BulkSMS] ✅ Phone number ${phoneNumber} is on ${dncCheck.source} registry but has express consent - sending allowed (TCPA/CASL compliant)`);
          // Log for compliance records
          console.log(`[BulkSMS] 📋 Express consent timestamp: ${consentTimestamp}`);
        }
        
        const sendStartTime = Date.now();
        // Send SMS (compliantMessage already has business identification)
        // Note: sendSMSDirect will add footer, but we've already added business identification
        const response = await sendSMSDirect(fromNumber, phoneNumber, compliantMessage, business.name, false);
        const sendDuration = Date.now() - sendStartTime;
        
        if (sendDuration > 1000) {
          console.log(`[BulkSMS] ⚠️ Slow send: ${sendDuration}ms for ${phoneNumber}`);
        }
        
        // Update recipient status
        // Note: response is now the full axios response, so we need response.data
        await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
          telnyx_message_id: response.data?.data?.id || response.data?.id || null,
        });
        
        // Update contact frequency tracking if contact exists
        try {
          const contact = await Contact.findByPhone(businessId, phoneNumber);
          if (contact) {
            await Contact.updateSMSFrequency(contact.id);
          }
        } catch (freqError) {
          console.warn(`[BulkSMS] Could not update frequency tracking for ${phoneNumber}:`, freqError.message);
          // Don't fail the send if frequency tracking fails
        }
        
        sentCount++;
        numberSendCounts[fromNumber]++;
        numberLastSend[fromNumber] = Date.now();
        
        // Update campaign progress every 10 messages
        if (sentCount % 10 === 0) {
          await SMSCampaign.update(campaignId, {
            sent_count: sentCount,
            failed_count: failedCount,
          });
        }
      } catch (error) {
        // Enhanced error logging
        console.error(`[BulkSMS] ❌ ========== SMS SEND FAILED ==========`);
        console.error(`[BulkSMS] Phone Number: ${phoneNumber}`);
        console.error(`[BulkSMS] From Number: ${fromNumber}`);
        console.error(`[BulkSMS] Error Message: ${error.message}`);
        console.error(`[BulkSMS] Error Name: ${error.name}`);
        console.error(`[BulkSMS] Error Code: ${error.code}`);
        if (error.stack) {
          console.error(`[BulkSMS] Error Stack:`, error.stack);
        }
        if (error.response) {
          console.error(`[BulkSMS] HTTP Status: ${error.response.status}`);
          console.error(`[BulkSMS] Error Response Data:`, JSON.stringify(error.response.data, null, 2));
          console.error(`[BulkSMS] Error Response Headers:`, JSON.stringify(error.response.headers, null, 2));
        }
        if (error.request) {
          console.error(`[BulkSMS] Request Config:`, JSON.stringify({
            url: error.config?.url,
            method: error.config?.method,
            headers: error.config?.headers,
          }, null, 2));
        }
        console.error(`[BulkSMS] =========================================`);
        
        // Update recipient status
        const recipient = recipientMap.get(phoneNumber);
        if (recipient) {
          // Extract detailed error message from Telnyx API response
          let errorMessage = 'Unknown error';
          
          if (error.response?.data?.errors && Array.isArray(error.response.data.errors) && error.response.data.errors.length > 0) {
            const firstError = error.response.data.errors[0];
            // Format: "Title: Detail" or just "Detail" if no title
            errorMessage = firstError.title && firstError.detail
              ? `${firstError.title}: ${firstError.detail}`
              : firstError.detail || firstError.title || errorMessage;
            
            // Include error code if available
            if (firstError.code) {
              errorMessage = `[${firstError.code}] ${errorMessage}`;
            }
          } else if (error.response?.data?.message) {
            errorMessage = error.response.data.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          console.log(`[BulkSMS] Saving error message for ${phoneNumber}: ${errorMessage}`);
          
          await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
            error_message: errorMessage,
          });
          
          console.log(`[BulkSMS] ✅ Error message saved for recipient ${recipient.id}`);
        }
        
        failedCount++;
        errors.push({ 
          phoneNumber, 
          error: error.message,
          status: error.response?.status,
          details: error.response?.data,
        });
        
        // Update campaign progress
        await SMSCampaign.update(campaignId, {
          sent_count: sentCount,
          failed_count: failedCount,
        });
      }
    }
    
    // Update final campaign status
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalStatus = failedCount === validAssignments.length ? 'failed' : 'completed';
    
    console.log(`[BulkSMS] ========== CAMPAIGN ${campaignId} FINISHED ==========`);
    console.log(`[BulkSMS] Final status: ${finalStatus}`);
    console.log(`[BulkSMS] Total sent: ${sentCount}`);
    console.log(`[BulkSMS] Total failed: ${failedCount}`);
    console.log(`[BulkSMS] Total time: ${totalTime} seconds (${(totalTime / 60).toFixed(1)} minutes)`);
    console.log(`[BulkSMS] Average rate: ${sentCount > 0 ? (sentCount / (totalTime / 60)).toFixed(1) : 0} messages/minute`);
    console.log(`[BulkSMS] End time: ${new Date().toISOString()}`);
    
    // Log distribution summary
    console.log(`[BulkSMS] 📊 Message Distribution by Phone Number:`);
    const sortedNumbers = Object.entries(numberSendCounts)
      .sort((a, b) => b[1] - a[1]); // Sort by count descending
    sortedNumbers.forEach(([phoneNumber, count]) => {
      const percent = sentCount > 0 ? ((count / sentCount) * 100).toFixed(1) : 0;
      console.log(`[BulkSMS]   ${phoneNumber}: ${count} messages (${percent}%)`);
    });
    
    await SMSCampaign.updateStatus(campaignId, finalStatus, {
      sent_count: sentCount,
      failed_count: failedCount,
      error_summary: errors.length > 0 ? { errors: errors.slice(0, 10) } : null, // Store first 10 errors
    });
    
    console.log(`[BulkSMS] ✅ Campaign status updated in database`);
    
    return {
      sentCount,
      failedCount,
      optedOutCount,
    };
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[BulkSMS] ========== CRITICAL ERROR IN CAMPAIGN ${campaignId} ==========`);
    console.error(`[BulkSMS] Error message: ${error.message}`);
    console.error(`[BulkSMS] Error stack:`, error.stack);
    console.error(`[BulkSMS] Time before error: ${totalTime} seconds`);
    console.error(`[BulkSMS] Sent before error: ${sentCount || 0}`);
    console.error(`[BulkSMS] Failed before error: ${failedCount || 0}`);
    
    await SMSCampaign.updateStatus(campaignId, 'failed', {
      error_summary: { error: error.message },
    });
    
    console.error(`[BulkSMS] ❌ Campaign marked as failed in database`);
    throw error;
  }
}

/**
 * Recover stuck campaigns by checking actual recipient statuses
 * @param {string} campaignId - Campaign ID
 * @param {boolean} force - Force completion even if not all recipients processed
 * @returns {Promise<Object>} Recovery result with updated stats
 */
export async function recoverStuckCampaign(campaignId, force = false) {
  console.log(`[BulkSMS] ========== RECOVERING STUCK CAMPAIGN ${campaignId} ==========`);
  
  try {
    const campaign = await SMSCampaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    
    // Only recover campaigns that are stuck in processing
    if (campaign.status !== 'processing') {
      console.log(`[BulkSMS] Campaign ${campaignId} is not in 'processing' status (current: ${campaign.status}), skipping recovery`);
      return {
        recovered: false,
        reason: `Campaign is not stuck (status: ${campaign.status})`,
        campaign,
      };
    }
    
    // Get all recipients and count their actual statuses
    const recipients = await SMSCampaignRecipient.findByCampaignId(campaignId);
    console.log(`[BulkSMS] Found ${recipients.length} recipients for campaign ${campaignId}`);
    
    const statusCounts = {
      sent: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      cancelled: 0,
    };
    
    recipients.forEach(recipient => {
      const status = recipient.status || 'pending';
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      } else {
        statusCounts.pending++;
      }
    });
    
    const totalProcessed = statusCounts.sent + statusCounts.failed;
    const totalRecipients = recipients.length;
    const processedPercentage = totalRecipients > 0 ? (totalProcessed / totalRecipients) * 100 : 0;
    
    console.log(`[BulkSMS] Recipient status breakdown:`, statusCounts);
    console.log(`[BulkSMS] Total processed: ${totalProcessed} / ${totalRecipients} (${processedPercentage.toFixed(1)}%)`);
    console.log(`[BulkSMS] Campaign sent_count: ${campaign.sent_count}, failed_count: ${campaign.failed_count}`);
    console.log(`[BulkSMS] Actual sent_count: ${statusCounts.sent}, failed_count: ${statusCounts.failed}`);
    
    // Determine final status
    let finalStatus = 'processing';
    
    // Check if all recipients are processed
    if (totalProcessed === totalRecipients) {
      // All recipients have been processed
      if (statusCounts.failed === totalRecipients) {
        finalStatus = 'failed';
      } else if (statusCounts.sent > 0) {
        finalStatus = 'completed';
      } else {
        finalStatus = 'failed';
      }
    } 
    // If most recipients are processed (>95%), mark as complete
    else if (processedPercentage >= 95 && statusCounts.sent > 0) {
      console.log(`[BulkSMS] Campaign is ${processedPercentage.toFixed(1)}% complete - marking as completed`);
      finalStatus = 'completed';
    }
    // Force completion if requested
    else if (force && totalProcessed > 0) {
      console.log(`[BulkSMS] Force recovery requested - marking as completed`);
      finalStatus = statusCounts.sent > 0 ? 'completed' : 'failed';
    }
    // If campaign has been stuck for more than 2 minutes and has significant progress
    else {
      const now = new Date();
      const startedAt = campaign.started_at ? new Date(campaign.started_at) : new Date(campaign.created_at);
      const stuckDuration = (now - startedAt) / 1000 / 60; // minutes
      
      console.log(`[BulkSMS] Campaign has been running for ${stuckDuration.toFixed(1)} minutes`);
      
      // If stuck for more than 2 minutes and no new progress, mark as complete
      if (stuckDuration > 2 && totalProcessed > 0) {
        // Check if campaign counts match actual counts (meaning no new progress)
        const countsMatch = campaign.sent_count === statusCounts.sent && campaign.failed_count === statusCounts.failed;
        
        if (countsMatch) {
          console.log(`[BulkSMS] Campaign has been stuck for ${stuckDuration.toFixed(1)} minutes with no new progress`);
          // Mark as completed if we have some sent, failed otherwise
          finalStatus = statusCounts.sent > 0 ? 'completed' : 'failed';
        } else {
          console.log(`[BulkSMS] Campaign counts don't match - updating counts but keeping as processing`);
          // Update counts but don't change status yet
          await SMSCampaign.update(campaignId, {
            sent_count: statusCounts.sent,
            failed_count: statusCounts.failed,
          });
          return {
            recovered: false,
            reason: 'Campaign is still processing - counts updated',
            sentCount: statusCounts.sent,
            failedCount: statusCounts.failed,
            totalRecipients,
            campaign: await SMSCampaign.findById(campaignId),
          };
        }
      }
    }
    
    if (finalStatus !== 'processing') {
      console.log(`[BulkSMS] Updating campaign status from 'processing' to '${finalStatus}'`);
      await SMSCampaign.updateStatus(campaignId, finalStatus, {
        sent_count: statusCounts.sent,
        failed_count: statusCounts.failed,
      });
      
      console.log(`[BulkSMS] ✅ Campaign recovered: ${finalStatus} (${statusCounts.sent} sent, ${statusCounts.failed} failed)`);
      
      return {
        recovered: true,
        previousStatus: 'processing',
        newStatus: finalStatus,
        sentCount: statusCounts.sent,
        failedCount: statusCounts.failed,
        totalRecipients,
        campaign: await SMSCampaign.findById(campaignId),
      };
    } else {
      console.log(`[BulkSMS] Campaign is still processing (${totalProcessed}/${totalRecipients} completed)`);
      return {
        recovered: false,
        reason: 'Campaign is still actively processing',
        sentCount: statusCounts.sent,
        failedCount: statusCounts.failed,
        totalRecipients,
        campaign,
      };
    }
  } catch (error) {
    console.error(`[BulkSMS] Error recovering campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Get diagnostic information about why a campaign might be stuck
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Diagnostic information
 */
export async function diagnoseStuckCampaign(campaignId) {
  console.log(`[BulkSMS] ========== DIAGNOSING STUCK CAMPAIGN ${campaignId} ==========`);
  
  try {
    const campaign = await SMSCampaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    
    const recipients = await SMSCampaignRecipient.findByCampaignId(campaignId);
    const statusCounts = {
      sent: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      cancelled: 0,
    };
    
    recipients.forEach(recipient => {
      const status = recipient.status || 'pending';
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      } else {
        statusCounts.pending++;
      }
    });
    
    const pendingRecipients = recipients.filter(r => (r.status || 'pending') === 'pending');
    const queuedRecipients = recipients.filter(r => r.status === 'queued');
    
    // Check if campaign has been running for a while
    const now = new Date();
    const startedAt = campaign.started_at ? new Date(campaign.started_at) : new Date(campaign.created_at);
    const runningDuration = (now - startedAt) / 1000 / 60; // minutes
    
    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        total_recipients: campaign.total_recipients,
        sent_count: campaign.sent_count,
        failed_count: campaign.failed_count,
        created_at: campaign.created_at,
        started_at: campaign.started_at,
        running_duration_minutes: runningDuration.toFixed(1),
      },
      recipientStatuses: statusCounts,
      actualCounts: {
        sent: statusCounts.sent,
        failed: statusCounts.failed,
        pending: statusCounts.pending,
        queued: statusCounts.queued,
        total: recipients.length,
      },
      discrepancies: {
        sentCountMismatch: campaign.sent_count !== statusCounts.sent,
        failedCountMismatch: campaign.failed_count !== statusCounts.failed,
        sentCountDiff: statusCounts.sent - campaign.sent_count,
        failedCountDiff: statusCounts.failed - campaign.failed_count,
      },
      pendingRecipientsCount: pendingRecipients.length,
      queuedRecipientsCount: queuedRecipients.length,
      samplePendingRecipients: pendingRecipients.slice(0, 5).map(r => ({
        id: r.id,
        phone_number: r.phone_number,
        status: r.status,
        created_at: r.created_at,
      })),
    };
  } catch (error) {
    console.error(`[BulkSMS] Error diagnosing campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Resume sending to pending recipients in a stuck campaign
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Resume result
 */
export async function resumeStuckCampaign(campaignId) {
  console.log(`[BulkSMS] ========== RESUMING STUCK CAMPAIGN ${campaignId} ==========`);
  
  try {
    const campaign = await SMSCampaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    
    // Get business
    const business = await Business.findById(campaign.business_id);
    if (!business) {
      throw new Error('Business not found');
    }
    
    // Get all pending recipients
    const allRecipients = await SMSCampaignRecipient.findByCampaignId(campaignId);
    const pendingRecipients = allRecipients.filter(r => (r.status || 'pending') === 'pending');
    
    console.log(`[BulkSMS] Found ${pendingRecipients.length} pending recipients to process`);
    
    if (pendingRecipients.length === 0) {
      return {
        resumed: false,
        reason: 'No pending recipients found',
        message: 'All recipients have been processed',
      };
    }
    
    // Get available numbers
    const availableNumbers = await getAvailableSMSNumbers(campaign.business_id);
    if (availableNumbers.length === 0) {
      throw new Error('No SMS-capable numbers available for this business');
    }
    
    // Update campaign status to processing if it's not already
    if (campaign.status !== 'processing') {
      await SMSCampaign.updateStatus(campaignId, 'processing');
    }
    
    // Load balance pending recipients
    const assignments = loadBalanceMessages(
      pendingRecipients.map(r => r.phone_number),
      availableNumbers
    );
    
    // Track progress
    let sentCount = 0;
    let failedCount = 0;
    const numberLastSend = {};
    const numberSendCounts = {};
    
    availableNumbers.forEach(num => {
      numberLastSend[num.phone_number] = 0;
      numberSendCounts[num.phone_number] = 0;
    });
    
    const recipientMap = new Map(pendingRecipients.map(r => [r.phone_number, r]));
    const startTime = Date.now();
    
    console.log(`[BulkSMS] Resuming: Processing ${assignments.length} pending messages`);
    
    // Process pending recipients
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      const { phoneNumber, fromNumber, numberInfo } = assignment;
      
      // Log progress every 10 messages
      if (i % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[BulkSMS] Resume progress: ${i + 1}/${assignments.length} | Sent: ${sentCount} | Failed: ${failedCount} | Elapsed: ${elapsed}s`);
      }
      
      // Rate limiting
      const now = Date.now();
      const lastSend = numberLastSend[fromNumber] || 0;
      const rateLimit = numberInfo.rateLimit;
      const minInterval = (60 * 1000) / rateLimit;
      
      if (lastSend > 0) {
        const timeSinceLastSend = now - lastSend;
        if (timeSinceLastSend < minInterval) {
          const waitTime = minInterval - timeSinceLastSend;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      // Send SMS
      try {
        const recipient = recipientMap.get(phoneNumber);
        if (!recipient) {
          console.warn(`[BulkSMS] No recipient record found for ${phoneNumber}`);
          continue;
        }
        
        // Prepare message
        const compliantMessage = addBusinessIdentification(campaign.message_text, business.name);
        
        // Send SMS
        const response = await sendSMSDirect(fromNumber, phoneNumber, compliantMessage, business.name);
        
        // Update recipient status
        // Note: response is now the full axios response, so we need response.data
        await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
          telnyx_message_id: response.data?.data?.id || response.data?.id || null,
        });
        
        sentCount++;
        numberSendCounts[fromNumber]++;
        numberLastSend[fromNumber] = Date.now();
        
        // Update campaign progress every 10 messages
        if (sentCount % 10 === 0) {
          await SMSCampaign.update(campaignId, {
            sent_count: (campaign.sent_count || 0) + sentCount,
            failed_count: (campaign.failed_count || 0) + failedCount,
          });
        }
      } catch (error) {
        console.error(`[BulkSMS] Failed to send to ${phoneNumber}:`, error.message);
        
        const recipient = recipientMap.get(phoneNumber);
        if (recipient) {
          let errorMessage = 'Unknown error';
          if (error.response?.data?.errors?.[0]) {
            const firstError = error.response.data.errors[0];
            errorMessage = firstError.title && firstError.detail
              ? `${firstError.title}: ${firstError.detail}`
              : firstError.detail || firstError.title || errorMessage;
            if (firstError.code) {
              errorMessage = `[${firstError.code}] ${errorMessage}`;
            }
          } else if (error.response?.data?.message) {
            errorMessage = error.response.data.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
            error_message: errorMessage,
          });
        }
        
        failedCount++;
        
        // Update campaign progress
        await SMSCampaign.update(campaignId, {
          sent_count: (campaign.sent_count || 0) + sentCount,
          failed_count: (campaign.failed_count || 0) + failedCount,
        });
      }
    }
    
    // Final update
    const finalSentCount = (campaign.sent_count || 0) + sentCount;
    const finalFailedCount = (campaign.failed_count || 0) + failedCount;
    const totalRecipients = allRecipients.length;
    const totalProcessed = finalSentCount + finalFailedCount;
    
    // Determine final status
    let finalStatus = 'processing';
    if (totalProcessed >= totalRecipients) {
      finalStatus = finalSentCount > 0 ? 'completed' : 'failed';
    }
    
    await SMSCampaign.updateStatus(campaignId, finalStatus, {
      sent_count: finalSentCount,
      failed_count: finalFailedCount,
    });
    
    console.log(`[BulkSMS] ✅ Resume complete: ${sentCount} sent, ${failedCount} failed. Total: ${finalSentCount} sent, ${finalFailedCount} failed`);
    
    return {
      resumed: true,
      sentCount,
      failedCount,
      totalSent: finalSentCount,
      totalFailed: finalFailedCount,
      finalStatus,
      campaign: await SMSCampaign.findById(campaignId),
    };
  } catch (error) {
    console.error(`[BulkSMS] Error resuming campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Get campaign status
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Campaign status with stats
 */
export async function getCampaignStatus(campaignId) {
  const campaign = await SMSCampaign.findById(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  
  const stats = await SMSCampaignRecipient.getCampaignStats(campaignId);
  
  return {
    ...campaign,
    stats,
    progress: campaign.total_recipients > 0 
      ? Math.round((stats.sent / campaign.total_recipients) * 100) 
      : 0,
  };
}

/**
 * Cancel a campaign
 * @param {string} campaignId - Campaign ID
 */
export async function cancelCampaign(campaignId) {
  console.log(`[BulkSMS] Cancel campaign called for: ${campaignId}`);
  
  const campaign = await SMSCampaign.findById(campaignId);
  if (!campaign) {
    console.error(`[BulkSMS] Campaign ${campaignId} not found`);
    throw new Error('Campaign not found');
  }
  
  console.log(`[BulkSMS] Campaign status: ${campaign.status}`);
  
  // Allow cancelling pending, processing, or paused campaigns
  // But provide a warning for completed/failed campaigns
  if (campaign.status === 'completed' || campaign.status === 'failed' || campaign.status === 'cancelled') {
    console.warn(`[BulkSMS] Attempting to cancel campaign with status: ${campaign.status}`);
    // Still allow it - just update the status
  }
  
  try {
    await SMSCampaign.updateStatus(campaignId, 'cancelled');
    console.log(`[BulkSMS] ✅ Campaign ${campaignId} cancelled successfully`);
    return { success: true };
  } catch (error) {
    console.error(`[BulkSMS] ❌ Error updating campaign status:`, error);
    console.error(`[BulkSMS] Error message:`, error.message);
    console.error(`[BulkSMS] Error code:`, error.code);
    console.error(`[BulkSMS] Error details:`, error.details);
    throw error;
  }
}

