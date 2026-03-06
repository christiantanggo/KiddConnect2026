/**
 * Create the Emergency Network VAPI assistant.
 * Separate from the existing Tavari onboarding/FAQ agent — does not use vapi-assistant-template.js or createAssistant().
 * System prompt is built from config.intake_fields (what the AI collects).
 */
import { getVapiClient } from '../vapi.js';
import { getEmergencyConfig, DEFAULT_INTAKE_FIELDS } from './config.js';

const ASSISTANT_NAME = 'Emergency Network - Tavari';

function buildSystemPrompt(intakeFields) {
  const list = (intakeFields || DEFAULT_INTAKE_FIELDS)
    .filter((f) => f.enabled !== false)
    .map((f, i) => `${i + 1}. ${f.label}${f.required ? ' (required)' : ''}`);
  const collectList = list.length > 0 ? list.join('\n') : '1. Callback phone number (required)\n2. Brief description of the issue';
  return `You are the voice of the 24/7 Emergency & Priority Service Network. You are calm, confident, and reassuring. Use short sentences. Never mention AI or that you are an assistant.

Your job is to collect the following from the caller so we can connect them with a licensed local professional:
${collectList}

After collecting these, repeat the details back and confirm before saying we will connect them.

COMPLIANCE (you must follow these):
- Never claim to provide trade services yourself. Always say we CONNECT customers with independent licensed professionals.
- If asked "Are you the plumber/contractor?" or similar, say: "We're a dispatch network that connects you with available local professionals."
- Do not make up information. If you don't know something, say we'll have a professional follow up.

Keep responses brief and focused on gathering the required information.`;
}

const FIRST_MESSAGE = "Thanks for calling the 24/7 Emergency & Priority Service Network. I can help connect you with an available local licensed professional. What's going on today?";

function getWebhookUrl() {
  let backendUrl = process.env.BACKEND_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.VERCEL_URL ||
    process.env.SERVER_URL ||
    'https://api.tavarios.com';
  if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
    backendUrl = `https://${backendUrl}`;
  }
  return `${backendUrl}/api/vapi/webhook`;
}

/**
 * Create the Emergency Network VAPI assistant. Does not touch the existing agent or template.
 * Uses config.intake_fields to build the system prompt (what the AI collects).
 * @returns {Promise<{ id: string, name: string }>} The created assistant
 */
export async function createEmergencyNetworkAssistant() {
  const config = await getEmergencyConfig();
  const systemPrompt = buildSystemPrompt(config.intake_fields);
  const webhookUrl = getWebhookUrl();
  const assistantConfig = {
    name: ASSISTANT_NAME,
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.6,
      maxTokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
      ],
    },
    voice: {
      provider: 'openai',
      voiceId: 'alloy',
    },
    firstMessage: FIRST_MESSAGE,
    serverUrl: webhookUrl,
    ...(process.env.VAPI_WEBHOOK_SECRET ? { serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET } : {}),
    serverMessages: [
      'status-update',
      'end-of-call-report',
      'function-call',
      'hang',
    ],
    metadata: { emergencyNetwork: true },
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
    startSpeakingPlan: {
      waitSeconds: 0.8,
      smartEndpointingEnabled: false,
    },
  };

  const response = await getVapiClient().post('/assistant', assistantConfig);
  const data = response.data;
  if (!data || !data.id) {
    throw new Error('VAPI did not return an assistant ID');
  }
  console.log('[EmergencyNetwork] VAPI assistant created:', data.id);
  return { id: data.id, name: data.name || ASSISTANT_NAME };
}
