// services/vapi.js
// VAPI API client for creating assistants, provisioning numbers, and managing calls

import axios from "axios";
import { supabaseClient } from "../config/database.js";

// Lazy client creation to ensure env vars are loaded
let vapiClient = null;

export function getVapiClient() {
  if (!vapiClient) {
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

    if (!VAPI_API_KEY) {
      console.warn("⚠️  VAPI_API_KEY not set. VAPI functions will not work.");
      // Still create client but it will fail on API calls - better to fail fast
    }

    vapiClient = axios.create({
      baseURL: VAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY || ''}`,
        "Content-Type": "application/json",
      },
    });
    
    // Add response interceptor to log errors
    vapiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error("[VAPI] ❌ Authentication failed - check VAPI_API_KEY");
        }
        return Promise.reject(error);
      }
    );
  }
  return vapiClient;
}

/**
 * Create a VAPI assistant for a business
 * @param {Object} businessData - Business information
 * @param {string} businessData.name - Business name
 * @param {string} businessData.public_phone_number - Business's public phone number
 * @param {string} businessData.timezone - Business timezone
 * @param {Object} businessData.business_hours - Business hours JSON
 * @param {Array} businessData.faqs - FAQs array (limited by tier)
 * @param {string} businessData.contact_email - Contact email
 * @param {string} businessData.address - Business address
 * @param {boolean} businessData.allow_call_transfer - Whether to allow call transfers
 * @returns {Promise<Object>} VAPI assistant object
 */
export async function createAssistant(businessData) {
  try {
    const { generateAssistantPrompt } = await import("../templates/vapi-assistant-template.js");
    
    const systemPrompt = await generateAssistantPrompt(businessData);
    
    // Get custom greetings, personality, and voice from agent data
    const openingGreeting = businessData.opening_greeting || `Hello! Thanks for calling ${businessData.name}. How can I help you today?`;
    const endingGreeting = businessData.ending_greeting || null; // Optional ending greeting
    const personality = businessData.personality || 'professional';
    // Use voice settings from businessData, default to OpenAI/alloy
    const voiceSettings = businessData.voice_settings || {};
    const voiceProvider = voiceSettings.provider || businessData.voice_provider || 'openai';
    const voiceId = voiceSettings.voice_id || businessData.voice_id || 'alloy'; // Default professional voice (OpenAI)
    
    // Adjust temperature based on personality
    let temperature = 0.7;
    if (personality === 'friendly') {
      temperature = 0.8;
    } else if (personality === 'professional') {
      temperature = 0.6;
    } else if (personality === 'casual') {
      temperature = 0.9;
    }
    
    // VAPI has a 40 character limit on assistant names
    // For demos, use just the business name (truncate to 40 chars)
    // For regular assistants, use " - Tavari" suffix (9 chars), so business name can be up to 31 chars
    const suffix = businessData.isDemo ? '' : ' - Tavari';
    const maxBusinessNameLength = businessData.isDemo ? 40 : 31;
    const truncatedBusinessName = businessData.name.length > maxBusinessNameLength 
      ? businessData.name.substring(0, maxBusinessNameLength).trim() 
      : businessData.name;
    
    const assistantConfig = {
      name: businessData.isDemo ? truncatedBusinessName : `${truncatedBusinessName}${suffix}`,
      model: {
        provider: "openai",
        model: "gpt-4o-mini", // Using mini for lower cost (~80% cheaper than gpt-4o)
        temperature: temperature,
        maxTokens: 150,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
      },
      voice: {
        provider: voiceProvider,
        voiceId: voiceId,
      },
      firstMessage: openingGreeting,
      serverUrl: (() => {
        let backendUrl = process.env.BACKEND_URL || 
                          process.env.RAILWAY_PUBLIC_DOMAIN || 
                          process.env.VERCEL_URL || 
                          process.env.SERVER_URL ||
                          "https://api.tavarios.com";
        
        // Ensure URL has https:// protocol
        if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
          backendUrl = `https://${backendUrl}`;
        }
        
        const webhookUrl = `${backendUrl}/api/vapi/webhook`;
        console.log(`[VAPI] Setting webhook URL: ${webhookUrl}`);
        return webhookUrl;
      })(),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // CRITICAL: serverMessages tells VAPI which events to send to the webhook
      // Without this, VAPI won't send any webhooks even if serverUrl is set
      serverMessages: [
        "status-update",      // Call status changes (call-start, call-end, etc.)
        "end-of-call-report", // Final call summary with transcript, duration, etc.
        "function-call",      // Function calls during the call
        "hang",               // Call hangup events
      ],
      // CRITICAL: Add businessId to metadata so webhook can find the business
      // For demo assistants, include demo metadata
      metadata: businessData.businessId ? {
        businessId: businessData.businessId,
      } : businessData.isDemo ? {
        isDemo: true,
        demoEmail: businessData.contact_email,
        demoBusinessName: businessData.name,
      } : undefined,
      // Transcriber settings - reduce sensitivity to background noise
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      // Enable background denoising to filter out ambient noise
      backgroundDenoisingEnabled: true,
      // Allow users to interrupt AI speech - users can cut off the AI mid-response
      interruptionsEnabled: true, // Enable interruptions - users can interrupt AI responses
      firstMessageInterruptionsEnabled: false, // Keep first message protected - users cannot interrupt initial greeting
      // Start speaking plan - wait a bit before speaking to avoid interrupting caller
      startSpeakingPlan: {
        waitSeconds: 0.8,
        smartEndpointingEnabled: false, // Disable to prevent premature responses
      },
    };
    
    // Add ending message if provided
    if (endingGreeting) {
      assistantConfig.endCallFunctionEnabled = true;
      // Note: VAPI may handle ending messages differently - check their API docs
    }

    console.log("[VAPI] Creating assistant with config:", {
      name: assistantConfig.name,
      personality,
      voiceProvider,
      voiceId,
      hasOpeningGreeting: !!openingGreeting,
      hasEndingGreeting: !!endingGreeting,
    });

    const response = await getVapiClient().post("/assistant", assistantConfig);
    return response.data;
  } catch (error) {
    console.error("Error creating VAPI assistant:", error.response?.data || error.message);
    throw new Error(`Failed to create VAPI assistant: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Provision a phone number via VAPI
 * @returns {Promise<Object>} Phone number object
 */
/**
 * Get Telnyx credentials from VAPI
 * @returns {Promise<Array>} List of Telnyx credentials
 */
export async function getTelnyxCredentials() {
  try {
    // Try different possible endpoints
    let response;
    try {
      // Try /credential endpoint
      response = await getVapiClient().get("/credential");
    } catch (error) {
      // If that fails, try /credentials (plural)
      if (error.response?.status === 404) {
        response = await getVapiClient().get("/credentials");
      } else {
        throw error;
      }
    }
    
    const allCredentials = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    // Filter for Telnyx credentials
    const telnyxCreds = allCredentials.filter(cred => cred.provider === "telnyx");
    console.log(`[VAPI] Found ${telnyxCreds.length} Telnyx credential(s) out of ${allCredentials.length} total`);
    return telnyxCreds;
  } catch (error) {
    console.error("Error getting Telnyx credentials:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    // If credentials endpoint doesn't exist or fails, return empty array
    // Phone provisioning might work without explicitly setting credentialId
    return [];
  }
}

/**
 * Search for available phone numbers via Telnyx
 * @param {string} countryCode - Country code (default: 'US')
 * @param {string} phoneType - Phone type: 'local', 'toll-free', 'mobile' (default: 'local')
 * @param {number} limit - Number of results (default: 5)
 * @param {string} areaCode - Optional area code to match (e.g., '415', '212')
 * @returns {Promise<Array>} Array of available phone numbers
 */
export async function searchAvailablePhoneNumbers(countryCode = 'US', phoneType = 'local', limit = 5, areaCode = null) {
  try {
    // Check if we have Telnyx API key for direct search
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      console.warn("[VAPI] TELNYX_API_KEY not set - cannot search for numbers directly");
      return [];
    }

    const axios = (await import("axios")).default;
    const params = new URLSearchParams({
      'filter[country_code]': countryCode,
      'filter[phone_number_type]': phoneType,
      'page[size]': limit.toString(),
    });

    // Add area code filter if provided (Telnyx uses national_destination_code)
    if (areaCode) {
      const cleanAreaCode = areaCode.replace(/\D/g, ''); // Remove non-digits
      if (cleanAreaCode.length === 3) {
        params.append('filter[national_destination_code]', cleanAreaCode);
        console.log(`[VAPI] Searching for numbers with area code: ${cleanAreaCode}`);
      }
    }

    const response = await axios.get(`https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const numbers = response.data?.data || [];
    console.log(`[VAPI] Found ${numbers.length} available ${phoneType} numbers for ${countryCode}${areaCode ? ` (area code: ${areaCode})` : ''}`);
    return numbers.map(num => ({
      phone_number: num.phone_number,
      phone_price: num.cost_information?.upfront_cost || 0,
      region_information: num.region_information,
    }));
  } catch (error) {
    console.error("[VAPI] Error searching for phone numbers:", error.response?.data || error.message);
    return [];
  }
}

