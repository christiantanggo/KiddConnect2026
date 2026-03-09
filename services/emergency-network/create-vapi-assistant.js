/**
 * Create the Emergency Network VAPI assistant.
 * Separate from the existing Tavari onboarding/FAQ agent — does not use vapi-assistant-template.js or createAssistant().
 * System prompt is built from config.intake_fields (what the AI collects).
 */
import { getVapiClient } from '../vapi.js';
import { getEmergencyConfig, DEFAULT_INTAKE_FIELDS, DEFAULT_OPENING_GREETING, DEFAULT_SERVICE_LINE_NAME } from './config.js';

const ASSISTANT_NAME = 'Emergency Network - Tavari';

function buildSystemPrompt(intakeFields, serviceLineName, customInstructions) {
  const lineName = (serviceLineName && String(serviceLineName).trim()) || DEFAULT_SERVICE_LINE_NAME;
  const list = (intakeFields || DEFAULT_INTAKE_FIELDS)
    .filter((f) => f.enabled !== false)
    .map((f, i) => `${i + 1}. ${f.label}${f.required ? ' (required)' : ''}`);
  const collectList = list.length > 0 ? list.join('\n') : '1. Callback phone number (required)\n2. Brief description of the issue';
  let prompt = `You are the voice of a ${lineName} dispatch line. You are calm, confident, and reassuring. Use short sentences. Never mention AI or that you are an assistant.

SERVICE SCOPE: We only offer PLUMBING right now (pipe, drain, water heater, leak, clog, etc.). Do NOT ask the caller to choose between plumbing, HVAC, tow truck, or other services. Assume they need a plumber. If they clearly need something else (e.g. HVAC, electrical), politely say we only connect with plumbers at the moment and suggest they call back or use our form for other services later.

Your job is to collect the following from the caller so we can connect them with a licensed local plumber:
${collectList}

When the caller gives their name, repeat it back clearly so we record it correctly, e.g. "Got it, [name]." or "The caller's name is [name]."

END OF CALL (when you have collected the required information): Give a clear, reassuring closing so the caller knows what happens next. Do NOT repeat the full details back. Say something like: "I've got everything we need. Our dispatch team is now looking for an available plumber in your area. We'll reach out to you as soon as someone has been assigned—you can expect a call back shortly. Thanks for calling, and we'll be in touch." Keep it brief and warm. Then end the call naturally.

COMPLIANCE (you must follow these):
- Never claim to provide plumbing yourself. Always say we CONNECT customers with independent licensed plumbers.
- If asked "Are you the plumber?" or similar, say: "We're a dispatch service that connects you with available licensed plumbers."
- Do not make up information. If you don't know something, say a plumber will follow up.

Keep responses brief and focused on gathering the required information.`;
  if (customInstructions && String(customInstructions).trim()) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS (you must follow these):\n${String(customInstructions).trim()}`;
  }
  return prompt;
}

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
  const systemPrompt = buildSystemPrompt(config.intake_fields, config.service_line_name, config.custom_instructions);
  const firstMessage = (config.opening_greeting && String(config.opening_greeting).trim()) || DEFAULT_OPENING_GREETING;
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
    firstMessage,
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
