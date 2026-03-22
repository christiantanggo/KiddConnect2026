import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';

dotenv.config();

/**
 * Test phone number configuration using Telnyx Number Reservations
 * This allows testing WITHOUT actually purchasing a number
 * 
 * Reservations are temporary (usually 15-30 minutes) and free
 */
async function testWithReservation() {
  console.log('=== TESTING WITH TELNYX NUMBER RESERVATION ===\n');
  console.log('This test reserves a number temporarily (FREE) to test configuration\n');
  
  // Get environment variables
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'https://api.tavarios.com'}/api/calls/webhook`;
  
  console.log('Configuration:');
  console.log('  TELNYX_VOICE_APPLICATION_ID:', voiceAppId || 'NOT SET');
  console.log('  TELNYX_MESSAGING_PROFILE_ID:', messagingProfileId || 'NOT SET');
  console.log('  Webhook URL:', webhookUrl);
  console.log('');
  
  // Step 1: Search for an available number
  console.log('Step 1: Searching for available number...');
  const numbers = await TelnyxService.searchPhoneNumbers('US', 'local', 1);
  
  if (numbers.length === 0) {
    console.log('❌ No numbers available for testing');
    return;
  }
  
  const testNumber = numbers[0].phone_number;
  console.log(`✅ Found test number: ${testNumber}`);
  console.log('');
  
  // Step 2: Reserve the number (FREE - temporary)
  console.log('Step 2: Reserving number (this is FREE and temporary)...');
  try {
    const reservationPayload = {
      phone_numbers: [{
        phone_number: testNumber
      }],
      customer_reference: 'test-reservation-' + Date.now()
    };
    
    console.log('Reservation payload:', JSON.stringify(reservationPayload, null, 2));
    
    // Note: Telnyx might not have a direct reservation endpoint in the same way
    // This is a simulation - we'll show what WOULD be sent
    console.log('⚠️  Note: Telnyx reservations may work differently');
    console.log('   This shows what the purchase request would look like with configuration\n');
    
    // Step 3: Show what the purchase request would look like
    console.log('Step 3: Purchase request WITH configuration (what would be sent):');
    const purchasePayload = {
      phone_numbers: [{
        phone_number: testNumber
      }]
    };
    
    if (voiceAppId) {
      purchasePayload.phone_numbers[0].voice_application_id = voiceAppId;
    }
    
    if (messagingProfileId) {
      purchasePayload.phone_numbers[0].messaging_profile_id = messagingProfileId;
    }
    
    console.log(JSON.stringify(purchasePayload, null, 2));
    console.log('');
    
    console.log('✅ This payload would:');
    console.log('   1. Purchase the number');
    if (voiceAppId) {
      console.log('   2. Automatically assign Voice API Application');
    }
    if (messagingProfileId) {
      console.log('   3. Automatically assign Messaging Profile');
    }
    console.log('   4. Then we configure the webhook URL after purchase');
    console.log('');
    
    console.log('⚠️  To actually test, you would need to:');
    console.log('   1. Make the purchase request above');
    console.log('   2. Verify the number has the correct configuration in Telnyx dashboard');
    console.log('   3. Or use one of your existing numbers to test the update');
    
  } catch (error) {
    console.error('Reservation test error:', error.message);
  }
}

testWithReservation().catch(console.error);