/**
 * Get all phone numbers from VAPI
 * @returns {Promise<Array>} Array of all VAPI phone number objects
 */
export async function getAllVapiPhoneNumbers() {
  try {
    const response = await getVapiClient().get('/phone-number');
    const allVapiNumbers = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    console.log(`[VAPI] Found ${allVapiNumbers.length} phone numbers in VAPI`);
    return allVapiNumbers;
  } catch (error) {
    console.error('[VAPI] Error getting VAPI phone numbers:', error.message);
    return [];
  }
}

/**
 * Check if a phone number is already provisioned in VAPI
 * @param {string} phoneNumber - Phone number in E.164 format
 * @returns {Promise<Object|null>} VAPI phone number object if found, null otherwise
 */
export async function checkIfNumberProvisionedInVAPI(phoneNumber) {
  try {
    // Normalize phone number
    let normalized = phoneNumber.replace(/[^0-9+]/g, '');
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    
    // Get all phone numbers from VAPI
    const response = await getVapiClient().get('/phone-number');
    const allVapiNumbers = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    // Find matching number
    const matching = allVapiNumbers.find(vapiNum => {
      const vapiPhone = vapiNum.phoneNumber || vapiNum.phone_number || vapiNum.number;
      if (!vapiPhone) return false;
      
      let vapiNormalized = vapiPhone.replace(/[^0-9+]/g, '');
      if (!vapiNormalized.startsWith('+')) {
        vapiNormalized = '+' + vapiNormalized;
      }
      
      return vapiNormalized === normalized;
    });
    
    if (matching) {
      console.log(`[VAPI] Phone number ${normalized} is already provisioned in VAPI`);
      return matching;
    }
    
    return null;
  } catch (error) {
    console.warn(`[VAPI] Could not check if number is provisioned in VAPI:`, error.message);
    return null;
  }
}

/**
 * Find unassigned phone numbers in Telnyx (numbers not assigned to any business)
 * @param {string} preferredAreaCode - Optional area code to prefer
 * @returns {Promise<Array>} Array of unassigned phone number objects
 */
export async function findUnassignedTelnyxNumbers(preferredAreaCode = null) {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';
    
    if (!TELNYX_API_KEY) {
      console.warn('[VAPI] TELNYX_API_KEY not set, cannot find unassigned numbers');
      return [];
    }

    const axios = (await import("axios")).default;
    const { Business } = await import("../models/Business.js");
    
    console.log('[VAPI] Finding unassigned phone numbers in Telnyx...');
    
    // Get all phone numbers from Telnyx
    const telnyxResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'page[size]': 100, // Get up to 100 numbers
      },
    });
    
    const allTelnyxNumbers = telnyxResponse.data?.data || [];
    console.log(`[VAPI] Found ${allTelnyxNumbers.length} phone numbers in Telnyx account`);
    
    // Get all phone numbers assigned to businesses in our database
    // Check multiple sources: vapi_phone_number, telnyx_number, and business_phone_numbers table
    const assignedNumbers = new Set();
    
    // 1. Check businesses.vapi_phone_number
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('vapi_phone_number, telnyx_number')
      .is('deleted_at', null);
    
    if (error) {
      console.warn('[VAPI] Error fetching assigned numbers from database:', error);
    } else {
      (businesses || []).forEach(b => {
        // Add vapi_phone_number if present
        if (b.vapi_phone_number) {
          let normalized = b.vapi_phone_number.replace(/[^0-9+]/g, '');
          if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
          }
          assignedNumbers.add(normalized);
        }
        // Add telnyx_number if present
        if (b.telnyx_number) {
          let normalized = b.telnyx_number.replace(/[^0-9+]/g, '');
          if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
          }
          assignedNumbers.add(normalized);
        }
      });
    }
    
    // 2. Check business_phone_numbers table
    try {
      const { BusinessPhoneNumber } = await import('../models/BusinessPhoneNumber.js');
      const { data: businessPhoneNumbers, error: bpnError } = await supabaseClient
        .from('business_phone_numbers')
        .select('phone_number')
        .eq('is_active', true);
      
      if (!bpnError && businessPhoneNumbers) {
        businessPhoneNumbers.forEach(bpn => {
          if (bpn.phone_number) {
            let normalized = bpn.phone_number.replace(/[^0-9+]/g, '');
            if (!normalized.startsWith('+')) {
              normalized = '+' + normalized;
            }
            assignedNumbers.add(normalized);
          }
        });
      }
    } catch (bpnImportError) {
      console.warn('[VAPI] Could not check business_phone_numbers table (may not exist yet):', bpnImportError.message);
    }
    
    console.log(`[VAPI] Found ${assignedNumbers.size} phone numbers assigned to businesses (checked vapi_phone_number, telnyx_number, and business_phone_numbers)`);
    
    // Find unassigned numbers in Telnyx
    // Include ALL numbers that aren't assigned to businesses, regardless of Telnyx connection status
    // Numbers without connection_id are still available for assignment
    const unassignedTelnyxNumbers = allTelnyxNumbers.filter(telnyxNum => {
      const telnyxPhone = telnyxNum.phone_number || telnyxNum.number;
      if (!telnyxPhone) return false;
      
      // Normalize for comparison
      let normalized = telnyxPhone.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }
      
      // Check if this number is assigned to a business in our database
      // We don't care about Telnyx connection_id - if it's not in our DB, it's available
      const isAssignedInDatabase = assignedNumbers.has(normalized);
      
      if (isAssignedInDatabase) {
        return false; // Already assigned to a business
      }
      
      // Number exists in Telnyx but not assigned to any business - it's available
      // Even if connection_id is null/undefined, we can still use it
      return true;
    });
    
    console.log(`[VAPI] Found ${unassignedTelnyxNumbers.length} unassigned phone numbers in Telnyx`);
    
    // Log details about unassigned numbers (including connection status)
    if (unassignedTelnyxNumbers.length > 0) {
      console.log(`[VAPI] Unassigned numbers details:`);
      unassignedTelnyxNumbers.slice(0, 5).forEach((num, idx) => {
        const phone = num.phone_number || num.number;
        const connectionId = num.connection_id || num.connection_name || 'NOT SET';
        console.log(`[VAPI]   ${idx + 1}. ${phone} (connection_id: ${connectionId})`);
      });
    }
    
    // Also check VAPI for numbers not assigned to businesses
    let unassignedVapiNumbers = [];
    try {
      const vapiNumbers = await getAllVapiPhoneNumbers();
      unassignedVapiNumbers = vapiNumbers.filter(vapiNum => {
        const vapiPhone = vapiNum.phoneNumber || vapiNum.phone_number || vapiNum.number;
        if (!vapiPhone) return false;
        
        // Normalize for comparison
        let normalized = vapiPhone.replace(/[^0-9+]/g, '');
        if (!normalized.startsWith('+')) {
          normalized = '+' + normalized;
        }
        
        return !assignedNumbers.has(normalized);
      });
      
      console.log(`[VAPI] Found ${unassignedVapiNumbers.length} unassigned phone numbers in VAPI`);
    } catch (error) {
      console.warn('[VAPI] Could not check VAPI numbers:', error.message);
    }
    
    // Combine both lists (VAPI numbers are preferred since they're already provisioned)
    const unassignedNumbers = [...unassignedVapiNumbers, ...unassignedTelnyxNumbers];
    console.log(`[VAPI] Total unassigned numbers available: ${unassignedNumbers.length}`);
    
    // Separate toll-free and local numbers
    const { isTollFree } = await import('../utils/phoneFormatter.js');
    const tollFreeNumbers = unassignedNumbers.filter(num => {
      const phone = num.phoneNumber || num.phone_number || num.number;
      return phone && isTollFree(phone);
    });
    const localNumbers = unassignedNumbers.filter(num => {
      const phone = num.phoneNumber || num.phone_number || num.number;
      return phone && !isTollFree(phone);
    });
    
    console.log(`[VAPI] Unassigned numbers breakdown: ${localNumbers.length} local, ${tollFreeNumbers.length} toll-free`);
    
    // Only return toll-free numbers (first number is included in subscription)
    // Local numbers are not offered - all numbers must be toll-free
    if (tollFreeNumbers.length > 0) {
      console.log(`[VAPI] Returning ${tollFreeNumbers.length} unassigned toll-free numbers`);
      return tollFreeNumbers;
    }
    
    // If no toll-free numbers available, return empty array
    console.warn(`[VAPI] ⚠️  No unassigned toll-free numbers available.`);
    return [];
  } catch (error) {
    console.error('[VAPI] Error finding unassigned numbers:', error.message);
    return [];
  }
}

