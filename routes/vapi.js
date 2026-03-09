// routes/vapi.js
// VAPI webhook handler for call events
// Last updated: 2026-01-02

import express from "express";
import { CallSession } from "../models/CallSession.js";
import { Business } from "../models/Business.js";
import { Message } from "../models/Message.js";
import { getCallSummary, forwardCallToBusiness, getVapiClient } from "../services/vapi.js";
import { checkMinutesAvailable, recordCallUsage } from "../services/usage.js";
import { sendCallSummaryEmail, sendSMSNotification, sendMissedCallEmail, sendEmergencyIntakeEmail, sendEmergencyIntakeSMS, sendEmergencyCustomerConfirmationSMS } from "../services/notifications.js";
import { isBusinessOpenAtTime } from "../utils/businessHours.js";
import { AIAgent } from "../models/AIAgent.js";
import { Notification } from "../models/v2/Notification.js";

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
 * Test endpoint to manually trigger call forwarding
 * GET /api/vapi/webhook/test-forward?callId=xxx&businessId=xxx
 * This allows testing forwarding without exhausting minutes
 */
router.get("/webhook/test-forward", async (req, res) => {
  try {
    const { callId, businessId } = req.query;
    
    if (!callId || !businessId) {
      return res.status(400).json({
        error: "Missing required parameters",
        required: ["callId", "businessId"],
        example: "/api/vapi/webhook/test-forward?callId=xxx&businessId=xxx",
      });
    }
    
    console.log(`[Test Forward] ========== MANUAL FORWARD TEST ==========`);
    console.log(`[Test Forward] Call ID: ${callId}`);
    console.log(`[Test Forward] Business ID: ${businessId}`);
    
    // Get business to get phone number
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    if (!business.public_phone_number) {
      return res.status(400).json({ error: "Business has no public phone number configured" });
    }
    
    console.log(`[Test Forward] Business: ${business.name}`);
    console.log(`[Test Forward] Target Number: ${business.public_phone_number}`);
    
    // Call the forwarding function
    const result = await forwardCallToBusiness(callId, business.public_phone_number);
    
    console.log(`[Test Forward] Result:`, result);
    console.log(`[Test Forward] =========================================`);
    
    res.status(200).json({
      success: result.forwarded === true,
      message: result.forwarded 
        ? "Call forwarding initiated successfully" 
        : "Call forwarding failed - check logs for details",
      result: result,
      business: {
        id: business.id,
        name: business.name,
        phone: business.public_phone_number,
      },
    });
  } catch (error) {
    console.error("[Test Forward] Error:", error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
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
 * Handle VAPI assistant-request: return assistant config so the call can be answered.
 * Used when the phone number has assistantId=null and a server URL (dynamic assistant selection).
 * Must respond within ~7.5s or the call fails ("could not be reached").
 */
async function handleAssistantRequest(body, res) {
  // Number that was CALLED (destination) — VAPI sends message.call; may be under different keys
  const call = body?.message?.call || body?.call;
  const destinationNumber =
    body?.message?.phoneNumber ||
    body?.message?.destinationNumber ||
    body?.message?.destination ||
    call?.phoneNumber ||
    call?.phone_number ||
    call?.destinationNumber ||
    call?.destination ||
    call?.to ||
    call?.inboundPhoneNumber ||
    body?.call?.phoneNumber ||
    body?.call?.destinationNumber ||
    body?.phoneNumber ||
    body?.destinationNumber ||
    body?.destination;
  const phoneNumber = destinationNumber; // alias for rest of handler
  const existingAssistantId =
    body?.message?.assistant?.id || body?.call?.assistant?.id || body?.assistantId;

  console.log("[VAPI Webhook] assistant-request: destinationNumber=%s existingAssistantId=%s", destinationNumber || "none", existingAssistantId || "none");
  if (!destinationNumber && (body?.message || body?.call)) {
    console.log("[VAPI Webhook] assistant-request: body.message keys=%s body.call keys=%s", Object.keys(body?.message || {}).join(","), Object.keys(body?.call || {}).join(","));
  }
  if (!destinationNumber) {
    console.warn("[VAPI Webhook] assistant-request: no destination number in body — emergency routing requires destination; body keys=%s", Object.keys(body || {}).join(","));
  }

  // Caller number (inbound) — may be present so we can look up recent requests for callback detection
  const callerNumber =
    body?.message?.customer?.number ||
    body?.message?.customer?.phoneNumber ||
    body?.message?.customer?.phone ||
    call?.customer?.number ||
    call?.customer?.phoneNumber ||
    body?.customer?.number ||
    body?.customer?.phoneNumber ||
    null;

  // EMERGENCY NETWORK: separate stream — dedicated number(s) route to Emergency assistant only; existing agent untouched
  if (phoneNumber) {
    const { isEmergencyNumber, getEmergencyAssistantId, getEmergencyConfig } = await import("../services/emergency-network/config.js");
    const emergencyId = await getEmergencyAssistantId();
    const config = await getEmergencyConfig();
    const isEmergency = await isEmergencyNumber(phoneNumber);
    console.log("[VAPI Webhook] assistant-request: emergency check number=%s isEmergency=%s emergencyId=%s configNumbers=%j", phoneNumber, isEmergency, emergencyId || "none", (config?.emergency_phone_numbers || []).slice(0, 5));
    if (isEmergency && emergencyId) {
      const vapiClient = getVapiClient();
      try {
        const assistantResponse = await vapiClient.get(`/assistant/${emergencyId}`);
        let assistant = assistantResponse.data;
        if (assistant) {
          // If we have caller number, look up recent requests (last 7 days) and inject context so AI can ask cancel/update/new
          if (callerNumber) {
            const { getRecentRequestsByPhone } = await import("../services/emergency-network/callback-lookup.js");
            const recentRequests = await getRecentRequestsByPhone(callerNumber, { days: 7 });
            if (recentRequests.length > 0) {
              const contextLines = recentRequests.slice(0, 5).map((r) => {
                const date = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                return `- Request ${r.id} (${r.service_category}, status: ${r.status}, ${date})`;
              });
              const callerContext = `\n\n[CALLER CONTEXT - use this to decide how to respond]\nThis caller has the following request(s) from the last 7 days:\n${contextLines.join('\n')}\nIf they have at least one request, FIRST ask: "Are you calling to cancel or update that request, or is this a new issue?" Then respond accordingly. If they want to cancel, say we'll note that and they don't need to do anything else. If they want to update, take the updated details. If it's a new issue, proceed to collect information as usual.`;
              assistant = JSON.parse(JSON.stringify(assistant));
              if (assistant.model?.messages?.length) {
                const systemMsg = assistant.model.messages.find((m) => m.role === 'system');
                if (systemMsg && typeof systemMsg.content === 'string') {
                  systemMsg.content += callerContext;
                  console.log("[VAPI Webhook] assistant-request: injected caller context for", recentRequests.length, "recent request(s)");
                }
              }
            }
          }
          console.log("[VAPI Webhook] assistant-request: emergency number -> returning Emergency Network assistant", emergencyId);
          res.status(200).json({ assistant });
          return { sent: true };
        }
      } catch (err) {
        console.warn("[VAPI Webhook] assistant-request: emergency assistant fetch failed", err?.message || err);
      }
    }
  }

  let assistantId = existingAssistantId;
  if (!assistantId && phoneNumber) {
    const business = await Business.findByPhoneNumber(phoneNumber);
    if (business?.vapi_assistant_id) {
      assistantId = business.vapi_assistant_id;
      console.log("[VAPI Webhook] assistant-request: resolved assistant from phone -> business", business.id, assistantId);
    }
  }

  if (!assistantId) {
    console.error("[VAPI Webhook] assistant-request: no assistantId and could not resolve from phone number");
    res.status(200).json({ received: true });
    return { sent: true };
  }

  const vapiClient = getVapiClient();
  const assistantResponse = await vapiClient.get(`/assistant/${assistantId}`);
  const assistant = assistantResponse.data;
  if (!assistant) {
    console.error("[VAPI Webhook] assistant-request: assistant not found in VAPI", assistantId);
    res.status(200).json({ received: true });
    return { sent: true };
  }

  console.log("[VAPI Webhook] assistant-request: returning assistant config for", assistantId);
  res.status(200).json({ assistant });
  return { sent: true };
}

/**
 * VAPI Webhook Handler
 * Handles assistant-request (MUST respond with assistant config), call-start, call-end, etc.
 *
 * CRITICAL: assistant-request expects a synchronous response with assistant config;
 * other events get 200 immediately then process async.
 */
router.post("/webhook", async (req, res) => {
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

  // assistant-request REQUIRES a response with assistant config (VAPI will fail the call otherwise)
  if (eventType === "assistant-request") {
    try {
      const result = await handleAssistantRequest(req.body, res);
      if (result.sent) return;
      // If handler didn't send, fall through to 200
    } catch (err) {
      console.error("[VAPI Webhook] assistant-request handler error:", err);
      res.status(500).json({ error: "assistant-request failed", message: err.message });
      return;
    }
  }

  // function-call or tool-calls: handle synchronously so we can return a result for the assistant (e.g. dispatch_accept result).
  // VAPI may send either event type; tool-calls uses message.toolCallList and requires { results: [{ toolCallId, result }] }.
  if (eventType === 'function-call' || eventType === 'tool-calls') {
    try {
      const result = await handleFunctionCall(req.body.message || req.body);
      return res.status(200).json(result != null && typeof result === 'object' ? result : { received: true });
    } catch (e) {
      console.error('[VAPI Webhook] function/tool-call error', e);
      return res.status(200).json({ received: true });
    }
  }

  // For all other events: respond immediately so VAPI doesn't time out
  res.status(200).json({ received: true });

  // Process asynchronously (don't await - let it run in background)
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
            // status-update with status "ended" - don't process as call-end here
            // We'll wait for the end-of-call-report event which has the full summary
            // This prevents duplicate emails (one with no summary, one with summary)
            console.log(`[VAPI Webhook ${webhookId}] ⚠️ Skipping status-update (ended) - waiting for end-of-call-report event`);
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
        case "tool-calls":
          console.log(`[VAPI Webhook ${webhookId}] ⚙️ Processing ${eventTypeFromEvent} event`);
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
    let business = await Business.findByVapiAssistantId(assistantId);
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

    // If AI is disabled, forward the call to the business
    if (!business.ai_enabled) {
      console.log(`[VAPI Webhook] AI disabled for business ${business.id}, forwarding call to business`);
      
      // CRITICAL: Immediately unlink assistant to prevent future calls from going through VAPI
      // This prevents the infinite loop where VAPI answers even when disabled
      if (business.vapi_phone_number) {
        console.log(`[VAPI Webhook] 🔗 Unlinking assistant from phone number to prevent future VAPI answers...`);
        (async () => {
          try {
            const { unlinkAssistantFromNumber, checkIfNumberProvisionedInVAPI } = await import('../services/vapi.js');
            
            // Find the VAPI phone number ID using the E.164 number
            const phoneNumberE164 = business.vapi_phone_number;
            const vapiPhoneNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
            
            if (!vapiPhoneNumber || !vapiPhoneNumber.id) {
              console.warn(`[VAPI Webhook] ⚠️  Could not find VAPI phone number for ${phoneNumberE164}`);
              return;
            }
            
            const phoneNumberId = vapiPhoneNumber.id || vapiPhoneNumber.phoneNumberId;
            await unlinkAssistantFromNumber(phoneNumberId);
            console.log(`[VAPI Webhook] ✅ Assistant unlinked - future calls will bypass VAPI`);
          } catch (unlinkError) {
            console.error(`[VAPI Webhook] ❌ Error unlinking assistant (non-blocking):`, unlinkError.message);
            // Don't fail the webhook if unlinking fails
          }
        })();
      }
      
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
      
      // Try to forward call to business
      const forwardResult = await forwardCallToBusiness(callId, business.public_phone_number);
      if (forwardResult.forwarded) {
        console.log(`[VAPI Webhook] ✅ Call forwarded successfully`);
      } else {
        console.error(`[VAPI Webhook] ⚠️ Call forwarding failed:`, forwardResult.reason, forwardResult.error);
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

    // AI is enabled - check minutes availability to handle exhaustion
    const minutesCheck = await checkMinutesAvailable(business.id, 0);
    
    if (!minutesCheck.available) {
      console.log(`[VAPI Webhook] Minutes exhausted for business ${business.id}, handling exhaustion`);
      
      if (business.minutes_exhausted_behavior === "disable_ai") {
        // Option A: Disable AI and forward (prevent free AI minutes)
        console.log(`[VAPI Webhook] Disabling AI and forwarding call (no free minutes)`);
        await Business.update(business.id, { ai_enabled: false });
        
        // Create call session for tracking
        let callSession = null;
        try {
          callSession = await CallSession.create({
            business_id: business.id,
            vapi_call_id: callId,
            caller_number: callerNumber,
            status: "forwarded_no_minutes",
            started_at: new Date(),
          });
        } catch (sessionError) {
          console.error(`[VAPI Webhook] ❌ Error creating call session:`, sessionError);
        }
        
        // Forward call to business
        const forwardResult = await forwardCallToBusiness(callId, business.public_phone_number);
        if (forwardResult.forwarded) {
          console.log(`[VAPI Webhook] ✅ Call forwarded successfully (no minutes)`);
        } else {
          console.error(`[VAPI Webhook] ⚠️ Call forwarding failed (no minutes):`, forwardResult.reason, forwardResult.error);
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
      } else if (business.minutes_exhausted_behavior === "allow_overage") {
        // Option B: Allow overage - check if overage cap is reached
        if (business.overage_cap_minutes && minutesCheck.overageMinutes >= business.overage_cap_minutes) {
          // Overage cap reached, disable AI and forward
          console.log(`[VAPI Webhook] Overage cap reached (${minutesCheck.overageMinutes}/${business.overage_cap_minutes}), disabling AI and forwarding`);
          await Business.update(business.id, { ai_enabled: false });
          
          let callSession = null;
          try {
            callSession = await CallSession.create({
              business_id: business.id,
              vapi_call_id: callId,
              caller_number: callerNumber,
              status: "forwarded_overage_cap",
              started_at: new Date(),
            });
          } catch (sessionError) {
            console.error(`[VAPI Webhook] ❌ Error creating call session:`, sessionError);
          }
          
          const forwardResult = await forwardCallToBusiness(callId, business.public_phone_number);
          if (forwardResult.forwarded) {
            console.log(`[VAPI Webhook] ✅ Call forwarded successfully (overage cap)`);
          } else {
            console.error(`[VAPI Webhook] ⚠️ Call forwarding failed (overage cap):`, forwardResult.reason, forwardResult.error);
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
        // Under overage cap - allow call with overage billing
        console.log(`[VAPI Webhook] ✅ Allowing call with overage billing (${minutesCheck.overageMinutes} overage minutes, cap: ${business.overage_cap_minutes || 'none'})`);
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

    // Create in-app notification for incoming call
    try {
      const callerDisplay = callerNumber ? callerNumber.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : 'Unknown caller';
      await Notification.create({
        business_id: business.id,
        user_id: null, // All users in organization see this
        type: 'module',
        message: `Incoming call from ${callerDisplay}`,
        metadata: {
          module_key: 'phone-agent',
          call_session_id: createdSession.id,
          caller_number: callerNumber,
        },
      });
      console.log(`[VAPI Webhook] ✅ In-app notification created for incoming call`);
    } catch (notifError) {
      console.error(`[VAPI Webhook] ⚠️ Failed to create incoming call notification (non-blocking):`, notifError);
    }
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
    
    // Track demo usage in database (even if frontend endpoint isn't called)
    // For browser-based demos, duration might be 0 in webhook but available from API
    let actualDuration = duration;
    if (actualDuration === 0 && callId) {
      try {
        // Try to fetch duration from VAPI API (browser calls might not report duration in webhook)
        const { getCallData } = await import("../services/vapi.js");
        const callData = await getCallData(callId);
        actualDuration = callData?.durationSeconds || callData?.duration || 0;
        console.log(`[VAPI Webhook] Fetched duration from VAPI API: ${actualDuration} seconds`);
      } catch (apiError) {
        console.warn(`[VAPI Webhook] Could not fetch duration from VAPI API:`, apiError.message);
        // Continue with duration 0 - we'll track anyway to record the demo happened
      }
    }
    
    // Track demo usage even if duration is 0 (browser-based demos may not report duration)
    // This ensures all demos are counted in the admin portal
    try {
      const { supabaseClient } = await import("../config/database.js");
      const now = new Date();
      const minutesUsed = actualDuration > 0 ? parseFloat((actualDuration / 60).toFixed(2)) : 0;
      
      await supabaseClient
        .from('demo_usage')
        .insert({
          assistant_id: assistantId,
          call_id: callId || null,
          business_name: demoData.businessName || null,
          email: demoData.email || null,
          duration_seconds: actualDuration,
          minutes_used: minutesUsed,
          marketing_consent: demoData.marketingConsent || false,
          date: now.toISOString().split('T')[0],
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
      
      console.log(`[VAPI Webhook] ✅ Tracked demo usage: ${minutesUsed} minutes (${actualDuration}s) for assistant ${assistantId}`);
    } catch (trackingError) {
      // Log error but don't fail the webhook
      console.error(`[VAPI Webhook] Error tracking demo usage:`, trackingError.message);
    }
    
    // For browser-based demo calls, webhooks might not be reliable
    // The frontend endpoint (/api/demo/send-summary) handles sending the email
    // Skip webhook handler entirely for demos to prevent duplicate emails
    console.log(`[VAPI Webhook] Demo call - skipping webhook handler (frontend will handle email via /api/demo/send-summary)`);
    return;
  }

  // Emergency Network: handle end-of-call for emergency assistant (no CallSession; persist request + email)
  const { getEmergencyAssistantId, getEmergencyConfig } = await import("../services/emergency-network/config.js");
  const emergencyAssistantId = await getEmergencyAssistantId();
  if (assistantId && emergencyAssistantId && assistantId === emergencyAssistantId) {
    console.log(`[VAPI Webhook] Emergency Network call-end for call: ${callId}`);
    let transcript = "";
    let summary = "";
    if (event.message?.analysis?.summary) summary = event.message.analysis.summary;
    if (event.message?.artifact?.transcript) {
      transcript = event.message.artifact.transcript;
    } else if (event.message?.artifact?.messages) {
      const messages = event.message.artifact.messages || [];
      transcript = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.message || m.content || ""}`)
        .join("\n");
    } else if (event.transcript) transcript = event.transcript;
    if (!transcript && !summary && callId) {
      try {
        const callSummary = await getCallSummary(callId);
        transcript = callSummary.transcript || "";
        summary = summary || callSummary.summary || "";
      } catch (e) {
        console.warn("[VAPI Webhook] Emergency: getCallSummary failed", e?.message);
      }
    }
    const callerNumberFromCall = call.customer?.number || event.message?.customer?.number;
    const extracted = extractEmergencyFromTranscript(transcript, summary, callerNumberFromCall);
    if (!extracted.callback_phone) {
      console.warn("[VAPI Webhook] Emergency: no callback phone (inbound or extracted), using placeholder");
      extracted.callback_phone = callerNumberFromCall || "Unknown";
    }

    // Guard: only create request and dispatch if call was long enough and we have meaningful intake (prevents calling plumbers when caller hung up before giving info)
    const MIN_DURATION_SECONDS = 30;
    const MIN_INTAKE_LENGTH = 80;
    let emergencyDuration = duration;
    if (emergencyDuration === 0 && callId) {
      try {
        const { getCallData } = await import("../services/vapi.js");
        const callData = await getCallData(callId);
        emergencyDuration = callData?.durationSeconds ?? callData?.duration ?? 0;
      } catch (_) {}
    }
    const hasMeaningfulIntake = (extracted.issue_summary && String(extracted.issue_summary).trim().length > 0) ||
      (String(transcript || "").length + String(summary || "").length >= MIN_INTAKE_LENGTH);
    if (emergencyDuration < MIN_DURATION_SECONDS) {
      console.log(`[VAPI Webhook] Emergency: skipping request — call too short (${emergencyDuration}s < ${MIN_DURATION_SECONDS}s)`);
      return;
    }
    if (!hasMeaningfulIntake) {
      console.log(`[VAPI Webhook] Emergency: skipping request — no meaningful intake (no issue summary and transcript/summary < ${MIN_INTAKE_LENGTH} chars)`);
      return;
    }

    try {
      const { createServiceRequest } = await import("../services/emergency-network/intake.js");
      const payload = {
        caller_name: extracted.caller_name || null,
        callback_phone: extracted.callback_phone,
        service_category: extracted.service_category || "Plumbing",
        urgency_level: extracted.urgency_level || "Schedule",
        location: extracted.location || null,
        issue_summary: extracted.issue_summary || (summary || transcript).slice(0, 2000) || null,
        intake_channel: "phone",
      };
      const request = await createServiceRequest(payload);
      const config = await getEmergencyConfig();
      const toEmail = config.notification_email || process.env.EMERGENCY_DISPATCH_NOTIFICATION_EMAIL;
      if (config.email_enabled && toEmail) {
        await sendEmergencyIntakeEmail(toEmail, payload, { transcript, summary });
      } else if (toEmail && !config.email_enabled) {
        // email_enabled is off; skip intake email
      } else {
        console.warn("[VAPI Webhook] Emergency: no notification_email configured, skipping email");
      }
      if (config.sms_enabled && config.notification_sms_number) {
        try {
          await sendEmergencyIntakeSMS(config, payload);
          console.log("[VAPI Webhook] Emergency: SMS notification sent");
        } catch (smsErr) {
          console.error("[VAPI Webhook] Emergency: SMS notification failed", smsErr?.message || smsErr);
        }
      }
      if (config.customer_sms_enabled) {
        try {
          await sendEmergencyCustomerConfirmationSMS(config, { ...payload, id: request.id });
          console.log("[VAPI Webhook] Emergency: customer confirmation SMS sent");
        } catch (customerSmsErr) {
          console.error("[VAPI Webhook] Emergency: customer SMS failed", customerSmsErr?.message || customerSmsErr);
        }
      }
      console.log("[VAPI Webhook] Emergency request created:", request.id);
      const { startDispatch } = await import("../services/emergency-network/dispatch.js");
      startDispatch(request.id).catch((err) =>
        console.error("[VAPI Webhook] Emergency startDispatch error:", err?.message || err)
      );
    } catch (err) {
      console.error("[VAPI Webhook] Emergency intake/email error:", err?.message || err);
    }
    return;
  }

  // Emergency dispatch outbound call ended (we called a provider)
  const { supabaseClient } = await import("../config/database.js");
  const { data: dispatchRow } = await supabaseClient
    .from('emergency_dispatch_calls')
    .select('service_request_id, provider_id, dispatch_log_id')
    .eq('vapi_call_id', callId)
    .single();
  if (dispatchRow) {
    const { data: logRow } = await supabaseClient
      .from('emergency_dispatch_log')
      .select('result')
      .eq('id', dispatchRow.dispatch_log_id)
      .single();
    if (logRow && logRow.result === 'pending') {
      await supabaseClient
        .from('emergency_dispatch_log')
        .update({ result: 'no_answer' })
        .eq('id', dispatchRow.dispatch_log_id);
    }
    // Only call next provider if they didn't accept or decline (no_answer/hang up). If they accepted, request is already 'Accepted'; if they declined, we already called next in function-call handler.
    const { data: req } = await supabaseClient
      .from('emergency_service_requests')
      .select('status')
      .eq('id', dispatchRow.service_request_id)
      .single();
    if (req && ['New', 'Contacting Providers'].includes(req.status)) {
      const { callNextProvider } = await import("../services/emergency-network/dispatch.js");
      await callNextProvider(dispatchRow.service_request_id);
      console.log("[VAPI Webhook] Emergency dispatch call ended, trying next provider:", callId, dispatchRow.service_request_id);
    } else {
      console.log("[VAPI Webhook] Emergency dispatch call ended (already accepted or closed):", callId, dispatchRow.service_request_id);
    }
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

  // First, try to get summary/transcript from the event itself (end-of-call-report has it)
  if (event.message?.analysis?.summary) {
    summary = event.message.analysis.summary;
    console.log(`[VAPI Webhook] ✅ Got summary from event.message.analysis.summary (${summary.length} chars)`);
  }
  
  // Try multiple locations for transcript
  if (event.message?.artifact?.transcript) {
    transcript = event.message.artifact.transcript;
    console.log(`[VAPI Webhook] ✅ Got transcript from event.message.artifact.transcript (${transcript.length} chars)`);
  } else if (event.message?.artifact?.messages) {
    // Build transcript from messages
    const messages = event.message.artifact.messages || [];
    transcript = messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.message || msg.content || ''}`)
      .join('\n');
    console.log(`[VAPI Webhook] ✅ Built transcript from event.message.artifact.messages (${messages.length} messages, ${transcript.length} chars)`);
  } else if (event.transcript) {
    transcript = event.transcript;
    console.log(`[VAPI Webhook] ✅ Got transcript from event.transcript (${transcript.length} chars)`);
  }

  try {
    // If we don't have summary/transcript from event, try to get from API
    if (!summary || !transcript) {
    const callSummary = await getCallSummary(callId);
      transcript = transcript || callSummary.transcript || "";
      summary = summary || callSummary.summary || "";
    }
    
    // Get full call data for better message extraction
    const { getVapiClient } = await import("../services/vapi.js");
    const vapiClient = getVapiClient();
    if (!vapiClient) {
      console.warn(`[VAPI Webhook] ⚠️ VAPI client not available, skipping full call data fetch`);
    } else {
      try {
        const callResponse = await vapiClient.get(`/call/${callId}`);
        vapiCallData = callResponse.data;
        
        // Use transcript from API if we have it and don't have one yet
        if (!transcript && vapiCallData.transcript) {
          transcript = vapiCallData.transcript;
        }
        
        // Use summary from API if we have it and don't have one yet
        if (!summary && vapiCallData.analysis?.summary) {
          summary = vapiCallData.analysis.summary;
        }
        
        // Include messages from callSummary if available
        if (vapiCallData.messages) {
          // Build transcript from messages if we still don't have one
          if (!transcript) {
            transcript = vapiCallData.messages
              .filter(msg => msg.role === 'user' || msg.role === 'assistant')
              .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.message || msg.content || ''}`)
              .join('\n');
          }
        }
        
        console.log(`[VAPI Webhook] Full call data:`, JSON.stringify(vapiCallData, null, 2).substring(0, 1000));
      } catch (error) {
        console.error(`[VAPI Webhook] Error fetching full call data:`, error.message);
        // Continue with what we have
      }
    }
    
    // Determine intent from summary
    intent = determineIntent(summary, transcript);
    console.log(`[VAPI Webhook] Detected intent: ${intent}`);
    console.log(`[VAPI Webhook] Summary length: ${summary.length}, Transcript length: ${transcript.length}`);
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

  // Check if this call was about placing an order (takeout/delivery)
  // Extract order information from transcript/summary
  const summaryLower = (summary || "").toLowerCase();
  const transcriptLower = (transcript || "").toLowerCase();
  
  console.log(`[VAPI Webhook] 🔍 Checking for order keywords...`);
  console.log(`[VAPI Webhook] Summary preview: ${(summary || "").substring(0, 200)}`);
  console.log(`[VAPI Webhook] Transcript preview: ${(transcript || "").substring(0, 200)}`);
  
  // Check for order-related keywords
  const hasOrderKeywords = summaryLower.includes("order") || 
                          summaryLower.includes("takeout") ||
                          summaryLower.includes("delivery") ||
                          summaryLower.includes("pickup") ||
                          summaryLower.includes("placed an order") ||
                          summaryLower.includes("want to order") ||
                          summaryLower.includes("would like to order") ||
                          transcriptLower.includes("order") ||
                          transcriptLower.includes("takeout") ||
                          transcriptLower.includes("delivery");
  
  console.log(`[VAPI Webhook] Has order keywords: ${hasOrderKeywords}`);
  
  let createdOrder = null;
  
  // Try to extract and create order if order keywords are present
  if (hasOrderKeywords) {
    try {
      console.log(`[VAPI Webhook] 📦 Detected order-related call, attempting to extract order data`);
      const orderData = extractOrderFromTranscript(transcript, summary, vapiCallData, callSession);
      
      if (orderData && (orderData.items && orderData.items.length > 0 || orderData.item_numbers && orderData.item_numbers.length > 0)) {
        console.log(`[VAPI Webhook] ✅ Extracted order data:`, {
          customer_name: orderData.customer_name || 'N/A',
          customer_phone: orderData.customer_phone ? '***' : 'N/A',
          items_count: orderData.items?.length || 0,
          item_numbers_count: orderData.item_numbers?.length || 0,
          total: orderData.total,
        });
        
        // Create the order using TakeoutOrder model
        const { TakeoutOrder } = await import("../models/TakeoutOrder.js");
        
        // Ensure we have a phone number (required field)
        const customerPhone = orderData.customer_phone || callSession.caller_number;
        
        if (!customerPhone) {
          console.error(`[VAPI Webhook] ❌ Cannot create order - no customer phone number available`);
          throw new Error("Customer phone number is required for order creation");
        }
        
        // If we have item numbers, try to look them up from the menu
        let finalItems = orderData.items || [];
        
        if (orderData.item_numbers && orderData.item_numbers.length > 0) {
          try {
            const { MenuItem } = await import("../models/MenuItem.js");
            
            for (const itemNumber of orderData.item_numbers) {
              try {
                const menuItem = await MenuItem.findByBusinessIdAndNumber(business.id, itemNumber);
                if (menuItem) {
                  // Check if we already have this item by name
                  const existingItem = finalItems.find(item => 
                    item.menu_item_id === menuItem.id || 
                    item.item_number === itemNumber ||
                    item.name?.toLowerCase() === menuItem.name?.toLowerCase()
                  );
                  
                  if (existingItem) {
                    // Update existing item with menu data
                    existingItem.menu_item_id = menuItem.id;
                    existingItem.item_number = itemNumber;
                    existingItem.name = menuItem.name;
                    existingItem.description = menuItem.description;
                    if (!existingItem.unit_price || existingItem.unit_price === 0) {
                      existingItem.unit_price = menuItem.price || 0;
                    }
                  } else {
                    // Add new item from menu
                    finalItems.push({
                      menu_item_id: menuItem.id,
                      item_number: itemNumber,
                      name: menuItem.name,
                      description: menuItem.description,
                      quantity: 1, // Default to 1 if not specified
                      unit_price: menuItem.price || 0,
                      modifications: null,
                    });
                  }
                } else {
                  console.warn(`[VAPI Webhook] ⚠️ Menu item #${itemNumber} not found for business ${business.id}`);
                }
              } catch (menuError) {
                console.warn(`[VAPI Webhook] ⚠️ Error looking up menu item #${itemNumber}:`, menuError.message);
              }
            }
          } catch (importError) {
            console.warn(`[VAPI Webhook] ⚠️ Could not import MenuItem model:`, importError.message);
          }
        }
        
        // Recalculate totals if we updated items from menu
        if (finalItems.length > 0 && finalItems.some(item => item.unit_price > 0)) {
          const calculatedSubtotal = finalItems.reduce((sum, item) => {
            return sum + (item.unit_price * (item.quantity || 1));
          }, 0);
          
          // Use calculated subtotal if it's more accurate
          if (calculatedSubtotal > 0 && (orderData.subtotal === 0 || Math.abs(calculatedSubtotal - orderData.subtotal) < 5)) {
            orderData.subtotal = calculatedSubtotal;
            // Recalculate tax and total
            const taxRate = business.takeout_tax_rate ?? 0.13;
            const taxMethod = business.takeout_tax_calculation_method || 'exclusive';
            
            if (taxMethod === 'exclusive') {
              orderData.tax = orderData.subtotal * taxRate;
              orderData.total = orderData.subtotal + orderData.tax;
            } else {
              orderData.tax = orderData.subtotal - (orderData.subtotal / (1 + taxRate));
              orderData.total = orderData.subtotal;
            }
          }
        }
        
        createdOrder = await TakeoutOrder.create({
          business_id: business.id,
          call_session_id: callSession.id,
          vapi_call_id: callId || null,
          customer_name: orderData.customer_name || null,
          customer_phone: customerPhone,
          customer_email: orderData.customer_email || null,
          order_type: 'takeout',
          status: 'pending',
          special_instructions: orderData.special_instructions || null,
          subtotal: orderData.subtotal || 0,
          tax: orderData.tax || 0,
          total: orderData.total || 0,
          items: finalItems,
        });
        
        console.log(`[VAPI Webhook] ✅✅✅ Order created successfully:`, {
          order_number: createdOrder.order_number,
          order_id: createdOrder.id,
          total: createdOrder.total,
        });
      } else {
        console.log(`[VAPI Webhook] ⚠️ Order keywords detected but insufficient order data extracted`);
        console.log(`[VAPI Webhook] Order data check:`, {
          hasOrderData: !!orderData,
          itemsCount: orderData?.items?.length || 0,
        });
      }
    } catch (orderError) {
      console.error(`[VAPI Webhook] ❌ Error creating order from transcript:`, orderError);
      console.error(`[VAPI Webhook] Error details:`, {
        message: orderError.message,
        stack: orderError.stack,
      });
      // Don't throw - continue with message extraction
    }
  }

  // Extract message if callback/message intent OR if summary/transcript indicates a message was taken
  // Be more lenient - if transcript mentions taking a message, callback, interview, or contact info, create message
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
          
          // Create in-app notification for new message
          try {
            const callerName = messageData.name || callSession.caller_name || "Unknown caller";
            await Notification.create({
              business_id: business.id,
              user_id: null, // All users in organization see this
              type: 'module',
              message: `New message from ${callerName}: ${(messageData.message || summary || "Callback requested").substring(0, 100)}${(messageData.message || summary || "").length > 100 ? '...' : ''}`,
              metadata: {
                module_key: 'phone-agent',
                call_session_id: callSession.id,
                message_id: createdMessage.id,
                caller_name: callerName,
                caller_phone: messageData.phone || callSession.caller_number,
              },
            });
            console.log(`[VAPI Webhook] ✅ In-app notification created for new message`);
          } catch (notifError) {
            console.error(`[VAPI Webhook] ⚠️ Failed to create notification (non-blocking):`, notifError);
          }
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

  // Create notification for call completion (if no message was created)
  if (!createdMessage) {
    try {
      const durationDisplay = durationMinutes > 0 ? `${durationMinutes} min` : `${duration} sec`;
      const callerDisplay = callSession.caller_number ? callSession.caller_number.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : 'Unknown caller';
      await Notification.create({
        business_id: business.id,
        user_id: null, // All users in organization see this
        type: 'module',
        message: `Call completed from ${callerDisplay} (${durationDisplay})`,
        metadata: {
          module_key: 'phone-agent',
          call_session_id: callSession.id,
          caller_number: callSession.caller_number,
          duration_seconds: duration,
          duration_minutes: durationMinutes,
          intent: intent,
        },
      });
      console.log(`[VAPI Webhook] ✅ In-app notification created for call completion`);
    } catch (notifError) {
      console.error(`[VAPI Webhook] ⚠️ Failed to create call completion notification (non-blocking):`, notifError);
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
/**
 * Handle function calls from VAPI assistant
 * This handles the submit_takeout_order function call
 */
/**
 * Extract toolCallId from VAPI event (required for correct tool response format).
 * VAPI expects response: { results: [ { toolCallId: "<id>", result: "<string>" } ] }
 */
function getToolCallIdFromEvent(event) {
  const msg = event.message || event;
  const list = msg.toolCallList || msg.tool_call_list;
  if (Array.isArray(list) && list[0]?.id) return list[0].id;
  const withList = msg.toolWithToolCallList || msg.tool_with_tool_call_list;
  if (Array.isArray(withList) && withList[0]?.toolCall?.id) return withList[0].toolCall.id;
  const fc = event.functionCall || msg.functionCall || msg.function_call;
  if (fc?.id) return fc.id;
  return null;
}

async function handleFunctionCall(event) {
  console.log(`[VAPI Webhook] ⚙️ Processing function-call event`);
  console.log(`[VAPI Webhook] Function call event:`, JSON.stringify(event, null, 2));
  const toolCallId = getToolCallIdFromEvent(event);

  try {
    // Extract function call data from event
    // VAPI sends function calls in different formats, handle all of them
    const functionCall = event.functionCall || event.message?.functionCall || event.message?.function_call
      || event.message?.toolCallList?.[0] || event.message?.toolWithToolCallList?.[0]?.toolCall || event;
    const functionName = functionCall.name || functionCall.functionName || functionCall.function_name
      || functionCall.function?.name;
    const functionArguments = functionCall.arguments || functionCall.args || functionCall.parameters
      || functionCall.function?.arguments || {};
    
    console.log(`[VAPI Webhook] Function name: ${functionName}, toolCallId: ${toolCallId || 'none'}`);
    console.log(`[VAPI Webhook] Function arguments:`, JSON.stringify(functionArguments, null, 2));
    
    let resultContent = null;

    // Handle submit_takeout_order function
    if (functionName === 'submit_takeout_order') {
      await handleSubmitTakeoutOrder(functionArguments, event);
      return toolCallId ? { results: [{ toolCallId, result: 'Order received.' }] } : undefined;
    }
    // Emergency dispatch: provider accepted or declined
    if (functionName === 'dispatch_accept' || functionName === 'dispatch_decline') {
      resultContent = await handleDispatchProviderResponse(functionName, event);
      if (toolCallId && resultContent != null) {
        return { results: [{ toolCallId, result: resultContent }] };
      }
      return resultContent != null ? { result: resultContent } : undefined;
    }
    if (functionName === 'dispatch_email_details') {
      const out = await handleDispatchEmailDetails(event);
      resultContent = typeof out === 'object' && out?.result != null ? out.result : out;
      if (toolCallId && resultContent != null) {
        return { results: [{ toolCallId, result: resultContent }] };
      }
      return out;
    }
    if (functionName === 'dispatch_sms_details') {
      const out = await handleDispatchSmsDetails(event);
      resultContent = typeof out === 'object' && out?.result != null ? out.result : out;
      if (toolCallId && resultContent != null) {
        return { results: [{ toolCallId, result: resultContent }] };
      }
      return out;
    }
    console.log(`[VAPI Webhook] ⚠️ Unhandled function: ${functionName}`);
  } catch (error) {
    console.error(`[VAPI Webhook] ❌ Error handling function call:`, error);
    if (toolCallId) {
      return { results: [{ toolCallId, result: "Something went wrong. Please say Accept or Decline again." }] };
    }
  }
  return undefined;
}

/**
 * Handle dispatch_accept / dispatch_decline from emergency dispatch outbound call.
 * Returns a short phrase for the assistant to speak so VAPI can continue the conversation (STEP 2 or goodbye).
 */
async function handleDispatchProviderResponse(functionName, event) {
  const call = event.call || event.message?.call || event.message?.artifact?.call || {};
  const callId = call.id || call.callId;
  if (!callId) {
    console.warn('[VAPI Webhook] dispatch response: no callId');
    return "I couldn't find this call. Say Accept to take the job or Decline to pass.";
  }
  const { supabaseClient } = await import("../config/database.js");
  const { data: row } = await supabaseClient
    .from('emergency_dispatch_calls')
    .select('service_request_id, provider_id, dispatch_log_id')
    .eq('vapi_call_id', callId)
    .single();
  if (!row) {
    console.warn('[VAPI Webhook] dispatch response: no emergency_dispatch_calls row for call', callId);
    return "I couldn't find this call. Say Accept to take the job or Decline to pass.";
  }
  const result = functionName === 'dispatch_accept' ? 'accepted' : 'declined';
  await supabaseClient
    .from('emergency_dispatch_log')
    .update({ result })
    .eq('id', row.dispatch_log_id);
  if (functionName === 'dispatch_accept') {
    await supabaseClient
      .from('emergency_service_requests')
      .update({
        status: 'Accepted',
        accepted_provider_id: row.provider_id,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.service_request_id);
    const { logRequestActivity } = await import("../services/emergency-network/activity.js");
    await logRequestActivity(row.service_request_id, 'status_change', { from_status: 'Contacting Providers', to_status: 'Accepted', source: 'ai' });
    console.log('[VAPI Webhook] Emergency dispatch: provider accepted', row.service_request_id, row.provider_id);
    return "Job accepted. Would you like the details emailed, sent by SMS, or repeat?";
  } else {
    const { callNextProvider } = await import("../services/emergency-network/dispatch.js");
    await callNextProvider(row.service_request_id);
    console.log('[VAPI Webhook] Emergency dispatch: provider declined, trying next', row.service_request_id);
    return "You declined. We'll try the next provider. Thanks.";
  }
}

/**
 * Get dispatch call row and request + provider for a VAPI call (emergency dispatch).
 * @returns {{ request, provider, dispatch_log_id } | null}
 */
async function getDispatchCallContext(callId) {
  if (!callId) return null;
  const { supabaseClient } = await import("../config/database.js");
  const { data: row } = await supabaseClient
    .from('emergency_dispatch_calls')
    .select('service_request_id, provider_id, dispatch_log_id')
    .eq('vapi_call_id', callId)
    .single();
  if (!row) return null;
  const { data: request } = await supabaseClient
    .from('emergency_service_requests')
    .select('*')
    .eq('id', row.service_request_id)
    .single();
  const { data: provider } = await supabaseClient
    .from('emergency_providers')
    .select('*')
    .eq('id', row.provider_id)
    .single();
  if (!request || !provider) return null;
  return { request, provider, dispatch_log_id: row.dispatch_log_id };
}

/**
 * Handle dispatch_email_details: email request details to the provider.
 * Returns { result: string } for the assistant to speak (e.g. "no email on file").
 */
async function handleDispatchEmailDetails(event) {
  const call = event.call || event.message?.call || event.message?.artifact?.call || {};
  const callId = call.id || call.callId;
  const ctx = await getDispatchCallContext(callId);
  if (!ctx) {
    console.warn('[VAPI Webhook] dispatch_email_details: no dispatch context for call', callId);
    return { result: "I couldn't find this call. Please try again or say SMS to get the details by text." };
  }
  const { request, provider, dispatch_log_id } = ctx;
  const email = (provider.email && String(provider.email).trim()) || null;
  if (!email) {
    console.warn('[VAPI Webhook] dispatch_email_details: provider has no email', provider.id);
    return { result: "There is no email on file for your business. Add your email in the provider directory, or say SMS to get the details by text." };
  }
  try {
    const { sendEmergencyIntakeEmail } = await import("../services/notifications.js");
    await sendEmergencyIntakeEmail(email, request);
    console.log('[VAPI Webhook] Emergency dispatch: emailed details to provider', provider.id);
    if (dispatch_log_id) {
      const { supabaseClient } = await import("../config/database.js");
      await supabaseClient
        .from('emergency_dispatch_log')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', dispatch_log_id);
    }
    return { result: "I've emailed the details to you." };
  } catch (err) {
    console.error('[VAPI Webhook] dispatch_email_details failed:', err?.message || err);
    return { result: "The email could not be sent. Say SMS to get the details by text instead." };
  }
}

/**
 * Handle dispatch_sms_details: text request details to the provider. SMS rates may apply.
 * Returns { result: string } for the assistant to speak.
 */
async function handleDispatchSmsDetails(event) {
  const call = event.call || event.message?.call || event.message?.artifact?.call || {};
  const callId = call.id || call.callId;
  const ctx = await getDispatchCallContext(callId);
  if (!ctx) {
    console.warn('[VAPI Webhook] dispatch_sms_details: no dispatch context for call', callId);
    return { result: "I couldn't find this call. Please try again." };
  }
  const { request, provider, dispatch_log_id } = ctx;
  const toNumber = (provider.phone && String(provider.phone).replace(/\D/g, '')) || null;
  if (!toNumber) {
    console.warn('[VAPI Webhook] dispatch_sms_details: provider has no phone', provider.id);
    return { result: "There is no phone number on file to text. The details were shared at the start of this call." };
  }
  const fromConfig = await (await import("../services/emergency-network/config.js")).getEmergencyConfig();
  const numbers = fromConfig?.emergency_phone_numbers || [];
  const fromDigits = numbers.length > 0 ? String(numbers[0]).replace(/\D/g, '') : '';
  if (!fromDigits) {
    console.warn('[VAPI Webhook] dispatch_sms_details: no emergency from number configured');
    return { result: "Text is not configured. The details were shared at the start of this call." };
  }
  const fromE164 = fromDigits.length === 10 ? `+1${fromDigits}` : fromDigits.length === 11 && fromDigits.startsWith('1') ? `+${fromDigits}` : `+${fromDigits}`;
  const toE164 = toNumber.length === 10 ? `+1${toNumber}` : toNumber.startsWith('+') ? toNumber : `+${toNumber}`;
  const lines = [
    'Emergency service request:',
    request.caller_name ? `Caller: ${request.caller_name}` : '',
    `Callback: ${request.callback_phone || 'N/A'}`,
    request.urgency_level ? `Urgency: ${request.urgency_level}` : '',
    request.location ? `Location: ${request.location}` : '',
    request.issue_summary ? `Issue: ${(request.issue_summary || '').slice(0, 120)}` : '',
  ].filter(Boolean);
  const messageText = lines.join('\n');
  try {
    const { sendSMSDirect } = await import("../services/notifications.js");
    await sendSMSDirect(fromE164, toE164, messageText, true);
    console.log('[VAPI Webhook] Emergency dispatch: texted details to provider', provider.id);
    if (dispatch_log_id) {
      const { supabaseClient } = await import("../config/database.js");
      await supabaseClient
        .from('emergency_dispatch_log')
        .update({ sms_sent_at: new Date().toISOString() })
        .eq('id', dispatch_log_id);
    }
    return { result: "I've texted the details to you. Data rates may apply." };
  } catch (err) {
    console.error('[VAPI Webhook] dispatch_sms_details failed:', err?.message || err);
    return { result: "The text could not be sent. The details were shared at the start of this call." };
  }
}

/**
 * Handle submit_takeout_order function call
 */
async function handleSubmitTakeoutOrder(args, event) {
  console.log(`[VAPI Webhook] 📦 Processing takeout order submission`);
  console.log(`[VAPI Webhook] Order data:`, JSON.stringify(args, null, 2));
  
  // Extract order data early for error handling
  let orderData = args;
  if (typeof args === 'string') {
    try {
      orderData = JSON.parse(args);
    } catch (parseError) {
      console.error(`[VAPI Webhook] ❌ Failed to parse function arguments as JSON:`, parseError);
      return;
    }
  }
  
  // CRITICAL: Log the raw items array immediately
  const rawItems = orderData?.items || [];
  console.log(`[VAPI Webhook] 🔥🔥🔥 RAW ITEMS FROM AI (before any processing):`, JSON.stringify(rawItems, null, 2));
  console.log(`[VAPI Webhook] 🔥🔥🔥 RAW ITEMS COUNT: ${rawItems.length}`);
  rawItems.forEach((item, idx) => {
    console.log(`[VAPI Webhook] 🔥🔥🔥 RAW Item ${idx + 1}:`, {
      name: item.name || item.item_name,
      quantity: item.quantity,
      quantity_type: typeof item.quantity,
      item_number: item.item_number,
      modifications: item.modifications || item.modification,
    });
  });
  
  let business = null;
  let assistantId = null;
  
  try {
    // Extract call ID and assistant ID to find business
    const call = event.call || event.message?.call || event.message?.artifact?.call || {};
    const callId = call.id || call.callId;
    assistantId = event.call?.assistant?.id 
      || event.message?.assistant?.id
      || call.assistant?.id
      || event.message?.call?.assistant?.id;
    
    console.log(`[VAPI Webhook] Call ID: ${callId}, Assistant ID: ${assistantId}`);
    
    if (!assistantId) {
      console.error(`[VAPI Webhook] ❌ No assistant ID found in function call event`);
      return;
    }
    
    // Find business by assistant ID
    business = await Business.findByVapiAssistantId(assistantId);
    
    if (!business) {
      console.error(`[VAPI Webhook] ❌ Business not found for assistant ${assistantId}`);
      return;
    }
    
    console.log(`[VAPI Webhook] ✅ Found business: ${business.id}`);
    
    // Find call session
    let callSession = null;
    if (callId) {
      try {
        callSession = await CallSession.findByVapiCallId(callId);
      } catch (error) {
        console.warn(`[VAPI Webhook] ⚠️ Could not find call session for call ${callId}:`, error.message);
      }
    }
    
    // Extract order data
    let {
      customer_name,
      customer_phone,
      customer_email,
      items = [], // Array of items: [{name, quantity, price, modifications}]
      special_instructions,
      subtotal = 0,
      tax = 0,
      total = 0,
    } = orderData;
    
    // Validate and clean customer name
    // The AI should have collected the name in Step 1, so it should be in the function call
    // But if it's missing or looks invalid, try to get it from call session
    if (!customer_name || customer_name.trim() === '' || customer_name === 'Unknown' || customer_name === 'N/A') {
      console.log(`[VAPI Webhook] ⚠️ Customer name missing or invalid in function call: "${customer_name}"`);
      
      // Try to get from call session
      if (callSession && callSession.caller_name) {
        customer_name = callSession.caller_name;
        console.log(`[VAPI Webhook] ✅ Using customer name from call session: "${customer_name}"`);
      } else {
        // Try to extract from transcript if available
        try {
          const { getCallSummary } = await import("../services/vapi.js");
          if (callId) {
            const callSummary = await getCallSummary(callId);
            if (callSummary && callSummary.transcript) {
              // Extract name from transcript using improved patterns
              const namePatterns = [
                /(?:my name is|this is|i'm|i am|name is|it's|it is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /(?:customer|caller|name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                /(?:^|\n)(?:User|Caller):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/m,
              ];
              
              for (const pattern of namePatterns) {
                const match = callSummary.transcript.match(pattern);
                if (match && match[1]) {
                  const candidate = match[1].trim();
                  // Validate: must be 2-30 chars, no digits, no common words
                  const invalidWords = ['order', 'pickup', 'takeout', 'delivery', 'phone', 'number', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank'];
                  if (candidate.length >= 2 && 
                      candidate.length <= 30 && 
                      !/\d/.test(candidate) && 
                      !invalidWords.includes(candidate.toLowerCase())) {
                    customer_name = candidate;
                    console.log(`[VAPI Webhook] ✅ Extracted customer name from transcript: "${customer_name}"`);
                    break;
                  }
                }
              }
            }
          }
        } catch (extractError) {
          console.warn(`[VAPI Webhook] ⚠️ Could not extract name from transcript:`, extractError.message);
        }
      }
    }
    
    // Final validation - if still invalid, set to null (don't use random words)
    if (!customer_name || 
        customer_name.trim() === '' || 
        customer_name === 'Unknown' || 
        customer_name === 'N/A' ||
        customer_name.length < 2 ||
        customer_name.length > 50 ||
        /\d/.test(customer_name)) {
      console.warn(`[VAPI Webhook] ⚠️ Customer name still invalid after all attempts: "${customer_name}", setting to null`);
      customer_name = null;
    } else {
      // Clean the name: capitalize properly, remove extra spaces
      customer_name = customer_name.trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      console.log(`[VAPI Webhook] ✅ Using validated customer name: "${customer_name}"`);
    }
    
    // Validate required fields
    if (!customer_phone) {
      console.error(`[VAPI Webhook] ❌ Customer phone number is required`);
      return;
    }
    
    if (!items || items.length === 0) {
      console.error(`[VAPI Webhook] ❌ Order must have at least one item`);
      return;
    }
    
    // Create order via API (using TakeoutOrder model directly)
    const { TakeoutOrder } = await import("../models/TakeoutOrder.js");
    
    // Log received items for debugging
    console.log(`[VAPI Webhook] 📦 Received items from function call:`, JSON.stringify(items, null, 2));
    console.log(`[VAPI Webhook] 📦 Items count: ${items.length}`);
    items.forEach((item, idx) => {
      console.log(`[VAPI Webhook] 📦 Item ${idx + 1}:`, {
        name: item.name || item.item_name,
        item_number: item.item_number,
        quantity: item.quantity,
        quantity_type: typeof item.quantity,
        quantity_value: item.quantity,
        modifications: item.modifications || item.modification,
        price: item.price || item.unit_price,
      });
    });
    
    // Consolidate duplicate items (same item_number AND same modifications) before processing
    // CRITICAL: Items with different modifications should NOT be consolidated
    // Example: "2 cheeseburgers, 1 with cheese, 1 with bacon" = 2 separate items, NOT 1 item with quantity 2
    // SAFEGUARD: If AI sends multiple identical items (same item_number, no modifications), consolidate them
    const itemMap = new Map();
    items.forEach((item) => {
      // Create a unique key that includes item_number AND modifications
      // This ensures items with different modifications are kept separate
      const modsKey = JSON.stringify(item.modifications || item.modification || []);
      const key = `${item.item_number || item.name || item.item_name || 'unknown'}_${modsKey}`;
      
      if (itemMap.has(key)) {
        // Item already exists with same modifications - add to quantity
        const existing = itemMap.get(key);
        const existingQty = typeof existing.quantity === 'number' ? existing.quantity : (parseInt(String(existing.quantity), 10) || 1);
        const newQty = typeof item.quantity === 'number' ? item.quantity : (parseInt(String(item.quantity), 10) || 1);
        existing.quantity = existingQty + newQty;
        console.log(`[VAPI Webhook] 🔄 Consolidated duplicate item "${key}": ${existingQty} (type: ${typeof existing.quantity}) + ${newQty} (type: ${typeof item.quantity}) = ${existing.quantity} (type: ${typeof existing.quantity})`);
      } else {
        // Ensure quantity is a number when adding to map
        const itemWithQty = { ...item };
        if (itemWithQty.quantity === undefined || itemWithQty.quantity === null) {
          itemWithQty.quantity = 1;
          console.log(`[VAPI Webhook] ⚠️ Item "${key}" missing quantity, defaulting to 1`);
        } else if (typeof itemWithQty.quantity !== 'number') {
          itemWithQty.quantity = parseInt(String(itemWithQty.quantity), 10) || 1;
          console.log(`[VAPI Webhook] ⚠️ Item "${key}" quantity was ${typeof item.quantity}, converted to ${itemWithQty.quantity}`);
        }
        itemMap.set(key, itemWithQty);
      }
    });
    
    const consolidatedItems = Array.from(itemMap.values());
    
    console.log(`[VAPI Webhook] 📦 After consolidation: ${items.length} items -> ${consolidatedItems.length} items`);
    consolidatedItems.forEach((item, idx) => {
      console.log(`[VAPI Webhook] 📦 Consolidated item ${idx + 1}:`, {
        name: item.name || item.item_name,
        item_number: item.item_number,
        quantity: item.quantity,
        quantity_type: typeof item.quantity,
        modifications: item.modifications || item.modification,
      });
    });
    if (consolidatedItems.length !== items.length) {
      console.log(`[VAPI Webhook] 📦 Consolidated items (full):`, JSON.stringify(consolidatedItems, null, 2));
    }
    
    // Process items and try to match with menu items if item_number is provided
    const processedItems = await Promise.all(consolidatedItems.map(async (item, index) => {
      // Log each item being processed
      console.log(`[VAPI Webhook] Processing item ${index + 1}:`, {
        item_number: item.item_number,
        name: item.name || item.item_name,
        quantity: item.quantity,
        quantity_type: typeof item.quantity,
        price: item.price || item.unit_price || item.unitPrice,
      });
      
      let menuItemId = null;
      
      // Extract quantity - handle various formats
      let quantity = 1;
      if (item.quantity !== undefined && item.quantity !== null) {
        if (typeof item.quantity === 'string') {
          quantity = parseInt(item.quantity, 10) || 1;
        } else if (typeof item.quantity === 'number') {
          quantity = Math.max(1, Math.floor(item.quantity)); // Ensure at least 1 and is an integer
        } else {
          quantity = parseInt(item.quantity, 10) || 1;
        }
      }
      
      // Try to find menu item by item_number if provided
      let menuItem = null;
      let modifierPrice = 0;
      let validatedModifications = null;
      
      if (item.item_number) {
        try {
          const { MenuItem } = await import("../models/MenuItem.js");
          menuItem = await MenuItem.findByBusinessIdAndNumber(business.id, item.item_number);
          if (menuItem) {
            menuItemId = menuItem.id;
            
            // Validate and process modifications
            const requestedMods = item.modifications || item.modification;
            if (requestedMods) {
              // Parse modifications - could be string, array, or object
              let modsArray = [];
              if (typeof requestedMods === 'string') {
                // Try to parse as JSON, or treat as comma-separated list
                try {
                  modsArray = JSON.parse(requestedMods);
                } catch {
                  modsArray = requestedMods.split(',').map(m => m.trim()).filter(m => m.length > 0);
                }
              } else if (Array.isArray(requestedMods)) {
                modsArray = requestedMods.filter(m => m !== null && m !== undefined);
              } else if (typeof requestedMods === 'object') {
                modsArray = Object.values(requestedMods).flat().filter(m => m !== null && m !== undefined);
              }
              
              // Get available modifiers from menu item
              const availableMods = {
                free: (menuItem.modifiers?.free || []).map(m => {
                  const name = typeof m === 'string' ? m : (m.name || m);
                  return name?.toLowerCase() || name;
                }),
                paid: (menuItem.modifiers?.paid || []).map(m => ({
                  name: (typeof m === 'string' ? m : (m.name || m))?.toLowerCase(),
                  price: parseFloat(typeof m === 'object' ? (m.price || 0) : 0),
                })),
              };
              
              // Also allow standard ingredient modifications (add/remove existing ingredients)
              // These are common like "extra cheese", "no lettuce", "double pickles", etc.
              const standardIngredientMods = ['extra', 'no', 'double', 'without', 'add', 'remove'];
              
              // Validate each requested modifier
              const validMods = [];
              const invalidMods = [];
              let modifierPricePerUnit = 0; // Price per unit (not total)
              
              modsArray.forEach(mod => {
                const modName = typeof mod === 'string' ? mod.toLowerCase().trim() : (mod.name || mod).toLowerCase().trim();
                
                // Check if it's a standard ingredient modification (extra, no, double, etc.)
                const isStandardMod = standardIngredientMods.some(prefix => modName.startsWith(prefix));
                
                // Check if it's a free modifier
                if (availableMods.free.includes(modName)) {
                  validMods.push(modName);
                } 
                // Check if it's a paid modifier
                else {
                  const paidMod = availableMods.paid.find(p => p.name === modName);
                  if (paidMod) {
                    validMods.push(modName);
                    modifierPricePerUnit += paidMod.price; // Add modifier price per unit
                  } 
                  // Check if it's a standard ingredient mod (allow it)
                  else if (isStandardMod) {
                    validMods.push(modName);
                    // Standard ingredient mods are free (no price)
                  } 
                  else {
                    invalidMods.push(modName);
                  }
                }
              });
              
              if (invalidMods.length > 0) {
                console.warn(`[VAPI Webhook] ⚠️ Invalid modifiers requested for item #${item.item_number}: ${invalidMods.join(', ')}`);
                console.warn(`[VAPI Webhook] Available modifiers: Free: ${availableMods.free.join(', ')}, Paid: ${availableMods.paid.map(p => `${p.name} ($${p.price.toFixed(2)})`).join(', ')}`);
                // Still include valid mods, but log the invalid ones
              }
              
              validatedModifications = validMods.length > 0 ? validMods.join(', ') : null;
              modifierPrice = modifierPricePerUnit; // This is per unit, will be multiplied by quantity later
            }
            
            // Calculate base price + modifier prices per unit
            const basePrice = parseFloat(item.price || item.unit_price || item.unitPrice || menuItem.price) || 0;
            const unitPriceWithMods = basePrice + modifierPrice; // modifierPrice is already per unit
            
            // Use menu item data if available
            const processedItem = {
              menu_item_id: menuItemId,
              item_number: item.item_number,
              name: menuItem.name || item.name || item.item_name || 'Unknown Item',
              description: menuItem.description || item.description || item.item_description || null,
              quantity: quantity,
              unit_price: unitPriceWithMods,
              modifications: validatedModifications,
              special_instructions: item.special_instructions || null,
            };
            console.log(`[VAPI Webhook] ✅ Processed item ${index + 1} (with menu match):`, {
              name: processedItem.name,
              quantity: processedItem.quantity,
              item_number: processedItem.item_number,
              unit_price: processedItem.unit_price,
              modifications: processedItem.modifications,
              modifier_price_added: modifierPrice,
            });
            return processedItem;
          }
        } catch (error) {
          console.warn(`[VAPI Webhook] Could not find menu item #${item.item_number}:`, error.message);
        }
      }
      
      // Fallback to item data as provided
      const processedItem = {
        menu_item_id: menuItemId,
        item_number: item.item_number || null,
        name: item.name || item.item_name || 'Unknown Item',
        description: item.description || item.item_description || null,
        quantity: quantity,
        unit_price: parseFloat(item.price || item.unit_price || item.unitPrice) || 0,
        modifications: item.modifications || item.modification || null,
        special_instructions: item.special_instructions || null,
      };
      console.log(`[VAPI Webhook] ✅ Processed item ${index + 1} (fallback):`, {
        name: processedItem.name,
        quantity: processedItem.quantity,
        item_number: processedItem.item_number,
      });
      return processedItem;
    }));
    
    // Log final processed items
    console.log(`[VAPI Webhook] 📦 Final processed items:`, JSON.stringify(processedItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      quantity_type: typeof item.quantity,
      item_number: item.item_number,
      unit_price: item.unit_price,
    })), null, 2));
    console.log(`[VAPI Webhook] 📦 Final processed items COUNT: ${processedItems.length}`);
    processedItems.forEach((item, idx) => {
      console.log(`[VAPI Webhook] 📦 Final item ${idx + 1}: quantity=${item.quantity} (type: ${typeof item.quantity}), name="${item.name}"`);
    });
    
    // Recalculate totals based on business tax settings
    const taxRate = business.takeout_tax_rate ?? 0.13;
    const taxMethod = business.takeout_tax_calculation_method || 'exclusive';
    
    // Calculate subtotal from items and modifiers
    // Note: item.unit_price already includes modifier prices (calculated during processing above)
    let calculatedSubtotal = processedItems.reduce((sum, item) => {
      let itemTotal = item.unit_price * item.quantity;
      // item.unit_price already includes base price + modifier prices per unit
      return sum + itemTotal;
    }, 0);
    
    // Use provided subtotal if it's close to calculated, otherwise use calculated
    const finalSubtotal = Math.abs(calculatedSubtotal - parseFloat(subtotal || 0)) < 0.01 
      ? parseFloat(subtotal || 0) 
      : calculatedSubtotal;
    
    // Calculate tax based on method
    let calculatedTax = 0;
    if (taxMethod === 'exclusive') {
      // Tax is added on top
      calculatedTax = finalSubtotal * taxRate;
    } else {
      // Tax is included in prices - extract it
      calculatedTax = finalSubtotal - (finalSubtotal / (1 + taxRate));
    }
    
    // Use provided tax if it's close to calculated, otherwise use calculated
    const finalTax = Math.abs(calculatedTax - parseFloat(tax || 0)) < 0.01
      ? parseFloat(tax || 0)
      : calculatedTax;
    
    // Calculate total
    const finalTotal = taxMethod === 'exclusive' 
      ? finalSubtotal + finalTax
      : finalSubtotal; // Tax already included
    
    // Use provided total if it's close to calculated, otherwise use calculated
    const orderTotal = Math.abs(finalTotal - parseFloat(total || 0)) < 0.01
      ? parseFloat(total || 0)
      : finalTotal;
    
    console.log(`[VAPI Webhook] Tax calculation:`, {
      method: taxMethod,
      rate: `${(taxRate * 100).toFixed(2)}%`,
      subtotal: finalSubtotal,
      tax: finalTax,
      total: orderTotal,
    });
    
    // Log items being passed to TakeoutOrder.create
    console.log(`[VAPI Webhook] 📦 About to create order with ${processedItems.length} items:`);
    processedItems.forEach((item, idx) => {
      console.log(`[VAPI Webhook] 📦 Item ${idx + 1} for DB:`, {
        name: item.name,
        quantity: item.quantity,
        quantity_type: typeof item.quantity,
        item_number: item.item_number,
        unit_price: item.unit_price,
      });
    });
    
    const order = await TakeoutOrder.create({
      business_id: business.id,
      call_session_id: callSession?.id || null,
      vapi_call_id: callId || null,
      customer_name: customer_name || null,
      customer_phone,
      customer_email: customer_email || null,
      order_type: 'takeout',
      status: 'pending',
      special_instructions: special_instructions || null,
      subtotal: finalSubtotal,
      tax: finalTax,
      total: orderTotal,
      items: processedItems,
    });
    
    console.log(`[VAPI Webhook] ✅ Takeout order created: ${order.order_number} (${order.id})`);
    console.log(`[VAPI Webhook] Order details:`, {
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items_count: order.items?.length || 0,
      total: order.total,
    });
    
    // TODO: Send notification to kitchen (tablet interface will poll for new orders)
    // For now, the tablet interface will refresh and show the new order
    
  } catch (error) {
    console.error(`[VAPI Webhook] ❌ Error creating takeout order:`, error);
    console.error(`[VAPI Webhook] Error stack:`, error.stack);
    
    // Send email notification to business about failed order (only if we have business info)
    if (business && (business.email || business.contact_email)) {
      try {
        const { sendCallSummaryEmail } = await import("../services/notifications.js");
        
        const customerName = orderData?.customer_name || 'Unknown';
        const customerPhone = orderData?.customer_phone || 'Unknown';
        const itemsSummary = (orderData?.items || []).map(item => 
          `${item.quantity || 1}x ${item.name || item.item_name || 'Unknown Item'}`
        ).join(', ') || 'No items listed';
        const total = orderData?.total || 0;
        
        const errorEmailSubject = `⚠️ Failed Takeout Order - Follow Up Required`;
        const errorEmailHtml = `
          <h2>⚠️ Failed Takeout Order - Follow Up Required</h2>
          <p>A customer attempted to place a takeout order through the AI phone system, but the order submission failed.</p>
          <p><strong>Please follow up with the customer immediately.</strong></p>
          <hr>
          <h3>Customer Information:</h3>
          <ul>
            <li><strong>Name:</strong> ${customerName}</li>
            <li><strong>Phone:</strong> ${customerPhone}</li>
          </ul>
          <h3>Order Details:</h3>
          <ul>
            <li><strong>Items:</strong> ${itemsSummary}</li>
            <li><strong>Total:</strong> $${total.toFixed(2)}</li>
          </ul>
          <h3>Error Details:</h3>
          <pre>${error.message}</pre>
          <hr>
          <p><em>This is an automated notification. Please contact the customer to complete their order.</em></p>
        `;
        
        const errorEmailText = `
Failed Takeout Order - Follow Up Required

A customer attempted to place a takeout order through the AI phone system, but the order submission failed. Please follow up with the customer immediately.

Customer Information:
- Name: ${customerName}
- Phone: ${customerPhone}

Order Details:
- Items: ${itemsSummary}
- Total: $${total.toFixed(2)}

Error: ${error.message}

Please contact the customer to complete their order.
        `;
        
        // Send email using the notification service
        await sendCallSummaryEmail({
          business: {
            id: business.id,
            name: business.name,
            email: business.email || business.contact_email,
          },
          subject: errorEmailSubject,
          html: errorEmailHtml,
          text: errorEmailText,
          forceEmail: true, // Force send even if email_ai_answered is false
        });
        
        console.log(`[VAPI Webhook] ✅ Error notification email sent to ${business.email || business.contact_email}`);
      } catch (emailError) {
        console.error(`[VAPI Webhook] ❌ Failed to send error notification email:`, emailError);
        // Don't throw - we've already logged the error
      }
    } else {
      console.warn(`[VAPI Webhook] ⚠️ Cannot send error notification email - business not found or no email address`);
    }
  }
}

/**
 * Extract order information from transcript and summary
 * This function parses the conversation to find order details when VAPI functions aren't available
 */
function extractOrderFromTranscript(transcript, summary, vapiCallData = null, callSession = null) {
  console.log(`[Order Extraction] Starting order extraction from transcript/summary`);
  
  // Prioritize summary first (more structured), then transcript
  // Summary typically has better formatted information like "came to $16.94"
  const fullText = `${summary || ""} ${transcript || ""}`;
  const fullTextLower = fullText.toLowerCase();
  
  console.log(`[Order Extraction] Summary length: ${(summary || "").length}, Transcript length: ${(transcript || "").length}`);
  
  // Initialize order data
  const orderData = {
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    items: [],
    special_instructions: null,
    subtotal: 0,
    tax: 0,
    total: 0,
  };
  
  // Extract customer information
  // Try to get from call session first
  if (callSession) {
    orderData.customer_phone = callSession.caller_number || null;
    orderData.customer_name = callSession.caller_name || null;
  }
  
  // Extract name from transcript (similar to message extraction)
  // Only extract if name is missing or invalid - prefer the name from function call
  if (!orderData.customer_name || 
      orderData.customer_name === "Unknown" || 
      orderData.customer_name === "N/A" ||
      orderData.customer_name.trim() === '') {
    const namePatterns = [
      /(?:my name is|this is|i'm|i am|name is|it's|it is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:customer|caller|name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:^|\n)(?:User|Caller):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/m,
    ];
    
    // Blacklist common words that shouldn't be names
    const invalidWords = new Set([
      'order', 'pickup', 'takeout', 'delivery', 'phone', 'number', 'yes', 'no', 'ok', 'okay', 
      'thanks', 'thank', 'please', 'sure', 'that', 'this', 'would', 'could', 'should',
      'total', 'subtotal', 'tax', 'price', 'amount', 'dollar', 'cents', 'ready', 'minutes',
      'cheeseburger', 'burger', 'pizza', 'fries', 'item', 'items', 'menu', 'special',
    ]);
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const candidateLower = candidate.toLowerCase();
        
        // Validate: must be 2-30 chars, no digits, not in blacklist, looks like a name
        if (candidate.length >= 2 && 
            candidate.length <= 30 && 
            !/\d/.test(candidate) &&
            !invalidWords.has(candidateLower) &&
            /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(candidate)) {
          orderData.customer_name = candidate;
          console.log(`[Order Extraction] ✅ Extracted customer name from transcript: "${candidate}"`);
          break;
        } else {
          console.log(`[Order Extraction] ⚠️ Rejected candidate name: "${candidate}" (invalid format or blacklisted)`);
        }
      }
    }
  }
  
  // Extract phone number
  if (!orderData.customer_phone) {
    const phonePatterns = [
      /(?:phone|number|call me at|reach me at)[:\s]*([+]?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
    ];
    
    for (const pattern of phonePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        let phone = match[1].replace(/[-.\s()]/g, "");
        if (phone.length === 10 && !phone.startsWith("+")) {
          phone = "+1" + phone;
        } else if (phone.length === 11 && phone.startsWith("1")) {
          phone = "+" + phone;
        }
        orderData.customer_phone = phone;
        break;
      }
    }
  }
  
  // Extract email
  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const emailMatch = fullText.match(emailPattern);
  if (emailMatch) {
    orderData.customer_email = emailMatch[1];
  }
  
  // BLACKLIST: Words that should NEVER be extracted as menu items
  const itemBlacklist = new Set([
    // Common words
    "the", "a", "an", "and", "or", "with", "for", "to", "of", "in", "on", "at", "is", "are", "was", "were", "been", "be", "have", "has", "had",
    "will", "would", "could", "should", "may", "might", "can", "must", "do", "does", "did", "done",
    "this", "that", "these", "those", "it", "its", "they", "them", "their", "there", "their",
    "i", "you", "he", "she", "we", "your", "my", "his", "her", "our", "me", "him", "us",
    "all", "some", "any", "each", "every", "other", "another", "one", "two", "three", "first", "second", "third",
    "moment", "minute", "second", "time", "times", "today", "tomorrow", "yesterday", "now", "then", "when", "where",
    "order", "orders", "ordering", "ordered", "total", "totals", "subtotal", "tax", "price", "prices", "cost", "costs",
    "dollar", "dollars", "cent", "cents", "digit", "digits", "number", "numbers", "item", "items",
    "takeout", "take", "put", "place", "placed", "placing", "get", "got", "getting", "give", "gave", "giving",
    "correct", "looks", "look", "see", "seeing", "want", "wants", "wanted", "need", "needs", "needed",
    "everything", "something", "nothing", "anything", "else", "more", "please", "thank", "thanks", "yes", "no", "ok", "okay",
    "cheeseburger", "burger", "pizza", "fries", // These might be actual items, but we only extract with item numbers
  ]);
  
  // Extract order items - ONLY extract items with explicit menu item numbers
  // DO NOT extract generic item names - they're too ambiguous and create false matches
  // We rely on the AI calling submit_takeout_order function for proper item extraction
  const itemPatterns = [
    // Pattern 1: menu item number with optional item name (e.g., "number 1, the cheeseburger", "item #5 pizza")
    // ONLY extract if we have a menu item number
    /(?:item\s*#?|number\s*|#)\s*(\d+)(?:,\s*(?:the\s+)?([a-z]+(?:\s+[a-z]+)*?)|(?:\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+)*?)))/gi,
    // Pattern 2: menu item number alone (e.g., "item #5", "number 5", "#5")
    // This is the most reliable - explicit item numbers
    /(?:item\s*#?|number\s*|#)\s*(\d+)/gi,
  ];
  
  const foundItems = new Map(); // Use Map to avoid duplicates
  const foundItemNumbers = new Set(); // Track item numbers separately
  
  // Try to extract items using patterns
  for (let i = 0; i < itemPatterns.length; i++) {
    const pattern = itemPatterns[i];
    let match;
    
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(fullText)) !== null) {
      // Handle menu item numbers with item names (first pattern)
      if (i === 0 && match[1]) {
        const itemNumber = parseInt(match[1], 10);
        if (itemNumber > 0) {
          foundItemNumbers.add(itemNumber);
          // Also extract the item name if provided (e.g., "number 1, the cheeseburger")
          const itemName = (match[2] || match[3] || "").trim();
          if (itemName && itemName.length > 2) {
            const itemNameLower = itemName.toLowerCase();
            
            // Skip blacklisted words
            if (itemBlacklist.has(itemNameLower)) {
              console.log(`[Order Extraction] Skipping blacklisted word: ${itemNameLower}`);
              continue;
            }
            
            // Skip if it contains digits (like "14.99" being extracted as an item)
            if (/\d/.test(itemName)) {
              console.log(`[Order Extraction] Skipping item name with digits: ${itemNameLower}`);
              continue;
            }
            
            const normalizedName = itemName.charAt(0).toUpperCase() + itemName.slice(1).toLowerCase();
            // Check if we already have this item
            const existingItem = foundItems.get(normalizedName);
            if (existingItem) {
              existingItem.item_number = itemNumber;
              existingItem.quantity = (existingItem.quantity || 0) + 1; // Increment quantity if item name already found
            } else {
              foundItems.set(normalizedName, {
                name: normalizedName,
                quantity: 1, // Default to 1, will be updated if we find quantity
                unit_price: 0,
                item_number: itemNumber,
                modifications: null,
              });
            }
          }
        }
        continue;
      }
      
      // Handle menu item numbers alone (second pattern)
      if (i === 1 && match[1]) {
        const itemNumber = parseInt(match[1], 10);
        if (itemNumber > 0) {
          foundItemNumbers.add(itemNumber);
        }
        continue;
      }
    }
  }
  
  // If we found item numbers, try to look them up from the menu
  // Note: This requires business context, which we'll handle when creating the order
  if (foundItemNumbers.size > 0) {
    console.log(`[Order Extraction] Found menu item numbers:`, Array.from(foundItemNumbers));
    // Store item numbers for later lookup during order creation
    orderData.item_numbers = Array.from(foundItemNumbers);
  }
  
  // NOTE: We DO NOT extract generic item names from summary text anymore
  // This was causing false positives (extracting words like "digits", "dollars", "cents", etc.)
  // We ONLY extract items with explicit menu item numbers (handled above)
  // The AI should be calling submit_takeout_order function with proper item data
  console.log(`[Order Extraction] Skipping summary text extraction - only extracting explicit menu item numbers`);
  
  // Convert Map to array
  orderData.items = Array.from(foundItems.values());
  
  // Try to extract prices from transcript if not found
  // Look for price patterns near item names
  if (orderData.items.length > 0) {
    for (const item of orderData.items) {
      if (item.unit_price === 0) {
        // Try to find price for this item
        const itemNameLower = item.name.toLowerCase();
        const pricePattern = new RegExp(`${itemNameLower}[^\\d]*\\$?(\\d+\\.?\\d*)`, 'i');
        const priceMatch = fullText.match(pricePattern);
        if (priceMatch) {
          item.unit_price = parseFloat(priceMatch[1]);
        }
      }
    }
  }
  
  // Extract special instructions - ONLY food-related instructions
  // Blacklist phrases that should NOT be included in special instructions
  const instructionBlacklist = [
    /confirming\s+(his|her|their|my|the)\s+(name|phone|number|email|contact)/i,
    /(name|phone|number|email|contact)\s+(is|was|will be|confirmed|provided)/i,
    /(caller|customer|person)\s+(name|phone|number|email|contact)/i,
    /(placed|placing|order|ordered|ordering)\s+(a|an|the|pickup|takeout|delivery)/i,
    /(ready|will be ready|estimated|minutes|time)/i,
    /(total|subtotal|tax|price|cost|amount|dollar|cents?)/i,
    /(submitted|submitting|submission|confirmed|confirmation)/i,
    /(inquiry|inquired|asking|asked|question|questions)/i,
    /(hours?|operating|open|closed|tomorrow|today)/i,
  ];
  
  const instructionPatterns = [
    /(?:special\s+instructions?|notes?|comments?)[:\s]+(.+?)(?:\.|$|total|subtotal)/i,
    /(?:with|add|extra|no|without)\s+(.+?)(?:\.|$|total|subtotal)/i,
  ];
  
  for (const pattern of instructionPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      
      // Filter out non-food related content
      const isBlacklisted = instructionBlacklist.some(blacklistPattern => 
        blacklistPattern.test(candidate)
      );
      
      // Only include if it's not blacklisted and seems food-related
      // Food-related keywords: extra, no, without, add, substitute, sauce, cheese, etc.
      const foodKeywords = /\b(extra|no|without|add|substitute|sauce|cheese|onion|pickle|lettuce|tomato|mayo|mustard|ketchup|bacon|pepper|salt|spicy|mild|well done|medium|rare|crispy|soft|gluten|dairy|allergy|allergic|substitution|modification|modify|change|different|instead|preference|prefer)\b/i;
      const hasFoodKeyword = foodKeywords.test(candidate);
      
      if (!isBlacklisted && (hasFoodKeyword || candidate.length < 50)) {
        // If it's short and not blacklisted, it's likely food-related
        // If it's longer, require food keywords
        if (candidate.length < 50 || hasFoodKeyword) {
          orderData.special_instructions = candidate;
          break;
        }
      }
    }
  }
  
  // Extract totals from transcript
  // Look for "total", "subtotal", "tax" mentions with dollar amounts
  // Also handle "came to", "comes to", "is", "will be" etc.
  // IMPORTANT: Order matters - check for specific patterns first, then generic
  const totalPatterns = [
    // Pattern 1: "$16.94" or "16.94" with decimal (highest priority - most specific)
    /\$?(\d+\.\d{2})/g,
    // Pattern 2: "16 dollars and 94 cents" (specific phrase)
    /(\d+)\s+dollars?\s+and\s+(\d+)\s+cents?/i,
    // Pattern 3: "total comes to $16.94" or "total is $16.94" (with context)
    /(?:total|grand\s+total|comes?\s+to|will\s+be)[:\s]+(?:.*?)?\$?(\d+\.?\d{2,})/i,
    // Pattern 4: "subtotal" or "tax" mentions
    /(?:subtotal|sub\s+total)[:\s]*\$?(\d+\.?\d*)/i,
    /(?:tax)[:\s]*\$?(\d+\.?\d*)/i,
  ];
  
  // First, try to find decimal amounts (most specific - like "$16.94")
  const decimalMatches = fullText.matchAll(/\$?(\d+\.\d{2})/g);
  const decimalAmounts = Array.from(decimalMatches).map(m => parseFloat(m[1]));
  // Look for amounts that appear after "total", "comes to", etc. context
  const totalContextPattern = /(?:total|grand\s+total|comes?\s+to|will\s+be|is)[:\s]+(?:.*?)?\$?(\d+\.\d{2})/i;
  const totalContextMatch = fullText.match(totalContextPattern);
  if (totalContextMatch && totalContextMatch[1]) {
    orderData.total = parseFloat(totalContextMatch[1]);
    console.log(`[Order Extraction] Found total from context: $${orderData.total}`);
  }
  
  // Second, try "16 dollars and 94 cents" pattern
  const dollarsCentsPattern = /(\d+)\s+dollars?\s+and\s+(\d+)\s+cents?/i;
  const dollarsCentsMatch = fullText.match(dollarsCentsPattern);
  if (dollarsCentsMatch && dollarsCentsMatch[1] && dollarsCentsMatch[2]) {
    const dollars = parseFloat(dollarsCentsMatch[1]);
    const cents = parseFloat(dollarsCentsMatch[2]) / 100;
    const value = dollars + cents;
    // Only use if we don't already have a better total
    if (orderData.total === 0 || Math.abs(value - orderData.total) < 0.01) {
      orderData.total = value;
      console.log(`[Order Extraction] Found total from dollars/cents: $${orderData.total}`);
    }
  }
  
  // Third, try other patterns as fallback
  for (let i = 2; i < totalPatterns.length; i++) {
    const pattern = totalPatterns[i];
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      
      if (value > 0 && value < 1000) { // Reasonable range check (avoid matching "1" from "1 cheeseburger")
        if (pattern.source.includes("total") && !pattern.source.includes("sub")) {
          // Only set if we don't have a better total already
          if (orderData.total === 0 || value > orderData.total * 0.5) {
            orderData.total = value;
          }
        } else if (pattern.source.includes("sub")) {
          orderData.subtotal = value;
        } else if (pattern.source.includes("tax")) {
          orderData.tax = value;
        }
      }
    }
  }
  
  // Calculate totals if not found
  if (orderData.items.length > 0) {
    // Calculate subtotal from items
    if (orderData.subtotal === 0) {
      orderData.subtotal = orderData.items.reduce((sum, item) => {
        return sum + (item.unit_price * item.quantity);
      }, 0);
    }
    
    // Calculate tax if not found (assume 13% if business tax rate not available)
    // Note: We'll recalculate with business tax rate when creating the order
    if (orderData.tax === 0 && orderData.subtotal > 0) {
      orderData.tax = orderData.subtotal * 0.13; // Default 13% tax
    }
    
    // Calculate total if not found
    if (orderData.total === 0) {
      orderData.total = orderData.subtotal + orderData.tax;
    }
  }
  
  console.log(`[Order Extraction] Extracted order:`, {
    customer_name: orderData.customer_name || 'N/A',
    customer_phone: orderData.customer_phone ? '***' : 'N/A',
    items_count: orderData.items.length,
    subtotal: orderData.subtotal,
    tax: orderData.tax,
    total: orderData.total,
  });
  
  return orderData;
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
 * Extract emergency intake fields from transcript/summary (Emergency Network phone calls).
 * callerNumberFromCall = inbound caller number from VAPI (call.customer.number).
 */
function extractEmergencyFromTranscript(transcript, summary, callerNumberFromCall = null) {
  const text = `${summary || ""} ${transcript || ""}`;
  const lower = text.toLowerCase();
  const result = {
    caller_name: null,
    callback_phone: callerNumberFromCall && String(callerNumberFromCall).trim() ? String(callerNumberFromCall).trim() : null,
    service_category: "Plumbing", // Plumbing-only focus; only override if they clearly say HVAC/Gas
    urgency_level: "Schedule",
    location: null,
    issue_summary: (summary || transcript || "").slice(0, 2000).trim() || null,
  };
  // Service: Plumbing, HVAC, Gas, Other
  if (/\bplumb/i.test(lower)) result.service_category = "Plumbing";
  else if (/\bhvac|heating|air\s*cond|ac\s*unit/i.test(lower)) result.service_category = "HVAC";
  else if (/\bgas\b|gas\s*line|gas\s*leak/i.test(lower)) result.service_category = "Gas";
  // Urgency
  if (/immediate|emergency|urgent|as\s*ap|right\s*away/i.test(lower)) result.urgency_level = "Immediate Emergency";
  else if (/same\s*day|today|this\s*afternoon|this\s*evening/i.test(lower)) result.urgency_level = "Same Day";
  // Name: prefer User lines so we get the caller's name, not the assistant's
  const nameBlocklist = new Set([
    "the", "a", "an", "it", "this", "that", "dispatch", "emergency", "line", "service",
    "assistant", "plumber", "customer", "caller", "yes", "no", "not", "someone", "anyone",
    "please", "thanks", "thank", "help", "hi", "hello", "okay", "ok", "um", "uh",
  ]);
  const isValidName = (s) => {
    if (!s || typeof s !== "string") return false;
    const t = s.trim();
    if (t.length < 2 || t.length > 50) return false;
    const firstWord = t.split(/\s+/)[0].toLowerCase();
    if (nameBlocklist.has(firstWord)) return false;
    if (nameBlocklist.has(t.toLowerCase())) return false;
    return /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(t);
  };
  const namePatternStrs = [
    "(?:my\\s+name\\s+is|this\\s+is|i'm|i\\s+am|call\\s+me)\\s+([A-Za-z]+(?:\\s+[A-Za-z]+)?)(?:\\s|$|,|\\.)",
    "(?:name|call\\s+me)\\s+([A-Za-z]+(?:\\s+[A-Za-z]+)?)(?:\\s|$|,|\\.)",
  ];
  const lines = (transcript || "").split("\n");
  const userLines = lines.filter((line) => /^\s*user\s*:/i.test(line));
  let nameCandidates = [];
  for (const userLine of userLines) {
    const userText = userLine.replace(/^\s*user\s*:\s*/i, "").trim();
    for (const pat of namePatternStrs) {
      const re = new RegExp(pat, "gi");
      let match;
      while ((match = re.exec(userText)) !== null) {
        const candidate = match[1].trim();
        if (isValidName(candidate)) nameCandidates.push(candidate);
      }
    }
  }
  if (nameCandidates.length > 0) {
    result.caller_name = nameCandidates[nameCandidates.length - 1];
  } else if (summary) {
    for (const pat of namePatternStrs) {
      const re = new RegExp(pat, "gi");
      let match;
      while ((match = re.exec(summary)) !== null) {
        const candidate = match[1].trim();
        if (isValidName(candidate)) {
          result.caller_name = candidate;
          break;
        }
      }
      if (result.caller_name) break;
    }
  }
  if (!result.caller_name) {
    for (const pat of namePatternStrs) {
      const re = new RegExp(pat, "gi");
      let match;
      while ((match = re.exec(text)) !== null) {
        const candidate = match[1].trim();
        if (isValidName(candidate)) {
          result.caller_name = candidate;
          break;
        }
      }
      if (result.caller_name) break;
    }
  }
  // Phone from text if not from call (e.g. callback number given)
  if (!result.callback_phone) {
    const phoneMatch = text.match(/(?:\+?1?[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/);
    if (phoneMatch) result.callback_phone = `+1${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;
  }
  // Location: address-like (digits + street words) or postal code
  const addrMatch = text.match(/(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|way|place|pl)\b[\w\s]*)/i)
    || text.match(/([A-Z]\d[A-Z]\s*\d[A-Z]\d)/i);
  if (addrMatch && addrMatch[1]) result.location = addrMatch[1].trim().slice(0, 500);
  return result;
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
  
  // Common words/phrases to exclude from name extraction
  const excludedPhrases = [
    "not able", "not sure", "not certain", "not available", "not here",
    "not available", "not working", "not open", "not closed",
    "able to", "sure about", "certain about", "available for",
    "here to", "speaking to", "calling to", "calling about",
    "the owner", "the manager", "the business", "the company",
    "someone", "anyone", "anybody", "somebody",
    "thanks", "thank you", "please", "sorry", "excuse me"
  ];
  
  // Extract name - look for patterns like "name is John" or "my name is John"
  // Prioritize User lines in transcript, then summary, then full text
  if (!name || name === "Unknown") {
    // First, try to extract from User lines in transcript (most reliable)
    const userLines = lines.filter(line => line.trim().toLowerCase().startsWith("user:"));
    for (const userLine of userLines) {
      const userText = userLine.replace(/^user:\s*/i, "").trim();
      
      // Look for explicit name patterns in user speech
      const explicitNamePatterns = [
        /(?:^|^my\s+name\s+is|^this\s+is|^i'm|^i\s+am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:name|call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      ];
      
      for (const pattern of explicitNamePatterns) {
        const match = userText.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          // Filter out excluded phrases
          const candidateLower = candidate.toLowerCase();
          if (!excludedPhrases.some(phrase => candidateLower.includes(phrase))) {
            // Additional validation: names should be 2-30 characters and not all lowercase
            if (candidate.length >= 2 && candidate.length <= 30 && /[A-Z]/.test(candidate)) {
              name = candidate;
              break;
            }
          }
        }
      }
      if (name && name !== "Unknown") break;
    }
    
    // If not found in user lines, try summary (often has structured info)
    if ((!name || name === "Unknown") && summary) {
      // Summary often has format like "Christian called..." or "The owner, Christian, called..."
      const summaryNamePatterns = [
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:called|requested|asked)/i,
        /(?:owner|manager|customer|caller|user)[,\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:name|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      ];
      
      for (const pattern of summaryNamePatterns) {
        const match = summary.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          const candidateLower = candidate.toLowerCase();
          if (!excludedPhrases.some(phrase => candidateLower.includes(phrase))) {
            if (candidate.length >= 2 && candidate.length <= 30 && /[A-Z]/.test(candidate)) {
              name = candidate;
              break;
            }
          }
        }
      }
    }
    
    // Last resort: try full text with stricter patterns
    if ((!name || name === "Unknown")) {
      const strictNamePatterns = [
        /(?:my\s+name\s+is|this\s+is|i'm|i\s+am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s|$|,|\.)/i,
        /(?:name|call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s|$|,|\.)/i,
      ];
      
      for (const pattern of strictNamePatterns) {
        const match = fullText.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          const candidateLower = candidate.toLowerCase();
          if (!excludedPhrases.some(phrase => candidateLower.includes(phrase))) {
            if (candidate.length >= 2 && candidate.length <= 30 && /[A-Z]/.test(candidate)) {
              name = candidate;
              break;
            }
          }
        }
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

