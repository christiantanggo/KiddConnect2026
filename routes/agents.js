import express from 'express';
import { AIAgent } from '../models/AIAgent.js';
import { Business } from '../models/Business.js';
import { authenticate, ensureBusinessAccess } from '../middleware/auth.js';

const router = express.Router();

// Get AI agent config
router.get('/', authenticate, async (req, res) => {
  try {
    const agent = await AIAgent.findByBusinessId(req.businessId);
    
    if (!agent) {
      return res.status(404).json({ error: 'AI agent not found' });
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to get agent config' });
  }
});

// Update AI agent config
router.put('/', authenticate, async (req, res) => {
  try {
    console.log('[Agent Settings] ========== SAVE REQUEST START ==========');
    console.log('[Agent Settings] Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      name,
      greeting_text,
      opening_greeting,
      ending_greeting,
      business_hours,
      faqs,
      holiday_hours,
      message_settings,
      voice_settings,
      system_instructions,
    } = req.body;
    
    console.log('[Agent Settings] Extracted values:', {
      opening_greeting,
      ending_greeting,
      faqs_count: faqs?.length || 0,
      holiday_hours_count: holiday_hours?.length || 0,
    });
    
    // CRITICAL: Normalize holiday hours dates to ensure they're in YYYY-MM-DD format
    // This prevents timezone issues when dates are stored/retrieved
    let normalizedHolidayHours = holiday_hours;
    if (holiday_hours && Array.isArray(holiday_hours)) {
      normalizedHolidayHours = holiday_hours.map(h => {
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
        // If it's already in YYYY-MM-DD format, use it as-is
        else if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // Already in correct format, use as-is
          dateStr = dateStr;
        }
        // If it's in a different format, try to parse it
        else if (typeof dateStr === 'string') {
          // Try to extract YYYY-MM-DD from various formats
          const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            dateStr = dateMatch[0]; // Use the matched YYYY-MM-DD
          } else {
            console.warn(`[Agent Settings] Could not parse holiday date: ${dateStr}, using as-is`);
          }
        }
        
        return { ...h, date: dateStr };
      });
      
      console.log('[Agent Settings] ========== HOLIDAY HOURS NORMALIZATION ==========');
      console.log('[Agent Settings] Original holiday hours from frontend:', JSON.stringify(holiday_hours.map(h => ({ name: h?.name, date: h?.date, dateType: typeof h?.date })), null, 2));
      console.log('[Agent Settings] Normalized holiday hours before saving:', JSON.stringify(normalizedHolidayHours.map(h => ({ name: h?.name, date: h?.date, dateType: typeof h?.date })), null, 2));
      console.log('[Agent Settings] ===================================================');
    }
    
    // Validate FAQ limits
    if (faqs !== undefined) {
      const { validateFaqLimit, validateFaqContent, updateFaqCount } = await import('../services/faqValidation.js');
      const business = await Business.findById(req.businessId);
      const currentFaqCount = business.faq_count || 0;
      
      // Validate each FAQ
      for (const faq of faqs) {
        const contentValidation = validateFaqContent(faq);
        if (!contentValidation.valid) {
          return res.status(400).json({ error: contentValidation.error });
        }
      }
      
      // Validate FAQ limit
      const limitValidation = await validateFaqLimit(req.businessId, currentFaqCount, faqs.length);
      if (!limitValidation.valid) {
        return res.status(400).json({ error: limitValidation.message });
      }
      
      // Update FAQ count
      await updateFaqCount(req.businessId, faqs.length);
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (greeting_text !== undefined) updateData.greeting_text = greeting_text;
    if (opening_greeting !== undefined) updateData.opening_greeting = opening_greeting;
    if (ending_greeting !== undefined) updateData.ending_greeting = ending_greeting;
    if (business_hours !== undefined) {
      updateData.business_hours = business_hours;
      console.log('[Agent Settings] ✅ Adding business_hours to updateData');
      console.log('[Agent Settings] business_hours data:', JSON.stringify(business_hours, null, 2));
    } else {
      console.warn('[Agent Settings] ⚠️ business_hours is undefined in request body');
    }
    if (faqs !== undefined) updateData.faqs = faqs;
    // Use normalized holiday hours to ensure dates are in YYYY-MM-DD format
    if (holiday_hours !== undefined) updateData.holiday_hours = normalizedHolidayHours;
    if (message_settings !== undefined) updateData.message_settings = message_settings;
    if (voice_settings !== undefined) updateData.voice_settings = voice_settings;
    if (system_instructions !== undefined) updateData.system_instructions = system_instructions;
    
    console.log('[Agent Settings] ========== UPDATING AGENT ==========');
    console.log('[Agent Settings] Business ID:', req.businessId);
    console.log('[Agent Settings] Update data keys:', Object.keys(updateData));
    console.log('[Agent Settings] Updating with data:', JSON.stringify(updateData, null, 2));
    
    const agent = await AIAgent.update(req.businessId, updateData);
    
    console.log('[Agent Settings] ✅ Agent updated successfully');
    if (agent.business_hours) {
      console.log('[Agent Settings] Saved business_hours:', JSON.stringify(agent.business_hours, null, 2));
    }
    console.log('[Agent Settings] ===============================================');
    console.log('[Agent Settings] Updated agent:', {
      id: agent.id,
      opening_greeting: agent.opening_greeting,
      ending_greeting: agent.ending_greeting,
      faqs_count: agent.faqs?.length || 0,
    });
    
    // ALWAYS rebuild VAPI assistant when agent settings change
    // This ensures the assistant has the latest data (FAQs, hours, greetings, etc.)
    // CRITICAL: Do this synchronously (not in async IIFE) to ensure it completes
    console.log('[Agent Settings] 🔄 Triggering VAPI assistant rebuild...');
    try {
      const { rebuildAssistant } = await import('../services/vapi.js');
      console.log('[Agent Settings] Rebuild function imported, calling rebuildAssistant...');
      await rebuildAssistant(req.businessId);
      console.log('[Agent Settings] ✅ VAPI assistant rebuilt successfully');
    } catch (vapiError) {
      console.error('[Agent Settings] ❌❌❌ ERROR rebuilding VAPI assistant:', {
        message: vapiError.message,
        stack: vapiError.stack,
        code: vapiError.code,
        response: vapiError.response?.data,
      });
      // Don't fail the request if VAPI update fails, but log it prominently
      console.error('[Agent Settings] ⚠️ WARNING: Assistant rebuild failed. User should manually rebuild via dashboard button.');
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent config' });
  }
});

// Rebuild VAPI assistant (manual trigger)
router.post('/rebuild', authenticate, async (req, res) => {
  try {
    console.log('[Agent Rebuild] Rebuild request for business:', req.businessId);
    
    if (!process.env.VAPI_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'VAPI API key not configured' 
      });
    }
    
    const { rebuildAssistant } = await import('../services/vapi.js');
    await rebuildAssistant(req.businessId);
    
    res.json({ success: true, message: 'AI agent rebuilt successfully' });
  } catch (error) {
    console.error('[Agent Rebuild] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to rebuild agent' 
    });
  }
});

export default router;