/**
 * Helper function to trigger verification if needed (non-blocking)
 */
async function triggerVerificationIfNeeded(phoneNumber, businessId) {
  try {
    const { autoVerifyAfterPurchase } = await import('./telnyxVerification.js');
    const { Business } = await import('../models/Business.js');
    const business = businessId ? await Business.findById(businessId) : null;
    if (business) {
      console.log(`[VAPI] Attempting automatic verification for ${phoneNumber}...`);
      const verificationResult = await autoVerifyAfterPurchase(phoneNumber, {
        name: business.name,
        website: business.website || '',
        use_case: 'Marketing and promotional messages',
      });
      
      if (verificationResult.verified) {
        console.log(`[VAPI] ✅ Number ${phoneNumber} is verified and ready for high-volume SMS`);
      } else if (verificationResult.manual_verification_required) {
        console.log(`[VAPI] ⚠️  Manual verification required for ${phoneNumber}. Please verify in Telnyx portal.`);
      }
    }
  } catch (verifyError) {
    console.warn(`[VAPI] ⚠️  Verification check failed (non-critical):`, verifyError.message);
    // Don't fail purchase if verification check fails
  }
}

/**
 * Purchase a phone number from Telnyx
 * Uses the recommended /number_orders endpoint, with fallback to /phone_numbers
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {string} businessId - Optional business ID for automatic verification
 * @returns {Promise<Object>} Purchased phone number object
 */
