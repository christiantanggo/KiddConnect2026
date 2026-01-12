// scripts/test-vapi-phone-direct.js
// Direct test of VAPI phone number provisioning endpoint

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_TELNYX_CREDENTIAL_ID = process.env.VAPI_TELNYX_CREDENTIAL_ID;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY not found");
  process.exit(1);
}

console.log("🧪 Testing VAPI Phone Number Provisioning (Direct)...\n");
console.log("=".repeat(50));
console.log(`API Key: ${VAPI_API_KEY.substring(0, 20)}...`);
console.log(`Credential ID: ${VAPI_TELNYX_CREDENTIAL_ID || 'NOT SET'}`);
console.log("=".repeat(50) + "\n");

const requestBody = {
  provider: "telnyx",
  number: null, // Let VAPI select
};

if (VAPI_TELNYX_CREDENTIAL_ID) {
  requestBody.credentialId = VAPI_TELNYX_CREDENTIAL_ID;
}

console.log("Request body:", JSON.stringify(requestBody, null, 2));
console.log("\nMaking request to:", `${VAPI_BASE_URL}/phone-number`);
console.log("Headers:", {
  Authorization: `Bearer ${VAPI_API_KEY.substring(0, 20)}...`,
  "Content-Type": "application/json",
});

try {
  const response = await axios.post(`${VAPI_BASE_URL}/phone-number`, requestBody, {
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  
  console.log("\n✅ SUCCESS!");
  console.log("Response:", JSON.stringify(response.data, null, 2));
} catch (error) {
  console.error("\n❌ FAILED");
  console.error("Status:", error.response?.status);
  console.error("Error:", error.response?.data || error.message);
  
  if (error.response?.status === 401) {
    console.error("\n💡 This suggests:");
    console.error("   1. The API key might not have permission for phone provisioning");
    console.error("   2. The API key might need to be regenerated");
    console.error("   3. There might be account-level restrictions");
    console.error("\n💡 Try:");
    console.error("   1. Go to VAPI Dashboard → Settings → API Keys");
    console.error("   2. Create a NEW private key");
    console.error("   3. Update your .env file with the new key");
    console.error("   4. Make sure your account has phone provisioning enabled");
  }
}
















