// frontend/lib/phoneFormatter.js
// Phone number formatting for frontend

import { parsePhoneNumber, isValidPhoneNumber, AsYouType } from 'libphonenumber-js';

/**
 * Format phone number as user types (US format by default)
 */
export function formatPhoneInput(value, country = 'US') {
  if (!value) return '';
  
  try {
    const formatter = new AsYouType(country);
    return formatter.input(value);
  } catch (error) {
    return value;
  }
}

/**
 * Convert phone number to E.164 format
 */
export function toE164(phoneNumber, country = 'US') {
  if (!phoneNumber) return null;
  
  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    if (parsed.isValid()) {
      return parsed.number; // Returns E.164 format like +15551234567
    }
  } catch (error) {
    // If parsing fails, try adding country code if missing
    if (!phoneNumber.startsWith('+')) {
      if (country === 'US' || country === 'CA') {
        // Try adding +1
        try {
          const withCountry = `+1${phoneNumber.replace(/\D/g, '')}`;
          const parsed = parsePhoneNumber(withCountry);
          if (parsed.isValid()) {
            return parsed.number;
          }
        } catch (e) {
          // Ignore
        }
      }
    }
  }
  
  return null;
}

/**
 * Validate phone number
 */
export function validatePhone(phoneNumber, country = 'US') {
  if (!phoneNumber) return false;
  return isValidPhoneNumber(phoneNumber, country);
}

/**
 * Get phone number validation error message
 */
export function getPhoneValidationError(phoneNumber, country = 'US') {
  if (!phoneNumber) {
    return 'Phone number is required';
  }
  
  if (!validatePhone(phoneNumber, country)) {
    return 'Please enter a valid phone number with country code (e.g., +1 555-123-4567)';
  }
  
  const e164 = toE164(phoneNumber, country);
  if (!e164) {
    return 'Phone number must include country code (e.g., +1 for US/Canada)';
  }
  
  return null;
}

/**
 * Extract area code from a phone number
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string|null} Area code (3 digits for US/Canada) or null if not found
 */
export function extractAreaCode(phoneNumber) {
  if (!phoneNumber) return null;
  
  try {
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

