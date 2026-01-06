// routes/phone-numbers.js
// Phone number management routes for customers and admins

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { Business } from '../models/Business.js';
import { AIAgent } from '../models/AIAgent.js';
import { AdminActivityLog } from '../models/AdminActivityLog.js';
import { 
  findUnassignedTelnyxNumbers,
  searchAvailablePhoneNumbers,
  purchaseTelnyxNumber,
  provisionPhoneNumber,
  checkIfNumberProvisionedInVAPI,
  createAssistant,
  rebuildAssistant,
  linkAssistantToNumber,
} from '../services/vapi.js';
import { acquirePhoneLock, releasePhoneLock } from '../utils/phoneLock.js';
import { canAssignPhoneNumber } from '../utils/phonePreflight.js';

const router = express.Router();

// Auto-assign unassigned phone number if available (for setup wizard)
router.post('/auto-assign', authenticate, async (req, res) => {
  try {
    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
        details: preflightCheck.details,
      });
    }

    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Check if business already has a phone number
    if (business.vapi_phone_number || business.telnyx_number) {
      return res.json({
        assigned: false,
        reason: 'Business already has a phone number',
        phone_number: business.vapi_phone_number || business.telnyx_number,
      });
    }

    // Find unassigned toll-free numbers
    const unassignedNumbers = await findUnassignedTelnyxNumbers(null);
    
    if (unassignedNumbers.length === 0) {
      return res.json({
        assigned: false,
        reason: 'No unassigned numbers available',
      });
    }

    // Get the first available number
    const selectedNumber = unassignedNumbers[0];
    const phoneNumber = selectedNumber.phoneNumber || selectedNumber.phone_number || selectedNumber.number;
    
    if (!phoneNumber) {
      return res.json({
        assigned: false,
        reason: 'Invalid number format',
      });
    }

    // Normalize phone number
    let phoneNumberE164 = phoneNumber.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.json({
        assigned: false,
        reason: 'Number is currently being assigned to another account',
      });
    }

    try {
      // Check if already in VAPI
      let phoneNumberId = null;
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
        console.log(`[Auto-Assign] Number already in VAPI, reusing ID: ${phoneNumberId}`);
      } else {
        // Provision to VAPI
        console.log(`[Auto-Assign] Provisioning number to VAPI...`);
        const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
        phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
        
        if (!phoneNumberId) {
          const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          if (vapiCheck) {
            phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        console.log(`[Auto-Assign] Using existing assistant: ${business.vapi_assistant_id}`);
      } else {
        // Create new assistant
        const { AIAgent } = await import('../models/AIAgent.js');
        const agent = await AIAgent.findByBusinessId(business.id);
        console.log(`[Auto-Assign] Creating new assistant...`);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
          ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
          takeout_orders_enabled: business.takeout_orders_enabled ?? false,
          businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
        });
      }

      const assistantId = assistant?.id || business.vapi_assistant_id;

      // Link assistant to phone number
      if (phoneNumberId && assistantId) {
        console.log(`[Auto-Assign] Linking assistant ${assistantId} to phone number ${phoneNumberId}...`);
        await linkAssistantToNumber(assistantId, phoneNumberId);
      }

      // Update business
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });

      // Rebuild assistant to ensure it's up to date
      if (assistantId) {
        try {
          await rebuildAssistant(business.id);
        } catch (rebuildError) {
          console.warn('[Auto-Assign] Assistant rebuild failed (non-critical):', rebuildError.message);
        }
      }

      releasePhoneLock(phoneNumberE164);

      res.json({
        assigned: true,
        phone_number: phoneNumberE164,
        assistant_id: assistantId,
      });
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Auto-assign phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to auto-assign phone number' });
  }
});

