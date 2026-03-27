// routes/business.js
// Business settings management routes

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { Business } from "../models/Business.js";

const router = express.Router();

// Update business settings
router.put("/settings", authenticate, async (req, res) => {
  let updateData = {};
  try {
    console.log('[Business Settings] ========== SAVE REQUEST START ==========');
    console.log('[Business Settings] Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      ai_enabled,
      call_forward_rings,
      after_hours_behavior,
      allow_call_transfer,
      email_ai_answered,
      email_missed_calls,
      sms_enabled,
      sms_notification_number,
      sms_business_hours_enabled,
      sms_timezone,
      sms_allowed_start_time,
      sms_allowed_end_time,
      minutes_exhausted_behavior,
      overage_billing_enabled,
      overage_cap_minutes,
      max_call_duration_minutes,
      detect_conversation_end,
      takeout_orders_enabled,
      takeout_tax_rate,
      takeout_tax_calculation_method,
      takeout_estimated_ready_minutes,
      // Business info fields
      name,
      phone,
      address,
      timezone,
      public_phone_number,
      website,
    } = req.body;
    
    console.log('[Business Settings] Extracted values:', {
      name,
      phone,
      address,
      timezone,
      public_phone_number,
      website,
      takeout_orders_enabled,
    });

    updateData = {};
    if (ai_enabled !== undefined) updateData.ai_enabled = ai_enabled;
    if (call_forward_rings !== undefined) updateData.call_forward_rings = call_forward_rings;
    if (after_hours_behavior !== undefined) updateData.after_hours_behavior = after_hours_behavior;
    if (allow_call_transfer !== undefined) updateData.allow_call_transfer = allow_call_transfer;
    if (email_ai_answered !== undefined) updateData.email_ai_answered = email_ai_answered;
    if (email_missed_calls !== undefined) updateData.email_missed_calls = email_missed_calls;
    if (sms_enabled !== undefined) updateData.sms_enabled = sms_enabled;
    if (sms_notification_number !== undefined) updateData.sms_notification_number = sms_notification_number;
    if (sms_business_hours_enabled !== undefined) updateData.sms_business_hours_enabled = sms_business_hours_enabled;
    if (sms_timezone !== undefined) updateData.sms_timezone = sms_timezone;
    if (sms_allowed_start_time !== undefined) updateData.sms_allowed_start_time = sms_allowed_start_time;
    if (sms_allowed_end_time !== undefined) updateData.sms_allowed_end_time = sms_allowed_end_time;
    if (minutes_exhausted_behavior !== undefined) updateData.minutes_exhausted_behavior = minutes_exhausted_behavior;
    if (overage_billing_enabled !== undefined) updateData.overage_billing_enabled = overage_billing_enabled;
    if (overage_cap_minutes !== undefined) updateData.overage_cap_minutes = overage_cap_minutes;
    if (max_call_duration_minutes !== undefined) updateData.max_call_duration_minutes = max_call_duration_minutes;
    if (detect_conversation_end !== undefined) updateData.detect_conversation_end = detect_conversation_end;
    if (takeout_orders_enabled !== undefined) {
      updateData.takeout_orders_enabled = takeout_orders_enabled;
      console.log('[Business Settings] ✅ Adding takeout_orders_enabled to updateData:', takeout_orders_enabled);
    }
    if (takeout_tax_rate !== undefined) updateData.takeout_tax_rate = parseFloat(takeout_tax_rate);
    if (takeout_tax_calculation_method !== undefined) updateData.takeout_tax_calculation_method = takeout_tax_calculation_method;
    if (takeout_estimated_ready_minutes !== undefined) updateData.takeout_estimated_ready_minutes = parseInt(takeout_estimated_ready_minutes) || 30;
    // Business info fields
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (public_phone_number !== undefined) updateData.public_phone_number = public_phone_number;
    
    // Handle website - include it even if it's an empty string (user might want to clear it)
    if (website !== undefined) {
      updateData.website = website;
    } else if (website === null) {
      updateData.website = null;
    }

    // Get current business state BEFORE update to check if ai_enabled changed
    const currentBusiness = await Business.findById(req.businessId);
    const aiEnabledChanged = ai_enabled !== undefined && ai_enabled !== currentBusiness.ai_enabled;
    const newAiEnabled = ai_enabled !== undefined ? ai_enabled : currentBusiness.ai_enabled;

    // Update business settings in database
    console.log('[Business Settings] updateData being sent to Business.update:', JSON.stringify(updateData, null, 2));
    const updatedBusiness = await Business.update(req.businessId, updateData);
    if (!updatedBusiness) {
      return res.status(404).json({ error: "Business not found" });
    }
    console.log('[Business Settings] Updated business:', {
      id: updatedBusiness.id,
      name: updatedBusiness.name,
      phone: updatedBusiness.phone,
      address: updatedBusiness.address,
      website: updatedBusiness.website,
      public_phone_number: updatedBusiness.public_phone_number,
      timezone: updatedBusiness.timezone,
      ai_enabled: updatedBusiness.ai_enabled,
      takeout_orders_enabled: updatedBusiness.takeout_orders_enabled,
    });

    // CRITICAL: Unlink/link assistant from phone number when ai_enabled changes
    // This prevents the infinite loop where calls go: VAPI → Transfer → Business Number → VAPI (repeat)
    if (aiEnabledChanged && currentBusiness.vapi_assistant_id && currentBusiness.vapi_phone_number) {
      console.log(`[Business Settings] 🔄 AI enabled status changed from ${currentBusiness.ai_enabled} to ${newAiEnabled}`);
      (async () => {
        try {
          const { 
            unlinkAssistantFromNumber, 
            linkAssistantToNumber, 
            checkIfNumberProvisionedInVAPI 
          } = await import('../services/vapi.js');
          
          // Find the VAPI phone number ID
          const phoneNumberE164 = currentBusiness.vapi_phone_number;
          const vapiPhoneNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          
          if (!vapiPhoneNumber || !vapiPhoneNumber.id) {
            console.error(`[Business Settings] ❌ Could not find VAPI phone number for ${phoneNumberE164}`);
            return;
          }
          
          const phoneNumberId = vapiPhoneNumber.id || vapiPhoneNumber.phoneNumberId;
          
          if (newAiEnabled === false) {
            // AI disabled: Unlink assistant so calls bypass VAPI
            console.log(`[Business Settings] 🔗 Unlinking assistant from phone number (AI disabled)...`);
            await unlinkAssistantFromNumber(phoneNumberId);
            console.log(`[Business Settings] ✅ Assistant unlinked - calls will bypass VAPI`);
            
            // TODO: Configure Telnyx to forward calls directly to business number
            // This requires Telnyx API calls to update the connection/application settings
            console.log(`[Business Settings] ⚠️  NOTE: Telnyx forwarding must be configured manually in Telnyx dashboard`);
            console.log(`[Business Settings] ⚠️  Configure phone number ${phoneNumberE164} to forward to ${currentBusiness.public_phone_number}`);
          } else {
            // AI enabled: Link assistant back
            console.log(`[Business Settings] 🔗 Linking assistant back to phone number (AI enabled)...`);
            await linkAssistantToNumber(currentBusiness.vapi_assistant_id, phoneNumberId);
            console.log(`[Business Settings] ✅ Assistant linked - calls will go to VAPI`);
          }
        } catch (linkError) {
          console.error("[Business Settings] ❌❌❌ ERROR linking/unlinking assistant (non-blocking):", {
            message: linkError.message,
            stack: linkError.stack,
            response: linkError.response?.data,
          });
          // Don't fail the request if link/unlink fails
        }
      })();
    }

    // ALWAYS rebuild VAPI assistant when business settings change
    // This ensures the assistant has the latest business info (name, address, timezone, etc.)
    console.log("[Business Settings] 🔄 Triggering VAPI assistant rebuild...");
    (async () => {
      try {
        console.log("[Business Settings] Starting async rebuild process...");
        const { rebuildAssistant } = await import('../services/vapi.js');
        console.log("[Business Settings] Rebuild function imported, calling rebuildAssistant...");
        await rebuildAssistant(req.businessId);
        console.log("[Business Settings] ✅ VAPI assistant rebuilt successfully");
      } catch (vapiError) {
        console.error("[Business Settings] ❌❌❌ ERROR rebuilding VAPI assistant (non-blocking):", {
          message: vapiError.message,
          stack: vapiError.stack,
          code: vapiError.code,
          response: vapiError.response?.data,
        });
        // Don't fail the request if VAPI update fails
      }
    })();

    res.json({ success: true });
  } catch (error) {
    // Log full error details to console
    const errorDetails = {
      message: error?.message || String(error),
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
      businessId: req.businessId,
      updateData: updateData,
      errorType: error?.constructor?.name,
    };
    
    console.error("=== Update settings error ===");
    console.error("Error details:", errorDetails);
    console.error("Full error object:", JSON.stringify(errorDetails, null, 2));
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);
    console.error("Error hint:", error?.hint);
    console.error("===========================");
    
    // Provide more helpful error messages
    let errorMessage = error?.message || error?.details || String(error) || "Failed to update settings";
    
    // Handle specific Supabase/PostgreSQL error codes
    if (error?.code === 'PGRST116') {
      errorMessage = "Business not found";
    } else if (error?.code === '23505') {
      errorMessage = "A setting with this value already exists";
    } else if (error?.code === '42703') {
      errorMessage = `Invalid field name in settings: ${error?.hint || 'Unknown field'}`;
    } else if (error?.code === '23502') {
      errorMessage = `Required field is missing: ${error?.hint || 'Unknown field'}`;
    } else if (error?.code === '42P01') {
      errorMessage = "Database table not found - migrations may not have been run";
    } else if (error?.code === 'PGRST201') {
      errorMessage = `Column not found: ${error?.hint || 'Unknown column'}. Please run database migrations.`;
    }
    
    // Always return the actual error message in development
    const isDevelopment = process.env.NODE_ENV !== "production";
    
    // Send response directly - don't let error handler override it
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: errorMessage,
        code: error?.code,
        ...(isDevelopment && {
          details: {
            message: error?.message,
            hint: error?.hint,
            code: error?.code,
            updateData: updateData,
          },
        }),
      });
    }
  }
});

