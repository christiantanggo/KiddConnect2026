/**
 * Telnyx Configuration Verification Script
 * 
 * This script verifies that Telnyx is properly configured for Tavari.
 * Run this to check if everything is set up correctly.
 */

import dotenv from 'dotenv';
import { DEFAULT_API_PUBLIC_BASE } from './config/public-urls.js';

dotenv.config();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY?.trim();
const TELNYX_VOICE_APPLICATION_ID = process.env.TELNYX_VOICE_APPLICATION_ID?.trim();
const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID?.trim();
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.WEBHOOK_BASE_URL || `${DEFAULT_API_PUBLIC_BASE}/api/calls/webhook`;

console.log('🔍 Telnyx Configuration Verification\n');
console.log('='.repeat(60));

// Check environment variables
console.log('\n📋 Environment Variables:');
console.log('  TELNYX_API_KEY:', TELNYX_API_KEY ? `✅ Set (${TELNYX_API_KEY.substring(0, 10)}...)` : '❌ NOT SET');
console.log('  TELNYX_VOICE_APPLICATION_ID:', TELNYX_VOICE_APPLICATION_ID || '❌ NOT SET');
console.log('  TELNYX_MESSAGING_PROFILE_ID:', TELNYX_MESSAGING_PROFILE_ID || '❌ NOT SET');
console.log('  WEBHOOK_URL:', WEBHOOK_URL);

if (!TELNYX_API_KEY) {
  console.error('\n❌ TELNYX_API_KEY is required!');
  process.exit(1);
}

// Make API request helper
async function makeAPIRequest(method, endpoint, body = null) {
  const url = `https://api.telnyx.com/v2${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} - ${JSON.stringify(data)}`);
  }
  
  return data;
}

