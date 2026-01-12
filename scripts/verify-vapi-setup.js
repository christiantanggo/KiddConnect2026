// Verify VAPI assistant and phone number setup
import dotenv from 'dotenv';
dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY not set in .env file');
  process.exit(1);
}

import axios from 'axios';

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

async function verifySetup() {
  try {
    console.log('🔍 Verifying VAPI Setup...\n');

    // 1. List all assistants
    console.log('1️⃣ Listing assistants...');
    const assistantsRes = await vapiClient.get('/assistant');
    const assistants = Array.isArray(assistantsRes.data) ? assistantsRes.data : (assistantsRes.data?.data || []);
    console.log(`   Found ${assistants.length} assistant(s)\n`);
    
    if (assistants.length === 0) {
      console.log('⚠️  No assistants found. Create one first.');
      return;
    }

    // 2. List all phone numbers
    console.log('2️⃣ Listing phone numbers...');
    const phoneNumbersRes = await vapiClient.get('/phone-number');
    const phoneNumbers = Array.isArray(phoneNumbersRes.data) ? phoneNumbersRes.data : (phoneNumbersRes.data?.data || []);
    console.log(`   Found ${phoneNumbers.length} phone number(s)\n`);

    // 3. Check which numbers are linked to assistants
    console.log('3️⃣ Checking phone number ↔ assistant links...\n');
    
    for (const phoneNumber of phoneNumbers) {
      console.log(`📞 Phone Number: ${phoneNumber.number || phoneNumber.phoneNumber || phoneNumber.id}`);
      console.log(`   ID: ${phoneNumber.id}`);
      console.log(`   Status: ${phoneNumber.status || 'unknown'}`);
      console.log(`   Assistant ID: ${phoneNumber.assistantId || '❌ NOT LINKED'}`);
      
      if (phoneNumber.assistantId) {
        // Find the assistant
        const assistant = assistants.find(a => a.id === phoneNumber.assistantId);
        if (assistant) {
          console.log(`   ✅ Linked to: ${assistant.name || assistant.id}`);
          console.log(`   Assistant Status: ${assistant.status || 'unknown'}`);
        } else {
          console.log(`   ⚠️  Linked to assistant ID ${phoneNumber.assistantId} but assistant not found`);
        }
      } else {
        console.log(`   ⚠️  WARNING: Phone number is NOT linked to any assistant!`);
        console.log(`   💡 Calls to this number will NOT be answered by AI.`);
        console.log(`   💡 Link it in VAPI dashboard or use the linkAssistantToNumber function.`);
      }
      console.log('');
    }

    // 4. Check assistants without phone numbers
    console.log('4️⃣ Checking assistants without phone numbers...\n');
    for (const assistant of assistants) {
      const linkedNumber = phoneNumbers.find(pn => pn.assistantId === assistant.id);
      if (!linkedNumber) {
        console.log(`   ⚠️  Assistant "${assistant.name || assistant.id}" has no linked phone number`);
      }
    }

    console.log('\n✅ Verification complete!');
    console.log('\n💡 If a phone number shows "NOT LINKED", you need to:');
    console.log('   1. Go to VAPI Dashboard → Phone Numbers');
    console.log('   2. Click on the phone number');
    console.log('   3. Select the assistant from the dropdown');
    console.log('   4. Save');
    console.log('\n   OR use the retry-activation endpoint from your dashboard.');

  } catch (error) {
    console.error('❌ Error verifying setup:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('\n⚠️  Authentication failed. Check your VAPI_API_KEY in .env file.');
      console.error('   Make sure you\'re using the PRIVATE key, not the public key.');
    }
  }
}

verifySetup();
















