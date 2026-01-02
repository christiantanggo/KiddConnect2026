// routes/vapi.js
// VAPI webhook handler for call events

import express from "express";
import { CallSession } from "../models/CallSession.js";
import { Business } from "../models/Business.js";
import { Message } from "../models/Message.js";
import { getCallSummary, forwardCallToBusiness } from "../services/vapi.js";
import { checkMinutesAvailable, recordCallUsage } from "../services/usage.js";
import { sendCallSummaryEmail, sendSMSNotification, sendMissedCallEmail } from "../services/notifications.js";
import { isBusinessOpenAtTime } from "../utils/businessHours.js";
import { AIAgent } from "../models/AIAgent.js";

const router = express.Router();

/**
 * Quick status check - simple endpoint to verify webhook is accessible
 * GET /api/vapi/webhook - Quick status check
 * POST /api/vapi/webhook - Actual webhook handler
 */
router.get("/webhook", (_req, res) => {
  const backendUrl = process.env.BACKEND_URL || 
                    process.env.RAILWAY_PUBLIC_DOMAIN || 
                    process.env.VERCEL_URL || 
                    process.env.SERVER_URL ||
                    "https://api.tavarios.com";
  
  const webhookUrl = `${backendUrl}/api/vapi/webhook`;
  
  res.status(200).json({
    status: "✅ Webhook endpoint is accessible",
    webhookUrl: webhookUrl,
    configured: !!(process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL || process.env.SERVER_URL),
    message: "If this URL doesn't match what's in VAPI, rebuild your assistant",
  });
});

/**
 * Quick environment variable check - shows what the server actually sees
 * GET /api/vapi/webhook/env-check
 */
