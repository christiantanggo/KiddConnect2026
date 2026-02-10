// scripts/test-phone-provisioning.js
// Test script to verify VAPI phone number provisioning works

import dotenv from "dotenv";
import { provisionPhoneNumber, getTelnyxCredentials } from "../services/vapi.js";

dotenv.config();

async function testPhoneProvisioning() {
  console.log("🧪 Testing VAPI Phone Number Provisioning...\n");
  console.log("=".repeat(50));
  
  // Check environment
  if (!process.env.VAPI_API_KEY) {
    console.error("❌ VAPI_API_KEY not found in environment variables");
    process.exit(1);
  }
  
  console.log("✅ VAPI_API_KEY is set\n");
  
  // Test 1: Check credentials
  console.log("1️⃣ Checking Telnyx Credentials...");
  try {
    const credentials = await getTelnyxCredentials();
    console.log(`   Found ${credentials.length} Telnyx credential(s)`);
    if (credentials.length > 0) {
      console.log(`   ✅ Credential ID: ${credentials[0].id}`);
    } else {
      console.log("   ⚠️  No credentials found - provisioning may fail");
    }
  } catch (error) {
    console.error("   ❌ Error getting credentials:", error.message);
  }
  console.log("");
  
  // Test 2: Try to provision a phone number
  console.log("2️⃣ Attempting to Provision Phone Number...");
  try {
    const phoneNumber = await provisionPhoneNumber();
    console.log("\n   ✅ SUCCESS! Phone number provisioned:");
    console.log(`   📞 Phone Number: ${phoneNumber.phoneNumber || phoneNumber.number || phoneNumber.id}`);
    console.log(`   📝 Phone Number ID: ${phoneNumber.id}`);
    console.log(`   📋 Full Response:`, JSON.stringify(phoneNumber, null, 2));
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ Phone provisioning test PASSED!");
    console.log("=".repeat(50));
    
    return phoneNumber;
  } catch (error) {
    console.error("\n   ❌ FAILED to provision phone number");
    console.error("   Error:", error.message);
    
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Response:", JSON.stringify(error.response.data, null, 2));
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("❌ Phone provisioning test FAILED");
    console.log("=".repeat(50));
    
    process.exit(1);
  }
}

// Run the test
testPhoneProvisioning().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});



















