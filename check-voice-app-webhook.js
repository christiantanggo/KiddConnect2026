import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';

dotenv.config();

/**
 * Check and configure Voice API Application webhook URL
 */
async function checkVoiceAppWebhook() {
  console.log('=== CHECKING VOICE API APPLICATION WEBHOOK ===\n');
  
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'https://api.kiddconnect.com'}/api/calls/webhook`;
  
  if (!voiceAppId) {
    console.error('❌ TELNYX_VOICE_APPLICATION_ID not set');
    return;
  }
  
  console.log('Voice API Application ID:', voiceAppId);
  console.log('Expected Webhook URL:', webhookUrl);
  console.log('');
  
  try {
    // Get Voice API Application details
    console.log('Fetching Voice API Application details...');
    const app = await TelnyxService.makeAPIRequest('GET', `/call_control/applications/${voiceAppId}`);
    
    console.log('Current configuration:');
    console.log('  Name:', app.data?.application_name || 'NOT SET');
    console.log('  Webhook URL:', app.data?.webhook_event_url || 'NOT SET');
    console.log('  Webhook Event Filter:', app.data?.webhook_event_filters || 'NOT SET');
    console.log('');
    
    if (app.data?.webhook_event_url !== webhookUrl) {
      console.log('⚠️  Webhook URL mismatch!');
      console.log('   Current:', app.data?.webhook_event_url || 'NOT SET');
      console.log('   Expected:', webhookUrl);
      console.log('');
      console.log('Updating webhook URL...');
      
      const updatePayload = {
        webhook_event_url: webhookUrl,
        webhook_event_filters: ['call.initiated', 'call.answered', 'call.hangup'],
      };
      
      const updated = await TelnyxService.makeAPIRequest('PATCH', `/call_control/applications/${voiceAppId}`, updatePayload);
      console.log('✅ Webhook URL updated successfully!');
      console.log('   New URL:', updated.data?.webhook_event_url);
    } else {
      console.log('✅ Webhook URL is correctly configured!');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error.response?.data);
  }
}

checkVoiceAppWebhook().catch(console.error);

