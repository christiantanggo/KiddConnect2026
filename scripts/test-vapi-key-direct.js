// scripts/test-vapi-key-direct.js
// Direct test of VAPI API key to see which type it is

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY not found in environment variables");
  process.exit(1);
}

console.log("🧪 Testing VAPI API Key Directly...\n");
console.log("=".repeat(50));
console.log(`Key (first 20 chars): ${VAPI_API_KEY.substring(0, 20)}...`);
console.log(`Key length: ${VAPI_API_KEY.length}`);
console.log(`Key format: ${VAPI_API_KEY.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? 'UUID' : 'Other'}`);
console.log("=".repeat(50) + "\n");

// Test 1: Try to list assistants (requires private key)
console.log("1️⃣ Testing with /assistant endpoint (requires PRIVATE key)...");
try {
  const response = await axios.get(`${VAPI_BASE_URL}/assistant`, {
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  console.log("   ✅ SUCCESS! This is a PRIVATE key (server-side)");
  console.log(`   Found ${response.data?.length || 0} assistants\n`);
  console.log("   ✅ Your key is correct and working!\n");
} catch (error) {
  if (error.response?.status === 401) {
    console.log("   ❌ FAILED: 401 Unauthorized");
    console.log("   This might be a PUBLIC key (client-side only)");
    console.log("   Error:", error.response?.data?.message || error.message);
    console.log("\n   💡 You need a PRIVATE key for server-side API calls");
    console.log("   💡 Go to VAPI Dashboard → Settings → API Keys");
    console.log("   💡 Look for 'Private Key' or 'Server Key' (not 'Public Key')\n");
  } else {
    console.error("   ❌ Error:", error.message);
    if (error.response?.data) {
      console.error("   Response:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Test 2: Try to get account info
console.log("2️⃣ Testing with /account endpoint...");
try {
  const response = await axios.get(`${VAPI_BASE_URL}/account`, {
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  console.log("   ✅ SUCCESS! Key is valid");
  console.log("   Account info:", JSON.stringify(response.data, null, 2));
} catch (error) {
  if (error.response?.status === 401) {
    console.log("   ❌ FAILED: 401 Unauthorized");
    console.log("   This confirms the key is invalid or wrong type");
  } else {
    console.log("   ⚠️  Endpoint might not exist, but key format is OK");
  }
}

console.log("\n" + "=".repeat(50));
console.log("Summary:");
console.log("=".repeat(50));
console.log("If you got 401 errors, you need a PRIVATE key from VAPI dashboard");
console.log("Private keys are for server-side API calls (what we need)");
console.log("Public keys are for client-side use only");
console.log("=".repeat(50));
