router.get("/webhook/env-check", (_req, res) => {
  res.status(200).json({
    environment: {
      SUPABASE_URL: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 20)}...` : "NOT SET",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET (hidden)" : "NOT SET",
      VAPI_API_KEY: process.env.VAPI_API_KEY ? "SET (hidden)" : "NOT SET",
      BACKEND_URL: process.env.BACKEND_URL || "NOT SET",
      RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || "NOT SET",
      NODE_ENV: process.env.NODE_ENV || "NOT SET",
    },
    note: "If variables show 'NOT SET' but are in Railway/.env, restart the server",
  });
});

/**
 * Test POST endpoint to verify webhook can receive data
 */
router.post("/webhook/test", async (req, res) => {
  console.log("🧪 TEST WEBHOOK RECEIVED");
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  
  res.status(200).json({
    status: "ok",
    message: "Test webhook received successfully",
    received: {
      body: req.body,
      headers: Object.keys(req.headers),
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Quick check - see if webhook is configured correctly
 * GET /api/vapi/webhook/check - Quick status
 */
router.get("/webhook/check", async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    
    // Create VAPI client directly (getVapiClient is not exported)
    const axios = (await import("axios")).default;
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
    
    if (!VAPI_API_KEY) {
      return res.status(200).json({
        status: "⚠️ VAPI API key not configured",
        message: "Set VAPI_API_KEY environment variable",
      });
    }
    
    const vapiClient = axios.create({
      baseURL: VAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    
    const backendUrl = process.env.BACKEND_URL || 
                      process.env.RAILWAY_PUBLIC_DOMAIN || 
                      process.env.VERCEL_URL || 
                      process.env.SERVER_URL ||
                      "https://api.tavarios.com";
    
    const expectedWebhookUrl = `${backendUrl}/api/vapi/webhook`;
    
    // Get first business with VAPI assistant
    const { data: business } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_assistant_id')
      .not('vapi_assistant_id', 'is', null)
      .limit(1)
      .single();
    
    if (!business) {
      return res.status(200).json({
        status: "⚠️ No assistants found",
        message: "Create an assistant first",
        expectedWebhookUrl: expectedWebhookUrl,
      });
    }
    
    // Check assistant webhook
    const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantResponse.data;
    
    const isCorrect = assistant.serverUrl === expectedWebhookUrl;
    
    res.status(200).json({
      status: isCorrect ? "✅ Configured correctly" : "❌ Mismatch",
      expected: expectedWebhookUrl,
      actual: assistant.serverUrl || "not set",
      match: isCorrect,
      message: isCorrect 
        ? "Webhook is configured correctly!" 
        : "Rebuild your assistant to fix the webhook URL",
    });
  } catch (error) {
    res.status(500).json({
      status: "❌ Error",
      error: error.message,
    });
  }
});

/**
 * Check if phone number is linked to assistant
 * GET /api/vapi/webhook/phone-check
 */
router.get("/webhook/phone-check", async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    
    // Create VAPI client
    const axios = (await import("axios")).default;
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
    
    if (!VAPI_API_KEY) {
      return res.status(200).json({
        status: "⚠️ VAPI API key not configured",
        message: "Set VAPI_API_KEY environment variable",
      });
    }
    
    const vapiClient = axios.create({
      baseURL: VAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    
    // Get first business with VAPI assistant and phone number
    const { data: business } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_assistant_id, vapi_phone_number')
      .not('vapi_assistant_id', 'is', null)
      .not('vapi_phone_number', 'is', null)
      .limit(1)
      .single();
    
    if (!business) {
      return res.status(200).json({
        status: "⚠️ No business found with both assistant and phone number",
        message: "Provision a phone number and link it to an assistant",
      });
    }
    
    // Get phone numbers from VAPI
    const phoneNumbersRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneNumbersRes.data) 
      ? phoneNumbersRes.data 
      : (phoneNumbersRes.data?.data || []);
    
    // Find matching phone number
    const matchingNumber = phoneNumbers.find(
      pn => (pn.number === business.vapi_phone_number) || 
            (pn.phoneNumber === business.vapi_phone_number) ||
            (pn.phone_number === business.vapi_phone_number)
    );
    
    if (!matchingNumber) {
      return res.status(200).json({
        status: "⚠️ Phone number not found in VAPI",
        businessPhone: business.vapi_phone_number,
        message: "Phone number may not be provisioned in VAPI",
      });
    }
    
    // Check if linked to assistant
    const linkedAssistantId = matchingNumber.assistantId || matchingNumber.assistant?.id;
    const isLinked = linkedAssistantId === business.vapi_assistant_id;
    
    return res.status(200).json({
      status: isLinked ? "✅ Linked correctly" : "❌ NOT LINKED",
      business: {
        name: business.name,
        assistantId: business.vapi_assistant_id,
        phoneNumber: business.vapi_phone_number,
      },
      vapiPhoneNumber: {
        id: matchingNumber.id,
        number: matchingNumber.number || matchingNumber.phoneNumber || matchingNumber.phone_number,
        linkedAssistantId: linkedAssistantId || "NOT SET",
        expectedAssistantId: business.vapi_assistant_id,
      },
      isLinked: isLinked,
      message: isLinked 
        ? "Phone number is correctly linked to assistant - webhooks should work!" 
        : "❌ CRITICAL: Phone number is NOT linked to assistant! This is why webhooks aren't working. Link the phone number to the assistant in VAPI dashboard or use the /api/business/phone-numbers/link endpoint.",
    });
  } catch (error) {
    res.status(500).json({
      status: "❌ Error",
      error: error.message,
    });
  }
});

/**
 * Diagnostic endpoint to check webhook configuration (detailed)
 */
router.get("/webhook/diagnostic", async (req, res) => {
  try {
    // Import database client
    const databaseModule = await import("../config/database.js");
    const supabaseClient = databaseModule.supabaseClient || databaseModule.default;
    
    if (!supabaseClient) {
      throw new Error("Failed to import supabaseClient from database config");
    }
    
    // Get webhook URL from environment
    const backendUrl = process.env.BACKEND_URL || 
                      process.env.RAILWAY_PUBLIC_DOMAIN || 
                      process.env.VERCEL_URL || 
                      process.env.SERVER_URL ||
                      "https://api.tavarios.com";
    
    const webhookUrl = `${backendUrl}/api/vapi/webhook`;
    
    // Check all required environment variables
    const envChecks = {
      // VAPI - CRITICAL for webhooks
      VAPI_API_KEY: {
        set: !!process.env.VAPI_API_KEY,
        status: process.env.VAPI_API_KEY ? "✅ Set" : "❌ NOT SET - CRITICAL!",
        description: "Required for VAPI API calls and assistant management"
      },
      VAPI_BASE_URL: {
        set: !!process.env.VAPI_BASE_URL,
        status: process.env.VAPI_BASE_URL ? `✅ Set: ${process.env.VAPI_BASE_URL}` : "⚠️ Using default: https://api.vapi.ai",
        description: "VAPI API base URL (optional, defaults to https://api.vapi.ai)"
      },
      VAPI_WEBHOOK_SECRET: {
        set: !!process.env.VAPI_WEBHOOK_SECRET,
        status: process.env.VAPI_WEBHOOK_SECRET ? "✅ Set" : "⚠️ Not set (optional but recommended for security)",
        description: "Optional webhook signature verification secret"
      },
      // Webhook URL - CRITICAL
      BACKEND_URL: {
        set: !!process.env.BACKEND_URL,
        status: process.env.BACKEND_URL ? `✅ Set: ${process.env.BACKEND_URL}` : "⚠️ Not set",
        description: "Primary backend URL for webhook (checked first)"
      },
      RAILWAY_PUBLIC_DOMAIN: {
        set: !!process.env.RAILWAY_PUBLIC_DOMAIN,
        status: process.env.RAILWAY_PUBLIC_DOMAIN ? `✅ Set: ${process.env.RAILWAY_PUBLIC_DOMAIN}` : "⚠️ Not set",
        description: "Railway public domain (fallback for webhook URL)"
      },
      VERCEL_URL: {
        set: !!process.env.VERCEL_URL,
        status: process.env.VERCEL_URL ? `✅ Set: ${process.env.VERCEL_URL}` : "⚠️ Not set",
        description: "Vercel URL (fallback for webhook URL)"
      },
      SERVER_URL: {
        set: !!process.env.SERVER_URL,
        status: process.env.SERVER_URL ? `✅ Set: ${process.env.SERVER_URL}` : "⚠️ Not set",
        description: "Server URL (fallback for webhook URL)"
      },
      // Database - CRITICAL (Supabase)
      SUPABASE_URL: {
        set: !!process.env.SUPABASE_URL,
        status: process.env.SUPABASE_URL ? "✅ Set" : "❌ NOT SET - CRITICAL!",
        description: "Required for Supabase database connection"
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        status: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Set" : "❌ NOT SET - CRITICAL!",
        description: "Required for Supabase database operations (service role key)"
      },
      // Legacy/alternative database connection
      DATABASE_URL: {
        set: !!process.env.DATABASE_URL,
        status: process.env.DATABASE_URL ? "✅ Set" : "⚠️ Not set (using Supabase instead)",
        description: "PostgreSQL connection string (optional if using Supabase)"
      },
      // Other services (optional but may be needed)
      OPENAI_API_KEY: {
        set: !!process.env.OPENAI_API_KEY,
        status: process.env.OPENAI_API_KEY ? "✅ Set" : "⚠️ Not set (may be needed for some features)",
        description: "OpenAI API key (if using OpenAI directly)"
      },
      TELNYX_API_KEY: {
        set: !!process.env.TELNYX_API_KEY,
        status: process.env.TELNYX_API_KEY ? "✅ Set" : "⚠️ Not set (may be needed for phone provisioning)",
        description: "Telnyx API key (if provisioning numbers directly)"
      },
    };
    
    // Determine webhook URL status
    const webhookUrlStatus = (process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 
                              process.env.VERCEL_URL || process.env.SERVER_URL) 
      ? "✅ Webhook URL can be determined" 
      : "❌ CRITICAL: No webhook URL environment variable set! Using default: https://api.tavarios.com";
    
    // Test VAPI API connection
    let vapiConnectionTest = { status: "⚠️ Not tested" };
    if (process.env.VAPI_API_KEY) {
      try {
        const axios = (await import("axios")).default;
        const VAPI_API_KEY = process.env.VAPI_API_KEY;
        const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
        
        const testClient = axios.create({
          baseURL: VAPI_BASE_URL,
          headers: {
            Authorization: `Bearer ${VAPI_API_KEY}`,
            "Content-Type": "application/json",
          },
        });
        
        // Try to get assistants list (lightweight test)
        const testResponse = await testClient.get("/assistant?limit=1");
        vapiConnectionTest = {
          status: "✅ Connected successfully",
          baseUrl: VAPI_BASE_URL,
          message: "VAPI API is accessible"
        };
      } catch (error) {
        vapiConnectionTest = {
          status: "❌ Connection failed",
          error: error.response?.status ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message,
          message: "Cannot connect to VAPI API - check VAPI_API_KEY"
        };
      }
    } else {
      vapiConnectionTest = {
        status: "⚠️ Skipped - VAPI_API_KEY not set",
        message: "Cannot test VAPI connection without API key"
      };
    }
    
    // Get all businesses with VAPI assistants
    const { data: businesses, error: businessError } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_assistant_id')
      .not('vapi_assistant_id', 'is', null)
      .limit(10);
    
    const assistantConfigs = [];
    
    if (businesses && businesses.length > 0 && process.env.VAPI_API_KEY) {
      try {
        const axios = (await import("axios")).default;
        const VAPI_API_KEY = process.env.VAPI_API_KEY;
        const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
        
        const vapiClient = axios.create({
          baseURL: VAPI_BASE_URL,
          headers: {
            Authorization: `Bearer ${VAPI_API_KEY}`,
            "Content-Type": "application/json",
          },
        });
        
        for (const business of businesses) {
          try {
            const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
            const assistant = assistantResponse.data;
            
            const hasServerMessages = assistant.serverMessages && assistant.serverMessages.length > 0;
            
            assistantConfigs.push({
              businessId: business.id,
              businessName: business.name,
              assistantId: business.vapi_assistant_id,
              assistantName: assistant.name,
              webhookUrl: assistant.serverUrl || "not set",
              webhookSecretSet: assistant.isServerUrlSecretSet || false,
              serverMessages: assistant.serverMessages || [],
              hasServerMessages: hasServerMessages,
              webhookUrlMatch: assistant.serverUrl === webhookUrl,
              status: assistant.serverUrl === webhookUrl && hasServerMessages 
                ? "✅ Correctly configured" 
                : assistant.serverUrl === webhookUrl 
                  ? "⚠️ Webhook URL correct but serverMessages missing!" 
                  : hasServerMessages 
                    ? "⚠️ serverMessages set but webhook URL mismatch!" 
                    : "❌ Both webhook URL and serverMessages need fixing",
            });
          } catch (error) {
            assistantConfigs.push({
              businessId: business.id,
              businessName: business.name,
              assistantId: business.vapi_assistant_id,
              error: error.response?.status ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message,
              status: "❌ Error fetching from VAPI",
            });
          }
        }
      } catch (error) {
        assistantConfigs.push({
          error: "Cannot fetch assistants - VAPI connection failed",
          details: error.message
        });
      }
    } else if (!process.env.VAPI_API_KEY) {
      assistantConfigs.push({
        error: "VAPI_API_KEY not set - cannot fetch assistant configurations"
      });
    } else {
      assistantConfigs.push({
        message: "No businesses with VAPI assistants found"
      });
    }
    
    // Overall status
    const criticalIssues = [];
    if (!process.env.VAPI_API_KEY) criticalIssues.push("VAPI_API_KEY not set");
    if (!process.env.SUPABASE_URL) criticalIssues.push("SUPABASE_URL not set");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) criticalIssues.push("SUPABASE_SERVICE_ROLE_KEY not set");
    if (!process.env.BACKEND_URL && !process.env.RAILWAY_PUBLIC_DOMAIN && !process.env.VERCEL_URL && !process.env.SERVER_URL) {
      criticalIssues.push("No webhook URL environment variable set");
    }
    
    const overallStatus = criticalIssues.length === 0 
      ? "✅ All critical credentials are configured" 
      : `❌ ${criticalIssues.length} critical issue(s) found`;
    
    res.status(200).json({
      status: overallStatus,
      criticalIssues: criticalIssues,
      diagnostic: {
        overallStatus: overallStatus,
        webhookUrl: {
          expected: webhookUrl,
          status: webhookUrlStatus,
          determinedFrom: process.env.BACKEND_URL ? "BACKEND_URL" :
                         process.env.RAILWAY_PUBLIC_DOMAIN ? "RAILWAY_PUBLIC_DOMAIN" :
                         process.env.VERCEL_URL ? "VERCEL_URL" :
                         process.env.SERVER_URL ? "SERVER_URL" : "default (https://api.tavarios.com)"
        },
        environmentVariables: envChecks,
        vapiConnection: vapiConnectionTest,
        assistants: assistantConfigs,
        instructions: {
          step1: "Check 'environmentVariables' section above - all items marked '❌ NOT SET' must be configured",
          step2: "Verify 'vapiConnection' shows '✅ Connected successfully'",
          step3: "Check 'assistants' section - each assistant should show '✅ Correctly configured'",
          step4: "If webhook URL or serverMessages are wrong, rebuild the assistant",
          step5: "Test webhook by calling: POST /api/vapi/webhook/test",
          step6: "Make a test call and check server logs for 'INBOUND WEBHOOK HIT'",
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
      stack: error.stack,
    });
  }
});

/**
 * VAPI Webhook Handler
 * Handles call-start, call-end, transfer-started, transfer-failed, call-returned events
 * 
 * CRITICAL: Respond IMMEDIATELY - do NOT wait for DB operations
 * VAPI needs a fast response to answer calls properly
 */
router.post("/webhook", async (req, res) => {
  // 🔥 IMMEDIATE LOG - First thing we do (comprehensive)
  const eventType = req.body?.type || req.body?.event || req.body?.message?.type;
  const callId = req.body?.call?.id || req.body?.message?.call?.id;
  const assistantId = req.body?.call?.assistant?.id || req.body?.message?.assistant?.id;
  const businessId = req.body?.call?.assistant?.metadata?.businessId || req.body?.message?.assistant?.metadata?.businessId;
  
  console.log(`🔥🔥🔥 INBOUND WEBHOOK HIT 🔥🔥🔥`);
  console.log(`🔥 Event Type: ${eventType || 'unknown'}`);
  console.log(`🔥 Call ID: ${callId || 'N/A'}`);
  console.log(`🔥 Assistant ID: ${assistantId || 'N/A'}`);
  console.log(`🔥 Business ID: ${businessId || 'N/A'}`);
  console.log(`🔥 Timestamp: ${new Date().toISOString()}`);
  
  // RESPOND IMMEDIATELY - Don't wait for anything
  // This tells VAPI we received the webhook
  res.status(200).json({ received: true });
  
  // Now process asynchronously (don't await - let it run in background)
  // Use setImmediate to ensure response is sent first
  setImmediate(async () => {
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      const event = req.body;
      // VAPI sends event type in multiple possible locations:
      // 1. event.type (direct)
      // 2. event.event (alternative)
      // 3. event.message.type (nested in message object - most common for status-update and end-of-call-report)
      const eventTypeFromEvent = event.type || event.event || event.message?.type;
      
      console.log(`[VAPI Webhook ${webhookId}] 📥 Processing ${eventTypeFromEvent || 'unknown'} event`);

      // Verify webhook signature if secret is provided
      if (process.env.VAPI_WEBHOOK_SECRET) {
        // TODO: Implement signature verification
        // const signature = req.headers["vapi-signature"];
        // verifySignature(req.body, signature);
      }

      if (!eventTypeFromEvent) {
        console.warn(`[VAPI Webhook ${webhookId}] ⚠️  No event type found in request body`);
        console.warn(`[VAPI Webhook ${webhookId}] Event keys:`, Object.keys(event).join(', '));
        return;
      }

      // Extract call info - handle both direct event structure and nested message structure
      const callId = event.call?.id || event.message?.call?.id;
      const assistantId = event.call?.assistant?.id || event.message?.assistant?.id;
      const businessId = event.call?.assistant?.metadata?.businessId || event.message?.assistant?.metadata?.businessId;
      const callerNumber = event.call?.customer?.number || event.message?.customer?.number;

      console.log(`[VAPI Webhook ${webhookId}] 📞 Received event: ${eventType}`, {
        callId: callId,
        assistantId: assistantId,
        businessId: businessId,
        callerNumber: callerNumber,
        fullEvent: JSON.stringify(event, null, 2).substring(0, 500), // First 500 chars for debugging
      });

      // Handle different event types (async - don't block)
      switch (eventTypeFromEvent) {
        case "call-start":
        case "status-update":
          // status-update with status "ringing" or "started" is equivalent to call-start
          if (eventTypeFromEvent === "status-update" && (event.message?.status === "ringing" || event.message?.status === "started")) {
            console.log(`[VAPI Webhook ${webhookId}] 🟢 Processing status-update (call-start) event`);
            await handleCallStart(event); // Pass full event, not just message
          } else if (eventTypeFromEvent === "status-update" && event.message?.status === "ended") {
            // status-update with status "ended" is equivalent to call-end
            console.log(`[VAPI Webhook ${webhookId}] 🔴 Processing status-update (call-end) event`);
            await handleCallEnd(event); // Pass full event, not just message
          } else {
            console.log(`[VAPI Webhook ${webhookId}] 🟢 Processing call-start/status-update event`);
            await handleCallStart(event); // Pass full event, not just message
          }
          break;
        case "call-end":
        case "end-of-call-report":
          console.log(`[VAPI Webhook ${webhookId}] 🔴 Processing call-end/end-of-call-report event`);
          // end-of-call-report contains full call details
          await handleCallEnd(event); // Pass full event, not just message
          break;
        case "transfer-started":
          console.log(`[VAPI Webhook ${webhookId}] 🔄 Processing transfer-started event`);
          await handleTransferStarted(event.message || event);
          break;
        case "transfer-failed":
        case "transfer-ended":
          console.log(`[VAPI Webhook ${webhookId}] ❌ Processing transfer-failed/ended event`);
          await handleTransferFailed(event.message || event);
          break;
        case "call-returned":
          console.log(`[VAPI Webhook ${webhookId}] ↩️ Processing call-returned event`);
          await handleCallReturned(event.message || event);
          break;
        case "function-call":
          console.log(`[VAPI Webhook ${webhookId}] ⚙️ Processing function-call event`);
          await handleFunctionCall(event.message || event);
          break;
        case "hang":
          console.log(`[VAPI Webhook ${webhookId}] 📞 Processing hang event (call ended)`);
          await handleCallEnd(event.message || event);
          break;
        default:
          console.log(`[VAPI Webhook ${webhookId}] ⚠️ Unhandled event type: ${eventTypeFromEvent}`);
      }
      
      console.log(`[VAPI Webhook ${webhookId}] ========== WEBHOOK PROCESSING SUCCESS ==========`);
    } catch (error) {
      console.error(`[VAPI Webhook] ❌❌❌ CRITICAL ERROR processing webhook (non-blocking):`, error);
      console.error(`[VAPI Webhook] Error name:`, error.name);
      console.error(`[VAPI Webhook] Error message:`, error.message);
      console.error(`[VAPI Webhook] Error stack:`, error.stack);
      console.error(`[VAPI Webhook] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      // Don't throw - we already responded
    }
  });
});

