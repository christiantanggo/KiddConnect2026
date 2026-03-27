// routes/diagnostics.js
// Diagnostic endpoints to help debug dashboard issues

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getApiPublicBaseUrl } from '../config/public-urls.js';
import { Business } from '../models/Business.js';
import { CallSession } from '../models/CallSession.js';
import { Message } from '../models/Message.js';
import { UsageMinutes } from '../models/UsageMinutes.js';

const router = express.Router();

// Get the actual assistant prompt from VAPI
router.get('/assistant-prompt', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ 
        error: 'No VAPI assistant ID found',
        message: 'Please provision a phone number first'
      });
    }

    const { getVapiClient } = await import('../services/vapi.js');
    const vapiClient = getVapiClient();
    const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantResponse.data;

    // Extract the system prompt from the model messages
    const systemPrompt = assistant.model?.messages?.find(msg => msg.role === 'system')?.content || 'Not found';

    // Extract business hours section from the prompt
    const hoursMatch = systemPrompt.match(/Regular Business Hours:[\s\S]*?(?=Holiday Hours|CURRENT TIME|FREQUENTLY|INSTRUCTIONS|$)/i);
    const hoursSection = hoursMatch ? hoursMatch[0] : 'Not found';

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
      },
      assistant: {
        id: assistant.id,
        name: assistant.name,
      },
      prompt_sections: {
        hours_section: hoursSection,
        full_prompt_length: systemPrompt.length,
      },
      // Show first 2000 chars of prompt for debugging
      prompt_preview: systemPrompt.substring(0, 2000) + (systemPrompt.length > 2000 ? '...' : ''),
    });
  } catch (error) {
    console.error('[Diagnostics] Error in assistant-prompt:', error);
    res.status(500).json({ 
      error: 'Failed to get assistant prompt',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check business hours configuration
router.get('/business-hours', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const AIAgent = (await import('../models/AIAgent.js')).AIAgent;
    const agent = await AIAgent.findByBusinessId(business.id);

    // Format business hours manually (since formatBusinessHours is not exported)
    const businessHours = agent?.business_hours || {};
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const formatted = [];
    
    // Helper to convert 24-hour to 12-hour format
    const convertTo12Hour = (time24) => {
      if (!time24) return "9:00 AM";
      const [hours, minutes] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${String(minutes || 0).padStart(2, '0')} ${period}`;
    };

    for (const day of days) {
      const dayLower = day.toLowerCase();
      const hours = businessHours[dayLower];
      
      if (!hours || hours.closed) {
        formatted.push(`${day}: Closed`);
      } else {
        const open12 = convertTo12Hour(hours.open || "09:00");
        const close12 = convertTo12Hour(hours.close || "17:00");
        formatted.push(`${day}: ${open12} to ${close12}`);
      }
    }

    const hoursText = formatted.join("\n");

    res.json({
      business: {
        id: business.id,
        name: business.name,
        timezone: business.timezone,
      },
      agent: {
        id: agent?.id || 'N/A',
        business_hours: agent?.business_hours || {},
        formatted_hours: hoursText,
      },
      raw_hours: JSON.stringify(agent?.business_hours || {}, null, 2),
      // Add detailed breakdown for easier debugging
      detailed_hours: Object.keys(businessHours).map(day => ({
        day,
        hours: businessHours[day],
        formatted: businessHours[day]?.closed 
          ? 'Closed' 
          : `${convertTo12Hour(businessHours[day]?.open)} to ${convertTo12Hour(businessHours[day]?.close)}`
      })),
    });
  } catch (error) {
    console.error('[Diagnostics] Error in business-hours:', error);
    res.status(500).json({ 
      error: 'Failed to get business hours',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/check-webhook', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ 
        error: 'No VAPI assistant ID found',
        message: 'Please provision a phone number first'
      });
    }

    // Get assistant config from VAPI
    const { getVapiClient } = await import('../services/vapi.js');
    const vapiClient = getVapiClient();
    const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantResponse.data;

    // Expected webhook URL
    let backendUrl = getApiPublicBaseUrl();
    
    // Ensure URL has https:// protocol
    if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
      backendUrl = `https://${backendUrl}`;
    }
    
    const expectedWebhookUrl = `${backendUrl}/api/vapi/webhook`;

    // Normalize URLs for comparison (remove trailing slashes, lowercase)
    const normalizeUrl = (url) => {
      if (!url) return '';
      return url.toLowerCase().replace(/\/$/, '');
    };

    // Check for issues
    const issues = [];
    if (!assistant.serverUrl) {
      issues.push('❌ CRITICAL: serverUrl is NOT SET - webhooks will not be sent!');
    } else if (normalizeUrl(assistant.serverUrl) !== normalizeUrl(expectedWebhookUrl)) {
      issues.push(`⚠️ serverUrl mismatch: expected ${expectedWebhookUrl}, got ${assistant.serverUrl}`);
    }

    if (!assistant.serverMessages || assistant.serverMessages.length === 0) {
      issues.push('❌ CRITICAL: serverMessages is NOT SET - webhooks will not be sent!');
    } else {
      const requiredMessages = ['status-update', 'end-of-call-report'];
      const missing = requiredMessages.filter(msg => !assistant.serverMessages.includes(msg));
      if (missing.length > 0) {
        issues.push(`⚠️ Missing required serverMessages: ${missing.join(', ')}`);
      }
    }

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
        vapi_phone_number: business.vapi_phone_number,
      },
      assistant: {
        id: assistant.id,
        name: assistant.name,
        serverUrl: assistant.serverUrl || 'NOT SET',
        serverMessages: assistant.serverMessages || [],
        metadata: assistant.metadata || {},
      },
      expected: {
        webhookUrl: expectedWebhookUrl,
        serverMessages: ['status-update', 'end-of-call-report', 'function-call', 'hang'],
      },
      status: {
        webhookUrlConfigured: normalizeUrl(assistant.serverUrl) === normalizeUrl(expectedWebhookUrl),
        serverMessagesConfigured: assistant.serverMessages && assistant.serverMessages.length > 0,
        hasBusinessIdInMetadata: !!assistant.metadata?.businessId,
        allGood: issues.length === 0,
      },
      issues: issues,
      fix: issues.length > 0 ? 'Call POST /api/diagnostics/rebuild-assistant to fix' : null,
    });
  } catch (error) {
    console.error('[Diagnostics] Error checking webhook:', error);
    res.status(500).json({ 
      error: 'Failed to check webhook configuration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get diagnostic information for the current business
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get recent calls
    const recentCalls = await CallSession.findByBusinessId(req.businessId, 10);
    
    // Get recent messages
    const recentMessages = await Message.findByBusinessId(req.businessId, 10);
    
    // Get usage for current billing cycle
    const { getCurrentCycleUsage } = await import('../services/usage.js');
    const usage = await getCurrentCycleUsage(req.businessId);
    
    // Check VAPI assistant configuration
    let assistantConfig = null;
    if (business.vapi_assistant_id) {
      try {
        const { getVapiClient } = await import('../services/vapi.js');
        const vapiClient = getVapiClient();
        const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
        assistantConfig = {
          id: assistantResponse.data.id,
          name: assistantResponse.data.name,
          serverUrl: assistantResponse.data.serverUrl,
          serverMessages: assistantResponse.data.serverMessages || [],
          metadata: assistantResponse.data.metadata || {},
        };
      } catch (error) {
        console.error('[Diagnostics] Error fetching assistant config:', error.message);
      }
    }

    // Check webhook endpoint accessibility
    const backendUrl = getApiPublicBaseUrl();
    const expectedWebhookUrl = `${backendUrl}/api/vapi/webhook`;

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
        vapi_phone_number: business.vapi_phone_number,
        email_ai_answered: business.email_ai_answered,
        email_missed_calls: business.email_missed_calls,
        notification_email: business.notification_email || business.email,
      },
      assistant: assistantConfig,
      webhook: {
        expectedUrl: expectedWebhookUrl,
        configured: assistantConfig?.serverUrl === expectedWebhookUrl,
        serverMessagesConfigured: assistantConfig?.serverMessages?.length > 0,
        metadataConfigured: !!assistantConfig?.metadata?.businessId,
      },
      data: {
        recentCallsCount: recentCalls?.length || 0,
        recentMessagesCount: recentMessages?.length || 0,
        usageMinutes: usage?.totalMinutes || 0,
        recentCalls: recentCalls?.slice(0, 5) || [],
        recentMessages: recentMessages?.slice(0, 5) || [],
      },
      issues: [
        !business.vapi_assistant_id && 'No VAPI assistant ID configured',
        !business.vapi_phone_number && 'No phone number assigned',
        assistantConfig && assistantConfig.serverUrl !== expectedWebhookUrl && 'Webhook URL mismatch',
        assistantConfig && (!assistantConfig.serverMessages || assistantConfig.serverMessages.length === 0) && 'No serverMessages configured in assistant',
        assistantConfig && !assistantConfig.metadata?.businessId && 'BusinessId not in assistant metadata',
        recentCalls?.length === 0 && 'No call sessions found',
        recentMessages?.length === 0 && 'No messages found',
        usage?.totalMinutes === 0 && 'No usage minutes recorded',
      ].filter(Boolean),
    });
  } catch (error) {
    console.error('[Diagnostics] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get diagnostics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rebuild assistant with businessId in metadata
router.post('/rebuild-assistant', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ 
        error: 'No VAPI assistant ID found',
        message: 'Please provision a phone number first'
      });
    }

    console.log(`[Diagnostics] Rebuilding assistant for business: ${business.id}`);
    const { rebuildAssistant } = await import('../services/vapi.js');
    await rebuildAssistant(business.id);

    res.json({ 
      success: true,
      message: 'Assistant rebuilt successfully with businessId in metadata'
    });
  } catch (error) {
    console.error('[Diagnostics] Error rebuilding assistant:', error);
    res.status(500).json({ 
      error: 'Failed to rebuild assistant',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get recent call sessions to check if webhooks are working
router.get('/recent-activity', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get recent calls (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: recentCalls, error: callsError } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('business_id', business.id)
      .gte('started_at', sevenDaysAgo.toISOString())
      .order('started_at', { ascending: false })
      .limit(50);

    if (callsError) {
      console.error('[Diagnostics] Error fetching recent calls:', callsError);
    }

    // Get recent messages (last 7 days)
    const { data: recentMessages, error: messagesError } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('business_id', business.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (messagesError) {
      console.error('[Diagnostics] Error fetching recent messages:', messagesError);
    }

    // Get usage for last 7 days
    const { UsageMinutes } = await import('../models/UsageMinutes.js');
    const usage = await UsageMinutes.getMonthlyUsage(
      business.id,
      new Date().getFullYear(),
      new Date().getMonth() + 1
    );

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
        vapi_phone_number: business.vapi_phone_number,
      },
      recentActivity: {
        calls: {
          count: recentCalls?.length || 0,
          lastCall: recentCalls && recentCalls.length > 0 ? recentCalls[0].started_at : null,
          calls: recentCalls?.slice(0, 10) || [],
        },
        messages: {
          count: recentMessages?.length || 0,
          lastMessage: recentMessages && recentMessages.length > 0 ? recentMessages[0].created_at : null,
          messages: recentMessages?.slice(0, 10) || [],
        },
        usage: {
          totalMinutes: usage?.totalMinutes || 0,
          overageMinutes: usage?.overageMinutes || 0,
        },
      },
      summary: {
        hasRecentCalls: (recentCalls?.length || 0) > 0,
        hasRecentMessages: (recentMessages?.length || 0) > 0,
        hasUsage: (usage?.totalMinutes || 0) > 0,
        lastActivity: recentCalls?.[0]?.started_at || recentMessages?.[0]?.created_at || null,
      },
    });
  } catch (error) {
    console.error('[Diagnostics] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get recent activity',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;

