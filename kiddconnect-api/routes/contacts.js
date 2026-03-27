// routes/contacts.js
// Contact management API routes

import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { Contact } from '../models/Contact.js';
import { ContactList } from '../models/ContactList.js';
import { parseCSV } from '../services/bulkSMS.js';
import { validatePhoneNumbersForBulk, formatPhoneNumberE164 } from '../utils/phoneFormatter.js';
import { supabaseClient } from '../config/database.js';

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
 * Get all contacts for business
 * GET /api/contacts
 */
router.get('/', authenticate, async (req, res) => {
  try {
    // Allow up to 50000 contacts, default to 10000 if not specified
    const { limit = 10000, offset = 0, search, all = false, count_only = false, exclude_sent_today = false } = req.query;
    
    // If count_only is true, just return counts
    if (count_only === 'true' || count_only === true) {
      // Get total count
      const { count: totalCount } = await supabaseClient
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', req.businessId);
      
      let eligibleCount = totalCount || 0;
      let excludedCount = 0;
      
      // If exclude_sent_today is true, count contacts that received SMS today
      if (exclude_sent_today === 'true' || exclude_sent_today === true) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Count contacts that received SMS today
        const { count: sentTodayCount } = await supabaseClient
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', req.businessId)
          .not('last_sms_sent_at', 'is', null)
          .gte('last_sms_sent_at', today.toISOString())
          .lt('last_sms_sent_at', tomorrow.toISOString());
        
        excludedCount = sentTodayCount || 0;
        
        // Also filter by consent, opted_out, and phone_number for eligible count
        const { count: eligibleWithFilters } = await supabaseClient
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', req.businessId)
          .eq('sms_consent', true)
          .eq('opted_out', false)
          .not('phone_number', 'is', null);
        
        eligibleCount = eligibleWithFilters || 0;
      } else {
        // Just count eligible contacts (with consent, not opted out, have phone)
        const { count: eligibleWithFilters } = await supabaseClient
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', req.businessId)
          .eq('sms_consent', true)
          .eq('opted_out', false)
          .not('phone_number', 'is', null);
        
        eligibleCount = eligibleWithFilters || 0;
      }
      
      return res.json({
        total: totalCount || 0,
        eligible: eligibleCount,
        excluded: excludedCount,
        will_send: exclude_sent_today ? (eligibleCount - excludedCount) : eligibleCount,
      });
    }
    
    let contacts;
    let total;
    
    if (search) {
      contacts = await Contact.search(req.businessId, search, parseInt(limit));
      total = contacts.length; // For search, total is the result count
    } else {
      // Get total count first
      const { count } = await supabaseClient
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', req.businessId);
      
      total = count || 0;
      
      // If 'all' is requested or limit is very high, fetch all contacts in batches
      const shouldFetchAll = all === 'true' || all === true || parseInt(limit) >= 50000;
      
      if (shouldFetchAll) {
        console.log(`[Contacts Route] Fetching all contacts (total: ${total}) in batches...`);
        // Fetch all contacts in batches of 1000
        contacts = [];
        let currentOffset = 0;
        const batchSize = 1000;
        
        while (contacts.length < total && currentOffset < 50000) {
          const batch = await Contact.findByBusinessId(req.businessId, batchSize, currentOffset);
          if (batch.length === 0) break;
          contacts.push(...batch);
          currentOffset += batchSize;
          console.log(`[Contacts Route] Loaded batch: ${contacts.length}/${total} contacts`);
          if (batch.length < batchSize) break; // No more contacts
        }
        console.log(`[Contacts Route] ✅ Loaded ${contacts.length} contacts total`);
      } else {
        contacts = await Contact.findByBusinessId(req.businessId, parseInt(limit), parseInt(offset));
      }
    }
    
    res.json({ 
      contacts,
      total: total || contacts.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      returned: contacts.length,
    });
  } catch (error) {
    console.error('[Contacts Route] Get contacts error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get contacts' 
    });
  }
});

