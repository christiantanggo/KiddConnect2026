import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';
import readline from 'readline';

dotenv.config();

/**
 * Test updating an EXISTING number with configuration
 * This is FREE - we're just updating settings on a number you already own
 */
async function testUpdateExistingNumber() {
  console.log('=== TESTING UPDATE ON EXISTING NUMBER ===\n');
  console.log('This will update one of your existing numbers (FREE - no purchase needed)\n');
  
  // Get environment variables
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'https://api.tavarios.com'}/api/calls/webhook`;
  
  console.log('Configuration:');
  console.log('  TELNYX_VOICE_APPLICATION_ID:', voiceAppId || 'NOT SET');
  console.log('  TELNYX_MESSAGING_PROFILE_ID:', messagingProfileId || 'NOT SET');
  console.log('  Webhook URL:', webhookUrl);
  console.log('');
  
  if (!voiceAppId && !messagingProfileId) {
    console.log('⚠️  WARNING: Environment variables not set locally.');
    console.log('   They should be set in Railway. This test will show what would be sent.\n');
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
    !num.connection_id && !num.messaging_profile_id
  );
  
  console.log(`Found ${result.data.length} phone number(s) total`);
  console.log(`${numbersNeedingConfig.length} need configuration\n`);
  
  if (numbersNeedingConfig.length === 0) {
    console.log('✅ All numbers are already configured!');
    return;
  }
  
  // Show numbers that need configuration
  console.log('Numbers needing configuration:');
  numbersNeedingConfig.forEach((num, index) => {
    console.log(`  ${index + 1}. ${num.phone_number} (ID: ${num.id})`);
  });
  console.log('');
  
  // Use the first number that needs configuration
  const testNumber = numbersNeedingConfig[0];
  console.log(`Testing with: ${testNumber.phone_number}`);
  console.log(`  Current connection_id: ${testNumber.connection_id || 'NOT SET'}`);
  console.log(`  Current messaging_profile_id: ${testNumber.messaging_profile_id || 'NOT SET'}`);
  console.log(`  Current webhook_url: ${testNumber.webhook_url || 'NOT SET'}`);
  console.log('');
  
  // Build update payload (same as what purchase would do)
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
  
  console.log('Update payload that would be sent:');
  console.log(JSON.stringify(updatePayload, null, 2));
  console.log('');
  
  // Ask for confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Do you want to ACTUALLY update this number? (yes/no): ', async (answer) => {
      rl.close();
      
      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('\n✅ Test complete - no changes made (dry run)');
        console.log('This shows what would happen during a new purchase.');
        resolve();
        return;
      }
      
      // Actually update the number
      console.log('\nUpdating number...');
      try {
        const updateResult = await TelnyxService.makeAPIRequest('PATCH', `/phone_numbers/${testNumber.id}`, updatePayload);
        console.log('✅ Number updated successfully!');
        console.log('Updated number:', JSON.stringify(updateResult.data, null, 2));
        console.log('');
        console.log('✅ TEST PASSED - Configuration works!');
        console.log('   New purchases will configure automatically.');
      } catch (error) {
        console.error('❌ Update failed:', error.message);
        console.error('Error details:', error.response?.data);
        console.log('');
        console.log('This might be because:');
        console.log('  - Environment variables not set in Railway yet');
        console.log('  - Invalid Voice API Application ID or Messaging Profile ID');
        console.log('  - API permissions issue');
      }
      resolve();
    });
  });
}

testUpdateExistingNumber().catch(console.error);

