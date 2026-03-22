import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';

dotenv.config();

async function testUpdateExistingNumber() {
  console.log('=== TESTING UPDATE ON EXISTING NUMBER ===\n');
  
  // Get environment variables
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'https://api.tavarios.com'}/api/calls/webhook`;
  
  console.log('Environment variables:');
  console.log('  TELNYX_VOICE_APPLICATION_ID:', voiceAppId || 'NOT SET');
  console.log('  TELNYX_MESSAGING_PROFILE_ID:', messagingProfileId || 'NOT SET');
  console.log('  Webhook URL:', webhookUrl);
  console.log('');
  
  if (!voiceAppId && !messagingProfileId) {
    console.log('⚠️  No configuration IDs set. This test will only show what would be sent.');
    console.log('   Set TELNYX_VOICE_APPLICATION_ID and/or TELNYX_MESSAGING_PROFILE_ID in Railway.\n');
  }
  
  // Get existing numbers
  console.log('Fetching existing phone numbers...');
  const result = await TelnyxService.makeAPIRequest('GET', '/phone_numbers?page[size]=10');
  
  if (!result.data || result.data.length === 0) {
    console.log('❌ No phone numbers found in account');
    return;
  }
  
  console.log(`Found ${result.data.length} phone number(s):\n`);
  
  // Show current state and what would be updated
  for (const number of result.data) {
    console.log(`Number: ${number.phone_number}`);
    console.log(`  ID: ${number.id}`);
    console.log(`  Current connection_id: ${number.connection_id || 'NOT SET'}`);
    console.log(`  Current messaging_profile_id: ${number.messaging_profile_id || 'NOT SET'}`);
    console.log(`  Current webhook_url: ${number.webhook_url || 'NOT SET'}`);
    console.log('');
    
    // Build update payload
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
    
    console.log('  Would update with:');
    console.log('    webhook_url:', updatePayload.webhook_url);
    if (updatePayload.voice_application_id) {
      console.log('    voice_application_id:', updatePayload.voice_application_id);
    }
    if (updatePayload.messaging_profile_id) {
      console.log('    messaging_profile_id:', updatePayload.messaging_profile_id);
    }
    console.log('');
    console.log('  Full payload:', JSON.stringify(updatePayload, null, 2));
    console.log('');
    console.log('---');
    console.log('');
  }
  
  console.log('✅ Test complete! This was a DRY RUN - no numbers were actually updated.');
  console.log('');
  console.log('To actually update a number, uncomment the code below and run again.');
  console.log('Or wait for Railway to deploy - new purchases will auto-configure.');
}

testUpdateExistingNumber().catch(console.error);

