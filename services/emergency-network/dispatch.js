/**
 * Emergency Network dispatch: call service providers when a new request comes in.
 * Selects eligible providers, places outbound VAPI calls, and records results via webhook.
 */
import { supabaseClient } from '../../config/database.js';
import { getEmergencyConfig, DEFAULT_CUSTOMER_CALLBACK_MESSAGE } from './config.js';
import {
  checkIfNumberProvisionedInVAPI,
  getVapiPhoneNumberId,
  createOutboundCall,
  PHONE_AGENT_MODEL,
} from '../vapi.js';
import {
  sendEmergencyEscalationEmail,
  sendEmergencyEscalationSMS,
} from '../notifications.js';

function normalizeE164(value) {
  if (!value || typeof value !== 'string') return '';
  const d = value.replace(/[^0-9+]/g, '').trim();
  return d.startsWith('+') ? d : d ? `+${d}` : '';
}

/**
 * Format E.164 phone for clear speech (no +); e.g. +15198722736 -> "519, 872, 2736" (commas = brief pause).
 */
export function formatPhoneForSpeech(e164) {
  if (!e164 || typeof e164 !== 'string') return '';
  let digits = String(e164).replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return `${digits.slice(0, 3)}, ${digits.slice(3, 6)}, ${digits.slice(6)}`;
  if (digits.length > 10) return digits.replace(/(\d{3})(?=\d)/g, '$1, ').trim();
  return digits;
}

/**
 * Format E.164 for SMS body (readable, no +); e.g. +15198722736 -> "(519) 872-2736".
 */