export async function purchaseTelnyxNumber(phoneNumber, businessId = null) {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';
    
    if (!TELNYX_API_KEY) {
      throw new Error('TELNYX_API_KEY not set. Cannot purchase phone numbers directly from Telnyx.');
    }

    const axios = (await import("axios")).default;
    
    // Clean phone number - ensure E.164 format
    let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!cleanNumber.startsWith('+')) {
      if (cleanNumber.length === 10) {
        cleanNumber = '+1' + cleanNumber;
      } else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
        cleanNumber = '+' + cleanNumber;
      } else {
        cleanNumber = '+1' + cleanNumber;
      }
    }
    
    console.log(`[VAPI] Purchasing phone number: ${cleanNumber}`);
    
    // Check if number already exists in Telnyx account
    try {
      const checkResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`, {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      });
      
      if (checkResponse.data?.data && checkResponse.data.data.length > 0) {
        const existingNumber = checkResponse.data.data[0];
        console.log(`[VAPI] ✅ Phone number already exists in Telnyx: ${cleanNumber}`);
        
        // Check verification status for existing numbers too
        await triggerVerificationIfNeeded(cleanNumber, businessId);
        
        return existingNumber;
      }
    } catch (checkError) {
      // If check fails, continue to purchase
      console.log("[VAPI] Could not check existing numbers, proceeding with purchase...");
    }
    
    // Method 1: Try Number Orders endpoint (recommended by Telnyx)
    try {
      console.log("[VAPI] Attempting purchase via /number_orders endpoint...");
      const numberOrderPayload = {
        phone_numbers: [{
          phone_number: cleanNumber
        }]
      };
      
      const orderResponse = await axios.post(`${TELNYX_API_BASE_URL}/number_orders`, numberOrderPayload, {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      // Number Orders returns an order, we need to wait for it to complete or get the phone number
      console.log("[VAPI] ✅ Number order created successfully");
      
      // Extract phone number from order response
      if (orderResponse.data?.data?.phone_numbers && orderResponse.data.data.phone_numbers.length > 0) {
        const purchasedNumber = orderResponse.data.data.phone_numbers[0];
        const finalNumber = purchasedNumber.phone_number || cleanNumber;
        console.log(`[VAPI] ✅ Phone number purchased via number_orders: ${finalNumber}`);
        
        // Automatically verify toll-free numbers after purchase
        await triggerVerificationIfNeeded(finalNumber, businessId);
        
        // Return in consistent format
        return {
          id: purchasedNumber.id,
          phone_number: finalNumber,
          ...purchasedNumber
        };
      }
      
      // If order was created but number not in response, fetch it
      if (orderResponse.data?.data?.id) {
        // Wait a moment for order to process, then fetch the number
        await new Promise(resolve => setTimeout(resolve, 1000));
        const getResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`, {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
          },
        });
        if (getResponse.data?.data && getResponse.data.data.length > 0) {
          const fetchedNumber = getResponse.data.data[0];
          // Check verification status
          await triggerVerificationIfNeeded(cleanNumber, businessId);
          return fetchedNumber;
        }
      }
      
      // Return what we have
      return {
        phone_number: cleanNumber,
        ...orderResponse.data?.data
      };
    } catch (orderError) {
      console.log("[VAPI] Number Orders endpoint failed, trying direct /phone_numbers endpoint...");
      console.log("[VAPI] Order error:", orderError.response?.data || orderError.message);
      
      // Method 2: Try direct /phone_numbers endpoint (fallback)
      try {
        const directResponse = await axios.post(`${TELNYX_API_BASE_URL}/phone_numbers`, {
          phone_number: cleanNumber,
        }, {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`[VAPI] ✅ Purchased phone number from Telnyx via direct endpoint: ${cleanNumber}`);
        
        // Automatically verify toll-free numbers after purchase
        await triggerVerificationIfNeeded(cleanNumber, businessId);
        
        return directResponse.data.data;
      } catch (directError) {
        // If both methods fail, check if number might already exist
        if (directError.response?.status === 422 || directError.response?.status === 409) {
          console.log("[VAPI] Number might already be purchased, fetching existing number...");
          try {
            const getResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`, {
              headers: {
                Authorization: `Bearer ${TELNYX_API_KEY}`,
              },
            });
            if (getResponse.data?.data && getResponse.data.data.length > 0) {
              const existingNumber = getResponse.data.data[0];
              console.log(`[VAPI] ✅ Number already exists in Telnyx: ${cleanNumber}`);
              
              // Check verification status for existing numbers too
              await triggerVerificationIfNeeded(cleanNumber, businessId);
              
              return existingNumber;
            }
          } catch (getError) {
            // Ignore and throw original error
          }
        }
        
        // Both methods failed
        const errorDetails = orderError.response?.data || directError.response?.data || {};
        const errorMessage = errorDetails.errors?.[0]?.detail || errorDetails.errors?.[0]?.title || directError.message || orderError.message;
        
        console.error("[VAPI] Both purchase methods failed:");
        console.error("[VAPI] Order error:", orderError.response?.data || orderError.message);
        console.error("[VAPI] Direct error:", directError.response?.data || directError.message);
        
        throw new Error(`Failed to purchase phone number from Telnyx: ${errorMessage}`);
      }
    }
  } catch (error) {
    console.error("[VAPI] Error purchasing Telnyx number:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Provision a phone number via VAPI
 * This function will:
 * 1. Search for available numbers (if not provided)
 * 2. Purchase the number from Telnyx (if needed)
 * 3. Provision it to VAPI
 * 
 * @param {string} specificNumber - Optional: specific phone number to provision (E.164 format)
 * @returns {Promise<Object>} Phone number object
 */
export async function provisionPhoneNumber(specificNumber = null, businessPhoneNumber = null) {
  try {
    let phoneNumberToProvision = specificNumber;
    
    // If no specific number provided, purchase a new one (don't reuse existing)
    if (!phoneNumberToProvision) {
      console.log("[VAPI] No specific number provided, will purchase a new number...");
      
      // Extract area code from business phone number if provided
      let areaCode = null;
      if (businessPhoneNumber) {
        const { extractAreaCode } = await import("../utils/phoneFormatter.js");
        areaCode = extractAreaCode(businessPhoneNumber);
        if (areaCode) {
          console.log(`[VAPI] Matching area code from business phone: ${areaCode}`);
        }
      }
      
      // Search for numbers, matching area code if available
      const availableNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, areaCode);
      
      if (availableNumbers.length === 0) {
        // If no numbers found with area code, try without area code
        if (areaCode) {
          console.log(`[VAPI] No numbers found with area code ${areaCode}, trying without area code...`);
          const fallbackNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, null);
          if (fallbackNumbers.length === 0) {
            throw new Error('No available phone numbers found. Please try again or contact support.');
          }
          phoneNumberToProvision = fallbackNumbers[0].phone_number;
        } else {
          throw new Error('No available phone numbers found. Please try again or contact support.');
        }
      } else {
        phoneNumberToProvision = availableNumbers[0].phone_number;
      }
      
      console.log(`[VAPI] Selected phone number: ${phoneNumberToProvision}`);
      
      // Purchase the number from Telnyx
      console.log("[VAPI] Attempting to purchase number from Telnyx...");
      await purchaseTelnyxNumber(phoneNumberToProvision);
      console.log("[VAPI] ✅ Number purchased from Telnyx, proceeding to VAPI...");
    } else {
      // Specific number provided - verify it exists in Telnyx
      const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
      if (TELNYX_API_KEY) {
        try {
          const axios = (await import("axios")).default;
          const checkResponse = await axios.get(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumberToProvision)}`, {
            headers: {
              Authorization: `Bearer ${TELNYX_API_KEY}`,
            },
          });
          
          if (!checkResponse.data?.data || checkResponse.data.data.length === 0) {
            throw new Error(`Phone number ${phoneNumberToProvision} does not exist in your Telnyx account. Please purchase it first.`);
          }
          
          console.log(`[VAPI] ✅ Verified number exists in Telnyx: ${phoneNumberToProvision}`);
        } catch (error) {
          if (error.message.includes('does not exist')) {
            throw error;
          }
          console.warn("[VAPI] Could not verify number in Telnyx, proceeding anyway...");
        }
      }
    }
    
    // VAPI requires a specific phone number in E.164 format
    const requestBody = {
      provider: "telnyx",
      number: phoneNumberToProvision, // Must be in E.164 format (e.g., +15551234567)
    };
    
    // Try to get credential ID automatically (prioritize auto-detection)
    let credentialId = null;
    
    // First, try to auto-detect from VAPI (this is the preferred method)
    try {
      console.log("[VAPI] Auto-detecting Telnyx credential from VAPI...");
      const credentials = await getTelnyxCredentials();
      console.log(`[VAPI] Found ${credentials.length} Telnyx credential(s) in VAPI`);
      if (credentials.length > 0) {
        credentialId = credentials[0].id;
        console.log(`[VAPI] ✅ Auto-detected Telnyx credential: ${credentialId}`);
      } else {
        console.log("[VAPI] No Telnyx credentials found in VAPI. Will try environment variable or auto-detection.");
      }
    } catch (error) {
      console.warn("[VAPI] ⚠️  Could not auto-detect credentials from VAPI API (this is OK, will try other methods)");
      console.warn("[VAPI] Error:", error.message);
    }
    
    // Fallback to environment variable if auto-detection didn't work
    if (!credentialId) {
      credentialId = process.env.VAPI_TELNYX_CREDENTIAL_ID;
      if (credentialId) {
        console.log(`[VAPI] Using Telnyx credential from environment variable: ${credentialId}`);
      }
    }
    
    // Add credentialId if we have one (VAPI may also auto-detect if not provided)
    if (credentialId) {
      requestBody.credentialId = credentialId;
      console.log(`[VAPI] Provisioning phone number with credentialId: ${credentialId}`);
    } else {
      console.log("[VAPI] No credentialId specified - VAPI will attempt to auto-detect from your account");
      console.log("[VAPI] If this fails, you may need to add a Telnyx credential in VAPI Dashboard → Settings → Credentials");
    }
    
    console.log("[VAPI] Request body:", JSON.stringify(requestBody, null, 2));
    
    // Check if VAPI_API_KEY is set before making the request
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    if (!VAPI_API_KEY) {
      throw new Error('VAPI_API_KEY is not set. Cannot provision phone number to VAPI. Please set VAPI_API_KEY in your environment variables.');
    }
    
    const response = await getVapiClient().post("/phone-number", requestBody);
    
    // VAPI returns phone number in different possible fields
    const phoneNumberData = response.data;
    const phoneNumber = phoneNumberData?.phoneNumber || 
                       phoneNumberData?.phone_number || 
                       phoneNumberData?.number ||
                       phoneNumberData?.id;
    
    // Extract phoneNumberId - this is critical for linking
    const phoneNumberId = phoneNumberData?.id || 
                         phoneNumberData?.phoneNumberId || 
                         phoneNumberData?.phone_number_id;
    
    if (!phoneNumberId) {
      console.error("[VAPI] ⚠️  WARNING: phoneNumberId not found in VAPI response!");
      console.error("[VAPI] Response data:", JSON.stringify(phoneNumberData, null, 2));
      // Try to extract from nested structure
      if (phoneNumberData?.data?.id) {
        phoneNumberData.id = phoneNumberData.data.id;
        phoneNumberData.phoneNumberId = phoneNumberData.data.id;
      }
    }
    
    console.log("[VAPI] ✅ Phone number provisioned successfully");
    console.log("[VAPI] Phone number:", phoneNumber);
    console.log("[VAPI] Phone number ID:", phoneNumberId || 'NOT FOUND');
    console.log("[VAPI] Full response:", JSON.stringify(phoneNumberData, null, 2));
    
    // Ensure phoneNumber and id fields exist for consistency
    if (!phoneNumberData.phoneNumber && phoneNumber) {
      phoneNumberData.phoneNumber = phoneNumber;
    }
    if (!phoneNumberData.id && phoneNumberId) {
      phoneNumberData.id = phoneNumberId;
      phoneNumberData.phoneNumberId = phoneNumberId;
    }
    
    return phoneNumberData;
  } catch (error) {
    const errorDetails = error.response?.data || {};
    const errorMessage = errorDetails.message || errorDetails.error || error.message;
    
    console.error("Error provisioning phone number:", {
      message: errorMessage,
      details: errorDetails,
      status: error.response?.status,
    });
    
    // Provide helpful error message for credential issues
    if (errorMessage.includes("credentialId") || errorMessage.includes("UUID") || errorMessage.includes("Credential")) {
      // First, try to auto-detect credentials one more time (in case they were just added)
      let autoDetectedCreds = [];
      try {
        console.log("[VAPI] Credential error detected - attempting to auto-detect credentials again...");
        autoDetectedCreds = await getTelnyxCredentials();
        if (autoDetectedCreds.length > 0) {
          console.log(`[VAPI] ✅ Found ${autoDetectedCreds.length} credential(s) - the credential may be invalid or have insufficient permissions`);
        }
      } catch (retryError) {
        // If retry also fails, continue with error message
      }
      
      let helpMessage;
      if (autoDetectedCreds.length > 0) {
        helpMessage = `VAPI credential error. Found ${autoDetectedCreds.length} Telnyx credential(s) in your VAPI account, but provisioning failed. 

Possible issues:
1. The Telnyx API key in your VAPI credential may be invalid or expired
2. The Telnyx API key may not have permission to provision phone numbers
3. The credential may not be properly configured

Please check your Telnyx API key in VAPI Dashboard → Settings → Credentials and ensure it's valid.

Original error: ${errorMessage}`;
      } else {
        helpMessage = `VAPI phone provisioning requires a Telnyx credential. The system attempted to auto-detect credentials but none were found.

To fix this automatically (no .env changes needed):
1. Go to VAPI Dashboard → Settings → Credentials
2. Add a Telnyx credential (use your Telnyx API key from portal.telnyx.com)
3. The system will automatically detect and use this credential on the next attempt

Alternatively, you can manually set VAPI_TELNYX_CREDENTIAL_ID in your .env file with the credential UUID.

Original error: ${errorMessage}`;
      }
      
      throw new Error(helpMessage);
    }
    
    throw new Error(`Failed to provision phone number: ${errorMessage}`);
  }
}