// Search for available phone numbers
// Search phone numbers (used by TelnyxPhoneNumberSelector)
router.get("/phone-numbers/search", authenticate, async (req, res) => {
  try {
    const { 
      countryCode = 'US', 
      phoneType, // Ignore frontend phoneType - always use toll-free
      limit = 20, 
      areaCode,
      locality,
      administrativeArea,
      phoneNumber 
    } = req.query;
    
    // Always use toll-free numbers (included in subscription)
    // Additional numbers beyond the first will be charged separately
    const enforcedPhoneType = 'toll-free';
    
    const { searchAvailablePhoneNumbers } = await import("../services/vapi.js");
    
    // If searching by specific phone number, we need to handle that differently
    // For now, use area code if phoneNumber looks like an area code
    let searchAreaCode = areaCode;
    if (phoneNumber && /^\d{3}$/.test(phoneNumber.replace(/[\s\-\(\)\+]/g, ''))) {
      searchAreaCode = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
    }
    
    const numbers = await searchAvailablePhoneNumbers(
      countryCode,
      enforcedPhoneType, // Always toll-free
      parseInt(limit),
      searchAreaCode || null
    );
    
    // If searching by specific phone number, filter results client-side
    let filteredNumbers = numbers;
    if (phoneNumber && phoneNumber.length > 3) {
      const cleanSearch = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
      filteredNumbers = numbers.filter(num => {
        const cleanNum = (num.phone_number || num.number || '').replace(/[\s\-\(\)\+]/g, '');
        return cleanNum.includes(cleanSearch);
      });
    }
    
    res.json({ numbers: filteredNumbers });
  } catch (error) {
    console.error("Search phone numbers error:", error);
    res.status(500).json({ error: error.message || "Failed to search phone numbers" });
  }
});

