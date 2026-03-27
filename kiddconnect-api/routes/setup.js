import express from 'express';
import { Business } from '../models/Business.js';
import { AIAgent } from '../models/AIAgent.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get onboarding status
router.get('/status', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    res.json({
      onboarding_complete: business.onboarding_complete,
      vapi_phone_number: business.vapi_phone_number,
      voximplant_number: business.voximplant_number, // Legacy
    });
  } catch (error) {
    console.error('Get setup status error:', error);
    res.status(500).json({ error: 'Failed to get setup status' });
  }
});

// Get all setup data (business + agent)
router.get('/data', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    const agent = await AIAgent.findByBusinessId(req.businessId);
    
    res.json({
      business: {
        name: business.name,
        phone: business.phone,
        email: business.email,
        public_phone_number: business.public_phone_number,
        address: business.address,
        website: business.website,
        timezone: business.timezone,
        onboarding_complete: business.onboarding_complete,
        vapi_phone_number: business.vapi_phone_number,
        voximplant_number: business.voximplant_number, // Legacy
        telnyx_number: business.telnyx_number, // Legacy
      },
      agent: agent || null,
    });
  } catch (error) {
    console.error('Get setup data error:', error);
    res.status(500).json({ error: 'Failed to get setup data' });
  }
});

// Update step 1: Business info
router.post('/step1', authenticate, async (req, res) => {
  try {
    const { name, phone, address, website, timezone, email } = req.body;
    
    const updateData = {
      name,
      phone,
      address,
      website,
      timezone,
    };
    
    // Update email if provided (for business email)
    if (email !== undefined) {
      updateData.email = email;
    }
    
    await Business.update(req.businessId, updateData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 1 error:', error);
    res.status(500).json({ error: 'Failed to update business info' });
  }
});

// Update step 2: Greeting
router.post('/step2', authenticate, async (req, res) => {
  try {
    const { greeting_text, opening_greeting, ending_greeting } = req.body;
    
    await AIAgent.update(req.businessId, {
      greeting_text,
      opening_greeting,
      ending_greeting,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 2 error:', error);
    res.status(500).json({ error: 'Failed to update greeting' });
  }
});

// Update step 3: Business hours and holiday hours
router.post('/step3', authenticate, async (req, res) => {
  try {
    const { business_hours, holiday_hours } = req.body;
    
    console.log('[Setup Step 3] ========== SAVING BUSINESS HOURS ==========');
    console.log('[Setup Step 3] Business ID:', req.businessId);
    console.log('[Setup Step 3] Received business_hours:', JSON.stringify(business_hours, null, 2));
    console.log('[Setup Step 3] Received holiday_hours:', JSON.stringify(holiday_hours, null, 2));
    
    const updateData = {};
    if (business_hours !== undefined) {
      updateData.business_hours = business_hours;
      console.log('[Setup Step 3] ✅ Adding business_hours to updateData');
    } else {
      console.warn('[Setup Step 3] ⚠️ business_hours is undefined in request body');
    }
    if (holiday_hours !== undefined) {
      // Normalize holiday hours dates to YYYY-MM-DD format
      let normalizedHolidayHours = holiday_hours;
      if (Array.isArray(holiday_hours)) {
        normalizedHolidayHours = holiday_hours.map(h => {
          if (!h.date) return h;
          let dateStr = h.date;
          if (dateStr instanceof Date) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          } else if (dateStr.includes('T')) {
            dateStr = dateStr.split('T')[0];
          }
          return { ...h, date: dateStr };
        });
      }
      updateData.holiday_hours = normalizedHolidayHours;
      console.log('[Setup Step 3] ✅ Adding holiday_hours to updateData');
    }
    
    console.log('[Setup Step 3] Update data to be saved:', JSON.stringify(updateData, null, 2));
    
    const updatedAgent = await AIAgent.update(req.businessId, updateData);
    
    console.log('[Setup Step 3] ✅ Business hours saved successfully');
    console.log('[Setup Step 3] Updated agent business_hours:', JSON.stringify(updatedAgent.business_hours, null, 2));
    console.log('[Setup Step 3] ===============================================');
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Setup Step 3] ❌ Error updating business hours:', error);
    console.error('[Setup Step 3] Error details:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Failed to update business hours' });
  }
});

// Update step 4: FAQs
router.post('/step4', authenticate, async (req, res) => {
  try {
    const { faqs } = req.body;
    
    // Validate max 5 FAQs
    if (faqs && faqs.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 FAQs allowed' });
    }
    
    await AIAgent.update(req.businessId, {
      faqs,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 4 error:', error);
    res.status(500).json({ error: 'Failed to update FAQs' });
  }
});

// Update step 5: Message settings
router.post('/step5', authenticate, async (req, res) => {
  try {
    const { message_settings } = req.body;
    
    await AIAgent.update(req.businessId, {
      message_settings,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 5 error:', error);
    res.status(500).json({ error: 'Failed to update message settings' });
  }
});

// Finalize setup
router.post('/finalize', authenticate, async (req, res) => {
  try {
    // Mark onboarding as complete
    await Business.setOnboardingComplete(req.businessId);
    
    const business = await Business.findById(req.businessId);
    
    res.json({
      success: true,
      onboarding_complete: true,
      vapi_phone_number: business.vapi_phone_number,
      voximplant_number: business.voximplant_number, // Legacy
      telnyx_number: business.telnyx_number, // Legacy
    });
  } catch (error) {
    console.error('Finalize setup error:', error);
    res.status(500).json({ error: 'Failed to finalize setup' });
  }
});

export default router;

