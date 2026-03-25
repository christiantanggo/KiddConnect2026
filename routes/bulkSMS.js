// routes/bulkSMS.js
// Bulk SMS campaign API routes

import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { SMSCampaign } from '../models/SMSCampaign.js';
import { SMSCampaignRecipient } from '../models/SMSCampaignRecipient.js';
import { SMSOptOut } from '../models/SMSOptOut.js';
import { Contact } from '../models/Contact.js';
import { ContactList } from '../models/ContactList.js';
import {
  parseCSV,
  getAvailableSMSNumbers,
  calculateTotalThroughput,
  sendBulkSMS,
  getCampaignStatus,
  cancelCampaign,
  recoverStuckCampaign,
  diagnoseStuckCampaign,
  resumeStuckCampaign,
} from '../services/bulkSMS.js';
import { validatePhoneNumbersForBulk, formatPhoneNumberE164 } from '../utils/phoneFormatter.js';
import { supabaseClient } from '../config/database.js';
import { sendSMSDirect } from '../services/notifications.js';
import { getApiPublicBaseUrl } from '../config/public-urls.js';

const router = express.Router();

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
});

/**
 * Create a new SMS campaign from selected contacts/lists
 * POST /api/bulk-sms/campaigns
 */
router.post('/campaigns', authenticate, async (req, res) => {
  try {
    const { name, message_text, contact_ids = [], list_ids = [], send_to_all = false, exclude_sent_today = false } = req.body;
    
    if (!name || !message_text) {
      return res.status(400).json({ 
        error: 'Campaign name and message text are required' 
      });
    }
    
    if (!send_to_all && contact_ids.length === 0 && list_ids.length === 0) {
      return res.status(400).json({ 
        error: 'Please select at least one contact or list, or enable "Send to All Contacts"' 
      });
    }
    
    if (message_text.length > 1600) {
      return res.status(400).json({ 
        error: 'Message text cannot exceed 1600 characters (10 SMS messages)' 
      });
    }
    
    // Contact and ContactList are already imported at the top of the file
    
    // Collect all contacts from selected contact IDs and list IDs
    const allContacts = [];
    const contactIdSet = new Set();
    
    // Import compliance checking utilities
    const { checkConsent, checkFrequencyLimits, detectCountry } = await import('../services/compliance.js');
    
    // If send_to_all is true, fetch all contacts for the business
    if (send_to_all) {
      console.log(`[BulkSMS] Loading ALL contacts for business ${req.businessId}...`);
      try {
        // Get total count first
        const { count } = await supabaseClient
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', req.businessId);
        
        const totalContacts = count || 0;
        console.log(`[BulkSMS] Found ${totalContacts} total contacts in business`);
        
        // Fetch all contacts in batches of 1000 (Supabase limit)
        const allBusinessContacts = [];
        const batchSize = 1000;
        let currentOffset = 0;
        
        while (allBusinessContacts.length < totalContacts && currentOffset < 100000) { // Cap at 100k for safety
          const batch = await Contact.findByBusinessId(req.businessId, batchSize, currentOffset);
          if (batch.length === 0) break;
          allBusinessContacts.push(...batch);
          currentOffset += batchSize;
          console.log(`[BulkSMS] Loaded batch: ${allBusinessContacts.length}/${totalContacts} contacts`);
          if (batch.length < batchSize) break; // No more contacts
        }
        
        console.log(`[BulkSMS] ✅ Loaded ${allBusinessContacts.length} contacts total from database`);
        
        // Add all contacts that have phone numbers and haven't opted out
        let skippedNoConsent = 0;
        let skippedOptedOut = 0;
        let skippedNoPhone = 0;
        let skippedSentToday = 0;
        
        for (const contact of allBusinessContacts) {
          if (!contact.phone_number) {
            skippedNoPhone++;
            continue;
          }
          
          if (contact.opted_out) {
            skippedOptedOut++;
            continue;
          }
          
          // Check SMS consent (TCPA/CASL compliance)
          const country = detectCountry(contact.phone_number);
          const consentCheck = checkConsent(contact, country);
          
          if (!consentCheck.hasConsent) {
            skippedNoConsent++;
            continue;
          }
          
          // Check if we should exclude contacts who received messages today
          if (exclude_sent_today && contact.last_sms_sent_at) {
            const lastSentDate = new Date(contact.last_sms_sent_at);
            const today = new Date();
            // Check if last sent was today (same day)
            if (lastSentDate.toDateString() === today.toDateString()) {
              skippedSentToday++;
              continue;
            }
          }
          
          if (!contactIdSet.has(contact.id)) {
            allContacts.push(contact);
            contactIdSet.add(contact.id);
          }
        }
        
        console.log(`[BulkSMS] Loaded ${allContacts.length} valid contacts from all business contacts`);
        console.log(`[BulkSMS] Skipped: ${skippedNoConsent} no consent, ${skippedOptedOut} opted out, ${skippedNoPhone} no phone${exclude_sent_today ? `, ${skippedSentToday || 0} sent today` : ''}`);
      } catch (error) {
        console.error('[BulkSMS] Error loading all contacts:', error);
        return res.status(500).json({ 
          error: 'Failed to load all contacts: ' + error.message 
        });
      }
    }
    
      // Get contacts from selected contact IDs
      if (contact_ids.length > 0) {
        console.log(`[BulkSMS] Loading ${contact_ids.length} individual contacts...`);
        let skippedNoConsent = 0;
        let skippedOptedOut = 0;
        let skippedNoPhone = 0;
        let skippedSentToday = 0;
      
      for (const contactId of contact_ids) {
        try {
          const contact = await Contact.findById(contactId);
          if (!contact || contact.business_id !== req.businessId) {
            continue;
          }
          
          if (!contact.phone_number) {
            skippedNoPhone++;
            continue;
          }
          
          if (contact.opted_out) {
            skippedOptedOut++;
            continue;
          }
          
          // Check SMS consent (TCPA/CASL compliance)
          const country = detectCountry(contact.phone_number);
          const consentCheck = checkConsent(contact, country);
          
          if (!consentCheck.hasConsent) {
            skippedNoConsent++;
            console.warn(`[BulkSMS] Contact ${contactId} (${contact.phone_number}) does not have SMS consent: ${consentCheck.reason}`);
            continue; // Skip this contact
          }
          
          // Check frequency limits
          const frequencyCheck = checkFrequencyLimits(contact, {
            maxPerDay: 1,
            maxPerWeek: 3,
            maxPerMonth: 10,
          });
          
          if (!frequencyCheck.allowed) {
            console.warn(`[BulkSMS] Contact ${contactId} (${contact.phone_number}) exceeds frequency limits: ${frequencyCheck.reason}`);
            // Still add to campaign but mark for later sending
          }
          
          if (!contactIdSet.has(contact.id)) {
            allContacts.push(contact);
            contactIdSet.add(contact.id);
          }
        } catch (contactError) {
          console.error(`[BulkSMS] Error loading contact ${contactId}:`, contactError);
          // Continue with other contacts
        }
      }
      console.log(`[BulkSMS] Loaded ${allContacts.length} valid contacts from individual selection`);
      console.log(`[BulkSMS] Skipped: ${skippedNoConsent} no consent, ${skippedOptedOut} opted out, ${skippedNoPhone} no phone${exclude_sent_today ? `, ${skippedSentToday || 0} sent today` : ''}`);
    }
    
    // Get contacts from selected lists
    if (list_ids.length > 0) {
      for (const listId of list_ids) {
        try {
          const list = await ContactList.findById(listId);
          if (!list || list.business_id !== req.businessId) {
            console.log(`[BulkSMS] List ${listId} not found or access denied`);
            continue;
          }
          
          const listContacts = await ContactList.getContacts(listId);
          console.log(`[BulkSMS] Found ${listContacts.length} contacts in list ${listId}`);
          
          for (const contact of listContacts) {
            // Filter out null contacts (deleted contacts that are still in list)
            if (!contact || !contact.id) {
              continue;
            }
            
            // Verify contact belongs to this business
            if (contact.business_id !== req.businessId) {
              continue;
            }
            
            if (!contact.opted_out && contact.phone_number) {
              // Check SMS consent (TCPA/CASL compliance)
              const country = detectCountry(contact.phone_number);
              const consentCheck = checkConsent(contact, country);
              
              if (!consentCheck.hasConsent) {
                console.warn(`[BulkSMS] Contact ${contact.id} (${contact.phone_number}) in list ${listId} does not have SMS consent: ${consentCheck.reason}`);
                continue; // Skip this contact
              }
              
              // Check if we should exclude contacts who received messages today
              if (exclude_sent_today && contact.last_sms_sent_at) {
                const lastSentDate = new Date(contact.last_sms_sent_at);
                const today = new Date();
                // Check if last sent was today (same day)
                if (lastSentDate.toDateString() === today.toDateString()) {
                  console.log(`[BulkSMS] Contact ${contact.id} (${contact.phone_number}) in list ${listId} received message today, skipping`);
                  continue;
                }
              }
              
              // Check frequency limits
              const frequencyCheck = checkFrequencyLimits(contact, {
                maxPerDay: 1,
                maxPerWeek: 3,
                maxPerMonth: 10,
              });
              
              if (!frequencyCheck.allowed) {
                console.warn(`[BulkSMS] Contact ${contact.id} (${contact.phone_number}) in list ${listId} exceeds frequency limits: ${frequencyCheck.reason}`);
                // Still add to campaign but mark for later sending
              }
              
              if (!contactIdSet.has(contact.id)) {
                allContacts.push(contact);
                contactIdSet.add(contact.id);
              }
            }
          }
        } catch (listError) {
          console.error(`[BulkSMS] Error loading list ${listId}:`, listError);
          // Continue with other lists
        }
      }
    }
    
    if (allContacts.length === 0) {
      return res.status(400).json({ 
        error: 'No valid contacts found. Make sure contacts have phone numbers, are not opted out, and have provided SMS consent (required for TCPA/CASL compliance).',
        details: 'Contacts must have: 1) Phone number, 2) Not opted out, 3) SMS consent (sms_consent = true with timestamp)'
      });
    }
    
    // Extract and validate phone numbers
    const phoneNumbers = allContacts.map(c => c.phone_number).filter(Boolean);
    const { valid, invalid, duplicates } = validatePhoneNumbersForBulk(phoneNumbers);
    
    if (valid.length === 0) {
      return res.status(400).json({ 
        error: 'No valid phone numbers found',
        invalid,
        duplicates,
      });
    }
    
    // Create a map of valid phone numbers to their contact info
    const validPhoneSet = new Set(valid);
    const contactsMap = new Map();
    allContacts.forEach(contact => {
      const formattedPhone = formatPhoneNumberE164(contact.phone_number);
      if (validPhoneSet.has(formattedPhone)) {
        contactsMap.set(formattedPhone, contact);
      }
    });
    
    // Check opt-outs
    const optOuts = await SMSOptOut.findByBusinessId(req.businessId);
    const optOutSet = new Set(optOuts.map(o => o.phone_number));
    const filteredNumbers = valid.filter(num => !optOutSet.has(num));
    const optedOutCount = valid.length - filteredNumbers.length;
    
    if (filteredNumbers.length === 0) {
      return res.status(400).json({ 
        error: 'All phone numbers are opted out',
        optedOutCount,
      });
    }
    
    // Create campaign
    const campaign = await SMSCampaign.create({
      business_id: req.businessId,
      name,
      message_text,
      total_recipients: filteredNumbers.length,
    });
    
    // Create recipient records with contact information
    const recipients = filteredNumbers.map(phoneNumber => {
      const contact = contactsMap.get(phoneNumber) || {};
      return {
        campaign_id: campaign.id,
        phone_number: phoneNumber,
        email: contact.email || null,
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        status: 'pending',
      };
    });
    
    await SMSCampaignRecipient.createBatch(recipients);
    
    console.log(`[BulkSMS Route] ========== STARTING BACKGROUND SEND ==========`);
    console.log(`[BulkSMS Route] Campaign ID: ${campaign.id}`);
    console.log(`[BulkSMS Route] Business ID: ${req.businessId}`);
    console.log(`[BulkSMS Route] Message: ${message_text.substring(0, 50)}...`);
    console.log(`[BulkSMS Route] Recipients: ${filteredNumbers.length}`);
    console.log(`[BulkSMS Route] Checking if sendBulkSMS is imported...`);
    console.log(`[BulkSMS Route] sendBulkSMS type:`, typeof sendBulkSMS);
    console.log(`[BulkSMS Route] Calling sendBulkSMS function...`);
    
    // Start sending in background (don't await)
    // IMPORTANT: Wrap in try-catch and log immediately to ensure it's being called
    // Use process.nextTick to ensure it runs in the next event loop cycle
    process.nextTick(async () => {
      try {
        console.log(`[BulkSMS Route] ✅ Inside async wrapper, about to call sendBulkSMS...`);
        console.log(`[BulkSMS Route] Parameters:`, {
          campaignId: campaign.id,
          businessId: req.businessId,
          messageTextLength: message_text.length,
          phoneNumbersCount: filteredNumbers.length,
        });
        
        if (typeof sendBulkSMS !== 'function') {
          throw new Error(`sendBulkSMS is not a function! Type: ${typeof sendBulkSMS}`);
        }
        
        // Check if user has admin override permission (for quiet hours bypass)
        const { User } = await import('../models/User.js');
        const user = await User.findById(req.user.id);
        const isAdmin = user?.role === 'admin';
        const overrideQuietHours = req.body.override_quiet_hours === true && isAdmin;
        
        if (overrideQuietHours) {
          console.log(`[BulkSMS Route] ⚠️  Admin override enabled - bypassing quiet hours restrictions`);
        }
        
        await sendBulkSMS(campaign.id, req.businessId, message_text, filteredNumbers, {
          overrideQuietHours,
        });
        console.log(`[BulkSMS Route] ✅ sendBulkSMS completed successfully for campaign ${campaign.id}`);
      } catch (error) {
        console.error(`[BulkSMS Route] ❌ CRITICAL ERROR in sendBulkSMS for campaign ${campaign.id}:`, error);
        console.error(`[BulkSMS Route] Error message:`, error.message);
        console.error(`[BulkSMS Route] Error stack:`, error.stack);
        
        // Update campaign status to failed
        try {
          await SMSCampaign.updateStatus(campaign.id, 'failed', {
            error_summary: {
              message: error.message,
              stack: error.stack?.substring(0, 1000), // Limit stack trace length
            },
          });
          console.log(`[BulkSMS Route] ✅ Campaign ${campaign.id} marked as failed`);
        } catch (updateError) {
          console.error(`[BulkSMS Route] ❌ Failed to update campaign status:`, updateError);
        }
        console.error(`[BulkSMS Route] Error stack:`, error.stack);
        console.error(`[BulkSMS Route] Error name:`, error.name);
        console.error(`[BulkSMS Route] Error code:`, error.code);
        if (error.response) {
          console.error(`[BulkSMS Route] Error response:`, JSON.stringify(error.response.data, null, 2));
        }
        
        // Update campaign status to failed
        try {
          await SMSCampaign.updateStatus(campaign.id, 'failed', {
            error_summary: { 
              message: error.message, 
              stack: error.stack,
              name: error.name,
              code: error.code,
            },
          });
        } catch (updateError) {
          console.error(`[BulkSMS Route] Failed to update campaign status:`, updateError);
        }
      }
    });
    
    console.log(`[BulkSMS Route] Background send process initiated (non-blocking)`);
    
    res.status(201).json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        total_recipients: campaign.total_recipients,
        status: campaign.status,
      },
      stats: {
        valid: filteredNumbers.length,
        invalid: invalid.length,
        duplicates: duplicates.length,
        optedOut: optedOutCount,
      },
      message: 'Campaign created and sending started',
    });
  } catch (error) {
    console.error('[BulkSMS Route] Create campaign error:', error);
    console.error('[BulkSMS Route] Error details:', JSON.stringify(error, null, 2));
    
    // Check if it's a missing column error
    if (error.message && (
      error.message.includes('column') || 
      error.message.includes('does not exist') ||
      error.code === '42703' || // PostgreSQL undefined_column
      error.message.includes('email') ||
      error.message.includes('first_name') ||
      error.message.includes('last_name')
    )) {
      return res.status(500).json({ 
        error: 'Database schema error: Missing columns in sms_campaign_recipients table',
        message: 'Please run the migration: MIGRATION_RUN_NOW.sql in Supabase SQL Editor',
        details: error.message,
        fix: 'Run: ALTER TABLE sms_campaign_recipients ADD COLUMN IF NOT EXISTS email VARCHAR(255), ADD COLUMN IF NOT EXISTS first_name VARCHAR(100), ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);'
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to create campaign',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get all campaigns for business
 * GET /api/bulk-sms/campaigns
 */
router.get('/campaigns', authenticate, async (req, res) => {
  try {
    const campaigns = await SMSCampaign.findByBusinessId(req.businessId);
    
    // Get stats for each campaign
    const campaignsWithStats = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          const stats = await SMSCampaignRecipient.getCampaignStats(campaign.id);
          return {
            ...campaign,
            stats,
            progress: campaign.total_recipients > 0 
              ? Math.round((stats.sent / campaign.total_recipients) * 100) 
              : 0,
          };
        } catch (statsError) {
          // If stats fail (table might not exist), return campaign without stats
          console.warn('[BulkSMS Route] Failed to get stats for campaign:', campaign.id, statsError.message);
          return {
            ...campaign,
            stats: { total: 0, pending: 0, sent: 0, failed: 0 },
            progress: 0,
          };
        }
      })
    );
    
    res.json({ campaigns: campaignsWithStats });
  } catch (error) {
    console.error('[BulkSMS Route] Get campaigns error:', error);
    console.error('[BulkSMS Route] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    // If table doesn't exist or any database error, return empty array
    if (error.message && (
      error.message.includes('does not exist') || 
      error.message.includes('relation') ||
      error.code === '42P01' || // PostgreSQL: relation does not exist
      error.code === 'PGRST116' // Supabase: no rows returned (but also used for missing table)
    )) {
      console.log('[BulkSMS Route] Table does not exist, returning empty campaigns array');
      return res.json({ campaigns: [] });
    }
    res.status(500).json({ 
      error: error.message || 'Failed to get campaigns' 
    });
  }
});

/**
 * Get campaign details
 * GET /api/bulk-sms/campaigns/:id
 */
router.get('/campaigns/:id', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const status = await getCampaignStatus(req.params.id);
    res.json({ campaign: status });
  } catch (error) {
    console.error('[BulkSMS Route] Get campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get campaign' 
    });
  }
});

