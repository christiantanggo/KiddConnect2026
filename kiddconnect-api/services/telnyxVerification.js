// services/telnyxVerification.js
// Automatic toll-free number verification for Telnyx

import axios from 'axios';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = 'https://api.telnyx.com/v2';

/**
 * Check if a phone number is toll-free
 * @param {string} phoneNumber - Phone number in E.164 format
 * @returns {boolean} True if toll-free
 */
function isTollFree(phoneNumber) {
  // Toll-free numbers in US/Canada start with: 800, 833, 844, 855, 866, 877, 888
  const tollFreePrefixes = ['800', '833', '844', '855', '866', '877', '888'];
  const digits = phoneNumber.replace(/\D/g, '');
  const areaCode = digits.slice(-10, -7); // Last 10 digits, first 3 are area code
  return tollFreePrefixes.includes(areaCode);
}

/**
 * Get verification status of a phone number from Telnyx
 * @param {string} phoneNumber - Phone number in E.164 format
 * @returns {Promise<Object>} Verification status object
 */
export async function getVerificationStatus(phoneNumber) {
  if (!TELNYX_API_KEY) {
    throw new Error('TELNYX_API_KEY not configured');
  }

  try {
    // Normalize phone number
    let normalized = phoneNumber.replace(/[^0-9+]/g, '').trim();
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    // Get phone number details from Telnyx
    const response = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'filter[phone_number]': normalized,
      },
    });

    const numbers = response.data?.data || [];
    if (numbers.length === 0) {
      return {
        verified: false,
        can_verify: false,
        reason: 'Number not found in Telnyx account',
      };
    }

    const numberData = numbers[0];
    
    // Check if it's toll-free
    const tollFree = isTollFree(normalized);
    
    // For toll-free numbers, check verification status
    if (tollFree) {
      // Telnyx stores verification status in the phone number object
      // Check for verification-related fields
      const verified = numberData.verification_status === 'verified' || 
                      numberData.verified === true ||
                      numberData.toll_free_verification_status === 'verified';
      
      return {
        verified: verified,
        can_verify: !verified, // Can verify if not already verified
        is_toll_free: true,
        verification_status: numberData.verification_status || numberData.toll_free_verification_status || 'unverified',
        phone_number: normalized,
      };
    }

    // For local numbers, check 10DLC registration status
    return {
      verified: true, // Local numbers don't need toll-free verification
      can_verify: false,
      is_toll_free: false,
      is_10dlc_registered: numberData.registration_status === 'registered' || false,
      phone_number: normalized,
    };
  } catch (error) {
    console.error('[Telnyx Verification] Error getting verification status:', error.message);
    throw error;
  }
}

/**
 * Submit toll-free verification request to Telnyx
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {Object} businessInfo - Business information for verification
 * @returns {Promise<Object>} Verification request result
 */
