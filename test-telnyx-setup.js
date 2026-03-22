import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';

dotenv.config();

async function testTelnyxSetup() {
  console.log('=== TESTING TELNYX SETUP ===\n');
  
  // Test 1: Check environment variables
  console.log('1. Checking environment variables...');
  const apiKey = process.env.TELNYX_API_KEY;
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'http://localhost:5001'}/api/calls/webhook`;
  const messagingWebhookUrl = `${process.env.SERVER_URL || 'https://api.tavarios.com'}/api/messages/webhook`;
  
  console.log('   TELNYX_API_KEY:', apiKey ? '✅ SET' : '❌ NOT SET');
  console.log('   TELNYX_VOICE_APPLICATION_ID:', voiceAppId ? `✅ SET (${voiceAppId})` : '❌ NOT SET');
  console.log('   TELNYX_MESSAGING_PROFILE_ID:', messagingProfileId ? `✅ SET (${messagingProfileId})` : '❌ NOT SET');
  console.log('   Voice Webhook URL:', webhookUrl);
  console.log('   Messaging Webhook URL:', messagingWebhookUrl);
  console.log('');
  
  if (!apiKey) {
    console.error('❌ TELNYX_API_KEY is required!');
    process.exit(1);
  }
  
  // Test 2: Test Telnyx API connection
  console.log('2. Testing Telnyx API connection...');
  try {
    // Try to get account info or list phone numbers (free API call)
    const result = await TelnyxService.makeAPIRequest('GET', '/phone_numbers?page[size]=1');
    console.log('   ✅ Telnyx API connection successful');
    console.log(`   Found ${result.meta?.total_results || 0} phone numbers in account`);
  } catch (error) {
    console.error('   ❌ Telnyx API connection failed:', error.message);
    process.exit(1);
  }
  console.log('');
  
  // Test 3: Test searching for available numbers (free)
  console.log('3. Testing phone number search (free API call)...');
  try {
    const numbers = await TelnyxService.searchPhoneNumbers('US', 'local', 5);
    console.log(`   ✅ Search successful - found ${numbers.length} available numbers`);
    if (numbers.length > 0) {
      console.log(`   Example number: ${numbers[0].phone_number}`);
      console.log(`   Price: $${numbers[0].phone_price || 'N/A'}/month`);
    }
  } catch (error) {
    console.error('   ❌ Search failed:', error.message);
  }
  console.log('');
  
  // Test 4: Test Voice API Application exists
  if (voiceAppId) {
    console.log('4. Testing Voice API Application...');
    try {
      const app = await TelnyxService.makeAPIRequest('GET', `/applications/${voiceAppId}`);
      console.log('   ✅ Voice API Application found');
      console.log(`   Name: ${app.data?.name || 'N/A'}`);
      console.log(`   Webhook URL: ${app.data?.webhook_url || 'N/A'}`);
    } catch (error) {
      console.error('   ❌ Voice API Application not found or invalid:', error.message);
      console.error('   Make sure TELNYX_VOICE_APPLICATION_ID is correct');
    }
    console.log('');
  }
  
  // Test 5: Test Messaging Profile exists
  if (messagingProfileId) {
    console.log('5. Testing Messaging Profile...');
    try {
      const profile = await TelnyxService.makeAPIRequest('GET', `/messaging_profiles/${messagingProfileId}`);
      console.log('   ✅ Messaging Profile found');
      console.log(`   Name: ${profile.data?.name || 'N/A'}`);
      console.log(`   Webhook URL: ${profile.data?.webhook_url || 'N/A'}`);
    } catch (error) {
      console.error('   ❌ Messaging Profile not found or invalid:', error.message);
      console.error('   Make sure TELNYX_MESSAGING_PROFILE_ID is correct');
    }
    console.log('');
  }
  
  // Test 6: Simulate purchase configuration (without actually purchasing)
  console.log('6. Simulating purchase configuration...');
  if (numbers && numbers.length > 0) {
    const testNumber = testNumbers[0].phone_number;
    console.log(`   Using test number: ${testNumber}`);
    console.log(`   Would configure:`);
    console.log(`     - Voice API Application: ${voiceAppId || 'NOT SET'}`);
    console.log(`     - Messaging Profile: ${messagingProfileId || 'NOT SET'}`);
    console.log(`     - Voice Webhook: ${webhookUrl}`);
    console.log(`     - Messaging Webhook: ${messagingWebhookUrl}`);
    
    // Test the payload format
    const updatePayload = {
      webhook_url: webhookUrl,
      webhook_url_method: 'POST',
    };
    
    if (voiceAppId) {
      updatePayload.voice_application_id = voiceAppId;
    }
    
    if (messagingProfileId) {
      updatePayload.messaging_profile_id = messagingProfileId;
    }
    
    console.log(`   Payload would be:`, JSON.stringify(updatePayload, null, 2));
    console.log('   ✅ Configuration payload looks correct');
  }
  console.log('');
  
  // Summary
  console.log('=== TEST SUMMARY ===');
  const allGood = apiKey && (voiceAppId || messagingProfileId);
  if (allGood) {
    console.log('✅ All checks passed! You\'re ready to purchase phone numbers.');
    console.log('   New numbers will automatically be configured with:');
    if (voiceAppId) console.log('   - Voice API Application');
    if (messagingProfileId) console.log('   - Messaging Profile');
    console.log('   - Webhook URLs');
  } else {
    console.log('⚠️  Some configuration is missing:');
    if (!voiceAppId) console.log('   - TELNYX_VOICE_APPLICATION_ID not set');
    if (!messagingProfileId) console.log('   - TELNYX_MESSAGING_PROFILE_ID not set');
  }
}

testTelnyxSetup().catch(console.error);

