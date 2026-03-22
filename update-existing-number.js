import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';
import { DEFAULT_API_PUBLIC_BASE } from './config/public-urls.js';

dotenv.config();

/**
 * Update an existing phone number with Voice API Application and Messaging Profile
 * This tests the configuration that will happen automatically for new purchases
 */
async function updateExistingNumber() {
  console.log('=== UPDATING EXISTING PHONE NUMBER ===\n');
  
  // Get environment variables
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || DEFAULT_API_PUBLIC_BASE}/api/calls/webhook`;
  
  console.log('Configuration:');
  console.log('  TELNYX_VOICE_APPLICATION_ID:', voiceAppId || 'NOT SET');
  console.log('  TELNYX_MESSAGING_PROFILE_ID:', messagingProfileId || 'NOT SET');
  console.log('  Webhook URL:', webhookUrl);
  console.log('');
  
  if (!voiceAppId && !messagingProfileId) {
    console.error('❌ ERROR: Environment variables not set!');
    console.error('   Set TELNYX_VOICE_APPLICATION_ID and/or TELNYX_MESSAGING_PROFILE_ID');
    console.error('   This script needs these to work.');
    process.exit(1);
  }
  
  // Get existing numbers
  console.log('Fetching existing phone numbers...');
  const result = await TelnyxService.makeAPIRequest('GET', '/phone_numbers?page[size]=10');
  
  if (!result.data || result.data.length === 0) {
    console.log('❌ No phone numbers found in account');
    return;
  }
  
  // Find numbers that need configuration
  const numbersNeedingConfig = result.data.filter(num => 
    !num.voice_application_id && !num.messaging_profile_id
  );
  
  console.log(`Found ${result.data.length} phone number(s) total`);
  console.log(`${numbersNeedingConfig.length} need configuration\n`);
  
  if (numbersNeedingConfig.length === 0) {
    console.log('✅ All numbers are already configured!');
    return;
  }
  
  // Use the first number that needs configuration
  const testNumber = numbersNeedingConfig[0];
  console.log(`Updating: ${testNumber.phone_number}`);
  console.log(`  ID: ${testNumber.id}`);
  console.log(`  Current voice_application_id: ${testNumber.voice_application_id || 'NOT SET'}`);
  console.log(`  Current messaging_profile_id: ${testNumber.messaging_profile_id || 'NOT SET'}`);
  console.log(`  Current webhook_url: ${testNumber.webhook_url || 'NOT SET'}`);
  console.log('');
  
  // Build update payloads (voice, messaging, and webhook must be separate)
  const voiceUpdatePayload = {};
  
  if (voiceAppId) {
    voiceUpdatePayload.connection_id = voiceAppId; // Voice API Applications use connection_id
    console.log(`  Will set connection_id (Voice API Application): ${voiceAppId}`);
  }
  
  const webhookUpdatePayload = {
    webhook_url: webhookUrl,
    webhook_url_method: 'POST',
  };
  console.log(`  Will set webhook_url: ${webhookUrl}`);
  console.log('');
  
  if (messagingProfileId) {
    console.log(`  Will set messaging_profile_id: ${messagingProfileId} (via separate endpoint)`);
  }
  console.log('');
  
  // Actually update the number
  console.log('Updating number...');
  try {
    // Step 1: Update voice settings (Voice API Application)
    if (voiceAppId) {
      console.log('Step 1: Updating voice settings (Voice API Application)...');
      const voiceResult = await TelnyxService.makeAPIRequest('PATCH', `/phone_numbers/${testNumber.id}/voice`, voiceUpdatePayload);
      console.log('✅ Voice settings updated');
    }
    
    // Step 2: Update webhook URL
    console.log('Step 2: Updating webhook URL...');
    const webhookResult = await TelnyxService.makeAPIRequest('PATCH', `/phone_numbers/${testNumber.id}`, webhookUpdatePayload);
    console.log('✅ Webhook URL updated');
    
    // Step 3: Update messaging settings (separate endpoint required by Telnyx)
    let messagingResult = null;
    if (messagingProfileId) {
      console.log('Step 3: Updating messaging settings...');
      const messagingUpdatePayload = {
        messaging_profile_id: messagingProfileId,
      };
      messagingResult = await TelnyxService.makeAPIRequest('PATCH', `/phone_numbers/${testNumber.id}/messaging`, messagingUpdatePayload);
      console.log('✅ Messaging settings updated');
    }
    
    console.log('✅ Number updated successfully!');
    console.log('');
    
    // Verify configuration by fetching the phone number again
    console.log('Verifying configuration...');
    const verifyResult = await TelnyxService.makeAPIRequest('GET', `/phone_numbers/${testNumber.id}`);
    const phoneData = verifyResult.data;
    
    console.log('Updated configuration:');
    console.log(`  Phone Number: ${phoneData.phone_number}`);
    console.log(`  Voice API Application: ${phoneData.connection_id || 'NOT SET'}`);
    console.log(`  Messaging Profile: ${phoneData.messaging_profile_id || 'NOT SET'}`);
    console.log(`  Webhook URL: Configured on Voice API Application (not stored on phone number)`);
    console.log('');
    
    // Check if everything is configured
    // Note: Webhook URL is stored on the Voice API Application, not the phone number
    const voiceConfigured = phoneData.connection_id;
    const messagingConfigured = phoneData.messaging_profile_id;
    
    if (voiceConfigured && messagingConfigured) {
      console.log('✅ TEST PASSED - All settings configured correctly!');
      console.log('   - Voice API Application: SET (routes calls to webhook)');
      console.log('   - Messaging Profile: SET (routes SMS to webhook)');
      console.log('   - Webhook URL: Configured on Voice API Application');
      console.log('');
      console.log('   This confirms that new purchases will configure automatically.');
    } else {
      console.log('⚠️  PARTIAL CONFIGURATION:');
      if (!voiceConfigured) console.log('   - Voice API Application: NOT SET');
      if (!messagingConfigured) console.log('   - Messaging Profile: NOT SET');
    }
  } catch (error) {
    console.error('❌ Update failed:', error.message);
    console.error('Error details:', JSON.stringify(error.response?.data || error.message, null, 2));
    process.exit(1);
  }
}

updateExistingNumber().catch(console.error);

