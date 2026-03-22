// scripts/verify-webhook-immediate.js
// Verify webhook is configured and test immediate response

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { supabaseClient } from "../config/database.js";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
const WEBHOOK_URL = `${process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "https://api.tavarios.com"}/api/vapi/webhook`;

if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY not set");
  process.exit(1);
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

async function verifyWebhook() {
  try {
    console.log("🔍 Verifying VAPI Webhook Configuration...\n");

    // Get business
    const { data: businesses } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_assistant_id")
      .not("vapi_assistant_id", "is", null)
      .limit(1);

    if (businesses.length === 0) {
      console.log("❌ No businesses with assistants found");
      return;
    }

    const business = businesses[0];
    const assistantId = business.vapi_assistant_id;

    console.log(`📋 Business: ${business.name}`);
    console.log(`   Assistant ID: ${assistantId}\n`);

    // Get assistant from VAPI
    const assistantRes = await vapiClient.get(`/assistant/${assistantId}`);
    const assistant = assistantRes.data;

    console.log("=".repeat(60));
    console.log("📞 ASSISTANT WEBHOOK CONFIGURATION:");
    console.log("=".repeat(60));
    console.log(`Expected URL: ${WEBHOOK_URL}`);
    console.log(`Actual URL:  ${assistant.serverUrl || "NOT SET"}`);
    console.log(`Match:       ${assistant.serverUrl === WEBHOOK_URL ? "✅ YES" : "❌ NO"}`);
    console.log(`Secret Set:  ${assistant.serverUrlSecret ? "✅ YES" : "❌ NO"}`);
    console.log("=".repeat(60));

    if (assistant.serverUrl !== WEBHOOK_URL) {
      console.log("\n⚠️  WEBHOOK URL MISMATCH!");
      console.log("   Updating assistant webhook URL...\n");
      
      await vapiClient.patch(`/assistant/${assistantId}`, {
        serverUrl: WEBHOOK_URL,
        serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || undefined,
      });
      
      console.log("✅ Webhook URL updated!");
    }

    // Test webhook endpoint
    console.log("\n🧪 Testing webhook endpoint...");
    try {
      const testRes = await axios.get(WEBHOOK_URL, {
        timeout: 5000,
      });
      console.log(`✅ Webhook endpoint is accessible`);
      console.log(`   Status: ${testRes.status}`);
      console.log(`   Response: ${JSON.stringify(testRes.data)}`);
    } catch (testError) {
      console.log(`❌ Webhook endpoint test failed:`);
      console.log(`   ${testError.message}`);
      if (testError.response) {
        console.log(`   Status: ${testError.response.status}`);
        console.log(`   Response: ${JSON.stringify(testError.response.data)}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📱 NEXT STEPS:");
    console.log("=".repeat(60));
    console.log("1. Call the phone number");
    console.log("2. Check Railway logs for: '🔥 INBOUND CALL HIT'");
    console.log("3. If you see that log, webhook is working");
    console.log("4. If you don't see it, webhook URL is wrong or not accessible");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

verifyWebhook();