export function formatPhoneForSms(e164) {
  if (!e164 || typeof e164 !== 'string') return '';
  let digits = String(e164).replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

/**
 * Get providers eligible for a request: same trade type, available, ordered by priority.
 * @param {Object} request - emergency_service_requests row
 * @returns {Promise<Array>} emergency_providers rows
 */
export async function getEligibleProviders(request) {
  const serviceCategory = request.service_category || 'Other';
  const { data, error } = await supabaseClient
    .from('emergency_providers')
    .select('*')
    .eq('trade_type', serviceCategory)
    .eq('is_available', true)
    .order('priority_tier', { ascending: true }) // premium first
    .order('business_name');

  if (error) throw error;
  return data || [];
}

/**
 * Get the next provider to call for this request (not yet attempted, within max_dispatch_attempts).
 * @param {string} requestId
 * @returns {Promise<{ provider: Object, attemptOrder: number }|null>}
 */
export async function getNextProviderToCall(requestId) {
  const config = await getEmergencyConfig();
  const maxAttempts = typeof config.max_dispatch_attempts === 'number' ? config.max_dispatch_attempts : 5;

  const { data: request, error: reqErr } = await supabaseClient
    .from('emergency_service_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (reqErr || !request) return null;
  if (!['New', 'Contacting Providers'].includes(request.status)) return null;

  const providers = await getEligibleProviders(request);
  const { data: logRows } = await supabaseClient
    .from('emergency_dispatch_log')
    .select('provider_id')
    .eq('service_request_id', requestId);
  const attemptedIds = new Set((logRows || []).map((r) => r.provider_id));
  const next = providers.find((p) => !attemptedIds.has(p.id));
  if (!next) return null;
  const attemptOrder = attemptedIds.size + 1;
  if (attemptOrder > maxAttempts) return null;
  return { provider: next, attemptOrder };
}

/**
 * Get VAPI phone number ID for the first configured emergency number (outbound caller ID).
 * @returns {Promise<string|null>}
 */
export async function getEmergencyOutboundPhoneNumberId() {
  const config = await getEmergencyConfig();
  const numbers = config.emergency_phone_numbers || [];
  if (numbers.length === 0) {
    console.warn('[EmergencyDispatch] getEmergencyOutboundPhoneNumberId: config has no emergency_phone_numbers');
    return null;
  }
  const e164 = normalizeE164(numbers[0]);
  if (!e164) return null;
  const vapiNumber = await checkIfNumberProvisionedInVAPI(e164);
  if (!vapiNumber) {
    console.warn('[EmergencyDispatch] getEmergencyOutboundPhoneNumberId: number', e164, 'not provisioned in VAPI');
    return null;
  }
  return getVapiPhoneNumberId(vapiNumber);
}

/**
 * Build the transient assistant config for a single dispatch outbound call.
 * Uses serverUrl so function-call (dispatch_accept / dispatch_decline) hits our webhook.
 */
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

export function buildDispatchAssistantConfig(firstMessage) {
  const webhookUrl = getWebhookUrl();
  return {
    model: {
      provider: 'openai',
      model: PHONE_AGENT_MODEL,
      temperature: 0.3,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: `You are calling a service provider on behalf of an emergency dispatch line. They may be in a noisy place (truck, job site). Use two steps. Rely on what they SAY (keypad often does not work).

STEP 1 – As soon as the call is answered, deliver your first message in full (the request details). Then say only: "Say Accept to take the job, Decline to pass, or Repeat to hear this again." Wait for their reply.
- If they say Accept, yes, I'll take it, or take it: call dispatch_accept. Then go to STEP 2.
- If they say Decline or no: call dispatch_decline. Do not offer email or SMS. End the call after confirming.
- If they say Repeat: re-read the full request details (caller name, callback number, urgency, location, issue), then say again "Say Accept, Decline, or Repeat." Wait.
- If you cannot make out what they said (noise or unclear): say once "I didn't catch that. Please say Accept to take the job, or Decline to pass." Then wait. Do not guess.

STEP 2 – Only after they accepted. You MUST ask first: "Would you like the details to be emailed, sent by SMS – data rates may apply, or repeat?" Wait for their reply. Do NOT call dispatch_email_details or dispatch_sms_details until they have clearly said Email or SMS. Do NOT say you emailed or texted anything until after you have called the tool and received the result.
- If they say Email: call dispatch_email_details. Then say exactly the result message the system returns (e.g. "I've emailed the details to you" or "There is no email on file..."). Do not say you sent the email unless the result says so.
- If they say SMS: call dispatch_sms_details. Then say exactly the result message the system returns. Do not say you sent the text unless the result says so.
- If they say Repeat: re-read the FULL request details again (caller name, callback number, urgency, location, issue) so they can write them down. Then say again: "Would you like the details emailed, by SMS, or repeat?" Wait.
- If you cannot make out what they said: say once "Say Email, SMS, or Repeat." Then wait.

If they are silent for 4–5 seconds, say once: "Just say Accept, Decline, or Repeat" (in step 1) or "Say Email, SMS, or Repeat" (in step 2). Then wait. Do not stay silent. Keep the call short.`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'dispatch_accept',
            description: 'Call in step 1 when they say Accept, yes, or take it (to accept the job).',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'dispatch_decline',
            description: 'Call in step 1 when they say Decline or no.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'dispatch_email_details',
            description: 'Call only in step 2 after they accepted, when they say Email. Then say the exact result message returned (may say email sent or no email on file).',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'dispatch_sms_details',
            description: 'Call only in step 2 after they accepted, when they say SMS. Then say the exact result message returned.',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    },
    voice: { provider: 'openai', voiceId: 'alloy' },
    firstMessage,
    firstMessageMode: 'assistant-speaks-first',
    serverUrl: webhookUrl,
    ...(process.env.VAPI_WEBHOOK_SECRET ? { serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET } : {}),
    serverMessages: ['status-update', 'end-of-call-report', 'function-call', 'hang'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
      smartFormat: true,
      endpointing: 500,
    },
    voicemailDetection: {
      provider: 'vapi',
      backoffPlan: {
        startAtSeconds: 2,
        frequencySeconds: 2.5,
        maxRetries: 5,
      },
      beepMaxAwaitSeconds: 20,
    },
    voicemailMessage: 'This is the emergency dispatch line. You have a new service request. Please call back or check your messages for details.',
  };
}

/**
 * Substitute placeholders in the customer callback message template.
 * Placeholders: {{caller_name}}, {{service_line_name}}, {{business_name}}, {{provider_phone}}
 */
function substituteCallbackPlaceholders(template, vars) {
  if (!template || typeof template !== 'string') return '';
  return template
    .replace(/\{\{caller_name\}\}/g, String(vars.caller_name ?? '').trim() || '')
    .replace(/\{\{service_line_name\}\}/g, String(vars.service_line_name ?? '').trim() || 'the emergency plumbing line')
    .replace(/\{\{business_name\}\}/g, String(vars.business_name ?? '').trim() || 'your assigned plumber')
    .replace(/\{\{provider_phone\}\}/g, String(vars.provider_phone ?? '').trim() || '');
}

/**
 * Build the transient assistant config for outbound callback to the customer after a provider accepts.
 * Speaks the message (phone number without +, in groups e.g. 519, 872, 2736), then offers SMS or repeat; repeat up to 3 times; then "Anything else?" with 30s silence then hang up.
 * @param {string} message - Full message to speak (placeholders already substituted; provider_phone is speakable format).
 */
export function buildCustomerCallbackAssistantConfig(message) {
  const fullMessage = (message && String(message).trim()) || "We've assigned a plumber to your request.";
  const firstMessage = `${fullMessage} Would you like these details sent to you by SMS, or would you like me to repeat this message?`;
  const webhookUrl = getWebhookUrl();
  return {
    model: {
      provider: 'openai',
      model: PHONE_AGENT_MODEL,
      temperature: 0.2,
      maxTokens: 300,
      messages: [
        {
          role: 'system',
          content: `You are calling the customer back to tell them a trades professional has been assigned.

STEP 1 – Say exactly the first message you were given (it includes the company name and the phone number). Then you have already asked: "Would you like these details sent to you by SMS, or would you like me to repeat this message?" Wait for their response.

STEP 2 – Respond to their choice:
- If they say SMS or text or send me a text: call the function customer_callback_send_sms. Then say exactly the result the system returns (e.g. "I've sent the details to your phone by text.").
- If they say repeat or say it again: say the exact same full message again (the whole message with company name and phone number). Then ask again: "Would you like these details sent by SMS, or would you like me to repeat?" You may repeat the full message at most 2 more times (3 readings in total). After the third time you have said the full message, do not repeat again; go to STEP 3.
- If unclear: say once "Would you like these details sent by SMS, or would you like me to repeat the message?" Then wait.

STEP 3 – After they have chosen SMS (and you said the result) or after you have repeated the message up to 3 times total, say: "Is there anything else I can assist you with today?" Wait for their response. If they say no or nothing else, say "Thank you for calling. Goodbye." and end the call. If they are silent for about 30 seconds, say "Thank you for calling. Goodbye." and end the call.`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'customer_callback_send_sms',
            description: 'Call when the customer says they want the details sent by SMS or text. Sends the dispatch details to their phone.',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    },
    voice: { provider: 'openai', voiceId: 'alloy' },
    firstMessage,
    firstMessageMode: 'assistant-speaks-first',
    serverUrl: webhookUrl,
    ...(process.env.VAPI_WEBHOOK_SECRET ? { serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET } : {}),
    serverMessages: ['status-update', 'end-of-call-report', 'function-call', 'hang'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
      smartFormat: true,
      endpointing: 500,
    },
  };
}

/**
 * Place an outbound call to the customer to tell them the assigned company name and provider phone.
 * Called after a provider accepts the job. Does not throw; logs errors so accept flow still succeeds.
 * @param {Object} request - emergency_service_requests row (callback_phone, caller_name)
 * @param {Object} provider - emergency_providers row (business_name, phone)
 */
export async function placeCustomerCallbackCall(request, provider) {
  const callbackPhone = normalizeE164(request.callback_phone);
  if (!callbackPhone) {
    console.warn('[EmergencyDispatch] placeCustomerCallbackCall: no callback_phone for request', request.id);
    return;
  }
  const providerPhone = normalizeE164(provider.phone);
  if (!providerPhone) {
    console.warn('[EmergencyDispatch] placeCustomerCallbackCall: provider has no phone', provider.id);
    return;
  }
  const phoneNumberId = await getEmergencyOutboundPhoneNumberId();
  if (!phoneNumberId) {
    console.warn('[EmergencyDispatch] placeCustomerCallbackCall: no emergency outbound number in VAPI');
    return;
  }
  const config = await getEmergencyConfig();
  const serviceLineName = (config.service_line_name && String(config.service_line_name).trim()) || 'the emergency plumbing line';
  const template = (config.customer_callback_message && String(config.customer_callback_message).trim()) || DEFAULT_CUSTOMER_CALLBACK_MESSAGE;
  const providerPhoneSpeakable = formatPhoneForSpeech(providerPhone);
  const message = substituteCallbackPlaceholders(template, {
    caller_name: request.caller_name ?? '',
    service_line_name: serviceLineName,
    business_name: provider.business_name ?? 'your assigned plumber',
    provider_phone: providerPhoneSpeakable,
  });
  const assistant = buildCustomerCallbackAssistantConfig(message);
  try {
    const call = await createOutboundCall({
      assistant,
      phoneNumberId,
      toNumber: callbackPhone,
      metadata: {
        type: 'emergency_customer_callback',
        request_id: request.id,
        provider_id: provider.id,
      },
    });
    console.log('[EmergencyDispatch] Customer callback placed:', { requestId: request.id, callId: call?.id });
  } catch (err) {
    const detail = err?.response?.data != null ? JSON.stringify(err.response.data) : err?.message;
    console.error('[EmergencyDispatch] placeCustomerCallbackCall failed:', err?.message || err, detail || '');
  }
}

/**
 * Build first message for the provider (read over the phone).
 */
export function buildDispatchFirstMessage(request, provider) {
  const parts = [
    'You have a new emergency service request.',
    request.caller_name ? `Caller name: ${request.caller_name}.` : '',
    `Callback number: ${request.callback_phone}.`,
    request.urgency_level ? `Urgency: ${request.urgency_level}.` : '',
    request.location ? `Location: ${request.location}.` : '',
    request.issue_summary ? `Issue: ${(request.issue_summary || '').slice(0, 200)}.` : '',
    'Say Accept to take the job, Decline to pass, or Repeat to hear this again.',
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Start dispatch for a request: set status to Contacting Providers and call the first provider.
 * @param {string} requestId
 */
export async function startDispatch(requestId) {
  console.log('[EmergencyDispatch] startDispatch called for request:', requestId);
  const { error: updateErr } = await supabaseClient
    .from('emergency_service_requests')
    .update({ status: 'Contacting Providers', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (updateErr) {
    console.error('[EmergencyDispatch] startDispatch failed to update status:', updateErr?.message || updateErr);
    throw updateErr;
  }
  await callNextProvider(requestId);
}

/**
 * Place one outbound call to the next eligible provider and log the attempt.
 * @param {string} requestId
 */
export async function callNextProvider(requestId) {
  const next = await getNextProviderToCall(requestId);
  if (!next) {
    const { data: requestRow } = await supabaseClient.from('emergency_service_requests').select('*').eq('id', requestId).single();
    if (requestRow && requestRow.status === 'Contacting Providers') {
      await supabaseClient
        .from('emergency_service_requests')
        .update({ status: 'Needs Manual Assist', updated_at: new Date().toISOString() })
        .eq('id', requestId);
      const { logRequestActivity } = await import("./activity.js");
      await logRequestActivity(requestId, 'status_change', { from_status: 'Contacting Providers', to_status: 'Needs Manual Assist', source: 'ai' });
      console.log('[EmergencyDispatch] No eligible provider to call for request', requestId, '— status set to Needs Manual Assist. Add plumbers in Emergency Dispatch → Providers and set is_available.');

      const config = await getEmergencyConfig();
      if (config.escalation_email_enabled && config.notification_email) {
        try {
          await sendEmergencyEscalationEmail(config.notification_email, requestRow);
        } catch (err) {
          console.error('[EmergencyDispatch] Escalation email failed:', err?.message || err);
        }
      }
      if (config.escalation_sms_enabled && config.notification_sms_number) {
        try {
          await sendEmergencyEscalationSMS(config, requestRow);
        } catch (err) {
          console.error('[EmergencyDispatch] Escalation SMS failed:', err?.message || err);
        }
      }
    }
    return;
  }

  const phoneNumberId = await getEmergencyOutboundPhoneNumberId();
  if (!phoneNumberId) {
    console.warn('[EmergencyDispatch] No emergency phone number in VAPI; cannot place outbound call. Ensure Emergency Dispatch config has at least one number and it is linked in VAPI.');
    return;
  }

  const { data: request } = await supabaseClient
    .from('emergency_service_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!request) return;

  const providerPhone = normalizeE164(next.provider.phone);
  if (!providerPhone) {
    console.warn('[EmergencyDispatch] Provider has no phone:', next.provider.id);
    await callNextProvider(requestId);
    return;
  }

  const firstMessage = buildDispatchFirstMessage(request, next.provider);
  const assistant = buildDispatchAssistantConfig(firstMessage);
  const metadata = {
    type: 'emergency_dispatch',
    request_id: requestId,
    provider_id: next.provider.id,
  };
  // dispatch_log_id is stored in emergency_dispatch_calls for webhook lookup

  let dispatchLogId = null;
  try {
    const { data: logRow, error: logErr } = await supabaseClient
      .from('emergency_dispatch_log')
      .insert({
        service_request_id: requestId,
        provider_id: next.provider.id,
        attempt_order: next.attemptOrder,
        result: 'pending',
      })
      .select('id')
      .single();
    if (logErr) throw logErr;
    dispatchLogId = logRow?.id;
  } catch (e) {
    console.error('[EmergencyDispatch] Failed to insert dispatch_log:', e?.message || e);
    return;
  }

  try {
    const call = await createOutboundCall({
      assistant,
      phoneNumberId,
      toNumber: providerPhone,
      metadata,
    });
    const callId = call?.id;
    if (callId && dispatchLogId) {
      await supabaseClient.from('emergency_dispatch_calls').upsert({
        vapi_call_id: callId,
        service_request_id: requestId,
        provider_id: next.provider.id,
        dispatch_log_id: dispatchLogId,
      }, { onConflict: 'vapi_call_id' });
    }
    console.log('[EmergencyDispatch] Outbound call placed:', { requestId, providerId: next.provider.id, callId });
  } catch (err) {
    const vapiDetail = err?.response?.data != null ? JSON.stringify(err.response.data) : '';
    console.error('[EmergencyDispatch] createOutboundCall failed:', err?.message || err, vapiDetail || '');
    await supabaseClient
      .from('emergency_dispatch_log')
      .update({ result: 'error' })
      .eq('id', dispatchLogId);
    await callNextProvider(requestId);
  }
}