/**
 * Get contact by ID
 * GET /api/contacts/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    if (contact.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ contact });
  } catch (error) {
    console.error('[Contacts Route] Get contact error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get contact' 
    });
  }
});

/**
 * Create a new contact
 * POST /api/contacts
 * Requires SMS consent for TCPA/CASL compliance if phone_number is provided
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      email,
      first_name,
      last_name,
      phone_number,
      address,
      city,
      state,
      zip_code,
      country,
      notes,
      tags,
      custom_fields,
    } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Format phone number
    const formattedPhone = formatPhoneNumberE164(phone_number);
    
    const contact = await Contact.create({
      business_id: req.businessId,
      email,
      first_name,
      last_name,
      phone_number: formattedPhone || phone_number,
      address,
      city,
      state,
      zip_code,
      country,
      notes,
      tags,
      custom_fields,
    });
    
    res.status(201).json({ contact });
  } catch (error) {
    console.error('[Contacts Route] Create contact error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create contact' 
    });
  }
});

/**
 * Update contact
 * PUT /api/contacts/:id
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    if (contact.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updated = await Contact.update(req.params.id, req.body);
    res.json({ contact: updated });
  } catch (error) {
    console.error('[Contacts Route] Update contact error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update contact' 
    });
  }
});

/**
 * Delete contact
 * DELETE /api/contacts/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    if (contact.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await Contact.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Contacts Route] Delete contact error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to delete contact' 
    });
  }
});

/**
 * Upload contacts from CSV
 * POST /api/contacts/upload
 * Requires SMS consent for TCPA/CASL compliance
 */
router.post('/upload', authenticate, upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }
    
    // Check if consent was provided (required for TCPA/CASL compliance)
    const { sms_consent, sms_consent_method = 'csv_upload', sms_consent_source } = req.body;
    
    if (sms_consent !== 'true' && sms_consent !== true) {
      return res.status(400).json({ 
        error: 'SMS consent is required for TCPA (US) and CASL (Canada) compliance. Please confirm that all contacts in the CSV have provided express consent to receive SMS messages.',
        requires_consent: true,
      });
    }
    
    // Parse CSV - returns contact objects
    const contacts = parseCSV(req.file.buffer);
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts found in CSV file' });
    }
    
    console.log(`[Contacts Route] Parsed ${contacts.length} contacts from CSV`);
    
    // Get client IP address for compliance tracking
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Format phone numbers and add consent information
    const formattedContacts = contacts.map(contact => ({
      business_id: req.businessId,
      email: contact.email || null,
      first_name: contact.first_name || null,
      last_name: contact.last_name || null,
      phone_number: formatPhoneNumberE164(contact.phone_number) || contact.phone_number,
      // SMS consent fields (TCPA/CASL compliance)
      sms_consent: true, // User confirmed consent via checkbox
      sms_consent_timestamp: new Date().toISOString(),
      sms_consent_method: sms_consent_method || 'csv_upload',
      sms_consent_ip_address: clientIp,
      sms_consent_source: sms_consent_source || 'CSV Upload',
    }));
    
    console.log(`[Contacts Route] Processing ${formattedContacts.length} formatted contacts with SMS consent...`);
    
    // Create contacts (upsert to handle duplicates) - handles batching internally
    const created = await Contact.createBatch(formattedContacts);
    
    console.log(`[Contacts Route] ✅ Imported ${created.length} contacts (${formattedContacts.length} total processed) with SMS consent`);
    
    res.json({
      success: true,
      imported: created.length,
      total: contacts.length,
      message: `Successfully imported ${created.length} contact(s) out of ${contacts.length} total with SMS consent`,
    });
  } catch (error) {
    console.error('[Contacts Route] Upload contacts error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to upload contacts' 
    });
  }
});

/**
 * Get all contact lists
 * GET /api/contacts/lists
 */
router.get('/lists/all', authenticate, async (req, res) => {
  try {
    const lists = await ContactList.findByBusinessId(req.businessId);
    
    // Get contact counts for each list
    const listsWithCounts = await Promise.all(
      lists.map(async (list) => {
        const count = await ContactList.getContactCount(list.id);
        return { ...list, contact_count: count };
      })
    );
    
    res.json({ lists: listsWithCounts });
  } catch (error) {
    console.error('[Contacts Route] Get lists error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get lists' 
    });
  }
});

/**
 * Create a new contact list
 * POST /api/contacts/lists
 */
router.post('/lists', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'List name is required' });
    }
    
    const list = await ContactList.create({
      business_id: req.businessId,
      name,
      description,
    });
    
    res.status(201).json({ list });
  } catch (error) {
    console.error('[Contacts Route] Create list error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create list' 
    });
  }
});

/**
 * Get list details with contacts
 * GET /api/contacts/lists/:id
 */
router.get('/lists/:id', authenticate, async (req, res) => {
  try {
    const list = await ContactList.findById(req.params.id);
    
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    if (list.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const contacts = await ContactList.getContacts(req.params.id);
    const count = await ContactList.getContactCount(req.params.id);
    
    res.json({ 
      list: { ...list, contact_count: count },
      contacts 
    });
  } catch (error) {
    console.error('[Contacts Route] Get list error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get list' 
    });
  }
});