/**
 * Cancel a campaign
 * POST /api/bulk-sms/campaigns/:id/cancel
 */
router.post('/campaigns/:id/cancel', authenticate, async (req, res) => {
  try {
    console.log(`[BulkSMS Route] Cancel campaign request for: ${req.params.id}`);
    console.log(`[BulkSMS Route] Business ID: ${req.businessId}`);
    
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      console.error(`[BulkSMS Route] Campaign ${req.params.id} not found`);
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    console.log(`[BulkSMS Route] Campaign found:`, {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      business_id: campaign.business_id,
    });
    
    if (campaign.business_id !== req.businessId) {
      console.error(`[BulkSMS Route] Access denied - business ID mismatch`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    console.log(`[BulkSMS Route] Calling cancelCampaign function...`);
    await cancelCampaign(req.params.id);
    console.log(`[BulkSMS Route] ✅ Campaign cancelled successfully`);
    
    res.json({ success: true, message: 'Campaign cancelled' });
  } catch (error) {
    console.error('[BulkSMS Route] ❌ Cancel campaign error:', error);
    console.error('[BulkSMS Route] Error message:', error.message);
    console.error('[BulkSMS Route] Error stack:', error.stack);
    console.error('[BulkSMS Route] Error code:', error.code);
    console.error('[BulkSMS Route] Error details:', error.details);
    
    res.status(500).json({ 
      error: error.message || 'Failed to cancel campaign',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Delete a campaign
 * DELETE /api/bulk-sms/campaigns/:id
 */
router.delete('/campaigns/:id', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete campaign (recipients will be deleted via CASCADE)
    const { error } = await supabaseClient
      .from('sms_campaigns')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    console.error('[BulkSMS Route] Delete campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to delete campaign' 
    });
  }
});

/**
 * Pause a campaign
 * POST /api/bulk-sms/campaigns/:id/pause
 */
router.post('/campaigns/:id/pause', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (campaign.status !== 'pending' && campaign.status !== 'processing') {
      return res.status(400).json({ 
        error: `Cannot pause campaign with status: ${campaign.status}` 
      });
    }
    
    await SMSCampaign.updateStatus(req.params.id, 'paused');
    res.json({ success: true, message: 'Campaign paused' });
  } catch (error) {
    console.error('[BulkSMS Route] Pause campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to pause campaign' 
    });
  }
});

/**
 * Restart a paused campaign
 * POST /api/bulk-sms/campaigns/:id/restart
 */
router.post('/campaigns/:id/restart', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (campaign.status !== 'paused') {
      return res.status(400).json({ 
        error: `Can only restart paused campaigns. Current status: ${campaign.status}` 
      });
    }
    
    // Reset campaign status and counts
    await SMSCampaign.update(req.params.id, {
      status: 'pending',
      sent_count: 0,
      failed_count: 0,
      started_at: null,
      completed_at: null,
    });
    
    // Reset all recipient statuses to pending
    const { error: recipientError } = await supabaseClient
      .from('sms_campaign_recipients')
      .update({ 
        status: 'pending',
        sent_at: null,
        telnyx_message_id: null,
        error_message: null,
      })
      .eq('campaign_id', req.params.id);
    
    if (recipientError) {
      console.error('[BulkSMS Route] Error resetting recipients:', recipientError);
    }
    
    // Start sending again
    sendBulkSMS(req.params.id, req.businessId, campaign.message_text)
      .catch(error => {
        console.error(`[BulkSMS Route] Background send error for restarted campaign ${req.params.id}:`, error);
      });
    
    res.json({ success: true, message: 'Campaign restarted' });
  } catch (error) {
    console.error('[BulkSMS Route] Restart campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to restart campaign' 
    });
  }
});