// Provision selected phone number
router.post("/phone-numbers/provision", authenticate, async (req, res) => {
  try {
    console.log('[Business Provision] ========== PROVISION REQUEST START ==========');
    console.log('[Business Provision] Business ID:', req.businessId);
    console.log('[Business Provision] Request body:', req.body);
    
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      console.error('[Business Provision] ❌ Phone number missing in request');
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    console.log('[Business Provision] Phone number to provision:', phoneNumber);
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error('[Business Provision] ❌ Business not found:', req.businessId);
      return res.status(404).json({ error: "Business not found" });
    }
    
    console.log('[Business Provision] Business found:', business.name);

    // If phone number already exists, return it
    if (business.vapi_phone_number) {
      return res.json({
        success: true,
        phone_number: business.vapi_phone_number,
        message: "Phone number already provisioned",
      });
    }

    // Create VAPI assistant if it doesn't exist
    console.log('[Business Provision] Step 1: Loading services...');
    const { createAssistant, provisionPhoneNumber, linkAssistantToNumber, purchaseTelnyxNumber } = await import("../services/vapi.js");
    const { initializeBillingCycle } = await import("../services/billing.js");
    const { AIAgent } = await import("../models/AIAgent.js");
    
    console.log('[Business Provision] Step 2: Finding AI agent...');
    const agent = await AIAgent.findByBusinessId(req.businessId);
    console.log('[Business Provision] Agent found:', agent ? 'Yes' : 'No');

    console.log('[Business Provision] Step 3: Checking for existing assistant...');
    let assistant;
    if (!business.vapi_assistant_id) {
      console.log('[Business Provision] No assistant found, creating new one...');
      // Create VAPI assistant
      assistant = await createAssistant({
        name: business.name,
        public_phone_number: business.public_phone_number || "",
        timezone: business.timezone || "America/New_York",
        business_hours: agent?.business_hours || {},
        faqs: agent?.faqs || [],
        contact_email: business.email,
        address: business.address || "",
        allow_call_transfer: business.allow_call_transfer ?? true,
        after_hours_behavior: business.after_hours_behavior || "take_message",
        opening_greeting: agent?.opening_greeting,
        ending_greeting: agent?.ending_greeting,
        personality: agent?.personality || 'professional',
        voice_provider: agent?.voice_provider || '11labs',
        voice_id: agent?.voice_id || '21m00Tcm4TlvDq8ikWAM',
        ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
        takeout_orders_enabled: business.takeout_orders_enabled ?? false,
        businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
      });
      
      // Store assistant ID
      console.log('[Business Provision] ✅ Assistant created:', assistant.id);
      await Business.update(req.businessId, { vapi_assistant_id: assistant.id });
    } else {
      console.log('[Business Provision] Using existing assistant:', business.vapi_assistant_id);
      // Fetch existing assistant
      const { getVapiClient } = await import("../services/vapi.js");
      const vapiClient = getVapiClient();
      const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
      assistant = assistantResponse.data;
      console.log('[Business Provision] ✅ Assistant retrieved');
    }

    // Check for unassigned numbers first, then purchase if needed
    console.log('[Business Provision] Step 4: Checking for phone numbers...');
    let telnyxNumber;
    let numberToUse = phoneNumber;
    
    // Extract area code from business phone for preference
    let preferredAreaCode = null;
    if (business.public_phone_number) {
      const { extractAreaCode } = await import("../utils/phoneFormatter.js");
      preferredAreaCode = extractAreaCode(business.public_phone_number);
      console.log('[Business Provision] Preferred area code:', preferredAreaCode);
    }
    
    // First, check if the selected number already exists in Telnyx (might be unassigned)
    console.log('[Business Provision] Checking for unassigned numbers...');
    const { findUnassignedTelnyxNumbers } = await import("../services/vapi.js");
    const unassignedNumbers = await findUnassignedTelnyxNumbers(preferredAreaCode);
    console.log('[Business Provision] Found unassigned numbers:', unassignedNumbers.length);
    
    // Check if the selected number is in the unassigned list
    const selectedNumberNormalized = phoneNumber.replace(/[^0-9+]/g, '');
    const isUnassigned = unassignedNumbers.some(num => {
      const numPhone = (num.phone_number || num.number || '').replace(/[^0-9+]/g, '');
      return numPhone === selectedNumberNormalized || numPhone === '+' + selectedNumberNormalized || '+' + numPhone === selectedNumberNormalized;
    });
    
    if (isUnassigned) {
      console.log(`[Business Provision] ✅ Selected number ${phoneNumber} is unassigned, reusing it`);
      // Find the matching number object
      telnyxNumber = unassignedNumbers.find(num => {
        const numPhone = (num.phone_number || num.number || '').replace(/[^0-9+]/g, '');
        return numPhone === selectedNumberNormalized || numPhone === '+' + selectedNumberNormalized || '+' + numPhone === selectedNumberNormalized;
      });
    } else if (unassignedNumbers.length > 0) {
      // Use an unassigned number instead of purchasing
      console.log(`[Business Provision] ✅ Found ${unassignedNumbers.length} unassigned numbers, reusing: ${unassignedNumbers[0].phone_number || unassignedNumbers[0].number}`);
      telnyxNumber = unassignedNumbers[0];
      numberToUse = telnyxNumber.phone_number || telnyxNumber.number;
    } else {
      // No unassigned numbers, purchase the selected one
      console.log(`[Business Provision] No unassigned numbers found, purchasing: ${phoneNumber}`);
      telnyxNumber = await purchaseTelnyxNumber(phoneNumber, req.businessId);
    }
    
    // Provision phone number to VAPI (this will use the Telnyx number)
    console.log('[Business Provision] Step 5: Provisioning phone number to VAPI:', numberToUse);
    const vapiPhoneNumber = await provisionPhoneNumber(
      numberToUse, // Use the number (reused or purchased)
      business.public_phone_number // Business phone for area code matching
    );
    console.log('[Business Provision] ✅ Phone number provisioned to VAPI:', vapiPhoneNumber);

    // Extract phone number from response
    const provisionedNumber =
      vapiPhoneNumber.phoneNumber ||
      vapiPhoneNumber.phone_number ||
      vapiPhoneNumber.number ||
      phoneNumber;

    // Link assistant to number
    try {
      await linkAssistantToNumber(assistant.id, vapiPhoneNumber.id);
      console.log(`[Business Provision] ✅ Assistant ${assistant.id} linked to phone number ${vapiPhoneNumber.id}`);
    } catch (linkError) {
      console.error(`[Business Provision] ⚠️  Failed to link assistant to number:`, linkError.message);
      // Don't fail the whole provisioning if linking fails - user can manually link in VAPI dashboard
      console.log(`[Business Provision] Phone number provisioned but not linked. Please link manually in VAPI dashboard.`);
    }

    // CRITICAL: Assign phone number to Voice API Application in Telnyx
    // This is required for calls to work - VAPI needs the number assigned to the Voice API Application
    try {
      const { getTelnyxCredentials } = await import("../services/vapi.js");
      const credentials = await getTelnyxCredentials();
      
      if (credentials.length > 0) {
        const credential = credentials[0];
        const voiceAppId = credential.telnyxApplicationId;
        
        if (voiceAppId) {
          console.log(`[Business Provision] Assigning number to Voice API Application: ${voiceAppId}`);
          
          const axios = (await import("axios")).default;
          const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
          const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";
          
          // Get phone number ID from Telnyx
          const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");
          const telnyxResponse = await axios.get(
            `${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`,
            {
              headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
            }
          );
          
          const telnyxNumbers = telnyxResponse.data?.data || [];
          if (telnyxNumbers.length > 0) {
            const telnyxNumberId = telnyxNumbers[0].id;
            
            // Assign to Voice API Application
            await axios.patch(
              `${TELNYX_API_BASE_URL}/phone_numbers/${telnyxNumberId}/voice`,
              { connection_id: voiceAppId },
              {
                headers: {
                  Authorization: `Bearer ${TELNYX_API_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );
            
            console.log(`[Business Provision] ✅ Number assigned to Voice API Application`);
            
            // CRITICAL: Assign phone number to Messaging Profile in Telnyx
            // This is required for SMS to work
            try {
              const MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;
              
              if (MESSAGING_PROFILE_ID) {
                console.log(`[Business Provision] Assigning number to Messaging Profile: ${MESSAGING_PROFILE_ID}`);
                
                await axios.patch(
                  `${TELNYX_API_BASE_URL}/phone_numbers/${telnyxNumberId}/messaging`,
                  { messaging_profile_id: MESSAGING_PROFILE_ID },
                  {
                    headers: {
                      Authorization: `Bearer ${TELNYX_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                  }
                );
                
                console.log(`[Business Provision] ✅ Number assigned to Messaging Profile`);
              } else {
                console.warn(`[Business Provision] ⚠️  TELNYX_MESSAGING_PROFILE_ID not set. SMS will not work until Messaging Profile is assigned manually.`);
              }
            } catch (messagingError) {
              console.error(`[Business Provision] ⚠️  Failed to assign number to Messaging Profile:`, messagingError.message);
              // Don't fail provisioning - number still works for voice, just SMS won't work
            }
          }
        } else {
          console.warn(`[Business Provision] ⚠️  No Voice API Application ID in credential`);
        }
      } else {
        console.warn(`[Business Provision] ⚠️  No Telnyx credentials found`);
      }
    } catch (assignError) {
      console.error(`[Business Provision] ⚠️  Failed to assign number to Voice API Application:`, assignError.message);
      // Don't fail provisioning - number still works, just needs manual assignment
    }

    // Store VAPI phone number in database
    await Business.update(req.businessId, { 
      vapi_phone_number: provisionedNumber,
      vapi_assistant_id: assistant.id, // Make sure assistant ID is stored
    });

    // Initialize billing cycle if not already done
    if (!business.next_billing_date) {
      await initializeBillingCycle(req.businessId, new Date());
    }

    // Mark onboarding as complete
    await Business.setOnboardingComplete(req.businessId);

    res.json({
      success: true,
      phone_number: provisionedNumber,
      message: "Phone number provisioned successfully",
    });
  } catch (error) {
    console.error("Provision phone number error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error response:", error.response?.data);
    
    let errorMessage = error.message || "Failed to provision phone number";
    
    // Check for common issues
    if (!process.env.VAPI_API_KEY) {
      errorMessage = "VAPI_API_KEY is not configured. Please contact support.";
    } else if (!process.env.TELNYX_API_KEY) {
      errorMessage = "TELNYX_API_KEY is not configured. Please contact support.";
    } else if (error.message.includes("credentialId") || error.response?.data?.message?.includes("credentialId")) {
      errorMessage = "VAPI phone provisioning requires a Telnyx credential. Please contact support.";
    } else if (error.response?.data?.message) {
      errorMessage = `VAPI error: ${error.response.data.message}`;
    } else if (error.response?.status === 401) {
      errorMessage = "Authentication failed. Please check API keys.";
    } else if (error.response?.status === 404) {
      errorMessage = "Resource not found. Please try again.";
    }
    
    // Include more details in development
    const isDevelopment = process.env.NODE_ENV !== "production";
    const errorResponse = {
      error: errorMessage,
      ...(isDevelopment && {
        details: {
          message: error.message,
          stack: error.stack,
          response: error.response?.data,
          status: error.response?.status,
        },
      }),
    };
    
    res.status(500).json(errorResponse);
  }
});