/**
 * Link an assistant to a phone number
 * @param {string} assistantId - VAPI assistant ID
 * @param {string} phoneNumberId - VAPI phone number ID
 * @returns {Promise<Object>} Updated phone number object
 */
export async function linkAssistantToNumber(assistantId, phoneNumberId) {
  try {
    console.log(`[VAPI] Linking assistant ${assistantId} to phone number ${phoneNumberId}...`);
    
    // Try the standard PATCH endpoint first
    let response;
    try {
      response = await getVapiClient().patch(`/phone-number/${phoneNumberId}`, {
        assistantId: assistantId,
      });
    } catch (patchError) {
      // If PATCH fails, try PUT (some APIs use PUT for updates)
      if (patchError.response?.status === 405 || patchError.response?.status === 404) {
        console.log(`[VAPI] PATCH failed, trying PUT...`);
        response = await getVapiClient().put(`/phone-number/${phoneNumberId}`, {
          assistantId: assistantId,
        });
      } else {
        throw patchError;
      }
    }
    
    console.log(`[VAPI] ✅ Successfully linked assistant to phone number`);
    console.log(`[VAPI] Link response:`, JSON.stringify(response.data, null, 2));
    
    // Verify the link was successful
    const verifyResponse = await getVapiClient().get(`/phone-number/${phoneNumberId}`);
    const linkedAssistantId = verifyResponse.data?.assistantId || verifyResponse.data?.assistant?.id;
    
    if (linkedAssistantId === assistantId) {
      console.log(`[VAPI] ✅ Verification: Phone number is correctly linked to assistant ${assistantId}`);
    } else {
      console.warn(`[VAPI] ⚠️  Verification: Phone number shows assistant ID ${linkedAssistantId}, expected ${assistantId}`);
    }
    
    return response.data;
  } catch (error) {
    console.error("[VAPI] Error linking assistant to number:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    });
    
    // Provide helpful error message
    if (error.response?.status === 404) {
      throw new Error(`Phone number ${phoneNumberId} not found in VAPI. Please verify the phone number ID.`);
    } else if (error.response?.status === 400) {
      throw new Error(`Invalid request: ${error.response?.data?.message || 'Check that assistant ID and phone number ID are valid UUIDs'}`);
    }
    
    throw new Error(`Failed to link assistant to number: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Update a VAPI assistant
 * @param {string} assistantId - VAPI assistant ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Updated assistant object
 */
export async function updateAssistant(assistantId, updates) {
  try {
    console.log(`[updateAssistant] Updating assistant ${assistantId}`);
    console.log(`[updateAssistant] Updates received:`, {
      hasModel: !!updates.model,
      hasFirstMessage: !!updates.firstMessage,
      hasEndCallFunction: !!updates.endCallFunctionEnabled,
      modelMessagesCount: updates.model?.messages?.length || 0,
    });
    
    // Handle systemPrompt updates - VAPI API expects it in model.messages
    const updatePayload = { ...updates };
    
    if (updates.systemPrompt) {
      // Put system prompt in model.messages structure
      updatePayload.model = {
        ...(updates.model || {}),
        messages: [
          {
            role: "system",
            content: updates.systemPrompt,
          },
        ],
      };
      // Remove systemPrompt from top level
      delete updatePayload.systemPrompt;
    }
    
    console.log(`[updateAssistant] Sending update payload to VAPI:`, {
      hasModel: !!updatePayload.model,
      hasFirstMessage: !!updatePayload.firstMessage,
      hasEndCallFunction: !!updatePayload.endCallFunctionEnabled,
      modelProvider: updatePayload.model?.provider,
      modelModel: updatePayload.model?.model,
    });
    
    const response = await getVapiClient().patch(`/assistant/${assistantId}`, updatePayload);
    
    console.log(`[updateAssistant] ✅ Assistant updated successfully:`, {
      assistantId: response.data?.id || assistantId,
      name: response.data?.name,
    });
    
    return response.data;
  } catch (error) {
    console.error("[updateAssistant] ❌❌❌ ERROR updating VAPI assistant:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      assistantId,
    });
    throw new Error(`Failed to update VAPI assistant: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Rebuild VAPI assistant with all current business and agent data
 * @param {string} businessId - Business ID
 * @returns {Promise<Object>} Updated assistant object
 */
export async function rebuildAssistant(businessId) {
  try {
    console.log(`[VAPI Rebuild] Starting rebuild for business: ${businessId}`);
    
    // Import everything we need first
    const BusinessModule = await import("../models/Business.js");
    const AIAgentModule = await import("../models/AIAgent.js");
    const TemplateModule = await import("../templates/vapi-assistant-template.js");
    
    const Business = BusinessModule.Business;
    const AIAgent = AIAgentModule.AIAgent;
    const generateAssistantPrompt = TemplateModule.generateAssistantPrompt;
    
    // Fetch business data
    const businessRecord = await Business.findById(businessId);
    if (!businessRecord) {
      throw new Error(`Business not found: ${businessId}`);
    }
    
    if (!businessRecord.vapi_assistant_id) {
      throw new Error(`No VAPI assistant ID. Please provision a phone number first.`);
    }
    
    const assistantId = businessRecord.vapi_assistant_id;
    
    // CRITICAL: Fetch current assistant config from VAPI first
    // VAPI requires all fields to be present in PATCH, otherwise it may clear missing fields
    console.log(`[VAPI Rebuild] Fetching current assistant config from VAPI...`);
    let currentAssistant;
    try {
      const currentResponse = await getVapiClient().get(`/assistant/${assistantId}`);
      currentAssistant = currentResponse.data;
      console.log(`[VAPI Rebuild] Current assistant config:`, {
        model: currentAssistant.model?.model,
        voiceProvider: currentAssistant.voice?.provider,
        voiceId: currentAssistant.voice?.voiceId,
      });
    } catch (fetchError) {
      console.warn(`[VAPI Rebuild] Could not fetch current assistant, proceeding with new config:`, fetchError.message);
      currentAssistant = null;
    }
    
    // Fetch agent data
    const agentRecord = await AIAgent.findByBusinessId(businessId);
    
    console.log(`[VAPI Rebuild] ========== RAW DATA FROM DATABASE ==========`);
    console.log(`[VAPI Rebuild] Raw agent record holiday_hours:`, JSON.stringify(agentRecord?.holiday_hours, null, 2));
    console.log(`[VAPI Rebuild] Holiday hours type:`, typeof agentRecord?.holiday_hours);
    console.log(`[VAPI Rebuild] Holiday hours is array:`, Array.isArray(agentRecord?.holiday_hours));
    if (Array.isArray(agentRecord?.holiday_hours)) {
      console.log(`[VAPI Rebuild] Each holiday date from DB:`, JSON.stringify(agentRecord.holiday_hours.map(h => ({ 
        name: h?.name, 
        date: h?.date, 
        dateType: typeof h?.date,
        dateValue: String(h?.date),
        dateLength: String(h?.date).length
      })), null, 2));
    }
    console.log(`[VAPI Rebuild] ===========================================`);
    
    // Extract all values we need into simple variables - NO references to businessRecord after this
    const businessName = businessRecord.name || "Business";
    const businessEmail = businessRecord.email || "";
    const businessAddress = businessRecord.address || "";
    const businessPhone = businessRecord.public_phone_number || "";
    const businessTimezone = businessRecord.timezone || "America/New_York";
    const allowTransfer = businessRecord.allow_call_transfer ?? true;
    const afterHoursBehavior = businessRecord.after_hours_behavior || "take_message";
    
    // CRITICAL: Check if business_hours exists and has actual data
    // If it's null, undefined, or an empty object, we should NOT use defaults
    // Instead, we should preserve whatever is in the database (even if empty)
    let businessHours = agentRecord?.business_hours;
    
    // Log business hours for debugging
    console.log(`[VAPI Rebuild] ========== BUSINESS HOURS FROM DATABASE ==========`);
    console.log(`[VAPI Rebuild] Raw business_hours from DB:`, JSON.stringify(businessHours, null, 2));
    console.log(`[VAPI Rebuild] business_hours type:`, typeof businessHours);
    console.log(`[VAPI Rebuild] business_hours is null:`, businessHours === null);
    console.log(`[VAPI Rebuild] business_hours is undefined:`, businessHours === undefined);
    console.log(`[VAPI Rebuild] business_hours is empty object:`, businessHours && typeof businessHours === 'object' && Object.keys(businessHours).length === 0);
    
    // Only use empty object as fallback if business_hours is truly missing
    // DO NOT overwrite existing hours (even if they seem "empty")
    if (businessHours === null || businessHours === undefined) {
      console.warn(`[VAPI Rebuild] ⚠️ business_hours is null/undefined, using empty object for rebuild (but NOT updating database)`);
      businessHours = {};
    } else if (typeof businessHours !== 'object') {
      console.warn(`[VAPI Rebuild] ⚠️ business_hours is not an object (type: ${typeof businessHours}), using empty object for rebuild`);
      businessHours = {};
    }
    
    if (businessHours && typeof businessHours === 'object') {
      Object.keys(businessHours).forEach(day => {
        const hours = businessHours[day];
        console.log(`[VAPI Rebuild] ${day}:`, hours);
      });
    }
    console.log(`[VAPI Rebuild] Final business_hours being used for rebuild:`, JSON.stringify(businessHours, null, 2));
    console.log(`[VAPI Rebuild] ================================================`);
    
    // CRITICAL: Normalize holiday hours dates to ensure they're in YYYY-MM-DD format
    // This prevents timezone issues when dates are stored/retrieved from the database
    let holidayHours = agentRecord?.holiday_hours || [];
    
    console.log(`[VAPI Rebuild] ========== HOLIDAY HOURS FROM DATABASE ==========`);
    console.log(`[VAPI Rebuild] Raw holiday hours before normalization:`, JSON.stringify(holidayHours.map(h => ({ 
      name: h?.name, 
      date: h?.date, 
      dateType: typeof h?.date,
      dateValue: String(h?.date),
      dateLength: String(h?.date).length
    })), null, 2));
    if (Array.isArray(holidayHours)) {
      holidayHours = holidayHours.map(h => {
        if (!h || !h.date) return h;
        
        // Ensure date is in YYYY-MM-DD format (timezone-agnostic)
        let dateStr = h.date;
        
        // If it's a Date object, extract the date parts in local timezone
        if (dateStr instanceof Date) {
          const year = dateStr.getFullYear();
          const month = String(dateStr.getMonth() + 1).padStart(2, '0');
          const day = String(dateStr.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } 
        // If it's an ISO string with time, extract just the date part
        else if (typeof dateStr === 'string' && dateStr.includes('T')) {
          dateStr = dateStr.split('T')[0];
        }
        // If it's already in YYYY-MM-DD format, use it as-is (most common case)
        else if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // Already in correct format - this is what we want! No conversion needed.
          console.log(`[VAPI Rebuild] ✅ Date "${dateStr}" for ${h.name} is already in YYYY-MM-DD format, using as-is`);
          return { ...h, date: dateStr }; // Return early to avoid unnecessary processing
        }
        // If it's in a different format, try to parse it
        else if (typeof dateStr === 'string') {
          // Try to extract YYYY-MM-DD from various formats
          const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            dateStr = dateMatch[0]; // Use the matched YYYY-MM-DD
          } else {
            console.warn(`[VAPI Rebuild] Could not parse holiday date: ${dateStr}, using as-is`);
          }
        }
        
        return { ...h, date: dateStr };
      });
      
      console.log(`[VAPI Rebuild] Normalized holiday hours after processing:`, JSON.stringify(holidayHours.map(h => ({ 
        name: h?.name, 
        date: h?.date, 
        dateType: typeof h?.date 
      })), null, 2));
      console.log(`[VAPI Rebuild] ================================================`);
    } else {
      console.log(`[VAPI Rebuild] Holiday hours is not an array:`, typeof holidayHours, holidayHours);
    }
    
    const faqs = agentRecord?.faqs || [];
    const openingGreeting = agentRecord?.opening_greeting || `Hello! Thanks for calling ${businessName}. How can I help you today?`;
    const endingGreeting = agentRecord?.ending_greeting || null;
    const personality = agentRecord?.personality || 'professional';
    // Use voice settings from agent record, default to OpenAI/alloy
    const voiceSettings = agentRecord?.voice_settings || {};
    const voiceProvider = voiceSettings.provider || 'openai'; // Default to OpenAI to save costs
    const voiceId = voiceSettings.voice_id || 'alloy'; // Default professional voice (OpenAI)
    
    // Calculate temperature
    let temperature = 0.7;
    if (personality === 'friendly') temperature = 0.8;
    else if (personality === 'professional') temperature = 0.6;
    else if (personality === 'casual') temperature = 0.9;
    
    console.log(`[VAPI Rebuild] Preparing to generate prompt with holiday hours:`, JSON.stringify(holidayHours.map(h => ({ name: h?.name, date: h?.date })), null, 2));
    
    // Generate system prompt
    const systemPrompt = await generateAssistantPrompt({
      name: businessName,
      public_phone_number: businessPhone,
      timezone: businessTimezone,
      business_hours: businessHours,
      holiday_hours: holidayHours,
      faqs: faqs,
      contact_email: businessEmail,
      address: businessAddress,
      allow_call_transfer: allowTransfer,
      after_hours_behavior: afterHoursBehavior,
      opening_greeting: openingGreeting,
      ending_greeting: endingGreeting,
      personality: personality,
    });
    
    // Build a clean payload with ONLY the fields VAPI accepts for updates
    // VAPI rejects updates with read-only fields (orgId, id, createdAt, isServerUrlSecretSet, etc.)
    // We build a fresh payload instead of spreading currentAssistant to avoid read-only fields
    // VAPI has a 40 character limit on assistant names
    // Use " - Tavari" suffix (9 chars), so business name can be up to 31 chars
    const suffix = ' - Tavari';
    const maxBusinessNameLength = 31;
    const truncatedBusinessName = businessName.length > maxBusinessNameLength 
      ? businessName.substring(0, maxBusinessNameLength).trim() 
      : businessName;
    
    const updatePayload = {
      name: `${truncatedBusinessName}${suffix}`,
      // FORCE model to gpt-4o-mini (cheaper) - this is critical for cost reduction
      model: {
        provider: "openai",
        model: "gpt-4o-mini", // Using mini for lower cost (~80% cheaper than gpt-4o)
        temperature: temperature,
        maxTokens: 150,
        messages: [{ role: "system", content: systemPrompt }],
      },
      // Use voice settings from agent record (defaults to OpenAI/alloy if not set)
      voice: {
        provider: voiceProvider, // Use selected provider (defaults to openai)
        voiceId: voiceId, // Use selected voice (defaults to alloy)
      },
      firstMessage: openingGreeting,
      serverUrl: (() => {
        let backendUrl = process.env.BACKEND_URL || 
                          process.env.RAILWAY_PUBLIC_DOMAIN || 
                          process.env.VERCEL_URL || 
                          process.env.SERVER_URL ||
                          "https://api.tavarios.com";
        
        // Ensure URL has https:// protocol
        if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
          backendUrl = `https://${backendUrl}`;
        }
        
        const webhookUrl = `${backendUrl}/api/vapi/webhook`;
        console.log(`[VAPI Rebuild] Setting webhook URL: ${webhookUrl}`);
        return webhookUrl;
      })(),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // CRITICAL: serverMessages tells VAPI which events to send to the webhook
      // Without this, VAPI won't send any webhooks even if serverUrl is set
      serverMessages: [
        "status-update",      // Call status changes (call-start, call-end, etc.)
        "end-of-call-report", // Final call summary with transcript, duration, etc.
        "function-call",      // Function calls during the call
        "hang",               // Call hangup events
      ],
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      // Enable background denoising to filter out ambient noise
      backgroundDenoisingEnabled: true,
      // Allow users to interrupt AI speech - users can cut off the AI mid-response
      interruptionsEnabled: true, // Enable interruptions - users can interrupt AI responses
      firstMessageInterruptionsEnabled: false, // Keep first message protected - users cannot interrupt initial greeting
      startSpeakingPlan: {
        waitSeconds: 0.8,
        smartEndpointingEnabled: false, // Keep disabled to prevent premature cutoffs
      },
      // CRITICAL: Add businessId to metadata so webhook can find the business
      metadata: {
        businessId: businessId,
      },
    };
    
    if (endingGreeting) {
      updatePayload.endCallFunctionEnabled = true;
    } else {
      updatePayload.endCallFunctionEnabled = false;
    }
    
    // Make API call - Use PATCH (VAPI standard for updates)
    console.log(`[VAPI Rebuild] ========== UPDATING ASSISTANT ==========`);
    console.log(`[VAPI Rebuild] Assistant ID: ${assistantId}`);
    console.log(`[VAPI Rebuild] Model being set: ${updatePayload.model.model}`);
    console.log(`[VAPI Rebuild] Voice provider being set: ${updatePayload.voice.provider}`);
    console.log(`[VAPI Rebuild] Voice ID being set: ${updatePayload.voice.voiceId}`);
    console.log(`[VAPI Rebuild] Clean update payload (no read-only fields):`, JSON.stringify(updatePayload, null, 2));
    
    const response = await getVapiClient().patch(`/assistant/${assistantId}`, updatePayload);
    console.log(`[VAPI Rebuild] ✅ PATCH successful! Status: ${response.status}`);
    console.log(`[VAPI Rebuild] PATCH response data:`, JSON.stringify(response.data, null, 2));
    
    // Verify the update by fetching the assistant
    console.log(`[VAPI Rebuild] ========== VERIFYING UPDATE ==========`);
    const verifyResponse = await getVapiClient().get(`/assistant/${assistantId}`);
    const updatedAssistant = verifyResponse.data;
    
    console.log(`[VAPI Rebuild] ✅ Assistant updated successfully!`);
    console.log(`[VAPI Rebuild] ========== VERIFIED CONFIGURATION ==========`);
    console.log(`[VAPI Rebuild] Model: ${updatedAssistant.model?.model || 'unknown'}`);
    console.log(`[VAPI Rebuild] Voice Provider: ${updatedAssistant.voice?.provider || 'unknown'}`);
    console.log(`[VAPI Rebuild] Voice ID: ${updatedAssistant.voice?.voiceId || 'unknown'}`);
    console.log(`[VAPI Rebuild] Webhook URL (serverUrl): ${updatedAssistant.serverUrl || 'NOT SET!'}`);
    console.log(`[VAPI Rebuild] Expected webhook URL: ${updatePayload.serverUrl}`);
    if (updatedAssistant.serverUrl !== updatePayload.serverUrl) {
      console.error(`[VAPI Rebuild] ❌❌❌ CRITICAL: Webhook URL mismatch!`);
      console.error(`[VAPI Rebuild] Expected: ${updatePayload.serverUrl}`);
      console.error(`[VAPI Rebuild] Actual: ${updatedAssistant.serverUrl || 'NOT SET'}`);
    } else {
      console.log(`[VAPI Rebuild] ✅ Webhook URL matches expected value`);
    }
    console.log(`[VAPI Rebuild] Server Messages (serverMessages): ${JSON.stringify(updatedAssistant.serverMessages || 'NOT SET')}`);
    console.log(`[VAPI Rebuild] Expected serverMessages: ${JSON.stringify(updatePayload.serverMessages)}`);
    if (!updatedAssistant.serverMessages || updatedAssistant.serverMessages.length === 0) {
      console.error(`[VAPI Rebuild] ❌❌❌ CRITICAL: serverMessages is NOT SET! This will prevent webhooks from being sent!`);
    } else {
      console.log(`[VAPI Rebuild] ✅ serverMessages is configured: ${JSON.stringify(updatedAssistant.serverMessages)}`);
    }
    console.log(`[VAPI Rebuild] Full assistant config:`, JSON.stringify({
      model: updatedAssistant.model,
      voice: updatedAssistant.voice,
      serverUrl: updatedAssistant.serverUrl,
    }, null, 2));
    
    // Check if update actually worked
    if (updatedAssistant.model?.model !== 'gpt-4o-mini') {
      console.warn(`[VAPI Rebuild] ⚠️ WARNING: Model is still ${updatedAssistant.model?.model}, expected gpt-4o-mini`);
    }
    if (updatedAssistant.voice?.provider !== 'openai') {
      console.warn(`[VAPI Rebuild] ⚠️ WARNING: Voice provider is still ${updatedAssistant.voice?.provider}, expected openai`);
    }
    if (!updatedAssistant.serverUrl || updatedAssistant.serverUrl !== updatePayload.serverUrl) {
      console.error(`[VAPI Rebuild] ❌❌❌ CRITICAL WARNING: Webhook URL not set correctly!`);
      console.error(`[VAPI Rebuild] This will prevent call tracking, usage recording, and message creation!`);
    }
    
    // Update the business record with the rebuild timestamp
    try {
      const updatedBusiness = await Business.update(businessId, {
        vapi_assistant_rebuilt_at: new Date().toISOString(),
      });
      console.log(`[VAPI Rebuild] ✅ Updated rebuild timestamp for business: ${businessId}`);
      console.log(`[VAPI Rebuild] Rebuild timestamp value:`, updatedBusiness?.vapi_assistant_rebuilt_at);
    } catch (timestampError) {
      // Non-blocking - don't fail the rebuild if timestamp update fails
      console.error(`[VAPI Rebuild] ⚠️  Failed to update rebuild timestamp (non-blocking):`, {
        message: timestampError.message,
        code: timestampError.code,
        details: timestampError.details,
        hint: timestampError.hint,
      });
      // If column doesn't exist, log a helpful message
      if (timestampError.message && (timestampError.message.includes('column') || timestampError.message.includes('does not exist'))) {
        console.error(`[VAPI Rebuild] ❌ Column 'vapi_assistant_rebuilt_at' does not exist in businesses table.`);
        console.error(`[VAPI Rebuild] Run this SQL to add it: ALTER TABLE businesses ADD COLUMN IF NOT EXISTS vapi_assistant_rebuilt_at TIMESTAMP;`);
      }
    }
    
    return response.data;
  } catch (err) {
    // Wrap error to ensure we never reference undefined variables
    const errorMessage = err?.message || 'Unknown error';
    const errorStack = err?.stack || 'No stack trace';
    console.error(`[VAPI Rebuild] ERROR: ${errorMessage}`);
    console.error(`[VAPI Rebuild] Stack: ${errorStack}`);
    throw new Error(`Failed to rebuild assistant: ${errorMessage}`);
  }
}

/**
 * Get call summary from VAPI
 * @param {string} callId - VAPI call ID
 * @returns {Promise<Object>} Call summary with transcript and metadata
 */
export async function getCallSummary(callId) {
  try {
    const response = await getVapiClient().get(`/call/${callId}`);
    return {
      transcript: response.data.transcript,
      summary: response.data.summary,
      duration: response.data.duration,
      endedReason: response.data.endedReason,
      metadata: response.data.metadata,
      messages: response.data.messages || [], // Include messages array from VAPI
    };
  } catch (error) {
    console.error("Error getting call summary:", error.response?.data || error.message);
    throw new Error(`Failed to get call summary: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get full call data from VAPI (includes transport/call leg info)
 * @param {string} callId - VAPI call ID
 * @returns {Promise<Object>} Full call data object
 */
export async function getCallData(callId) {
  try {
    const response = await getVapiClient().get(`/call/${callId}`);
    return response.data;
  } catch (error) {
    console.error("[VAPI] Error getting call data:", error.response?.data || error.message);
    throw error; // Let caller handle this error
  }
}

/**
 * Transfer a call to the business number
 * @param {string} callId - VAPI call ID
 * @param {string} targetNumber - Business phone number to transfer to (must be E.164 format)
 * @returns {Promise<Object>} Transfer response
 */
export async function transferCall(callId, targetNumber) {
  try {
    // Ensure phone number is in E.164 format
    const { formatPhoneNumberE164, validatePhoneNumber } = await import("../utils/phoneFormatter.js");
    const e164Number = formatPhoneNumberE164(targetNumber);
    
    if (!e164Number || !validatePhoneNumber(e164Number)) {
      throw new Error(`Invalid phone number format: ${targetNumber}. Must be in E.164 format (e.g., +15551234567)`);
    }
    
    const response = await getVapiClient().post(`/call/${callId}/transfer`, {
      phoneNumberId: null, // Not using VAPI phone number
      phoneNumber: e164Number, // Direct number transfer in E.164 format
    });
    return response.data;
  } catch (error) {
    console.error("Error transferring call:", error.response?.data || error.message);
    throw new Error(`Failed to transfer call: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Transfer a call via Telnyx Call Control API
 * @param {string} callLegId - Telnyx call leg ID (call_control_id)
 * @param {string} targetNumber - Phone number to transfer to (E.164 format)
 * @returns {Promise<Object>} Telnyx API response
 */
export async function forwardCallViaTelnyx(callLegId, targetNumber) {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      throw new Error("TELNYX_API_KEY not configured");
    }
    
    const { formatPhoneNumberE164, validatePhoneNumber } = await import("../utils/phoneFormatter.js");
    const e164Number = formatPhoneNumberE164(targetNumber);
    
    if (!e164Number || !validatePhoneNumber(e164Number)) {
      throw new Error(`Invalid phone number format: ${targetNumber}`);
    }
    
    console.log(`[Telnyx Transfer] Transferring call (control ID: ${callLegId}) to ${e164Number}`);
    
    const axios = (await import("axios")).default;
    const response = await axios.post(
      `https://api.telnyx.com/v2/calls/${callLegId}/actions/transfer`,
      { to: e164Number },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      }
    );
    
    console.log(`[Telnyx Transfer] ✅ Transfer successful`);
    return response.data;
  } catch (error) {
    console.error("[Telnyx Transfer] Error:", {
      callLegId,
      targetNumber,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error; // Let caller handle this error
  }
}

/**
 * Forward a call to business immediately (no AI interaction)
 * @param {string} callId - VAPI call ID
 * @param {string} targetNumber - Business phone number (must be E.164 format)
 * @returns {Promise<Object>} Forward response (always returns object, never throws)
 */
export async function forwardCallToBusiness(callId, targetNumber) {
  try {
    // Ensure phone number is in E.164 format
    const { formatPhoneNumberE164, validatePhoneNumber } = await import("../utils/phoneFormatter.js");
    const e164Number = formatPhoneNumberE164(targetNumber);
    
    if (!e164Number || !validatePhoneNumber(e164Number)) {
      console.error(`[VAPI Forward] Invalid phone number format: ${targetNumber}`);
      return { forwarded: false, reason: "invalid_phone_number", error: `Invalid phone number format: ${targetNumber}` };
    }
    
    console.log(`[VAPI Forward] ========== ATTEMPTING CALL FORWARD ==========`);
    console.log(`[VAPI Forward] Call ID: ${callId}`);
    console.log(`[VAPI Forward] Target Number: ${e164Number}`);
    
    // STEP 1: Fetch full call data from VAPI to get Telnyx call leg ID
    console.log(`[VAPI Forward] Step 1: Fetching call data from VAPI...`);
    let callData = null;
    try {
      callData = await getCallData(callId);
      console.log(`[VAPI Forward] ✅ Call data fetched successfully`);
      console.log(`[VAPI Forward] Call data structure:`, {
        hasTransport: !!callData?.transport,
        hasPhoneCallProviderId: !!callData?.phoneCallProviderId,
        phoneCallProvider: callData?.phoneCallProvider,
        transportKeys: callData?.transport ? Object.keys(callData.transport) : [],
        transportData: callData?.transport || null, // Log full transport data for debugging
      });
    } catch (error) {
      console.error(`[VAPI Forward] ❌ Failed to fetch call data:`, error.message);
      return { forwarded: false, reason: "failed_to_fetch_call_data", error: error.message };
    }
    
    // STEP 2: Extract Telnyx call control ID from transport data
    console.log(`[VAPI Forward] Step 2: Extracting Telnyx call control ID...`);
    // Try callControlId first (this is what Telnyx needs for transfers)
    // Priority: callControlId > call_control_id > callLegId > call_leg_id
    const callControlId = callData?.transport?.callControlId || callData?.transport?.call_control_id || callData?.transport?.callLegId || callData?.transport?.call_leg_id;
    
    // Log which field we found
    let foundInField = 'unknown';
    if (callData?.transport?.callControlId) foundInField = 'callControlId';
    else if (callData?.transport?.call_control_id) foundInField = 'call_control_id';
    else if (callData?.transport?.callLegId) foundInField = 'callLegId';
    else if (callData?.transport?.call_leg_id) foundInField = 'call_leg_id';
    
    if (!callControlId) {
      console.error(`[VAPI Forward] ❌ Call control ID not found in call data`);
      console.error(`[VAPI Forward] Available transport data:`, JSON.stringify(callData?.transport || {}, null, 2));
      return { forwarded: false, reason: "call_control_id_not_found", callData: callData?.transport };
    }
    
    console.log(`[VAPI Forward] ✅ Found call control ID: ${callControlId} (from field: ${foundInField})`);
    console.log(`[VAPI Forward] Available transport fields:`, {
      callControlId: callData?.transport?.callControlId || 'NOT FOUND',
      call_control_id: callData?.transport?.call_control_id || 'NOT FOUND',
      callLegId: callData?.transport?.callLegId || 'NOT FOUND',
      call_leg_id: callData?.transport?.call_leg_id || 'NOT FOUND',
    });
    
    // STEP 3: Transfer call via Telnyx API
    console.log(`[VAPI Forward] Step 3: Transferring call via Telnyx API...`);
    try {
      const result = await forwardCallViaTelnyx(callControlId, e164Number);
      console.log(`[VAPI Forward] ✅✅✅ TRANSFER SUCCESSFUL via Telnyx API`);
      return { forwarded: true, method: "telnyx", result };
    } catch (telnyxError) {
      console.error(`[VAPI Forward] ❌ Telnyx transfer failed:`, telnyxError.message);
      console.error(`[VAPI Forward] Telnyx error details:`, telnyxError.response?.data || telnyxError.message);
      return { 
        forwarded: false, 
        reason: "telnyx_transfer_failed", 
        error: telnyxError.message,
        telnyxError: telnyxError.response?.data,
        callControlId,
      };
    }
    
  } catch (error) {
    // Catch-all for any unexpected errors - NEVER throw, always return error object
    console.error("[VAPI Forward] Unexpected error:", {
      callId,
      targetNumber,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    return { forwarded: false, reason: "unexpected_error", error: error.message };
  }
}