/**
 * Resend a campaign (create new campaign with same message/recipients)
 * POST /api/bulk-sms/campaigns/:id/resend
 */
router.post('/campaigns/:id/resend', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get all recipients from the original campaign
    const recipients = await SMSCampaignRecipient.findByCampaignId(req.params.id);
    const phoneNumbers = recipients.map(r => r.phone_number).filter(Boolean);
    
    if (phoneNumbers.length === 0) {
      return res.status(400).json({ 
        error: 'No recipients found in original campaign' 
      });
    }
    
    // Create new campaign
    const newCampaign = await SMSCampaign.create({
      business_id: req.businessId,
      name: `${campaign.name} (Resent)`,
      message_text: campaign.message_text,
      total_recipients: phoneNumbers.length,
    });
    
    // Create recipient records
    const newRecipients = recipients.map(recipient => ({
      campaign_id: newCampaign.id,
      phone_number: recipient.phone_number,
      email: recipient.email || null,
      first_name: recipient.first_name || null,
      last_name: recipient.last_name || null,
      status: 'pending',
    }));
    
    await SMSCampaignRecipient.createBatch(newRecipients);
    
    // Start sending
    sendBulkSMS(newCampaign.id, req.businessId, campaign.message_text, phoneNumbers)
      .catch(error => {
        console.error(`[BulkSMS Route] Background send error for resent campaign ${newCampaign.id}:`, error);
      });
    
    res.json({ 
      success: true, 
      message: 'New campaign created and sending started',
      campaign: newCampaign,
    });
  } catch (error) {
    console.error('[BulkSMS Route] Resend campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to resend campaign' 
    });
  }
});