try {
  // 1. Verify Voice API Application exists and is configured
  console.log('\n🔊 Voice API Application:');
  if (TELNYX_VOICE_APPLICATION_ID) {
    try {
      const voiceApp = await makeAPIRequest('GET', `/call_control/applications/${TELNYX_VOICE_APPLICATION_ID}`);
      console.log('  ✅ Voice API Application exists:', voiceApp.data.name || voiceApp.data.id);
      console.log('  Application ID:', voiceApp.data.id);
      
      // Check webhook URL
      const webhookUrl = voiceApp.data.webhook_event_url || voiceApp.data.webhook_api_version || 'NOT SET';
      console.log('  Webhook URL:', webhookUrl);
      
      if (webhookUrl === WEBHOOK_URL || webhookUrl.includes('tavarios.com')) {
        console.log('  ✅ Webhook URL is configured correctly');
      } else {
        console.log('  ⚠️  Webhook URL may not match expected:', WEBHOOK_URL);
      }
      
      // Check webhook event filters
      const eventFilters = voiceApp.data.webhook_event_filters || [];
      console.log('  Event Filters:', eventFilters.length > 0 ? eventFilters.join(', ') : 'NOT SET');
      
      const requiredEvents = ['call.initiated', 'call.answered', 'call.hangup', 'streaming.started', 'streaming.stopped'];
      const missingEvents = requiredEvents.filter(e => !eventFilters.includes(e));
      if (missingEvents.length > 0) {
        console.log('  ⚠️  Missing event filters:', missingEvents.join(', '));
        console.log('  ⚠️  Required events:', requiredEvents.join(', '));
      } else {
        console.log('  ✅ All required event filters are set');
      }
    } catch (error) {
      console.error('  ❌ Voice API Application not found or error:', error.message);
      console.error('  ⚠️  Check that TELNYX_VOICE_APPLICATION_ID is correct');
    }
  } else {
    console.log('  ❌ TELNYX_VOICE_APPLICATION_ID not set');
  }
  
  // 2. Verify Messaging Profile exists
  console.log('\n💬 Messaging Profile:');
  if (TELNYX_MESSAGING_PROFILE_ID) {
    try {
      const messagingProfile = await makeAPIRequest('GET', `/messaging_profiles/${TELNYX_MESSAGING_PROFILE_ID}`);
      console.log('  ✅ Messaging Profile exists:', messagingProfile.data.name || messagingProfile.data.id);
      console.log('  Profile ID:', messagingProfile.data.id);
    } catch (error) {
      console.error('  ❌ Messaging Profile not found or error:', error.message);
      console.error('  ⚠️  Check that TELNYX_MESSAGING_PROFILE_ID is correct');
    }
  } else {
    console.log('  ❌ TELNYX_MESSAGING_PROFILE_ID not set');
  }
  
  // 3. Check phone numbers and their configuration
  console.log('\n📞 Phone Numbers:');
  try {
    const phoneNumbers = await makeAPIRequest('GET', '/phone_numbers?page[size]=10');
    const numbers = phoneNumbers.data || [];
    
    if (numbers.length === 0) {
      console.log('  ⚠️  No phone numbers found in your Telnyx account');
    } else {
      console.log(`  Found ${numbers.length} phone number(s):`);
      
      for (const number of numbers.slice(0, 5)) { // Show first 5
        console.log(`\n  📱 ${number.phone_number}:`);
        console.log(`     Status: ${number.status || 'unknown'}`);
        
        // Check voice configuration
        const connectionId = number.connection_name || number.connection_id || 'NOT SET';
        console.log(`     Voice API Application/Connection: ${connectionId}`);
        
        if (connectionId === TELNYX_VOICE_APPLICATION_ID || connectionId === 'NOT SET') {
          if (connectionId === 'NOT SET') {
            console.log(`     ⚠️  Voice API Application NOT SET - calls won't route!`);
          } else {
            console.log(`     ✅ Voice API Application is set`);
          }
        } else {
          console.log(`     ⚠️  Voice API Application doesn't match TELNYX_VOICE_APPLICATION_ID`);
        }
        
        // Check messaging configuration
        const messagingProfileId = number.messaging_profile_id || 'NOT SET';
        console.log(`     Messaging Profile: ${messagingProfileId}`);
        
        if (messagingProfileId === TELNYX_MESSAGING_PROFILE_ID || messagingProfileId === 'NOT SET') {
          if (messagingProfileId === 'NOT SET') {
            console.log(`     ⚠️  Messaging Profile NOT SET - SMS won't route!`);
          } else {
            console.log(`     ✅ Messaging Profile is set`);
          }
        } else {
          console.log(`     ⚠️  Messaging Profile doesn't match TELNYX_MESSAGING_PROFILE_ID`);
        }
        
        // Check webhook URL
        const webhookUrl = number.webhook_url || 'NOT SET';
        console.log(`     Webhook URL: ${webhookUrl}`);
        
        if (webhookUrl === WEBHOOK_URL || webhookUrl.includes('tavarios.com')) {
          console.log(`     ✅ Webhook URL is configured`);
        } else if (webhookUrl === 'NOT SET') {
          console.log(`     ⚠️  Webhook URL NOT SET - webhooks won't work!`);
        } else {
          console.log(`     ⚠️  Webhook URL doesn't match expected: ${WEBHOOK_URL}`);
        }
      }
      
      if (numbers.length > 5) {
        console.log(`\n  ... and ${numbers.length - 5} more number(s)`);
      }
    }
  } catch (error) {
    console.error('  ❌ Error fetching phone numbers:', error.message);
  }
  
  // 4. Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log('\n✅ Required for calls to work:');
  console.log('  1. Voice API Application exists and has webhook URL set');
  console.log('  2. Phone number assigned to Voice API Application');
  console.log('  3. Webhook event filters include: call.initiated, call.answered, call.hangup');
  console.log('  4. WebSocket streaming events: streaming.started, streaming.stopped');
  console.log('\n✅ Required for SMS to work:');
  console.log('  1. Messaging Profile exists');
  console.log('  2. Phone number assigned to Messaging Profile');
  console.log('\n⚠️  If anything is missing, fix it in the Telnyx dashboard:');
  console.log('   https://portal.telnyx.com');
  
} catch (error) {
  console.error('\n❌ Verification failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