// Manually link assistant to phone number (if linking failed during provisioning)
router.post("/link-assistant", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ error: "No VAPI assistant found. Please create an assistant first." });
    }

    if (!business.vapi_phone_number) {
      return res.status(400).json({ error: "No VAPI phone number found. Please provision a phone number first." });
    }

    // Get the phone number ID from VAPI
    const { getVapiClient } = await import("../services/vapi.js");
    const vapiClient = getVapiClient();
    
    // List phone numbers to find the one matching our stored number
    const phoneNumbersRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneNumbersRes.data) ? phoneNumbersRes.data : (phoneNumbersRes.data?.data || []);
    
    const matchingNumber = phoneNumbers.find(
      pn => (pn.number === business.vapi_phone_number) || 
            (pn.phoneNumber === business.vapi_phone_number) ||
            (pn.phone_number === business.vapi_phone_number)
    );

    if (!matchingNumber) {
      return res.status(404).json({ 
        error: `Phone number ${business.vapi_phone_number} not found in VAPI. Please check VAPI dashboard.` 
      });
    }

    // Link assistant to number
    const { linkAssistantToNumber } = await import("../services/vapi.js");
    try {
      await linkAssistantToNumber(business.vapi_assistant_id, matchingNumber.id);
      
      res.json({
        success: true,
        message: "Assistant successfully linked to phone number",
        assistant_id: business.vapi_assistant_id,
        phone_number_id: matchingNumber.id,
        phone_number: business.vapi_phone_number,
      });
    } catch (linkError) {
      console.error(`[Link Assistant] Failed to link:`, linkError);
      res.status(500).json({
        error: linkError.message || "Failed to link assistant to phone number",
        assistant_id: business.vapi_assistant_id,
        phone_number_id: matchingNumber.id,
        phone_number: business.vapi_phone_number,
        details: linkError.response?.data,
      });
    }
  } catch (error) {
    console.error("Link assistant error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to link assistant to phone number",
      details: error.response?.data,
    });
  }
});