/**
 * Handle call-start event
 */
async function handleCallStart(event) {
  const callId = (event.call || event.message?.call || event.message?.artifact?.call)?.id;
  console.log(`[VAPI Webhook] 📞 Handling call-start for call: ${callId || 'unknown'}`);
  
  try {
    // Handle nested message structure (status-update)
    // VAPI can send: event.call, event.message.call, or event.message.artifact.call
    const call = event.call || event.message?.call || event.message?.artifact?.call;
    if (!call) {
      console.error(`[VAPI Webhook] ❌ No call object in event`);
      console.error(`[VAPI Webhook] Event structure:`, {
        hasCall: !!event.call,
        hasMessageCall: !!event.message?.call,
        hasArtifactCall: !!event.message?.artifact?.call,
        eventKeys: Object.keys(event),
      });
      return;
    }
    
    const callId = call.id || event.message?.call?.id || event.message?.artifact?.call?.id;
    // Extract assistant ID - match the outer scope extraction logic
    // Check both call.assistant.id (when call is extracted) and event.message.assistant.id (when assistant is at message level)
    const assistantId = event.call?.assistant?.id 
      || event.message?.assistant?.id
      || call.assistant?.id
      || event.message?.call?.assistant?.id
      || event.message?.artifact?.assistant?.id
      || event.message?.artifact?.call?.assistant?.id;
    const callerNumber = call.customer?.number || event.message?.customer?.number || event.message?.artifact?.customer?.number;

    console.log(`[VAPI Webhook] Call details:`, {
      callId,
      assistantId,
      callerNumber,
    });

    // Skip test webhooks (assistant ID starting with "test-")
    if (!assistantId || assistantId.startsWith("test-")) {
      console.log(`[VAPI Webhook] Skipping test webhook for assistant: ${assistantId}`);
      return;
    }

    // Check if this is a demo assistant first
    const { demoAssistants } = await import("./demo.js");
    const demoData = demoAssistants.get(assistantId);
    
    if (demoData) {
      console.log(`[VAPI Webhook] 🎧 Demo assistant detected: ${assistantId}`);
      // Handle demo call - we'll process it in the call-end handler
      // For now, just log it and continue (call-end handler will check for demo)
    }
    
    // If it's a demo assistant, skip call-start processing (we'll handle it in call-end)
    if (demoData) {
      console.log(`[VAPI Webhook] 🎧 Demo assistant call-start - skipping CallSession creation (will handle in call-end)`);
      return; // Demo calls don't need CallSession tracking
    }
    
    // Find business by assistant ID
    console.log(`[VAPI Webhook] Looking up business for assistant: ${assistantId}`);
    const business = await Business.findByVapiAssistantId(assistantId);
    if (!business) {
      console.error(`[VAPI Webhook] ❌❌❌ Business not found for assistant: ${assistantId}`);
      console.error(`[VAPI Webhook] This is a CRITICAL error - call will not be tracked!`);
      return;
    }
    
    console.log(`[VAPI Webhook] ✅ Business found:`, {
      id: business.id,
      name: business.name,
      ai_enabled: business.ai_enabled,
    });

  // CRITICAL: Check minutes availability FIRST - this will re-enable AI if minutes are available
  const minutesCheck = await checkMinutesAvailable(business.id, 0);
  
  // Refresh business object after minutes check (in case AI was re-enabled)
  const refreshedBusiness = await Business.findById(business.id);
  if (refreshedBusiness) {
    business = refreshedBusiness;
  }
  
  // Check if AI is enabled (after potential re-enable from minutes check)
  if (!business.ai_enabled) {
    console.log(`[VAPI Webhook] AI disabled for business ${business.id}, forwarding call`);
    
    // Create call session record FIRST (always create, even if forward fails)
    let callSession = null;
    try {
      callSession = await CallSession.create({
        business_id: business.id,
        vapi_call_id: callId,
        caller_number: callerNumber,
        status: "forwarded",
        started_at: new Date(),
      });
      console.log(`[VAPI Webhook] ✅ Call session created for forwarded call:`, callSession.id);
    } catch (sessionError) {
      console.error(`[VAPI Webhook] ❌ Error creating call session for forwarded call:`, sessionError);
    }
    
    // Try to forward call to business (but don't fail if this doesn't work)
    try {
      await forwardCallToBusiness(callId, business.public_phone_number);
      console.log(`[VAPI Webhook] ✅ Call forwarded successfully`);
    } catch (error) {
      console.error(`[VAPI Webhook] ⚠️ Error forwarding call to business (non-critical):`, error.message);
      // Update session status to indicate forward failed
      if (callSession && callSession.id) {
        try {
          await CallSession.update(callSession.id, {
            status: "forward_failed",
          });
        } catch (updateError) {
          console.error(`[VAPI Webhook] Error updating call session status:`, updateError);
        }
      }
    }
    return;
  }

  // Minutes check already done above (before AI enabled check) to allow re-enabling
  if (!minutesCheck.available) {
    console.log(`[VAPI Webhook] Minutes exhausted for business ${business.id}, handling exhaustion`);
    
    if (business.minutes_exhausted_behavior === "disable_ai") {
      // Option A: Disable AI and forward
      await Business.update(business.id, { ai_enabled: false });
      await forwardCallToBusiness(callId, business.public_phone_number);
      
      await CallSession.create({
        business_id: business.id,
        vapi_call_id: callId,
        caller_number: callerNumber,
        status: "forwarded_no_minutes",
        started_at: new Date(),
      });
      return;
    } else if (business.minutes_exhausted_behavior === "allow_overage") {
      // Option B: Check overage cap
      if (business.overage_cap_minutes && minutesCheck.overageMinutes >= business.overage_cap_minutes) {
        // Cap reached, disable AI
        await Business.update(business.id, { ai_enabled: false });
        await forwardCallToBusiness(callId, business.public_phone_number);
        
        await CallSession.create({
          business_id: business.id,
          vapi_call_id: callId,
          caller_number: callerNumber,
          status: "forwarded_overage_cap",
          started_at: new Date(),
        });
        return;
      }
      // Under cap, allow call with overage billing
    }
  }

  // Create call session record
  try {
    console.log(`[VAPI Webhook] Creating call session with data:`, {
      business_id: business.id,
      vapi_call_id: callId,
      caller_number: callerNumber,
      status: "active",
      started_at: new Date().toISOString(),
      transfer_attempted: false,
    });
    
    const createdSession = await CallSession.create({
      business_id: business.id,
      vapi_call_id: callId,
      caller_number: callerNumber,
      status: "active",
      started_at: new Date(),
      transfer_attempted: false,
    });
    
    if (!createdSession || !createdSession.id) {
      console.error(`[VAPI Webhook] ❌❌❌ Call session creation returned null/undefined!`);
      console.error(`[VAPI Webhook] Created session:`, createdSession);
      return;
    }
    
    console.log(`[VAPI Webhook] ✅✅✅ Call session created successfully:`, {
      id: createdSession.id,
      business_id: createdSession.business_id,
      vapi_call_id: createdSession.vapi_call_id,
      status: createdSession.status,
      created_at: createdSession.created_at,
    });
  } catch (error) {
    console.error(`[VAPI Webhook] ❌❌❌ CRITICAL ERROR creating call session:`, error);
    console.error(`[VAPI Webhook] Error name:`, error.name);
    console.error(`[VAPI Webhook] Error message:`, error.message);
    console.error(`[VAPI Webhook] Error code:`, error.code);
    console.error(`[VAPI Webhook] Error details:`, error.details);
    console.error(`[VAPI Webhook] Error hint:`, error.hint);
    console.error(`[VAPI Webhook] Error stack:`, error.stack);
    console.error(`[VAPI Webhook] Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    // Don't throw - continue processing
  }
  } catch (error) {
    console.error(`[VAPI Webhook] ❌❌❌ CRITICAL ERROR in handleCallStart:`, error);
    console.error(`[VAPI Webhook] Error name:`, error.name);
    console.error(`[VAPI Webhook] Error message:`, error.message);
    console.error(`[VAPI Webhook] Error stack:`, error.stack);
  }
  
  console.log(`[VAPI Webhook] ========== HANDLE CALL START END ==========`);
}

/**
 * Handle call-end event
 */
async function handleCallEnd(event) {
  // Handle nested message structure (status-update, end-of-call-report)
  // VAPI can send: event.call, event.message.call, or event.message.artifact.call
  const call = event.call || event.message?.call || event.message?.artifact?.call || event;
  const callId = call.id || call.callId || event.message?.call?.id || event.message?.artifact?.call?.id;
  
  console.log(`[VAPI Webhook] 📞 Handling call-end for call: ${callId || 'unknown'}`);
  
  // Extract duration from multiple possible locations
  // Check: call.duration, call.durationSeconds, event.durationSeconds, event.message.artifact.durationSeconds
  let duration = 0;
  if (call.duration !== undefined && call.duration !== null) {
    duration = typeof call.duration === 'number' ? call.duration : parseInt(call.duration) || 0;
  } else if (call.durationSeconds !== undefined && call.durationSeconds !== null) {
    duration = typeof call.durationSeconds === 'number' ? call.durationSeconds : parseInt(call.durationSeconds) || 0;
  } else if (call.duration_seconds !== undefined && call.duration_seconds !== null) {
    duration = typeof call.duration_seconds === 'number' ? call.duration_seconds : parseInt(call.duration_seconds) || 0;
  } else if (event.durationSeconds !== undefined && event.durationSeconds !== null) {
    duration = typeof event.durationSeconds === 'number' ? event.durationSeconds : parseInt(event.durationSeconds) || 0;
  } else if (event.message?.artifact?.durationSeconds !== undefined && event.message.artifact.durationSeconds !== null) {
    duration = typeof event.message.artifact.durationSeconds === 'number' 
      ? event.message.artifact.durationSeconds 
      : parseInt(event.message.artifact.durationSeconds) || 0;
  } else if (event.message?.artifact?.durationMs !== undefined && event.message.artifact.durationMs !== null) {
    // Convert milliseconds to seconds
    duration = Math.floor((typeof event.message.artifact.durationMs === 'number' 
      ? event.message.artifact.durationMs 
      : parseInt(event.message.artifact.durationMs) || 0) / 1000);
  }
  
  console.log(`[VAPI Webhook] Extracted duration: ${duration} seconds`);
  console.log(`[VAPI Webhook] Call ID: ${callId}`);
  console.log(`[VAPI Webhook] Call object structure:`, {
    hasCall: !!event.call,
    hasMessageCall: !!event.message?.call,
    hasArtifactCall: !!event.message?.artifact?.call,
    callId: callId,
  });

  // Check if this is a demo assistant call
  const { demoAssistants } = await import("./demo.js");
  const assistantId = call.assistant?.id || call.assistantId || event.message?.assistant?.id;
  
  console.log(`[VAPI Webhook] Checking for demo assistant:`, {
    assistantId,
    callAssistantId: call.assistant?.id,
    callAssistantIdField: call.assistantId,
    messageAssistantId: event.message?.assistant?.id,
    demoAssistantsKeys: Array.from(demoAssistants.keys()),
  });
  
  const demoData = assistantId ? demoAssistants.get(assistantId) : null;
  
  if (demoData) {
    console.log(`[VAPI Webhook] 🎧 Demo call detected for assistant: ${assistantId}`);
    console.log(`[VAPI Webhook] Demo email: ${demoData.email}`);
    
    // For browser-based demo calls, webhooks might not be reliable
    // The frontend endpoint (/api/demo/send-summary) handles sending the email
    // Skip webhook handler entirely for demos to prevent duplicate emails
    console.log(`[VAPI Webhook] Demo call - skipping webhook handler (frontend will handle email via /api/demo/send-summary)`);
    return;
  }

  // Find call session (for regular business calls)
  const callSession = await CallSession.findByVapiCallId(callId);
  if (!callSession) {
    console.error(`[VAPI Webhook] Call session not found for call: ${callId}`);
    return;
  }
  
  console.log(`[VAPI Webhook] Found call session:`, {
    id: callSession.id,
    business_id: callSession.business_id,
    started_at: callSession.started_at,
    status: callSession.status,
  });

  // Calculate duration from start time if not provided by VAPI
  if (duration === 0 && callSession.started_at) {
    const startTime = new Date(callSession.started_at);
    const endTime = new Date();
    duration = Math.floor((endTime - startTime) / 1000); // Duration in seconds
    console.log(`[VAPI Webhook] Calculated duration from start time: ${duration} seconds`);
  }
  
  const durationMinutes = Math.ceil(duration / 60); // Round up to nearest minute
  console.log(`[VAPI Webhook] Duration in minutes: ${durationMinutes} (from ${duration} seconds)`);

  // Get business
  const business = await Business.findById(callSession.business_id);
  if (!business) {
    console.error(`[VAPI Webhook] Business not found for call session: ${callSession.id}`);
    return;
  }

  // Only process if AI was actually active (not just forwarded)
  if (callSession.status === "forwarded" || callSession.status === "forwarded_no_minutes" || callSession.status === "forwarded_overage_cap") {
    // Call was forwarded, no AI interaction
    await CallSession.update(callSession.id, {
      status: "completed",
      ended_at: new Date(),
      duration_seconds: duration,
    });
    
    // Send missed call email if enabled (only during business hours)
    if (business.email_missed_calls) {
      // Get AI agent to check business hours
      const agent = await AIAgent.findByBusinessId(business.id);
      const businessHours = agent?.business_hours || {};
      const timezone = business.timezone || 'America/New_York';
      
      // Check if call occurred during business hours
      // Use the call start time to determine if it was during business hours
      const callStartTime = new Date(callSession.started_at);
      const isOpen = isBusinessOpenAtTime(businessHours, timezone, callStartTime);
      
      if (isOpen) {
        console.log(`[VAPI Webhook] Call was forwarded during business hours, sending missed call email`);
        await sendMissedCallEmail(business, {
          ...callSession,
          duration_seconds: duration,
        });
      } else {
        console.log(`[VAPI Webhook] Call was forwarded outside business hours, skipping missed call email`);
      }
    }
    
    return;
  }

  // Get call summary from VAPI
  let transcript = "";
  let summary = "";
  let intent = "general";
  let vapiCallData = null;

  try {
    const callSummary = await getCallSummary(callId);
    transcript = callSummary.transcript || "";
    summary = callSummary.summary || "";
    
    // Get full call data for better message extraction
    const { getVapiClient } = await import("../services/vapi.js");
    const vapiClient = getVapiClient();
    if (!vapiClient) {
      console.warn(`[VAPI Webhook] ⚠️ VAPI client not available, skipping full call data fetch`);
    } else {
      try {
        const callResponse = await vapiClient.get(`/call/${callId}`);
        vapiCallData = callResponse.data;
        
        // Include messages from callSummary if available
        if (callSummary.messages) {
          vapiCallData.messages = callSummary.messages;
        }
        
        console.log(`[VAPI Webhook] Full call data:`, JSON.stringify(vapiCallData, null, 2).substring(0, 1000));
      } catch (error) {
        console.error(`[VAPI Webhook] Error fetching full call data:`, error.message);
        // Continue with callSummary data only
      }
    }
    
    // Determine intent from summary
    intent = determineIntent(summary, transcript);
    console.log(`[VAPI Webhook] Detected intent: ${intent}`);
  } catch (error) {
    console.error(`[VAPI Webhook] Error getting call summary:`, error);
  }

  // Update call session
  await CallSession.update(callSession.id, {
    status: "completed",
    ended_at: new Date(),
    duration_seconds: duration,
    transcript: transcript,
    intent: intent,
    message_taken: intent === "callback" || intent === "message",
  });

  // Record usage (minutes) - ONLY if duration > 0
  if (duration > 0 && durationMinutes > 0) {
    try {
      console.log(`[VAPI Webhook] ========== RECORDING USAGE ==========`);
      console.log(`[VAPI Webhook] Business ID: ${business.id}`);
      console.log(`[VAPI Webhook] Call Session ID: ${callSession.id}`);
      console.log(`[VAPI Webhook] Duration: ${duration} seconds = ${durationMinutes} minutes`);
      
      const usageResult = await recordCallUsage(business.id, callSession.id, durationMinutes);
      
      if (!usageResult) {
        console.error(`[VAPI Webhook] ❌❌❌ Usage recording returned null/undefined!`);
      } else {
        console.log(`[VAPI Webhook] ✅✅✅ Usage recorded successfully:`, {
          minutes: durationMinutes,
          usageRecord: usageResult,
        });
      }
    } catch (error) {
      console.error(`[VAPI Webhook] ❌❌❌ CRITICAL ERROR recording usage:`, error);
      console.error(`[VAPI Webhook] Error name:`, error.name);
      console.error(`[VAPI Webhook] Error message:`, error.message);
      console.error(`[VAPI Webhook] Error code:`, error.code);
      console.error(`[VAPI Webhook] Error stack:`, error.stack);
      console.error(`[VAPI Webhook] Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      // Don't throw - we still want to process the rest of the call end event
    }
  } else {
    console.warn(`[VAPI Webhook] ⚠️ Skipping usage recording - duration is 0 or invalid (duration=${duration}, durationMinutes=${durationMinutes})`);
  }

  // Extract message if callback/message intent OR if summary/transcript indicates a message was taken
  // Be more lenient - if transcript mentions taking a message, callback, interview, or contact info, create message
  const summaryLower = (summary || "").toLowerCase();
  const transcriptLower = (transcript || "").toLowerCase();
  const shouldCreateMessage = intent === "callback" || 
                              intent === "message" || 
                              summaryLower.includes("message") ||
                              summaryLower.includes("callback") ||
                              summaryLower.includes("call back") ||
                              summaryLower.includes("interview") ||
                              summaryLower.includes("job") ||
                              transcriptLower.includes("taking a message") ||
                              transcriptLower.includes("leave a message") ||
                              transcriptLower.includes("call back") ||
                              transcriptLower.includes("interview") ||
                              transcriptLower.includes("job") ||
                              (summaryLower.includes("name") && summaryLower.includes("phone"));
  
  let createdMessage = null;
  
  if (shouldCreateMessage) {
    console.log(`[VAPI Webhook] Creating message record - Intent: ${intent}`);
    const messageData = extractMessageFromTranscript(transcript, summary, vapiCallData);
    
    console.log(`[VAPI Webhook] Extracted message data:`, {
      name: messageData.name,
      phone: messageData.phone ? '***' : 'none',
      hasMessage: !!messageData.message,
      reason: messageData.reason,
    });
    
    // Create message if we have at least a name OR phone OR meaningful message text
    if (messageData && (messageData.name !== "Unknown" || messageData.phone || (messageData.message && messageData.message.length > 20))) {
      try {
        const messagePayload = {
          business_id: business.id,
          call_session_id: callSession.id,
          caller_name: messageData.name || "Unknown",
          caller_phone: messageData.phone || callSession.caller_number || "",
          caller_email: messageData.email || "",
          message_text: messageData.message || summary || transcript || "Callback requested",
          reason: messageData.reason || intent,
          status: "new",
        };
        
        console.log(`[VAPI Webhook] Creating message with data:`, {
          ...messagePayload,
          message_text: messagePayload.message_text.substring(0, 100) + '...',
        });
        
        createdMessage = await Message.create(messagePayload);
        
        if (!createdMessage || !createdMessage.id) {
          console.error(`[VAPI Webhook] ❌❌❌ Message creation returned null/undefined!`);
          console.error(`[VAPI Webhook] Created message:`, createdMessage);
        } else {
          console.log(`[VAPI Webhook] ✅✅✅ Message created successfully:`, {
            id: createdMessage.id,
            business_id: createdMessage.business_id,
            call_session_id: createdMessage.call_session_id,
            caller_name: createdMessage.caller_name,
            status: createdMessage.status,
            created_at: createdMessage.created_at,
          });
        }
      } catch (msgError) {
        console.error(`[VAPI Webhook] ❌❌❌ ERROR creating message:`, msgError);
        console.error(`[VAPI Webhook] Error details:`, {
          message: msgError.message,
          code: msgError.code,
          details: msgError.details,
          hint: msgError.hint,
          stack: msgError.stack,
        });
      }
    } else {
      console.log(`[VAPI Webhook] ⚠️  Message data insufficient, not creating message record`);
      console.log(`[VAPI Webhook] Message data check:`, {
        hasMessageData: !!messageData,
        name: messageData?.name,
        hasPhone: !!messageData?.phone,
        messageLength: messageData?.message?.length || 0,
      });
    }
  }

  // Send notifications - CRITICAL: ALWAYS send email for callbacks/messages, regardless of email_ai_answered setting
  // Check multiple indicators to ensure we catch all callbacks
  // Note: summaryLower and transcriptLower are already declared above
  const hasCallbackKeywords = summaryLower.includes("callback") || 
                              summaryLower.includes("call back") || 
                              summaryLower.includes("call me") ||
                              summaryLower.includes("interview") ||
                              summaryLower.includes("job") ||
                              transcriptLower.includes("callback") ||
                              transcriptLower.includes("call back") ||
                              transcriptLower.includes("interview") ||
                              transcriptLower.includes("job");
  
  const isCallbackOrMessage = intent === "callback" || 
                              intent === "message" || 
                              createdMessage !== null ||
                              hasCallbackKeywords; // Also check for keywords in case intent detection failed
  
  // ALWAYS send email if it's a callback/message OR if email_ai_answered is enabled
  if (isCallbackOrMessage || business.email_ai_answered) {
    try {
      // Force email for callbacks/messages even if email_ai_answered is disabled
      const forceEmail = isCallbackOrMessage;
      
      console.log(`[VAPI Webhook] ========== EMAIL NOTIFICATION CHECK ==========`);
      console.log(`[VAPI Webhook] Intent: ${intent}`);
      console.log(`[VAPI Webhook] Created Message: ${!!createdMessage}`);
      console.log(`[VAPI Webhook] Has Callback Keywords: ${hasCallbackKeywords}`);
      console.log(`[VAPI Webhook] Is Callback/Message: ${isCallbackOrMessage}`);
      console.log(`[VAPI Webhook] Force Email: ${forceEmail}`);
      console.log(`[VAPI Webhook] Business Email: ${business.email}`);
      console.log(`[VAPI Webhook] Email AI Answered Setting: ${business.email_ai_answered}`);
      console.log(`[VAPI Webhook] Summary length: ${summary?.length || 0}`);
      console.log(`[VAPI Webhook] Transcript length: ${transcript?.length || 0}`);
      
      await sendCallSummaryEmail(
        business, 
        callSession, 
        transcript, 
        summary, 
        intent,
        createdMessage, // Pass message if one was created
        forceEmail // Force email for callbacks/messages
      );
      console.log(`[VAPI Webhook] ✅ Email notification sent successfully (or skipped if summary not ready)`);
    } catch (emailError) {
      console.error(`[VAPI Webhook] ❌❌❌ CRITICAL ERROR sending email:`, emailError);
      console.error(`[VAPI Webhook] Email error details:`, {
        message: emailError.message,
        stack: emailError.stack,
        businessEmail: business.email,
        intent: intent,
        hasMessage: !!createdMessage,
      });
      // Don't throw - we don't want to break the webhook, but log it prominently
    }
  } else {
    console.log(`[VAPI Webhook] ⚠️ Skipping email - not a callback/message and email_ai_answered is disabled`);
    console.log(`[VAPI Webhook] Debug info:`, {
      intent: intent,
      hasCreatedMessage: !!createdMessage,
      hasCallbackKeywords: hasCallbackKeywords,
      email_ai_answered: business.email_ai_answered,
    });
  }

  // Send SMS if enabled and callback/urgent intent OR if message was created
  if (business.sms_enabled && (intent === "urgent" || intent === "callback" || createdMessage)) {
    try {
      await sendSMSNotification(business, callSession, summary, createdMessage);
      console.log(`[VAPI Webhook] ✅ SMS notification sent`);
    } catch (smsError) {
      console.error(`[VAPI Webhook] ❌ Error sending SMS:`, smsError);
    }
  }
}

/**
 * Handle transfer-started event
 */
async function handleTransferStarted(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;

  const callSession = await CallSession.findByVapiCallId(callId);
  if (callSession) {
    await CallSession.update(callSession.id, {
      transfer_attempted: true,
      transfer_timestamp: new Date(),
    });
  }
}

/**
 * Handle transfer-failed event
 */
async function handleTransferFailed(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;

  const callSession = await CallSession.findByVapiCallId(callId);
  if (callSession) {
    await CallSession.update(callSession.id, {
      transfer_successful: false,
    });
  }
}

/**
 * Handle call-returned event (call returned after transfer failure)
 */
async function handleCallReturned(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;

  // Call returned after transfer failure
  // AI should NOT attempt another transfer
  // This is handled in the assistant template logic
  console.log(`[VAPI Webhook] Call ${callId} returned after transfer failure`);
}

/**
 * Handle function-call event (if needed)
 */
async function handleFunctionCall(event) {
  // Handle any function calls from VAPI assistant
  console.log(`[VAPI Webhook] Function call:`, event);
}

/**
 * Determine call intent from summary/transcript
 */
function determineIntent(summary, transcript) {
  const text = (summary + " " + transcript).toLowerCase();
  
  // Check for callback/interview requests first (high priority)
  if (text.includes("interview") || text.includes("job") || text.includes("employment") || text.includes("hiring")) {
    return "callback"; // Interview requests should be treated as callbacks
  }
  if (text.includes("callback") || text.includes("call back") || text.includes("call me")) {
    return "callback";
  }
  if (text.includes("hours") || text.includes("open") || text.includes("close")) {
    return "hours";
  }
  if (text.includes("catering") || text.includes("cater")) {
    return "catering";
  }
  if (text.includes("complaint") || text.includes("problem") || text.includes("issue")) {
    return "complaint";
  }
  if (text.includes("urgent") || text.includes("asap") || text.includes("immediately")) {
    return "urgent";
  }
  if (text.includes("message") || text.includes("leave a message")) {
    return "message";
  }
  
  return "general";
}

/**
 * Extract message data from transcript, summary, and VAPI call data
 */
function extractMessageFromTranscript(transcript, summary, vapiCallData = null) {
  // Combine all text for extraction
  const fullText = `${summary || ""} ${transcript || ""}`.toLowerCase();
  
  let name = "";
  let phone = "";
  let email = "";
  let message = summary || transcript || "";
  let reason = "";

  // Try to extract from VAPI structured data first (if available)
  if (vapiCallData) {
    // Check for structured message data in VAPI response
    if (vapiCallData.metadata?.callerName) {
      name = vapiCallData.metadata.callerName;
    }
    if (vapiCallData.metadata?.callerPhone) {
      phone = vapiCallData.metadata.callerPhone;
    }
    if (vapiCallData.metadata?.callerEmail) {
      email = vapiCallData.metadata.callerEmail;
    }
    if (vapiCallData.metadata?.message) {
      message = vapiCallData.metadata.message;
    }
  }

  // Fallback: Extract from transcript/summary text
  const lines = (transcript || "").split("\n");
  
  // Extract name - look for patterns like "name is John" or "my name is John"
  if (!name || name === "Unknown") {
    const namePatterns = [
      /(?:name is|my name is|this is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:name|caller)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:here|speaking|calling)/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        name = match[1].trim();
        break;
      }
    }
  }

  // Extract phone - look for phone number patterns
  if (!phone) {
    const phonePatterns = [
      /(?:phone|number|call me at|reach me at)[:\s]*([+]?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
      /([+]?1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
    ];
    
    for (const pattern of phonePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        phone = match[1].replace(/[-.\s()]/g, "");
        if (phone.length === 10 && !phone.startsWith("+")) {
          phone = "+1" + phone;
        } else if (phone.length === 11 && phone.startsWith("1")) {
          phone = "+" + phone;
        }
        break;
      }
    }
  }

  // Extract email
  if (!email) {
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = fullText.match(emailPattern);
    if (match) {
      email = match[1];
    }
  }

  // Extract message/reason from summary or transcript
  if (summary) {
    const summaryLower = summary.toLowerCase();
    // Look for key phrases that indicate what the caller wants
    if (summaryLower.includes("interview") || summaryLower.includes("job") || summaryLower.includes("employment") || summaryLower.includes("hiring")) {
      reason = "Interview Request";
    } else if (summaryLower.includes("reservation") || summaryLower.includes("book")) {
      reason = "Reservation";
    } else if (summaryLower.includes("catering")) {
      reason = "Catering";
    } else if (summaryLower.includes("hours") || summaryLower.includes("open")) {
      reason = "Hours Inquiry";
    } else if (summaryLower.includes("complaint")) {
      reason = "Complaint";
    } else if (summaryLower.includes("callback") || summaryLower.includes("call back")) {
      reason = "Callback Request";
    } else {
      reason = "General Inquiry";
    }
    
    // Use summary as message if it's detailed
    if (summary.length > 50) {
      message = summary;
    }
  }

  console.log(`[Message Extraction] Extracted:`, {
    name: name || "Unknown",
    phone: phone || "None",
    email: email || "None",
    reason: reason || "General inquiry",
    messageLength: message.length,
  });

  return {
    name: name || "Unknown",
    phone: phone || "",
    email: email || "",
    message: message || summary || transcript || "No message provided",
    reason: reason || "General inquiry",
  };
}

export default router;