/**
 * Get campaign recipients
 * GET /api/bulk-sms/campaigns/:id/recipients
 */
router.get('/campaigns/:id/recipients', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { status } = req.query;
    const recipients = status
      ? await SMSCampaignRecipient.findByCampaignIdAndStatus(req.params.id, status)
      : await SMSCampaignRecipient.findByCampaignId(req.params.id);
    
    res.json({ recipients });
  } catch (error) {
    console.error('[BulkSMS Route] Get recipients error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get recipients' 
    });
  }
});

/**
 * Diagnose why a campaign is stuck
 * GET /api/bulk-sms/campaigns/:id/diagnose
 */
router.get('/campaigns/:id/diagnose', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const diagnostics = await diagnoseStuckCampaign(req.params.id);
    
    res.json(diagnostics);
  } catch (error) {
    console.error('[BulkSMS Route] Diagnose campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to diagnose campaign' 
    });
  }
});

/**
 * Resume sending to pending recipients in a stuck campaign
 * POST /api/bulk-sms/campaigns/:id/resume
 */
router.post('/campaigns/:id/resume', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Run resume in background
    resumeStuckCampaign(req.params.id)
      .then(result => {
        console.log(`[BulkSMS Route] Resume completed for campaign ${req.params.id}:`, result);
      })
      .catch(error => {
        console.error(`[BulkSMS Route] Resume error for campaign ${req.params.id}:`, error);
      });
    
    res.json({
      success: true,
      message: 'Resume started - campaign will continue sending to pending recipients',
    });
  } catch (error) {
    console.error('[BulkSMS Route] Resume campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to resume campaign' 
    });
  }
});

/**
 * Recover stuck campaign by checking actual recipient statuses
 * POST /api/bulk-sms/campaigns/:id/recover
 * Query param: force=true to force completion even if not all processed
 */
router.post('/campaigns/:id/recover', authenticate, async (req, res) => {
  try {
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const force = req.query.force === 'true' || req.body.force === true;
    
    const result = await recoverStuckCampaign(req.params.id, force);
    
    res.json({
      success: result.recovered,
      message: result.recovered 
        ? `Campaign recovered: ${result.previousStatus} → ${result.newStatus} (${result.sentCount} sent, ${result.failedCount} failed)`
        : result.reason,
      result,
    });
  } catch (error) {
    console.error('[BulkSMS Route] Recover campaign error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to recover campaign' 
    });
  }
});

/**
 * Resend to specific failed recipients
 * POST /api/bulk-sms/campaigns/:id/resend-recipients
 */
router.post('/campaigns/:id/resend-recipients', authenticate, async (req, res) => {
  try {
    const { recipient_ids } = req.body;
    
    if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length === 0) {
      return res.status(400).json({ error: 'recipient_ids array is required' });
    }
    
    const campaign = await SMSCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    if (campaign.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get the recipients to resend
    const allRecipients = await SMSCampaignRecipient.findByCampaignId(req.params.id);
    const recipientsToResend = allRecipients.filter(r => recipient_ids.includes(r.id));
    
    if (recipientsToResend.length === 0) {
      return res.status(404).json({ error: 'No recipients found with provided IDs' });
    }
    
    // Get phone numbers to resend
    const phoneNumbers = recipientsToResend.map(r => r.phone_number).filter(Boolean);
    
    if (phoneNumbers.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers found for resend' });
    }
    
    // Reset recipient statuses to pending
    for (const recipient of recipientsToResend) {
      await SMSCampaignRecipient.updateStatus(recipient.id, 'pending', {
        error_message: null,
        sent_at: null,
        telnyx_message_id: null,
      });
    }
    
    // Resend the messages
    sendBulkSMS(req.params.id, req.businessId, campaign.message_text, phoneNumbers)
      .catch(error => {
        console.error(`[BulkSMS Route] Background send error for resent recipients:`, error);
      });
    
    res.json({ 
      success: true, 
      message: `Resending to ${phoneNumbers.length} recipient(s)`,
      recipient_count: phoneNumbers.length,
    });
  } catch (error) {
    console.error('[BulkSMS Route] Resend recipients error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to resend to recipients' 
    });
  }
});

/**
 * Get all SMS-capable numbers for business
 * GET /api/bulk-sms/numbers
 */