// Retry phone number activation (customer-facing) - DEPRECATED, use /phone-numbers/provision instead
router.post("/retry-activation", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // If phone number already exists, return it
    if (business.vapi_phone_number) {
      return res.json({
        success: true,
        phone_number: business.vapi_phone_number,
        message: "Phone number already provisioned",
      });
    }

    // Retry VAPI activation
    const { createAssistant, provisionPhoneNumber, linkAssistantToNumber } = await import("../services/vapi.js");
    const { initializeBillingCycle } = await import("../services/billing.js");
    const { AIAgent } = await import("../models/AIAgent.js");
    const agent = await AIAgent.findByBusinessId(req.businessId);

    // Create VAPI assistant
    const assistant = await createAssistant({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone || "America/New_York",
      business_hours: agent?.business_hours || {},
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
      after_hours_behavior: business.after_hours_behavior || "take_message",
      ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
      businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
    });

    // Provision phone number
    const phoneNumber = await provisionPhoneNumber(
      null, // No existing number
      business.public_phone_number // Business phone for area code matching
    );

    // Extract phone number from response
    const provisionedNumber =
      phoneNumber.phoneNumber ||
      phoneNumber.phone_number ||
      phoneNumber.number ||
      phoneNumber.id;

    if (!provisionedNumber) {
      throw new Error("Phone number was provisioned but no phone number value was returned from VAPI");
    }

    // Link assistant to number
    await linkAssistantToNumber(assistant.id, phoneNumber.id);

    // Store VAPI IDs in database
    await Business.setVapiAssistant(req.businessId, assistant.id, provisionedNumber);

    // Initialize billing cycle if not already done
    if (!business.next_billing_date) {
      await initializeBillingCycle(req.businessId, new Date());
    }

    // Mark onboarding as complete
    await Business.setOnboardingComplete(req.businessId);

    res.json({
      success: true,
      phone_number: provisionedNumber,
      message: "Phone number provisioned successfully",
    });
  } catch (error) {
    console.error("Retry activation error:", error);
    let errorMessage = error.message;
    if (error.message.includes("credentialId") || error.response?.data?.message?.includes("credentialId")) {
      errorMessage = "VAPI phone provisioning requires a Telnyx credential. Please contact support.";
    } else if (error.response?.data?.message) {
      errorMessage = `VAPI error: ${error.response.data.message}`;
    }
    res.status(500).json({ error: errorMessage });
  }
});