// Get available phone numbers for selection (customer)
router.get('/available', authenticate, async (req, res) => {
  try {
    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
        details: preflightCheck.details,
      });
    }

    const { areaCode } = req.query;
    
    // Don't show already-purchased numbers - they should be automatically assigned during signup
    // Only show numbers that need to be purchased
    // Search for available toll-free numbers to purchase (first number is included in subscription)
    // Only toll-free numbers are available - local numbers are not offered
    const availableToPurchase = await searchAvailablePhoneNumbers('US', 'toll-free', 10, areaCode || null);
    
    res.json({
      unassigned: [], // Already-purchased numbers are automatically assigned during signup, not shown here
      available: availableToPurchase.map(num => ({
        phone_number: num.phone_number,
        source: 'purchase',
        cost: 0, // First number is included in subscription, additional numbers will be charged separately
        region: num.region_information,
      })),
    });
  } catch (error) {
    console.error('Get available phone numbers error:', error);
    res.status(500).json({ error: 'Failed to get available phone numbers' });
  }
});

// Assign a phone number (customer)
router.post('/assign', authenticate, async (req, res) => {
  try {
    const { phone_number, purchase_new } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
      });
    }

    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Normalize phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.status(409).json({ 
        error: 'This phone number is currently being assigned to another account. Please try again in a moment.' 
      });
    }

    try {
      // If purchasing new, purchase from Telnyx first
      // OR if number already exists in Telnyx but not assigned, we still need to configure it
      if (purchase_new) {
        console.log(`[Phone Assign] Purchasing/verifying number ${phoneNumberE164} in Telnyx...`);
        await purchaseTelnyxNumber(phoneNumberE164, req.businessId);
        console.log(`[Phone Assign] ✅ Number verified/purchased in Telnyx`);
      } else {
        // Even if not purchasing new, verify the number exists in Telnyx
        // This handles the case where number exists but isn't assigned to a connection
        try {
          const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
          if (TELNYX_API_KEY) {
            const axios = (await import("axios")).default;
            const checkResponse = await axios.get(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumberE164)}`, {
              headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
            });
            
            if (checkResponse.data?.data && checkResponse.data.data.length > 0) {
              const existingNumber = checkResponse.data.data[0];
              console.log(`[Phone Assign] ✅ Number exists in Telnyx: ${phoneNumberE164}`);
              console.log(`[Phone Assign] Connection ID: ${existingNumber.connection_id || 'NOT SET'}`);
              // Number exists - we can proceed with assignment even if connection_id is not set
              // The number will be configured during provisioning
            } else {
              console.warn(`[Phone Assign] ⚠️  Number ${phoneNumberE164} not found in Telnyx. You may need to purchase it first.`);
            }
          }
        } catch (checkError) {
          console.warn(`[Phone Assign] Could not verify number in Telnyx:`, checkError.message);
          // Continue anyway - provisioning will handle it
        }
      }

      // Check if already in VAPI
      let phoneNumberId = null;
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
        console.log(`[Phone Assign] Number already in VAPI, reusing ID: ${phoneNumberId}`);
      } else {
        // Provision to VAPI
        console.log(`[Phone Assign] Provisioning number to VAPI...`);
        const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
        phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
        
        if (!phoneNumberId) {
          const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          if (vapiCheck) {
            phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        // Assistant exists, we'll link to it
        console.log(`[Phone Assign] Using existing assistant: ${business.vapi_assistant_id}`);
      } else {
        // Create new assistant
        const agent = await AIAgent.findByBusinessId(business.id);
        console.log(`[Phone Assign] Creating new assistant...`);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
          ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
          takeout_orders_enabled: business.takeout_orders_enabled ?? false,
          businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
        });
      }

      const assistantId = assistant?.id || business.vapi_assistant_id;

      // Link assistant to phone number
      if (phoneNumberId && assistantId) {
        console.log(`[Phone Assign] Linking assistant ${assistantId} to phone number ${phoneNumberId}...`);
        await linkAssistantToNumber(assistantId, phoneNumberId);
      }

      // Update business
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });

      // Rebuild assistant to ensure it's up to date
      if (assistantId) {
        try {
          await rebuildAssistant(business.id);
        } catch (rebuildError) {
          console.warn('[Phone Assign] Assistant rebuild failed (non-critical):', rebuildError.message);
        }
      }

      releasePhoneLock(phoneNumberE164);

      res.json({
        success: true,
        phone_number: phoneNumberE164,
        assistant_id: assistantId,
      });
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Assign phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to assign phone number' });
  }
});

// Admin: Assign phone number to business
router.post('/admin/assign/:businessId', authenticateAdmin, async (req, res) => {
  try {
    const { phone_number, purchase_new } = req.body;
    const { businessId } = req.params;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Normalize phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.status(409).json({ 
        error: 'This phone number is currently being assigned. Please try again in a moment.' 
      });
    }

    try {
      // If purchasing new, purchase from Telnyx first
      if (purchase_new) {
        console.log(`[Admin Phone Assign] Purchasing new number ${phoneNumberE164}...`);
        await purchaseTelnyxNumber(phoneNumberE164, businessId);
      }

      // Check if already in VAPI
      let phoneNumberId = null;
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
      } else {
        const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
        phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
        
        if (!phoneNumberId) {
          const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          if (vapiCheck) {
            phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        // Rebuild existing assistant
        await rebuildAssistant(business.id);
        assistant = { id: business.vapi_assistant_id };
      } else {
        const agent = await AIAgent.findByBusinessId(business.id);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
          ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
          takeout_orders_enabled: business.takeout_orders_enabled ?? false,
          businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
        });
      }

      const assistantId = assistant.id;

      // Link assistant to phone number
      if (phoneNumberId && assistantId) {
        await linkAssistantToNumber(assistantId, phoneNumberId);
      }

      // Update business
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });

      // Log admin activity
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: 'assign_phone_number',
        details: { 
          phone_number: phoneNumberE164,
          purchased_new: purchase_new || false,
        },
      });

      releasePhoneLock(phoneNumberE164);

      res.json({
        success: true,
        phone_number: phoneNumberE164,
        assistant_id: assistantId,
      });
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Admin assign phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to assign phone number' });
  }
});

// Admin: Change phone number for business
router.post('/admin/change/:businessId', authenticateAdmin, async (req, res) => {
  try {
    const { phone_number, purchase_new } = req.body;
    const { businessId } = req.params;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const oldPhoneNumber = business.vapi_phone_number;

    // Normalize new phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock for new number
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.status(409).json({ 
        error: 'This phone number is currently being assigned. Please try again in a moment.' 
      });
    }

    try {
      // If purchasing new, purchase from Telnyx first
      if (purchase_new) {
        console.log(`[Admin Phone Change] Purchasing new number ${phoneNumberE164}...`);
        await purchaseTelnyxNumber(phoneNumberE164, businessId);
      }

      // Check if already in VAPI
      let phoneNumberId = null;
      let provisioningWarning = null;
      
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
        console.log(`[Admin Phone Change] Number ${phoneNumberE164} already in VAPI, reusing ID: ${phoneNumberId}`);
      } else {
        // Number exists in Telnyx but not in VAPI - try to provision it
        try {
          console.log(`[Admin Phone Change] Number ${phoneNumberE164} exists in Telnyx but not in VAPI, provisioning...`);
          const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
          phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
          
          if (!phoneNumberId) {
            // Try to get it from VAPI after provisioning
            const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
            if (vapiCheck) {
              phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
              console.log(`[Admin Phone Change] Retrieved phoneNumberId from VAPI check: ${phoneNumberId}`);
            }
          }
        } catch (provisionError) {
          // If provisioning fails due to credential issues, this is CRITICAL - AI agent won't work
          const errorMessage = provisionError.message || '';
          if (errorMessage.includes('Credential') || errorMessage.includes('credential')) {
            console.error(`[Admin Phone Change] ❌ CRITICAL: Provisioning failed due to credential issue: ${errorMessage}`);
            console.error(`[Admin Phone Change] ❌ The AI agent will NOT work until this is fixed!`);
            provisioningWarning = `⚠️ CRITICAL: Phone number assigned but VAPI provisioning failed. THE AI AGENT WILL NOT ANSWER CALLS until this is fixed. Error: ${errorMessage}. Please configure VAPI_TELNYX_CREDENTIAL_ID in your .env file. See VAPI_CREDENTIAL_SETUP.md for instructions.`;
            
            // Check one more time if it got provisioned despite the error
            const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
            if (vapiCheck) {
              phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
              console.log(`[Admin Phone Change] ✅ Number was provisioned despite error, using ID: ${phoneNumberId}`);
              provisioningWarning = null; // Clear warning if it worked
            }
          } else {
            // Re-throw other errors
            throw provisionError;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        assistant = { id: business.vapi_assistant_id };
      } else {
        const agent = await AIAgent.findByBusinessId(business.id);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
          ai_enabled: business.ai_enabled ?? true, // Include ai_enabled to set greeting delay
          takeout_orders_enabled: business.takeout_orders_enabled ?? false,
          businessId: business.id, // CRITICAL: Include businessId in metadata for webhook lookup
        });
      }

      const assistantId = assistant.id;

      // Link assistant to new phone number (only if we have phoneNumberId)
      if (phoneNumberId && assistantId) {
        try {
          await linkAssistantToNumber(assistantId, phoneNumberId);
          console.log(`[Admin Phone Change] ✅ Linked assistant ${assistantId} to phone number ${phoneNumberId}`);
        } catch (linkError) {
          console.warn(`[Admin Phone Change] ⚠️  Failed to link assistant to number (non-critical): ${linkError.message}`);
          if (!provisioningWarning) {
            provisioningWarning = `Phone number assigned but failed to link to assistant: ${linkError.message}`;
          }
        }
      } else if (!phoneNumberId) {
        if (!provisioningWarning) {
          provisioningWarning = `⚠️ CRITICAL: Phone number assigned but not provisioned in VAPI. THE AI AGENT WILL NOT ANSWER CALLS. Please configure VAPI_TELNYX_CREDENTIAL_ID in your .env file and try again.`;
        }
      }

      // Update business (always update, even if VAPI provisioning failed)
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });
      
      // If phoneNumberId is missing, warn but don't fail
      if (!phoneNumberId) {
        console.warn(`[Admin Phone Change] ⚠️  Phone number ${phoneNumberE164} saved to business but not provisioned in VAPI.`);
        console.warn(`[Admin Phone Change] ⚠️  You may need to manually configure this number in VAPI dashboard.`);
      }

      // Rebuild assistant
      try {
        await rebuildAssistant(business.id);
      } catch (rebuildError) {
        console.warn('[Admin Phone Change] Assistant rebuild failed (non-critical):', rebuildError.message);
      }

      // Log admin activity
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: 'change_phone_number',
        details: { 
          old_phone_number: oldPhoneNumber,
          new_phone_number: phoneNumberE164,
          purchased_new: purchase_new || false,
        },
      });

      releasePhoneLock(phoneNumberE164);

      const response = {
        success: true,
        old_phone_number: oldPhoneNumber,
        new_phone_number: phoneNumberE164,
        assistant_id: assistantId,
      };
      
      // Include warning if provisioning had issues
      if (provisioningWarning) {
        response.warning = provisioningWarning;
      }

      res.json(response);
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Admin change phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to change phone number' });
  }
});

// Admin: Get available phone numbers
router.get('/admin/available', authenticateAdmin, async (req, res) => {
  try {
    const { areaCode } = req.query;
    
    // Admin can see ALL unassigned numbers (both toll-free and local) that are already purchased
    // We need to get all unassigned numbers, not just toll-free
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';
    const axios = (await import("axios")).default;
    const { supabaseClient } = await import("../config/database.js");
    const { isTollFree } = await import("../utils/phoneFormatter.js");
    
    // Get all phone numbers from Telnyx
    const telnyxResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'page[size]': 100,
      },
    });
    
    const allTelnyxNumbers = telnyxResponse.data?.data || [];
    
    // Get all assigned numbers
    const assignedNumbers = new Set();
    
    // Check businesses table
    const { data: businesses } = await supabaseClient
      .from('businesses')
      .select('vapi_phone_number, telnyx_number')
      .is('deleted_at', null);
    
    (businesses || []).forEach(b => {
      if (b.vapi_phone_number) {
        let normalized = b.vapi_phone_number.replace(/[^0-9+]/g, '');
        if (!normalized.startsWith('+')) normalized = '+' + normalized;
        assignedNumbers.add(normalized);
      }
      if (b.telnyx_number) {
        let normalized = b.telnyx_number.replace(/[^0-9+]/g, '');
        if (!normalized.startsWith('+')) normalized = '+' + normalized;
        assignedNumbers.add(normalized);
      }
    });
    
    // Check business_phone_numbers table
    try {
      const { data: businessPhoneNumbers } = await supabaseClient
        .from('business_phone_numbers')
        .select('phone_number')
        .eq('is_active', true);
      
      (businessPhoneNumbers || []).forEach(bpn => {
        if (bpn.phone_number) {
          let normalized = bpn.phone_number.replace(/[^0-9+]/g, '');
          if (!normalized.startsWith('+')) normalized = '+' + normalized;
          assignedNumbers.add(normalized);
        }
      });
    } catch (error) {
      // Table might not exist, continue
    }
    
    // Find all unassigned numbers (both toll-free and local)
    const allUnassignedNumbers = allTelnyxNumbers.filter(telnyxNum => {
      const telnyxPhone = telnyxNum.phone_number || telnyxNum.number;
      if (!telnyxPhone) return false;
      
      let normalized = telnyxPhone.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) normalized = '+' + normalized;
      
      return !assignedNumbers.has(normalized);
    });
    
    // Only toll-free numbers are available for purchase (first number included in subscription)
    const availableToPurchase = await searchAvailablePhoneNumbers('US', 'toll-free', 20, areaCode || null);
    
    // Deduplicate unassigned numbers by normalizing phone numbers
    // Show ALL purchased numbers (both toll-free and local)
    const seenUnassigned = new Set();
    const uniqueUnassigned = [];
    
    for (const num of allUnassignedNumbers) {
      const phoneNumber = num.phone_number || num.number;
      if (!phoneNumber) continue;
      
      // Normalize phone number for comparison
      let normalized = phoneNumber.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }
      
      // Only add if we haven't seen this number before
      if (!seenUnassigned.has(normalized)) {
        seenUnassigned.add(normalized);
        const isTollFreeNum = isTollFree(phoneNumber);
        uniqueUnassigned.push({
          phone_number: phoneNumber,
          source: 'existing',
          cost: 0, // Included in subscription
          is_toll_free: isTollFreeNum,
        });
      }
    }
    
    // Deduplicate available to purchase numbers
    const seenAvailable = new Set();
    const uniqueAvailable = [];
    
    for (const num of availableToPurchase) {
      const phoneNumber = num.phone_number;
      if (!phoneNumber) continue;
      
      // Normalize phone number for comparison
      let normalized = phoneNumber.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }
      
      // Only add if we haven't seen this number before (and it's not in unassigned)
      if (!seenAvailable.has(normalized) && !seenUnassigned.has(normalized)) {
        seenAvailable.add(normalized);
        uniqueAvailable.push({
          phone_number: phoneNumber,
          source: 'purchase',
          cost: 0, // First number included in subscription, additional numbers charged separately
          region: num.region_information,
        });
      }
    }
    
    res.json({
      unassigned: uniqueUnassigned,
      available: uniqueAvailable,
    });
  } catch (error) {
    console.error('Admin get available phone numbers error:', error);
    res.status(500).json({ error: 'Failed to get available phone numbers' });
  }
});

export default router;


