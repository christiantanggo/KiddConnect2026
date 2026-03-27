// utils/phoneFormatter.js
// Phone number formatting and validation using libphonenumber-js

import { parsePhoneNumber, isValidPhoneNumber, formatIncompletePhoneNumber } from "libphonenumber-js";

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phoneNumber, country = "US") {
  if (!phoneNumber) return null;

  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    return parsed.formatNational();
  } catch (error) {
    // If parsing fails, return as-is
    return phoneNumber;
  }
}

/**
 * Format phone number for E.164 (international format)
 */
export function formatPhoneNumberE164(phoneNumber, country = "US") {
  if (!phoneNumber) return null;

  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    return parsed.number;
  } catch (error) {
    return phoneNumber;
  }
}

/**
 * Validate phone number
 */
export function validatePhoneNumber(phoneNumber, country = "US") {
  if (!phoneNumber) return false;
  return isValidPhoneNumber(phoneNumber, country);
}

/**
 * Format incomplete phone number as user types
 */
export function formatIncomplete(phoneNumber, country = "US") {
  if (!phoneNumber) return "";
  return formatIncompletePhoneNumber(phoneNumber, country);
}

/**
 * Extract area code from a phone number
 * @param {string} phoneNumber - Phone number in E.164 format or any format
 * @returns {string|null} Area code (3 digits for US/Canada) or null if not found
 */
export function extractAreaCode(phoneNumber) {
  try {
    if (!phoneNumber) return null;
    
    // Parse the phone number
    const parsed = parsePhoneNumber(phoneNumber);
    if (!parsed) return null;
    
    // For US/Canada, get the area code (national destination code)
    const countryCode = parsed.country;
    if (countryCode === 'US' || countryCode === 'CA') {
      // Get the national number and extract first 3 digits
      const nationalNumber = parsed.nationalNumber;
      if (nationalNumber && nationalNumber.length >= 10) {
        // US/Canada format: (area code)(exchange)(number)
        // Extract first 3 digits as area code
        return nationalNumber.substring(0, 3);
      }
    }
    
    return null;
  } catch (error) {
    // If parsing fails, try regex extraction
    const cleaned = phoneNumber.replace(/\D/g, '');
    // For US/Canada numbers, area code is digits 1-3 (after country code 1)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return cleaned.substring(1, 4);
    } else if (cleaned.length === 10) {
      return cleaned.substring(0, 3);
    }
    return null;
  }
}

/**
 * Canadian area codes
 */
const CANADIAN_AREA_CODES = [
  '204', '226', '236', '249', '250', '289', '306', '343', '365', '403',
  '416', '418', '431', '437', '438', '450', '506', '514', '519', '548',
  '579', '581', '587', '604', '613', '639', '647', '672', '705', '709',
  '742', '778', '780', '782', '807', '819', '825', '867', '873', '902', '905', '942'
];

/**
 * Toll-free prefixes (US and Canada)
 */
const TOLL_FREE_PREFIXES = ['800', '833', '844', '855', '866', '877', '888'];

/**
 * Check if a phone number is Canadian
 * @param {string} phoneNumber - Phone number in any format
 * @returns {boolean} True if Canadian number
 */
export function isCanadianNumber(phoneNumber) {
  try {
    if (!phoneNumber) return false;
    
    const parsed = parsePhoneNumber(phoneNumber);
    if (!parsed) return false;
    
    return parsed.country === 'CA';
  } catch (error) {
    // Fallback: check area code
    const areaCode = extractAreaCode(phoneNumber);
    return areaCode ? CANADIAN_AREA_CODES.includes(areaCode) : false;
  }
}

/**
 * Check if a phone number is US
 * @param {string} phoneNumber - Phone number in any format
 * @returns {boolean} True if US number
 */
export function isUSNumber(phoneNumber) {
  try {
    if (!phoneNumber) return false;
    
    const parsed = parsePhoneNumber(phoneNumber);
    if (!parsed) return false;
    
    return parsed.country === 'US';
  } catch (error) {
    // Fallback: if not Canadian and has +1, assume US
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const areaCode = cleaned.substring(1, 4);
      return !CANADIAN_AREA_CODES.includes(areaCode) && !TOLL_FREE_PREFIXES.includes(areaCode);
    }
    return false;
  }
}

/**
 * Check if a phone number is toll-free
 * @param {string} phoneNumber - Phone number in any format
 * @returns {boolean} True if toll-free number
 */
export function isTollFree(phoneNumber) {
  try {
    if (!phoneNumber) return false;
    
    const parsed = parsePhoneNumber(phoneNumber);
    if (!parsed) return false;
    
    // Get area code or prefix
    const areaCode = extractAreaCode(phoneNumber);
    return areaCode ? TOLL_FREE_PREFIXES.includes(areaCode) : false;
  } catch (error) {
    // Fallback: check cleaned number
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const prefix = cleaned.substring(1, 4);
      return TOLL_FREE_PREFIXES.includes(prefix);
    } else if (cleaned.length === 10) {
      const prefix = cleaned.substring(0, 3);
      return TOLL_FREE_PREFIXES.includes(prefix);
    }
    return false;
  }
}

/**
 * Get country code for a phone number
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string|null} 'CA', 'US', or null
 */
export function getNumberCountry(phoneNumber) {
  if (isCanadianNumber(phoneNumber)) return 'CA';
  if (isUSNumber(phoneNumber)) return 'US';
  return null;
}

/**
 * Validate and format phone numbers for bulk SMS
 * Removes duplicates and invalid numbers
 * @param {string[]} phoneNumbers - Array of phone numbers
 * @returns {Object} { valid: string[], invalid: string[], duplicates: string[] }
 */
export function validatePhoneNumbersForBulk(phoneNumbers) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  const duplicates = [];
  
  for (const phone of phoneNumbers) {
    if (!phone || typeof phone !== 'string') {
      invalid.push(phone);
      continue;
    }
    
    // Format to E.164
    const formatted = formatPhoneNumberE164(phone);
    if (!formatted) {
      invalid.push(phone);
      continue;
    }
    
    // Check if valid
    if (!isValidPhoneNumber(formatted)) {
      invalid.push(phone);
      continue;
    }
    
    // Check for duplicates
    if (seen.has(formatted)) {
      duplicates.push(phone);
      continue;
    }
    
    seen.add(formatted);
    valid.push(formatted);
  }
  
  return { valid, invalid, duplicates };
}


