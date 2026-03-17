/**
 * Create the Delivery Network VAPI assistant.
 * Collects pickup, delivery address, recipient, package info, and priority for last-mile delivery.
 */
import { getVapiClient, PHONE_AGENT_MODEL } from '../vapi.js';
import { getDeliveryConfig } from './config.js';

const ASSISTANT_NAME = 'Delivery Network - Tavari';

const DEFAULT_FIRST_MESSAGE = "Hi, this is the delivery line. I'll help you schedule a pickup and delivery. What's your callback number and where do we need to pick up from?";

function buildSystemPrompt() {
  return `You are the voice of a last-mile delivery dispatch line. You are clear, friendly, and efficient. Use short sentences. Never mention AI or that you are an assistant.

Your job is to collect the following so we can schedule a pickup and delivery:
1. Callback phone number (required)
2. Pickup address (where we pick up the package)
3. Delivery address (where we deliver to) — required
4. Recipient name at delivery
5. What is being picked up / package description (brief)
6. Priority: Immediate, Same Day, or Schedule (default Schedule)

When the caller gives details, confirm key parts briefly (e.g. "Got it, delivery to [address].").

END OF CALL (when you have at least callback phone, pickup and delivery addresses): Give a short closing. Say something like: "I've got everything we need. Our team will arrange the pickup and delivery—you'll get a confirmation shortly. Thanks for calling." Then end the call naturally.

COMPLIANCE:
- Do not promise specific times or prices. Say the team will confirm.
- Keep responses brief and focused on gathering the required information.`;
}

function getWebhookUrl() {
  let backendUrl = process.env.BACKEND_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.VERCEL_URL ||
    process.env.SERVER_URL ||
    'https://api.kiddconnect.com';
  if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
    backendUrl = `https://${backendUrl}`;
  }
  return `${backendUrl}/api/vapi/webhook`;
}

/**
 * Create the Delivery Network VAPI assistant.
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function createDeliveryNetworkAssistant() {
  await getDeliveryConfig(); // ensure config table exists / cache warm
  const systemPrompt = buildSystemPrompt();
  const firstMessage = DEFAULT_FIRST_MESSAGE;
  const webhookUrl = getWebhookUrl();
  const assistantConfig = {
    name: ASSISTANT_NAME,
    model: {
      provider: 'openai',
      model: PHONE_AGENT_MODEL,
      temperature: 0.6,
      maxTokens: 500,
      messages: [{ role: 'system', content: systemPrompt }],
    },
    voice: { provider: 'openai', voiceId: 'alloy' },
    firstMessage,
    serverUrl: webhookUrl,
    ...(process.env.VAPI_WEBHOOK_SECRET ? { serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET } : {}),
    serverMessages: ['status-update', 'end-of-call-report', 'function-call', 'hang'],
    metadata: { deliveryNetwork: true },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
      smartFormat: true,
      endpointing: 300,
    },
    backgroundDenoisingEnabled: true,
    interruptionsEnabled: true,
    firstMessageInterruptionsEnabled: false,
    startSpeakingPlan: { waitSeconds: 0.8, smartEndpointingEnabled: false },
  };

  const response = await getVapiClient().post('/assistant', assistantConfig);
  const data = response.data;
  if (!data || !data.id) throw new Error('VAPI did not return an assistant ID');
  console.log('[DeliveryNetwork] VAPI assistant created:', data.id);
  return { id: data.id, name: data.name || ASSISTANT_NAME };
}