router.get('/numbers', authenticate, async (req, res) => {
  try {
    const numbers = await getAvailableSMSNumbers(req.businessId);
    const throughput = calculateTotalThroughput(numbers);
    
    res.json({
      numbers,
      total_throughput: throughput,
    });
  } catch (error) {
    console.error('[BulkSMS Route] Get numbers error:', error);
    
    // Handle rate limiting gracefully
    if (error.response?.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
      console.warn('[BulkSMS Route] Rate limited when getting numbers - returning cached/default numbers');
      // Return empty array or cached numbers instead of error
      // The frontend can still work with empty numbers array
      return res.json({
        numbers: [],
        total_throughput: { totalRate: 0, unit: 'messages_per_minute', totalPerHour: 0 },
        warning: 'Rate limited - verification status check skipped. Numbers may not show verification status.',
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to get numbers' 
    });
  }
});

/**
 * Get opt-out list
 * GET /api/bulk-sms/opt-outs
 */
router.get('/opt-outs', authenticate, async (req, res) => {
  try {
    const optOuts = await SMSOptOut.findByBusinessId(req.businessId);
    res.json({ optOuts });
  } catch (error) {
    console.error('[BulkSMS Route] Get opt-outs error:', error);
    console.error('[BulkSMS Route] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    // If table doesn't exist or any database error, return empty array
    if (error.message && (
      error.message.includes('does not exist') || 
      error.message.includes('relation') ||
      error.code === '42P01' || // PostgreSQL: relation does not exist
      error.code === 'PGRST116' // Supabase: no rows returned (but also used for missing table)
    )) {
      console.log('[BulkSMS Route] Table does not exist, returning empty opt-outs array');
      return res.json({ optOuts: [] });
    }
    res.status(500).json({ 
      error: error.message || 'Failed to get opt-outs' 
    });
  }
});

/**
 * Test load balancing distribution (shows which numbers would be used)
 * GET /api/bulk-sms/test-load-balance
 */
router.get('/test-load-balance', authenticate, async (req, res) => {
  try {
    const { getAvailableSMSNumbers, loadBalanceMessages } = await import('../services/bulkSMS.js');
    
    // Get available numbers for this business
    const availableNumbers = await getAvailableSMSNumbers(req.businessId);
    
    if (availableNumbers.length === 0) {
      return res.status(400).json({
        error: 'No SMS-capable numbers available for this business',
      });
    }
    
    // Simulate load balancing with different message counts
    const testScenarios = [1, 5, 10, 20, 50, 100];
    const results = [];
    
    for (const messageCount of testScenarios) {
      const testPhoneNumbers = Array(messageCount).fill(null).map((_, i) => `+1555123${String(i).padStart(4, '0')}`);
      const assignments = loadBalanceMessages(testPhoneNumbers, availableNumbers);
      
      // Count distribution
      const distribution = {};
      assignments.forEach(a => {
        distribution[a.fromNumber] = (distribution[a.fromNumber] || 0) + 1;
      });
      
      results.push({
        message_count: messageCount,
        available_numbers: availableNumbers.length,
        distribution: Object.entries(distribution).map(([num, count]) => ({
          phone_number: num,
          message_count: count,
          percentage: ((count / messageCount) * 100).toFixed(1) + '%',
        })),
      });
    }
    
    res.json({
      success: true,
      business_id: req.businessId,
      available_numbers: availableNumbers.map(n => ({
        phone_number: n.phone_number,
        type: n.type,
        rate_limit: n.rateLimit,
        country: n.country,
      })),
      load_balancing_test: results,
      summary: {
        total_numbers: availableNumbers.length,
        total_rate_limit: availableNumbers.reduce((sum, n) => sum + (n.rateLimit || 0), 0),
        rate_limit_unit: 'messages_per_minute',
      },
    });
  } catch (error) {
    console.error('[BulkSMS] Test load balance error:', error);
    res.status(500).json({
      error: error.message || 'Failed to test load balancing',
    });
  }
});

/**
 * Test SMS sending (for debugging)
 * POST /api/bulk-sms/test
 */
router.post('/test', authenticate, async (req, res) => {
  try {
    const { phone_number, message } = req.body;
    
    if (!phone_number || !message) {
      return res.status(400).json({ 
        error: 'phone_number and message are required' 
      });
    }
    
    console.log(`[BulkSMS Test] ========== TEST SMS SEND ==========`);
    console.log(`[BulkSMS Test] To: ${phone_number}`);
    console.log(`[BulkSMS Test] Message: ${message}`);
    
    // Get business phone number
    const business = await Business.findById(req.businessId);
    if (!business || !business.vapi_phone_number) {
      return res.status(400).json({ 
        error: 'Business phone number not configured' 
      });
    }
    
    console.log(`[BulkSMS Test] From: ${business.vapi_phone_number}`);
    
    // Import sendSMSDirect
    const { sendSMSDirect } = await import('../services/notifications.js');
    
    console.log(`[BulkSMS Test] Calling sendSMSDirect...`);
    const result = await sendSMSDirect(business.vapi_phone_number, phone_number, message);
    
    console.log(`[BulkSMS Test] ✅ SMS sent successfully!`);
    console.log(`[BulkSMS Test] Telnyx Message ID: ${result.data?.id}`);
    
    res.json({ 
      success: true, 
      message: 'Test SMS sent successfully',
      telnyx_message_id: result.data?.id,
    });
  } catch (error) {
    console.error(`[BulkSMS Test] ❌ ERROR:`, error);
    console.error(`[BulkSMS Test] Error message:`, error.message);
    console.error(`[BulkSMS Test] Error stack:`, error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to send test SMS',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * Test endpoint to verify webhook is accessible
 * GET /api/bulk-sms/webhook
 */
router.get('/webhook', (req, res) => {
  const apiBase = getApiPublicBaseUrl();
  res.status(200).json({
    status: '✅ Webhook endpoint is accessible',
    url: `${apiBase.replace(/\/$/, '')}/api/bulk-sms/webhook`,
    message: 'This endpoint receives incoming SMS messages from Telnyx for STOP/START opt-out handling',
    test: 'Send a POST request with Telnyx webhook format to test',
  });
});

/**
 * Handle incoming SMS webhook for opt-outs (STOP keyword)
 * POST /api/bulk-sms/webhook
 */
router.post('/webhook', express.json(), async (req, res) => {
  console.log('[BulkSMS Webhook] ========== WEBHOOK RECEIVED ==========');
  console.log('[BulkSMS Webhook] Request method:', req.method);
  console.log('[BulkSMS Webhook] Request URL:', req.url);
  console.log('[BulkSMS Webhook] Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('[BulkSMS Webhook] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Telnyx webhook format - can be different structures
    // Try multiple possible formats
    let data = req.body?.data;
    let eventType = data?.event_type;
    
    // Alternative format: direct event_type in body
    if (!eventType && req.body?.event_type) {
      eventType = req.body.event_type;
      data = req.body;
    }
    
    // Alternative format: payload directly in body
    if (!data && req.body?.payload) {
      data = req.body;
      eventType = req.body.event_type || 'message.received';
    }
    
    console.log('[BulkSMS Webhook] Parsed event type:', eventType);
    console.log('[BulkSMS Webhook] Parsed data:', JSON.stringify(data, null, 2));
    
    // Always respond 200 to Telnyx immediately (don't wait for processing)
    res.status(200).json({ received: true });
    console.log('[BulkSMS Webhook] ✅ Sent 200 response to Telnyx');
    
    // Handle incoming SMS (for opt-outs)
    // Telnyx can send different event types, so check multiple
    if (eventType === 'message.received' || eventType === 'sms.received' || !eventType) {
      // Try multiple message formats - Telnyx webhook structure can vary
      const message = data?.payload || data?.data || data;
      const fromNumber = message?.from?.phone_number || message?.from?.number || message?.from || message?.origin_phone_number;
      
      // Handle toNumber - it can be an array of objects or a single value
      let toNumber = message?.to?.phone_number || message?.to?.number || message?.to || message?.destination_phone_number;
      if (Array.isArray(toNumber) && toNumber.length > 0) {
        // If it's an array, get the phone_number from the first object
        toNumber = toNumber[0]?.phone_number || toNumber[0]?.number || toNumber[0];
      } else if (typeof toNumber === 'object' && toNumber !== null) {
        // If it's an object, extract the phone_number property
        toNumber = toNumber.phone_number || toNumber.number || toNumber;
      }
      
      const text = (message?.text || message?.body || message?.message || '').toLowerCase().trim();
      const rawText = (message?.text || message?.body || message?.message || '').trim();
      
      console.log('[BulkSMS Webhook] Extracted message data:', {
        fromNumber,
        toNumber,
        text: text.substring(0, 100),
        messageKeys: Object.keys(message || {}),
      });
      
      console.log('[BulkSMS Webhook] Incoming message:', {
        from: fromNumber,
        to: toNumber,
        text: text.substring(0, 50),
      });
      
      // EMERGENCY NETWORK: separate stream — if destination is emergency number, create service request and stop
      if (toNumber) {
        const formattedToNumber = formatPhoneNumberE164(toNumber);
        const formattedFromNumber = formatPhoneNumberE164(fromNumber);
        const { isEmergencyNumber } = await import('../services/emergency-network/config.js');
        const isEmergency = await isEmergencyNumber(formattedToNumber);
        console.log('[BulkSMS Webhook] Emergency check: to=', formattedToNumber, 'isEmergencyNumber=', isEmergency);
        if (isEmergency) {
          try {
            const { handleSmsIntake } = await import('../services/emergency-network/sms-intake.js');
            const { reply, requestId } = await handleSmsIntake(formattedFromNumber, formattedToNumber, rawText);
            if (requestId) {
              console.log('[BulkSMS Webhook] Emergency Network: service request created from SMS intake', requestId, 'from', formattedFromNumber);
            }
            try {
              await sendSMSDirect(formattedToNumber, formattedFromNumber, reply, true);
              console.log('[BulkSMS Webhook] Emergency Network: reply SMS sent to', formattedFromNumber);
            } catch (smsErr) {
              const status = smsErr.response?.status;
              const data = smsErr.response?.data;
              console.error('[BulkSMS Webhook] Emergency Network: failed to send reply SMS. Status:', status, 'Error:', smsErr?.message || smsErr, 'Response:', data ? JSON.stringify(data) : 'none');
              if (!process.env.TELNYX_API_KEY) {
                console.error('[BulkSMS Webhook] TELNYX_API_KEY is not set — set it in env to send reply SMS.');
              }
            }
          } catch (err) {
            console.error('[BulkSMS Webhook] Emergency Network intake error:', err?.message || err);
          }
          return;
        }

        const { isDeliveryLineNumber } = await import('../services/delivery-network/config.js');
        const isDelivery = await isDeliveryLineNumber(formattedToNumber);
        console.log('[BulkSMS Webhook] Delivery check: to=', formattedToNumber, 'isDeliveryLineNumber=', isDelivery);
        if (isDelivery) {
          try {
            const { handleSmsIntake } = await import('../services/delivery-network/sms-intake.js');
            const { reply, requestId } = await handleSmsIntake(formattedFromNumber, formattedToNumber, rawText);
            if (requestId) {
              console.log('[BulkSMS Webhook] Delivery Network: request created from SMS intake', requestId, 'from', formattedFromNumber);
            }
            try {
              await sendSMSDirect(formattedToNumber, formattedFromNumber, reply, true);
              console.log('[BulkSMS Webhook] Delivery Network: reply SMS sent to', formattedFromNumber);
            } catch (smsErr) {
              const status = smsErr.response?.status;
              const data = smsErr.response?.data;
              console.error(
                '[BulkSMS Webhook] Delivery Network: failed to send reply SMS. Status:',
                status,
                'Error:',
                smsErr?.message || smsErr,
                'Response:',
                data ? JSON.stringify(data) : 'none',
              );
              if (!process.env.TELNYX_API_KEY) {
                console.error('[BulkSMS Webhook] TELNYX_API_KEY is not set — set it in env to send reply SMS.');
              }
            }
          } catch (err) {
            console.error('[BulkSMS Webhook] Delivery Network intake error:', err?.message || err);
          }
          return;
        }
      }
      
      // Check for opt-out keywords
      const optOutKeywords = ['stop', 'unsubscribe', 'optout', 'opt out', 'cancel', 'end', 'quit', 'remove'];
      const optInKeywords = ['start', 'subscribe', 'optin', 'opt in', 'yes', 'resume'];
      const isOptOut = optOutKeywords.some(keyword => text.includes(keyword));
      const isOptIn = optInKeywords.some(keyword => text.includes(keyword));
      
      if (isOptOut && toNumber) {
        console.log('[BulkSMS Webhook] Opt-out keyword detected, processing...');
        
        // Format phone numbers for consistent lookup
        const formattedToNumber = formatPhoneNumberE164(toNumber);
        const formattedFromNumber = formatPhoneNumberE164(fromNumber);
        
        // Find business by phone number (check both vapi_phone_number and telnyx_number)
        console.log(`[BulkSMS Webhook] Looking up business with phone number: ${formattedToNumber}`);
        const business = await Business.findByPhoneNumber(formattedToNumber);
        
        if (!business) {
          console.error(`[BulkSMS Webhook] ❌ BUSINESS NOT FOUND for phone number: ${formattedToNumber}`);
          console.error(`[BulkSMS Webhook] Original toNumber: ${toNumber}`);
          console.error(`[BulkSMS Webhook] Formatted toNumber: ${formattedToNumber}`);
          console.error(`[BulkSMS Webhook] Cannot process opt-out - business lookup failed`);
          return; // Exit early if business not found
        }
        
        console.log(`[BulkSMS Webhook] ✅ Business found: ${business.id} (${business.name})`);
        console.log(`[BulkSMS Webhook] Business vapi_phone_number: ${business.vapi_phone_number}`);
        console.log(`[BulkSMS Webhook] Business telnyx_number: ${business.telnyx_number}`);
        
        try {
          // Add to opt-out list (upsert to handle duplicates)
          console.log(`[BulkSMS Webhook] Creating opt-out record for: ${formattedFromNumber}`);
          const optOutRecord = await SMSOptOut.create({
            business_id: business.id,
            phone_number: formattedFromNumber,
            reason: 'STOP',
          });
          console.log(`[BulkSMS Webhook] ✅ Opt-out recorded in sms_opt_outs:`, optOutRecord);
        } catch (optOutError) {
          // If already exists, that's fine - just log it
          if (optOutError.code === '23505' || optOutError.message?.includes('duplicate') || optOutError.message?.includes('unique')) {
            console.log(`[BulkSMS Webhook] ⚠️ Opt-out already exists for ${formattedFromNumber}`);
          } else {
            console.error(`[BulkSMS Webhook] ❌ Error creating opt-out record:`, optOutError);
            console.error(`[BulkSMS Webhook] Error code:`, optOutError.code);
            console.error(`[BulkSMS Webhook] Error message:`, optOutError.message);
            console.error(`[BulkSMS Webhook] Error details:`, optOutError.details);
            // Don't return - continue to update contact and send confirmation
          }
        }
        
        // Update contact's opt-out status if they exist in contacts table
        try {
          const contact = await Contact.findByPhone(business.id, formattedFromNumber);
          if (contact) {
            await Contact.setOptOutStatus(contact.id, true);
            console.log(`[BulkSMS Webhook] ✅ Contact ${contact.id} marked as opted out`);
          } else {
            console.log(`[BulkSMS Webhook] ℹ️ No contact found for ${formattedFromNumber}, skipping contact update`);
          }
        } catch (contactError) {
          console.error(`[BulkSMS Webhook] ❌ Error updating contact opt-out status:`, contactError);
          // Don't fail the whole process if contact update fails
        }
        
        // Send confirmation SMS back to the user
        // Note: Footer is automatically added by sendSMSDirect
        // Note: Telnyx may return 409 Conflict if user just opted out (they block sending to opted-out numbers)
        // This is expected behavior - we still record the opt-out successfully
        try {
          // CASL (Canada) requires bilingual opt-out confirmation (English and French)
          // TCPA (US) requires English only
          // Apply strictest rule: Bilingual for Canadian numbers, English for US
          const { isCanadianNumber } = await import('../utils/phoneFormatter.js');
          const isCanadian = isCanadianNumber(formattedFromNumber);
          
          const confirmationMessage = isCanadian
            ? 'You have been unsubscribed from receiving SMS messages. Reply START to opt back in.\n\nVous avez été désabonné des messages SMS. Répondez START pour vous réabonner.'
            : 'You have been unsubscribed from receiving SMS messages. Reply START to opt back in.';
          const senderNumber = business.vapi_phone_number || business.telnyx_number;
          
          if (senderNumber) {
            await sendSMSDirect(senderNumber, formattedFromNumber, confirmationMessage);
            console.log(`[BulkSMS Webhook] ✅ Confirmation SMS sent to ${formattedFromNumber}`);
          } else {
            console.warn(`[BulkSMS Webhook] ⚠️ No sender number configured for business ${business.id}, cannot send confirmation`);
          }
        } catch (smsError) {
          // Handle 409 Conflict gracefully - Telnyx blocks sending to numbers that just opted out
          if (smsError.response?.status === 409) {
            console.log(`[BulkSMS Webhook] ℹ️ Telnyx returned 409 Conflict - user is already opted out (expected behavior)`);
          } else {
            console.error(`[BulkSMS Webhook] ❌ Error sending confirmation SMS:`, smsError.message || smsError);
          }
          // Don't fail the whole process if confirmation SMS fails - opt-out is already recorded
        }
        
        console.log(`[BulkSMS Webhook] ✅ Opt-out process completed for ${formattedFromNumber}`);
      } else if (isOptIn && toNumber) {
        // Handle opt-in (START keyword)
        console.log('[BulkSMS Webhook] Opt-in keyword detected, processing...');
        
        // Format phone numbers for consistent lookup
        const formattedToNumber = formatPhoneNumberE164(toNumber);
        const formattedFromNumber = formatPhoneNumberE164(fromNumber);
        
        // Find business by phone number
        const business = await Business.findByPhoneNumber(formattedToNumber);
        
        if (business) {
          console.log(`[BulkSMS Webhook] Business found: ${business.id} (${business.name})`);
          
          try {
            // Remove from opt-out list (delete if exists)
            const { error: deleteError } = await supabaseClient
              .from('sms_opt_outs')
              .delete()
              .eq('business_id', business.id)
              .eq('phone_number', formattedFromNumber);
            
            if (deleteError && deleteError.code !== 'PGRST116') {
              console.error(`[BulkSMS Webhook] ❌ Error removing opt-out:`, deleteError);
            } else {
              console.log(`[BulkSMS Webhook] ✅ Opt-out removed from sms_opt_outs: ${formattedFromNumber}`);
            }
          } catch (optOutError) {
            console.error(`[BulkSMS Webhook] ❌ Error removing opt-out record:`, optOutError);
          }
          
          // Update contact's opt-out status if they exist in contacts table
          try {
            const contact = await Contact.findByPhone(business.id, formattedFromNumber);
            if (contact) {
              await Contact.setOptOutStatus(contact.id, false);
              console.log(`[BulkSMS Webhook] ✅ Contact ${contact.id} marked as opted in`);
            } else {
              console.log(`[BulkSMS Webhook] ℹ️ No contact found for ${formattedFromNumber}, skipping contact update`);
            }
          } catch (contactError) {
            console.error(`[BulkSMS Webhook] ❌ Error updating contact opt-in status:`, contactError);
            // Don't fail the whole process if contact update fails
          }
          
          // Send confirmation SMS back to the user
          try {
            // CASL (Canada) requires bilingual opt-in confirmation
            const { isCanadianNumber } = await import('../utils/phoneFormatter.js');
            const isCanadian = isCanadianNumber(formattedFromNumber);
            
            const confirmationMessage = isCanadian
              ? 'You have been subscribed to receive SMS messages. Reply STOP to opt out at any time.\n\nVous avez été abonné aux messages SMS. Répondez STOP pour vous désabonner à tout moment.'
              : 'You have been subscribed to receive SMS messages. Reply STOP to opt out at any time.';
            const senderNumber = business.vapi_phone_number || business.telnyx_number;
            
            if (senderNumber) {
              await sendSMSDirect(senderNumber, formattedFromNumber, confirmationMessage);
              console.log(`[BulkSMS Webhook] ✅ Opt-in confirmation SMS sent to ${formattedFromNumber}`);
            } else {
              console.warn(`[BulkSMS Webhook] ⚠️ No sender number configured for business ${business.id}, cannot send confirmation`);
            }
          } catch (smsError) {
            console.error(`[BulkSMS Webhook] ❌ Error sending opt-in confirmation SMS:`, smsError);
            // Don't fail the whole process if confirmation SMS fails
          }
          
          console.log(`[BulkSMS Webhook] ✅ Opt-in process completed for ${formattedFromNumber}`);
        } else {
          console.warn(`[BulkSMS Webhook] ⚠️ No business found for phone number ${formattedToNumber}`);
        }
      } else {
        console.log('[BulkSMS Webhook] Message received but no opt-out/opt-in keyword detected');
      }
    } else if (eventType === 'message.sent' || eventType === 'message.finalized') {
      // Handle outbound message status updates (for bulk SMS campaigns)
      console.log(`[BulkSMS Webhook] Processing ${eventType} event for outbound message`);
      
      const message = data?.payload || data;
      const messageId = message?.id;
      const toRecipients = message?.to || [];
      
      if (!messageId) {
        console.warn('[BulkSMS Webhook] ⚠️ No message ID in payload, cannot update recipient status');
        return;
      }
      
      // Find recipient by telnyx_message_id
      try {
        const recipient = await SMSCampaignRecipient.findByTelnyxMessageId(messageId);
        
        if (recipient) {
          console.log(`[BulkSMS Webhook] ✅ Found recipient ${recipient.id} for message ${messageId}`);
          
          // Process status from the event
          if (eventType === 'message.sent') {
            // Message was sent successfully
            if (recipient.status !== 'sent') {
              await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
                telnyx_message_id: messageId,
              });
              console.log(`[BulkSMS Webhook] ✅ Updated recipient ${recipient.id} to 'sent' status`);
              
              // Update campaign counts
              const campaign = await SMSCampaign.findById(recipient.campaign_id);
              if (campaign) {
                await SMSCampaign.update(recipient.campaign_id, {
                  sent_count: (campaign.sent_count || 0) + 1,
                });
              }
            }
          } else if (eventType === 'message.finalized') {
            // Message was finalized (delivered or failed)
            // Check the status in the 'to' array
            const recipientStatus = toRecipients[0]?.status;
            
            if (recipientStatus === 'delivered') {
              // Message was delivered successfully
              if (recipient.status !== 'sent') {
                await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
                  telnyx_message_id: messageId,
                });
                console.log(`[BulkSMS Webhook] ✅ Updated recipient ${recipient.id} to 'sent' (delivered) status`);
              }
            } else if (recipientStatus === 'failed' || message?.errors?.length > 0) {
              // Message failed
              const errorMessage = message?.errors?.[0]?.detail || message?.errors?.[0]?.title || 'Message delivery failed';
              await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
                telnyx_message_id: messageId,
                error_message: errorMessage,
              });
              console.log(`[BulkSMS Webhook] ❌ Updated recipient ${recipient.id} to 'failed' status: ${errorMessage}`);
              
              // Update campaign counts
              const campaign = await SMSCampaign.findById(recipient.campaign_id);
              if (campaign) {
                await SMSCampaign.update(recipient.campaign_id, {
                  failed_count: (campaign.failed_count || 0) + 1,
                });
              }
            } else {
              // Status is 'sent' or unknown - mark as sent
              if (recipient.status !== 'sent') {
                await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
                  telnyx_message_id: messageId,
                });
                console.log(`[BulkSMS Webhook] ✅ Updated recipient ${recipient.id} to 'sent' status (finalized)`);
              }
            }
          }
        } else {
          // Try to find by phone number if we have campaign context
          // This is a fallback if telnyx_message_id wasn't stored
          if (toRecipients.length > 0) {
            const toPhoneNumber = toRecipients[0]?.phone_number;
            if (toPhoneNumber) {
              const formattedPhone = formatPhoneNumberE164(toPhoneNumber);
              
              // Find all pending recipients with this phone number
              // We'll update the most recent one for the most recent campaign
              const { data: recipients } = await supabaseClient
                .from('sms_campaign_recipients')
                .select('*')
                .eq('phone_number', formattedPhone)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1);
              
              if (recipients && recipients.length > 0) {
                const recipient = recipients[0];
                console.log(`[BulkSMS Webhook] ✅ Found recipient ${recipient.id} by phone number (fallback)`);
                
                if (eventType === 'message.sent' || (eventType === 'message.finalized' && toRecipients[0]?.status === 'delivered')) {
                  await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
                    telnyx_message_id: messageId,
                  });
                  console.log(`[BulkSMS Webhook] ✅ Updated recipient ${recipient.id} to 'sent' status (fallback)`);
                } else if (eventType === 'message.finalized' && (toRecipients[0]?.status === 'failed' || message?.errors?.length > 0)) {
                  const errorMessage = message?.errors?.[0]?.detail || message?.errors?.[0]?.title || 'Message delivery failed';
                  await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
                    telnyx_message_id: messageId,
                    error_message: errorMessage,
                  });
                  console.log(`[BulkSMS Webhook] ❌ Updated recipient ${recipient.id} to 'failed' status (fallback)`);
                }
              } else {
                console.log(`[BulkSMS Webhook] ℹ️ No recipient found for message ${messageId} or phone ${formattedPhone}`);
              }
            }
          }
        }
      } catch (updateError) {
        console.error(`[BulkSMS Webhook] ❌ Error updating recipient status for message ${messageId}:`, updateError);
        // Don't throw - we already sent 200 to Telnyx
      }
    } else {
      console.log(`[BulkSMS Webhook] Event type: ${eventType} (not message.received/sent/finalized, ignoring)`);
    }
  } catch (error) {
    console.error('[BulkSMS Webhook] ❌ CRITICAL ERROR:', error);
    console.error('[BulkSMS Webhook] Error stack:', error.stack);
    // Don't return error to Telnyx - we already sent 200
  }
});

