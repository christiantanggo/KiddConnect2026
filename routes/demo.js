// routes/demo.js
// Demo/landing page endpoints for instant AI assistant demos

import express from "express";
import { createAssistant, provisionPhoneNumber, linkAssistantToNumber } from "../services/vapi.js";

const router = express.Router();

// Store demo assistants temporarily (in production, use Redis or database)
// Export for use in webhook handler
export const demoAssistants = new Map(); // assistantId -> { expiresAt, email, businessName, faqs }

// Clean up expired demo assistants every 30 minutes
setInterval(async () => {
  const now = Date.now();
  for (const [assistantId, data] of demoAssistants.entries()) {
    if (data.expiresAt < now) {
      console.log(`[Demo] Cleaning up expired demo assistant: ${assistantId}`);
      demoAssistants.delete(assistantId);
      // Optionally delete from VAPI (non-blocking)
      try {
        const { getVapiClient } = await import("../services/vapi.js");
        await getVapiClient().delete(`/assistant/${assistantId}`);
      } catch (err) {
        console.warn(`[Demo] Failed to delete expired assistant from VAPI:`, err.message);
      }
    }
  }
}, 30 * 60 * 1000); // Every 30 minutes

/**
 * Create a demo assistant
 * POST /api/demo/create
 */
router.post("/create", async (req, res) => {
  try {
    const { businessName, faq1, answer1, faq2, answer2, email, marketingConsent } = req.body;

    // Validate required fields
    if (!businessName || !faq1 || !answer1 || !email) {
      return res.status(400).json({ 
        error: "Missing required fields: businessName, faq1, answer1, and email are required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    // Build FAQs array (max 2 for demo)
    const faqs = [
      { question: faq1, answer: answer1 },
    ];
    if (faq2 && answer2) {
      faqs.push({ question: faq2, answer: answer2 });
    }

    // Create demo assistant
    const openingGreeting = `Hello! Thanks for calling ${businessName}. How can I help you today?`;
    
    const assistantData = {
      name: businessName,
      public_phone_number: "", // Demo doesn't need real number
      timezone: "America/New_York",
      business_hours: {
        monday: { open: "09:00", close: "17:00", closed: false },
        tuesday: { open: "09:00", close: "17:00", closed: false },
        wednesday: { open: "09:00", close: "17:00", closed: false },
        thursday: { open: "09:00", close: "17:00", closed: false },
        friday: { open: "09:00", close: "17:00", closed: false },
        saturday: { closed: true },
        sunday: { closed: true },
      },
      faqs: faqs,
      contact_email: email,
      address: "",
      allow_call_transfer: false,
      after_hours_behavior: "take_message",
      opening_greeting: openingGreeting,
      ending_greeting: null,
      personality: "professional",
      voice_settings: {
        provider: "openai",
        voice_id: "alloy",
      },
      // Mark as demo in metadata
      isDemo: true,
    };

    console.log(`[Demo] Creating demo assistant for: ${businessName}`);
    console.log(`[Demo] Assistant data:`, JSON.stringify(assistantData, null, 2));
    
    let assistant;
    try {
      assistant = await createAssistant(assistantData);
      console.log(`[Demo] ✅ Assistant created successfully:`, assistant?.id);
    } catch (createError) {
      console.error(`[Demo] ❌ Error in createAssistant:`, createError);
      console.error(`[Demo] Error stack:`, createError.stack);
      throw createError;
    }

    // For demo assistants that need to make calls, we should provision a phone number
    // However, for cost reasons, we'll only provision if user requests a call
    // For now, we'll create the assistant without a phone number
    // When user requests a call, we'll provision a number then

    // Store demo assistant info (expires in 2 hours for demos)
    const expiresAt = Date.now() + (2 * 60 * 60 * 1000); // 2 hours
    const createdAt = new Date().toISOString();
    demoAssistants.set(assistant.id, {
      expiresAt,
      email,
      businessName,
      faqs,
      createdAt,
      assistantId: assistant.id,
      marketingConsent: marketingConsent === true,
      followUpEmailSent: false, // Track if 24-hour follow-up email was sent
      summaryEmailSent: false, // Track if call summary email was sent (prevent duplicates)
    });
    
    // Store demo email for 24-hour follow-up tracking
    // This will be checked periodically to send follow-up emails
    if (email) {
      const { supabaseClient } = await import("../config/database.js");
      try {
        // Store demo email with timestamp in a separate table or use existing mechanism
        // For now, we'll create a simple tracking system
        await supabaseClient
          .from('demo_emails')
          .upsert({
            email: email,
            assistant_id: assistant.id,
            business_name: businessName,
            created_at: createdAt,
            marketing_consent: marketingConsent === true,
            follow_up_sent: false,
            signed_up: false,
          }, {
            onConflict: 'email',
            ignoreDuplicates: false,
          });
        console.log(`[Demo] ✅ Stored demo email for 24-hour follow-up: ${email}`);
      } catch (dbError) {
        // If table doesn't exist, log warning but continue (we'll create migration)
        console.warn(`[Demo] Could not store demo email in database:`, dbError.message);
      }
    }

    console.log(`[Demo] ✅ Demo assistant created: ${assistant.id}`);
    console.log(`[Demo] Stored demo assistants:`, Array.from(demoAssistants.keys()));
    console.log(`[Demo] Assistant expires at:`, new Date(expiresAt).toISOString());

    res.json({
      success: true,
      assistantId: assistant.id,
      businessName,
      openingGreeting,
    });
  } catch (error) {
    console.error("[Demo] ========== ERROR CREATING DEMO ASSISTANT ==========");
    console.error("[Demo] Error message:", error.message);
    console.error("[Demo] Error stack:", error.stack);
    console.error("[Demo] Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error("[Demo] ===================================================");
    res.status(500).json({
      error: "Failed to create demo assistant",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Initiate a demo call and generate summary
 * POST /api/demo/call
 */
router.post("/call", async (req, res) => {
  try {
    const { assistantId, email, customerPhoneNumber } = req.body;

    if (!assistantId || !email) {
      return res.status(400).json({ error: "assistantId and email are required" });
    }

    // Verify this is a demo assistant
    console.log(`[Demo] Looking for assistant: ${assistantId}`);
    console.log(`[Demo] Available assistants:`, Array.from(demoAssistants.keys()));
    
    const demoData = demoAssistants.get(assistantId);
    if (!demoData) {
      console.error(`[Demo] ❌ Assistant ${assistantId} not found in storage`);
      return res.status(404).json({ 
        error: "Demo assistant not found or expired",
        assistantId: assistantId,
        availableAssistants: Array.from(demoAssistants.keys()),
      });
    }
    
    // Check if expired
    if (demoData.expiresAt < Date.now()) {
      console.error(`[Demo] ❌ Assistant ${assistantId} expired at ${new Date(demoData.expiresAt).toISOString()}`);
      demoAssistants.delete(assistantId);
      return res.status(404).json({ error: "Demo assistant expired" });
    }
    
    console.log(`[Demo] ✅ Found demo assistant: ${assistantId}`);

    // Verify the assistant exists in VAPI (optional validation)
    try {
      const { getVapiClient } = await import("../services/vapi.js");
      const vapiClient = getVapiClient();
      
      // Verify assistant exists
      await vapiClient.get(`/assistant/${assistantId}`);
      console.log(`[Demo] ✅ Verified assistant exists in VAPI`);
    } catch (verifyError) {
      console.warn(`[Demo] ⚠️ Could not verify assistant in VAPI:`, verifyError.message);
      // Don't fail if verification fails - assistant might still work
    }

    // Store email for potential webhook updates
    demoAssistants.set(assistantId, {
      ...demoData,
      callEmail: email,
    });
    // Return success - frontend will use VAPI SDK to start the call
    // The browser-based call will be initiated client-side using the VAPI SDK
    res.json({
      success: true,
      assistantId: assistantId,
      message: "Demo assistant validated. Use VAPI SDK to start the call.",
    });
  } catch (error) {
    console.error("[Demo] Error processing demo call:", error);
    res.status(500).json({
      error: "Failed to process demo call",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Send demo call summary email (called from frontend when call ends)
 * POST /api/demo/send-summary
 */
router.post("/send-summary", async (req, res) => {
  try {
    const { assistantId, callId, email } = req.body;
    
    if (!assistantId || !email) {
      return res.status(400).json({ error: "assistantId and email are required" });
    }
    
    console.log(`[Demo] Sending summary email for assistant: ${assistantId}, email: ${email}, callId: ${callId || 'NOT PROVIDED'}`);
    
    // Get demo data
    const demoData = demoAssistants.get(assistantId);
    if (!demoData) {
      return res.status(404).json({ error: "Demo assistant not found" });
    }
    
    // Check if email was already sent (prevent duplicates)
    if (demoData.summaryEmailSent) {
      console.log(`[Demo] Summary email already sent for assistant ${assistantId}, skipping`);
      return res.json({ success: true, message: "Email already sent" });
    }
    
    // REPLICATE PRODUCTION FLOW EXACTLY
    // Production: Gets call summary, creates callSession object, calls sendCallSummaryEmail
    // We'll do the same but with a mock callSession for demo
    
    // Step 1: Get call ID (try to find if not provided)
    let actualCallId = callId;
    if (!actualCallId) {
      try {
        console.log(`[Demo] No callId provided, searching for most recent call...`);
        const { getVapiClient } = await import("../services/vapi.js");
        const vapiClient = getVapiClient();
        
        try {
          const callsResponse = await vapiClient.get(`/call?assistantId=${assistantId}&limit=5`);
          const calls = Array.isArray(callsResponse.data) ? callsResponse.data : (callsResponse.data?.data || callsResponse.data?.calls || []);
          if (calls && calls.length > 0) {
            const recentCall = calls.find(call => 
              call.assistant?.id === assistantId || call.assistantId === assistantId || call.assistant === assistantId
            ) || calls[0];
            actualCallId = recentCall.id || recentCall.callId;
            console.log(`[Demo] ✅ Found call ID: ${actualCallId}`);
          }
        } catch (apiError) {
          console.warn(`[Demo] Could not find call ID:`, apiError.message);
        }
      } catch (findError) {
        console.warn(`[Demo] Error finding call ID:`, findError.message);
      }
    }
    
    // Step 2: Wait for VAPI to process the summary (like production - webhooks come AFTER processing)
    // Wait 8 seconds to give VAPI time to process the summary
    console.log(`[Demo] Waiting 8 seconds for VAPI to process call summary...`);
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Step 3: Get call summary (EXACTLY like production - uses same function)
    let transcript = "";
    let summary = "";
    let duration = 0;
    let intent = "general";
    
    if (actualCallId) {
      try {
        // Use the EXACT same function production uses
        const { getCallSummary } = await import("../services/vapi.js");
        const callSummary = await getCallSummary(actualCallId);
        transcript = callSummary.transcript || "";
        summary = callSummary.summary || "";
        
        // Get call data for duration
        const { getVapiClient } = await import("../services/vapi.js");
        const vapiClient = getVapiClient();
        const callResponse = await vapiClient.get(`/call/${actualCallId}`);
        const callData = callResponse.data;
        duration = callData?.durationSeconds || callData?.duration || 0;
        
        // Determine intent (same logic as production)
        const text = (summary + " " + transcript).toLowerCase();
        if (text.includes("callback") || text.includes("call back") || text.includes("call me")) {
          intent = "callback";
        } else if (text.includes("hours") || text.includes("open") || text.includes("close")) {
          intent = "hours";
        } else if (text.includes("message") || text.includes("leave a message")) {
          intent = "message";
        } else {
          intent = "general";
        }
        
        console.log(`[Demo] Call summary retrieved:`, {
          hasTranscript: !!transcript && transcript.trim().length > 0,
          hasSummary: !!summary && summary.trim().length > 0,
          duration: duration,
          intent: intent,
        });
      } catch (callError) {
        console.error(`[Demo] Error fetching call summary:`, callError.message);
        // Continue - we'll send email anyway
      }
    }
    
    // Step 4: Create mock callSession object (like production has)
    const mockCallSession = {
      id: `demo-${assistantId}`,
      business_id: null, // Demo doesn't have business_id
      caller_name: "Demo User",
      caller_number: "",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
      status: "completed",
      transcript: transcript,
      intent: intent,
    };
    
    // Step 5: Create mock business object (like production has)
    const mockBusiness = {
      id: `demo-${assistantId}`,
      name: demoData.businessName,
      email: email,
      email_ai_answered: true, // Always send emails for demos
    };
    
    // Step 5.5: Track demo usage in database
    // Track even if duration is 0 (browser-based demos may not report duration)
    // This ensures all demos are counted in the admin portal
    try {
      const { supabaseClient } = await import("../config/database.js");
      const now = new Date();
      const minutesUsed = duration > 0 ? parseFloat((duration / 60).toFixed(2)) : 0;
      
      await supabaseClient
        .from('demo_usage')
        .insert({
          assistant_id: assistantId,
          call_id: actualCallId || null,
          business_name: demoData.businessName,
          email: email,
          duration_seconds: duration,
          minutes_used: minutesUsed,
          marketing_consent: demoData.marketingConsent || false,
          date: now.toISOString().split('T')[0],
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
      
      console.log(`[Demo] ✅ Tracked demo usage: ${minutesUsed} minutes (${duration}s) for assistant ${assistantId}`);
    } catch (trackingError) {
      // Log error but don't fail the email sending
      console.error(`[Demo] Error tracking demo usage:`, trackingError.message);
    }
    
    // Step 6: Send demo email with marketing CTA
    // For demos, we need to add marketing content, so we'll build the email ourselves
    // but use the same sendEmail function that production uses
    const { sendEmail } = await import("../services/notifications.js");
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'https://tavarios.com';
    
    // Build email content similar to production but with demo marketing
    const subject = `📞 Call Summary from ${demoData.businessName} Demo`;
    
    const bodyText = `Call Summary - ${demoData.businessName} Demo\n\n${summary || 'Thank you for trying our AI assistant demo! This was a test call to demonstrate how our AI can answer calls for your business.'}\n\n${transcript ? `Transcript:\n${transcript}` : ''}\n\n---\n👉 Want this answering your real phone?\nGo live in 10 minutes: ${frontendUrl}/signup`;
    
    const bodyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">📞 Call Summary</h2>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Business:</strong> ${demoData.businessName}</p>
          <p><em>Demo Call</em></p>
          ${duration > 0 ? `<p><strong>Duration:</strong> ${duration} seconds</p>` : ''}
        </div>
        ${summary ? `
        <div style="margin: 16px 0;">
          <h3 style="color: #1f2937;">Summary</h3>
          <p style="color: #374151; line-height: 1.6;">${summary.replace(/\n/g, '<br>')}</p>
        </div>
        ` : `
        <div style="margin: 16px 0;">
          <p style="color: #374151; line-height: 1.6;">Thank you for trying our AI assistant demo! This was a test call to demonstrate how our AI can answer calls for your business.</p>
        </div>
        `}
        ${transcript ? `
        <div style="margin: 16px 0;">
          <h3 style="color: #1f2937;">Transcript</h3>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; white-space: pre-wrap; color: #374151;">${transcript}</div>
        </div>
        ` : ''}
        <div style="background: #dbeafe; padding: 16px; border-radius: 8px; margin: 24px 0; text-align: center;">
          <p style="font-size: 18px; font-weight: bold; color: #1e40af; margin-bottom: 12px;">👉 Want this AI answering your phones?</p>
          <p style="color: #374151; margin-bottom: 16px;">Get your AI phone assistant live in 10 minutes. No setup calls. No scripts. Just answers your phones 24/7.</p>
          <a href="${frontendUrl}/signup" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Go Live in 10 Minutes</a>
        </div>
      </div>
    `;
    
    await sendEmail(email, subject, bodyText, bodyHtml, "Tavari Demo", null);
    
    // Mark as sent to prevent duplicates
    demoAssistants.set(assistantId, {
      ...demoData,
      summaryEmailSent: true,
    });
    
    console.log(`[Demo] ✅ Summary email sent to: ${email}`);
    
    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("[Demo] Error sending summary email:", error);
    res.status(500).json({
      error: "Failed to send summary email",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get VAPI public key for client-side SDK
 * GET /api/demo/public-key
 */
router.get("/public-key", async (req, res) => {
  try {
    // VAPI public key from environment (required for browser-based calls)
    const publicKey = process.env.VAPI_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    
    console.log(`[Demo] Public key endpoint called`);
    console.log(`[Demo] VAPI_PUBLIC_KEY exists: ${!!process.env.VAPI_PUBLIC_KEY}`);
    console.log(`[Demo] NEXT_PUBLIC_VAPI_PUBLIC_KEY exists: ${!!process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY}`);
    console.log(`[Demo] Public key length: ${publicKey ? publicKey.length : 0}`);
    
    if (!publicKey) {
      console.warn(`[Demo] ⚠️ VAPI_PUBLIC_KEY not found in environment variables`);
      console.warn(`[Demo] Available env vars with VAPI:`, Object.keys(process.env).filter(k => k.includes('VAPI')));
    }
    
    res.json({
      publicKey: publicKey || null,
      message: publicKey 
        ? "Public key available" 
        : "No public key configured - please set VAPI_PUBLIC_KEY environment variable",
    });
  } catch (error) {
    console.error("[Demo] Error getting public key:", error);
    res.status(500).json({ error: "Failed to get public key" });
  }
});

/**
 * Get demo assistant info
 * GET /api/demo/:assistantId
 */
router.get("/:assistantId", async (req, res) => {
  try {
    const { assistantId } = req.params;
    const demoData = demoAssistants.get(assistantId);
    
    if (!demoData) {
      return res.status(404).json({ error: "Demo assistant not found or expired" });
    }

    res.json({
      success: true,
      businessName: demoData.businessName,
      faqs: demoData.faqs,
      createdAt: demoData.createdAt,
    });
  } catch (error) {
    console.error("[Demo] Error getting demo assistant:", error);
    res.status(500).json({ error: "Failed to get demo assistant" });
  }
});

export default router;