/**
 * Update list
 * PUT /api/contacts/lists/:id
 */
router.put('/lists/:id', authenticate, async (req, res) => {
  try {
    const list = await ContactList.findById(req.params.id);
    
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    if (list.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updated = await ContactList.update(req.params.id, req.body);
    res.json({ list: updated });
  } catch (error) {
    console.error('[Contacts Route] Update list error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update list' 
    });
  }
});

/**
 * Delete list
 * DELETE /api/contacts/lists/:id
 */
router.delete('/lists/:id', authenticate, async (req, res) => {
  try {
    const list = await ContactList.findById(req.params.id);
    
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    if (list.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await ContactList.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Contacts Route] Delete list error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to delete list' 
    });
  }
});

/**
 * Add contact to list
 * POST /api/contacts/lists/:id/contacts
 */
router.post('/lists/:id/contacts', authenticate, async (req, res) => {
  try {
    const { contact_id } = req.body;
    
    if (!contact_id) {
      return res.status(400).json({ error: 'Contact ID is required' });
    }
    
    const list = await ContactList.findById(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    if (list.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await ContactList.addContact(req.params.id, contact_id);
    
    // If contact already exists in list, return success anyway
    if (result.already_exists) {
      return res.json({ success: true, message: 'Contact already in list' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Contacts Route] Add contact to list error:', error);
    
    // Handle duplicate entry gracefully
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return res.json({ success: true, message: 'Contact already in list' });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to add contact to list' 
    });
  }
});

/**
 * Remove contact from list
 * DELETE /api/contacts/lists/:id/contacts/:contactId
 */
router.delete('/lists/:id/contacts/:contactId', authenticate, async (req, res) => {
  try {
    const list = await ContactList.findById(req.params.id);
    if (!list || list.business_id !== req.businessId) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    await ContactList.removeContact(req.params.id, req.params.contactId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Contacts Route] Remove contact from list error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to remove contact from list' 
    });
  }
});

/**
 * Toggle opt-out status for a contact
 * POST /api/contacts/:id/opt-out
 */
router.post('/:id/opt-out', authenticate, async (req, res) => {
  try {
    const { opted_out } = req.body;
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    if (contact.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update contact opt-out status
    const updated = await Contact.setOptOutStatus(req.params.id, opted_out === true);
    
    // Also update sms_opt_outs table
    const { SMSOptOut } = await import('../models/SMSOptOut.js');
    if (opted_out) {
      await SMSOptOut.create({
        business_id: req.businessId,
        phone_number: contact.phone_number,
        reason: 'manual',
      });
    } else {
      await SMSOptOut.remove(req.businessId, contact.phone_number);
    }
    
    res.json({ contact: updated });
  } catch (error) {
    console.error('[Contacts Route] Toggle opt-out error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update opt-out status' 
    });
  }
});

/**
 * Sync opt-out status from sms_opt_outs to contacts
 * POST /api/contacts/sync-opt-outs
 */
router.post('/sync-opt-outs', authenticate, async (req, res) => {
  console.log(`[Contacts Route] Sync opt-outs requested for business ${req.businessId}`);
  try {
    const result = await Contact.syncOptOutStatus(req.businessId);
    console.log(`[Contacts Route] ✅ Sync completed: ${result.synced} contacts updated`);
    res.json({ success: true, synced: result.synced });
  } catch (error) {
    console.error('[Contacts Route] ❌ Sync opt-outs error:', error);
    console.error('[Contacts Route] Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to sync opt-out status',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * Debug endpoint to check opt-out status
 * GET /api/contacts/debug-opt-outs
 */
router.get('/debug-opt-outs', authenticate, async (req, res) => {
  try {
    // Get opt-outs from sms_opt_outs table
    const { data: optOuts } = await supabaseClient
      .from('sms_opt_outs')
      .select('phone_number, opted_out_at, reason')
      .eq('business_id', req.businessId);
    
    // Get contacts with their opt-out status
    const { data: contacts } = await supabaseClient
      .from('contacts')
      .select('id, phone_number, opted_out, opted_out_at')
      .eq('business_id', req.businessId)
      .limit(100); // Limit for performance
    
    res.json({
      optOuts: optOuts || [],
      optOutsCount: optOuts?.length || 0,
      contacts: contacts || [],
      contactsCount: contacts?.length || 0,
      message: 'Check phone_number formats - they should match for sync to work',
    });
  } catch (error) {
    console.error('[Contacts Route] Debug opt-outs error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get debug info' 
    });
  }
});

export default router;