// Send test SMS
router.post("/test-sms", authenticate, async (req, res) => {
  console.log("[Test SMS] ========== TEST SMS REQUEST START ==========");
  console.log("[Test SMS] Business ID:", req.businessId);
  console.log("[Test SMS] Request body:", req.body);
  
  try {
    console.log("[Test SMS] Step 1: Fetching business...");
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error("[Test SMS] ❌ Business not found");
      return res.status(404).json({ error: "Business not found" });
    }
    console.log("[Test SMS] ✅ Business found:", {
      id: business.id,
      name: business.name,
      sms_enabled: business.sms_enabled,
      sms_notification_number: business.sms_notification_number,
    });

    // Allow test even if not saved - use request body or database value
    const smsEnabled = req.body.sms_enabled !== undefined ? req.body.sms_enabled : business.sms_enabled;
    const smsNumber = req.body.sms_notification_number || business.sms_notification_number;

    console.log("[Test SMS] Using SMS settings:", {
      sms_enabled: smsEnabled,
      sms_notification_number: smsNumber,
      from_request: req.body.sms_enabled !== undefined || !!req.body.sms_notification_number,
    });

    if (!smsEnabled) {
      console.error("[Test SMS] ❌ SMS not enabled");
      return res.status(400).json({ error: "SMS is not enabled. Please enable SMS notifications first." });
    }

    if (!smsNumber) {
      console.error("[Test SMS] ❌ SMS notification number not configured");
      return res.status(400).json({ error: "SMS notification number is not configured. Please add a phone number first." });
    }

    // Create a temporary business object with the test values
    const testBusiness = {
      ...business,
      sms_enabled: smsEnabled,
      sms_notification_number: smsNumber,
    };

    console.log("[Test SMS] Step 2: Importing notification service...");
    const { sendSMSNotification } = await import("../services/notifications.js");
    console.log("[Test SMS] ✅ Notification service imported");

    // Create a mock call session for the test SMS
    const mockCallSession = {
      id: "test-session-" + Date.now(),
      business_id: business.id,
      caller_name: "John Doe",
      caller_number: "+15551234567",
      started_at: new Date(),
      status: "completed",
      duration_seconds: 120,
    };
    console.log("[Test SMS] Step 3: Created mock call session:", mockCallSession);

    const mockSummary = "Test SMS: Customer called requesting urgent callback. This is a test message from Tavari.";
    console.log("[Test SMS] Step 4: Created mock summary:", mockSummary);

    console.log("[Test SMS] Step 5: Calling sendSMSNotification...");
    await sendSMSNotification(testBusiness, mockCallSession, mockSummary);
    console.log("[Test SMS] ✅ sendSMSNotification completed without error");

    console.log("[Test SMS] ========== TEST SMS REQUEST SUCCESS ==========");
    res.json({
      success: true,
      message: `Test SMS sent to ${smsNumber}`,
    });
  } catch (error) {
    console.error("[Test SMS] ========== TEST SMS REQUEST ERROR ==========");
    console.error("[Test SMS] Error message:", error.message);
    console.error("[Test SMS] Error stack:", error.stack);
    console.error("[Test SMS] Full error:", JSON.stringify(error, null, 2));
    res.status(500).json({
      error: error.message || "Failed to send test SMS",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Send test email
router.post("/test-email", authenticate, async (req, res) => {
  console.log("[Test Email] ========== TEST EMAIL REQUEST START ==========");
  console.log("[Test Email] Business ID:", req.businessId);
  
  try {
    console.log("[Test Email] Step 1: Fetching business...");
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error("[Test Email] ❌ Business not found");
      return res.status(404).json({ error: "Business not found" });
    }
    console.log("[Test Email] ✅ Business found:", {
      id: business.id,
      name: business.name,
      email: business.email,
      email_ai_answered: business.email_ai_answered,
    });

    console.log("[Test Email] Step 2: Importing notification service...");
    const { sendCallSummaryEmail } = await import("../services/notifications.js");
    console.log("[Test Email] ✅ Notification service imported");

    // Create a mock call session for the test email
    const mockCallSession = {
      id: "test-session-" + Date.now(),
      business_id: business.id,
      caller_name: "John Doe",
      caller_number: "+15551234567",
      started_at: new Date(),
      status: "completed",
      duration_seconds: 120,
    };
    console.log("[Test Email] Step 3: Created mock call session:", mockCallSession);

    // Mock transcript and summary
    const mockTranscript = "Caller: Hi, I'd like to place an order.\nAI: I'd be happy to help you with that. What would you like to order?\nCaller: I'll take a large pizza with pepperoni.\nAI: Great! I've noted your order. Is there anything else?\nCaller: No, that's all. Thanks!\nAI: You're welcome! Your order will be ready in about 30 minutes.";
    const mockSummary = "Customer called to place an order for a large pepperoni pizza. Order confirmed and will be ready in 30 minutes.";
    const mockIntent = "order";
    console.log("[Test Email] Step 4: Created mock data:", {
      transcriptLength: mockTranscript.length,
      summary: mockSummary,
      intent: mockIntent,
    });

    console.log("[Test Email] Step 5: Calling sendCallSummaryEmail...");
    await sendCallSummaryEmail(
      business,
      mockCallSession,
      mockTranscript,
      mockSummary,
      mockIntent,
      null // No message for this test
    );
    console.log("[Test Email] ✅ sendCallSummaryEmail completed without error");

    console.log("[Test Email] ========== TEST EMAIL REQUEST SUCCESS ==========");
    res.json({
      success: true,
      message: `Test email sent to ${business.email}`,
    });
  } catch (error) {
    console.error("[Test Email] ========== TEST EMAIL REQUEST ERROR ==========");
    console.error("[Test Email] Error message:", error.message);
    console.error("[Test Email] Error stack:", error.stack);
    console.error("[Test Email] Full error:", JSON.stringify(error, null, 2));
    res.status(500).json({
      error: error.message || "Failed to send test email",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Send test missed call email
router.post("/test-missed-call", authenticate, async (req, res) => {
  console.log("[Test Missed Call] ========== TEST MISSED CALL REQUEST START ==========");
  console.log("[Test Missed Call] Business ID:", req.businessId);
  
  try {
    console.log("[Test Missed Call] Step 1: Fetching business...");
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error("[Test Missed Call] ❌ Business not found");
      return res.status(404).json({ error: "Business not found" });
    }
    console.log("[Test Missed Call] ✅ Business found:", {
      id: business.id,
      name: business.name,
      email: business.email,
      email_missed_calls: business.email_missed_calls,
    });

    // Allow test even if not saved - use request body or database value
    const emailMissedCalls = req.body.email_missed_calls !== undefined ? req.body.email_missed_calls : business.email_missed_calls;

    if (!emailMissedCalls) {
      console.error("[Test Missed Call] ❌ Email for missed calls not enabled");
      return res.status(400).json({ error: "Email for missed calls is not enabled. Please enable it first." });
    }

    console.log("[Test Missed Call] Step 2: Importing notification service...");
    const { sendMissedCallEmail } = await import("../services/notifications.js");
    console.log("[Test Missed Call] ✅ Notification service imported");

    // Create a mock call session for the test email (simulating a forwarded call)
    const mockCallSession = {
      id: "test-session-" + Date.now(),
      business_id: business.id,
      caller_name: "Jane Smith",
      caller_number: "+15559876543",
      started_at: new Date(),
      status: "forwarded", // Simulating a forwarded call
      duration_seconds: 45,
    };
    console.log("[Test Missed Call] Step 3: Created mock call session:", mockCallSession);

    console.log("[Test Missed Call] Step 4: Calling sendMissedCallEmail...");
    await sendMissedCallEmail(
      { ...business, email_missed_calls: emailMissedCalls },
      mockCallSession
    );
    console.log("[Test Missed Call] ✅ sendMissedCallEmail completed without error");

    console.log("[Test Missed Call] ========== TEST MISSED CALL REQUEST SUCCESS ==========");
    res.json({
      success: true,
      message: `Test missed call email sent to ${business.email}`,
    });
  } catch (error) {
    console.error("[Test Missed Call] ========== TEST MISSED CALL REQUEST ERROR ==========");
    console.error("[Test Missed Call] Error message:", error.message);
    console.error("[Test Missed Call] Error stack:", error.stack);
    console.error("[Test Missed Call] Full error:", JSON.stringify(error, null, 2));
    res.status(500).json({
      error: error.message || "Failed to send test missed call email",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * Generate or regenerate kiosk access token
 * POST /api/business/kiosk-token
 */
router.post("/kiosk-token", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Generate new token: kiosk_<business_id>_<random_64_chars>
    const crypto = await import('crypto');
    const randomString = crypto.randomBytes(32).toString('hex');
    const kioskToken = `kiosk_${req.businessId}_${randomString}`;
    
    // Update business with new token
    const updatedBusiness = await Business.update(req.businessId, {
      kiosk_access_token: kioskToken,
      kiosk_token_created_at: new Date().toISOString(),
    });
    
    console.log(`[Business] ✅ Generated kiosk token for business: ${business.name}`);
    
    res.json({
      success: true,
      token: kioskToken,
      kiosk_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/kiosk?token=${kioskToken}`,
      created_at: updatedBusiness.kiosk_token_created_at,
    });
  } catch (error) {
    console.error('[Business] Error generating kiosk token:', error);
    res.status(500).json({ error: error.message || 'Failed to generate kiosk token' });
  }
});

/**
 * Get current kiosk token (if exists)
 * GET /api/business/kiosk-token
 */
router.get("/kiosk-token", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    if (!business.kiosk_access_token) {
      return res.json({
        success: true,
        token: null,
        kiosk_url: null,
        message: 'No kiosk token generated yet. Generate one to enable kiosk access.',
      });
    }
    
    res.json({
      success: true,
      token: business.kiosk_access_token,
      kiosk_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/kiosk?token=${business.kiosk_access_token}`,
      created_at: business.kiosk_token_created_at,
    });
  } catch (error) {
    console.error('[Business] Error fetching kiosk token:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch kiosk token' });
  }
});

/**
 * Revoke kiosk token
 * DELETE /api/business/kiosk-token
 */
router.delete("/kiosk-token", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Remove token
    await Business.update(req.businessId, {
      kiosk_access_token: null,
      kiosk_token_created_at: null,
    });
    
    console.log(`[Business] ✅ Revoked kiosk token for business: ${business.name}`);
    
    res.json({
      success: true,
      message: 'Kiosk token revoked successfully',
    });
  } catch (error) {
    console.error('[Business] Error revoking kiosk token:', error);
    res.status(500).json({ error: error.message || 'Failed to revoke kiosk token' });
  }
});

export default router;