export async function submitTollFreeVerification(phoneNumber, businessInfo) {
  if (!TELNYX_API_KEY) {
    throw new Error('TELNYX_API_KEY not configured');
  }

  try {
    // Normalize phone number
    let normalized = phoneNumber.replace(/[^0-9+]/g, '').trim();
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    // Check if it's toll-free
    if (!isTollFree(normalized)) {
      return {
        success: false,
        message: 'Number is not toll-free. Verification only required for toll-free numbers.',
      };
    }

    // Check current verification status
    const status = await getVerificationStatus(normalized);
    if (status.verified) {
      return {
        success: true,
        message: 'Number is already verified',
        verified: true,
      };
    }

    // Get phone number ID from Telnyx
    const numberResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'filter[phone_number]': normalized,
      },
    });

    const numbers = numberResponse.data?.data || [];
    if (numbers.length === 0) {
      throw new Error('Phone number not found in Telnyx account');
    }

    const phoneNumberId = numbers[0].id;

    // Try multiple possible Telnyx Toll-Free Verification API endpoints
    // Based on test results, the API endpoint may not be available
    // We'll try the official endpoint first, then fall back gracefully
    const endpointsToTry = [
      { path: '/toll_free_verifications', name: 'Official endpoint' },
      { path: `/phone_numbers/${phoneNumberId}/toll_free_verification`, name: 'Phone number endpoint' },
      { path: `/phone_numbers/${phoneNumberId}/verification`, name: 'Verification endpoint' },
    ];

    for (const endpoint of endpointsToTry) {
      try {
        const verifyResponse = await axios.post(
          `${TELNYX_API_BASE_URL}${endpoint.path}`,
          {
            phone_number: normalized,
            use_case: businessInfo.use_case || 'Marketing and promotional messages',
            business_name: businessInfo.name || 'Business',
            website: businessInfo.website || '',
            // Optional but recommended fields (will be mandatory after Jan 1, 2026)
            business_registration_number: businessInfo.business_registration_number || '',
            business_registration_type: businessInfo.business_registration_type || '',
            business_registration_country: businessInfo.business_registration_country || 'US',
          },
          {
            headers: {
              Authorization: `Bearer ${TELNYX_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(`[Telnyx Verification] ✅ Verification request submitted successfully via ${endpoint.name}`);
        return {
          success: true,
          message: 'Verification request submitted',
          verification_id: verifyResponse.data?.data?.id,
          status: verifyResponse.data?.data?.status || 'pending',
          api_available: true,
          endpoint_used: endpoint.path,
        };
      } catch (apiError) {
        // If 404 or 501, try next endpoint
        if (apiError.response?.status === 404 || apiError.response?.status === 501) {
          console.log(`[Telnyx Verification] ${endpoint.name} not available (${apiError.response?.status}), trying next...`);
          continue; // Try next endpoint
        }
        
        // If it's a validation error (400/422), the endpoint exists but needs correct data
        if (apiError.response?.status === 400 || apiError.response?.status === 422) {
          console.warn(`[Telnyx Verification] ${endpoint.name} exists but validation failed:`, apiError.response.data);
          return {
            success: false,
            message: 'Verification API available but validation failed. Check required fields.',
            api_available: true,
            endpoint_used: endpoint.path,
            validation_error: apiError.response.data,
            error_details: apiError.response.data?.errors || [],
          };
        }
        
        // If 409 (conflict), number may already be verified
        if (apiError.response?.status === 409) {
          console.log(`[Telnyx Verification] ${endpoint.name} - Number may already be verified or verification in progress`);
          return {
            success: true,
            message: 'Verification may already exist or be in progress',
            api_available: true,
            endpoint_used: endpoint.path,
            conflict: true,
          };
        }
        
        // Other errors - try next endpoint
        console.log(`[Telnyx Verification] ${endpoint.name} error: ${apiError.response?.status}, trying next...`);
        continue;
      }
    }

    // If all endpoints failed with 404/501, API is not available
    console.warn('[Telnyx Verification] ❌ No automatic verification API endpoints available. Manual verification required.');
    return {
      success: false,
      message: 'Automatic verification not available via API. Please verify manually in Telnyx portal.',
      manual_verification_required: true,
      api_available: false,
      portal_url: 'https://portal.telnyx.com/#/app/numbers',
    };
  } catch (error) {
    console.error('[Telnyx Verification] Error submitting verification:', error.message);
    throw error;
  }
}

/**
 * Automatically verify a toll-free number after purchase
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {Object} businessInfo - Business information
 * @returns {Promise<Object>} Verification result
 */
export async function autoVerifyAfterPurchase(phoneNumber, businessInfo) {
  try {
    console.log(`[Telnyx Verification] Checking verification status for ${phoneNumber}...`);
    
    const status = await getVerificationStatus(phoneNumber);
    
    if (status.verified) {
      console.log(`[Telnyx Verification] ✅ Number ${phoneNumber} is already verified`);
      return {
        verified: true,
        already_verified: true,
        status: status,
      };
    }

    if (!status.is_toll_free) {
      console.log(`[Telnyx Verification] ℹ️  Number ${phoneNumber} is not toll-free - verification not required`);
      return {
        verified: true, // Local numbers don't need toll-free verification
        is_toll_free: false,
        status: status,
      };
    }

    if (!status.can_verify) {
      console.log(`[Telnyx Verification] ⚠️  Number ${phoneNumber} cannot be verified automatically`);
      return {
        verified: false,
        can_verify: false,
        status: status,
      };
    }

    // Attempt automatic verification
    console.log(`[Telnyx Verification] Submitting verification request for ${phoneNumber}...`);
    const result = await submitTollFreeVerification(phoneNumber, businessInfo);
    
    if (result.success) {
      console.log(`[Telnyx Verification] ✅ Verification request submitted for ${phoneNumber}`);
    } else {
      console.log(`[Telnyx Verification] ⚠️  ${result.message}`);
    }

    return {
      verified: result.verified || false,
      verification_submitted: result.success || false,
      manual_verification_required: result.manual_verification_required || false,
      result: result,
      status: status,
    };
  } catch (error) {
    console.error(`[Telnyx Verification] ❌ Error in auto-verify:`, error.message);
    // Don't throw - verification failure shouldn't block number purchase
    return {
      verified: false,
      error: error.message,
    };
  }
}

