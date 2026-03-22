// scripts/fix-vapi-webhook.js
// Fix VAPI webhook URL for existing assistant

import dotenv from "dotenv";
dotenv.config();

const ASSISTANT_ID = "d01a8d92-6236-45c6-a7bb-5827419a255f"; // From VAPI dashboard

async function fixWebhook() {
  try {
    const { updateAssistant } = await import("../services/vapi.js");
    
    // Get the correct webhook URL
    const webhookUrl = `${process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL || "https://api.tavarios.com"}/api/vapi/webhook`;
    
    console.log(`[Fix Webhook] Updating assistant ${ASSISTANT_ID}`);
    console.log(`[Fix Webhook] Setting serverUrl to: ${webhookUrl}`);
    
    // Update assistant with webhook URL
    const updated = await updateAssistant(ASSISTANT_ID, {
      serverUrl: webhookUrl,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || undefined,
    });
    
    console.log(`[Fix Webhook] ✅ Successfully updated assistant`);
    console.log(`[Fix Webhook] Assistant serverUrl: ${updated.serverUrl || 'Not shown in response'}`);
    
    // Verify by fetching the assistant
    const axios = (await import("axios")).default;
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const response = await axios.get(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });
    
    console.log(`[Fix Webhook] ✅ Verification - Current serverUrl: ${response.data.serverUrl || 'NOT SET!'}`);
    
    if (response.data.serverUrl === webhookUrl) {
      console.log(`[Fix Webhook] ✅ Webhook URL is correctly set!`);
    } else {
      console.error(`[Fix Webhook] ❌ Webhook URL mismatch!`);
      console.error(`[Fix Webhook] Expected: ${webhookUrl}`);
      console.error(`[Fix Webhook] Got: ${response.data.serverUrl || 'NOT SET'}`);
    }
    
  } catch (error) {
    console.error("[Fix Webhook] ❌ Error:", error.response?.data || error.message);
    process.exit(1);
  }
}

fixWebhook();