/**
 * Debug endpoint to check opt-out records
 * GET /api/bulk-sms/debug-opt-outs
 */
router.get('/debug-opt-outs', authenticate, async (req, res) => {
  try {
    // Get all opt-outs for this business
    const optOuts = await SMSOptOut.findByBusinessId(req.businessId, 100);
    
    // Get a sample of contacts to compare phone number formats
    const { data: contacts } = await supabaseClient
      .from('contacts')
      .select('id, phone_number, opted_out, opted_out_at')
      .eq('business_id', req.businessId)
      .limit(10);
    
    res.json({
      businessId: req.businessId,
      optOutsCount: optOuts.length,
      optOuts: optOuts,
      sampleContacts: contacts || [],
      message: 'Check if opt-out phone numbers match contact phone numbers (format may differ)',
    });
  } catch (error) {
    console.error('[BulkSMS Route] Debug opt-outs error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get debug info' 
    });
  }
});

/**
 * Test endpoint to manually create an opt-out (for testing)
 * POST /api/bulk-sms/test-opt-out
 */
router.post('/test-opt-out', authenticate, async (req, res) => {
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }
    
    console.log(`[BulkSMS Test] Creating test opt-out for ${phone_number}...`);
    
    // Format phone number
    const formattedPhone = formatPhoneNumberE164(phone_number);
    console.log(`[BulkSMS Test] Formatted phone: ${formattedPhone}`);
    
    // Create opt-out record
    const optOut = await SMSOptOut.create({
      business_id: req.businessId,
      phone_number: formattedPhone,
      reason: 'TEST',
    });
    
    console.log(`[BulkSMS Test] ✅ Opt-out created:`, optOut);
    
    // Update contact if exists
    try {
      const contact = await Contact.findByPhone(req.businessId, formattedPhone);
      if (contact) {
        await Contact.setOptOutStatus(contact.id, true);
        console.log(`[BulkSMS Test] ✅ Contact ${contact.id} marked as opted out`);
      } else {
        console.log(`[BulkSMS Test] ℹ️ No contact found for ${formattedPhone}`);
      }
    } catch (contactError) {
      console.warn(`[BulkSMS Test] Could not update contact:`, contactError.message);
    }
    
    res.json({ 
      success: true, 
      message: 'Test opt-out created successfully',
      optOut,
      formattedPhone,
    });
  } catch (error) {
    console.error('[BulkSMS Route] Test opt-out error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create test opt-out',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * Diagnostic endpoint to check webhook and business setup
 * GET /api/bulk-sms/diagnose
 */
router.get('/diagnose', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Check opt-outs
    const optOuts = await SMSOptOut.findByBusinessId(req.businessId, 10);
    
    // Test business lookup by phone number
    let businessLookupTest = null;
    if (business.vapi_phone_number) {
      try {
        businessLookupTest = await Business.findByPhoneNumber(business.vapi_phone_number);
      } catch (error) {
        businessLookupTest = { error: error.message };
      }
    }
    
    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_phone_number: business.vapi_phone_number,
        telnyx_number: business.telnyx_number,
      },
      businessLookupTest: {
        phoneNumber: business.vapi_phone_number,
        found: businessLookupTest !== null && !businessLookupTest.error,
        error: businessLookupTest?.error,
      },
      optOuts: {
        count: optOuts.length,
        recent: optOuts.slice(0, 5),
      },
      webhookUrl: `${getApiPublicBaseUrl().replace(/\/$/, '')}/api/bulk-sms/webhook`,
      message: 'Use this to diagnose why opt-outs might not be working',
    });
  } catch (error) {
    console.error('[BulkSMS Route] Diagnose error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get diagnostic info' 
    });
  }
});

export default router;

