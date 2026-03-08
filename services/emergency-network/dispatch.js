/**
 * Emergency Network dispatch: call service providers when a new request comes in.
 * Selects eligible providers, places outbound VAPI calls, and records results via webhook.
 */
import { supabaseClient } from '../../config/database.js';
import { getEmergencyConfig } from './config.js';
import {
  checkIfNumberProvisionedInVAPI,
  getVapiPhoneNumberId,
  createOutboundCall,
} from '../vapi.js';

function normalizeE164(value) {
  if (!value || typeof value !== 'string') return '';
  const d = value.replace(/[^0-9+]/g, '').trim();
  return d.startsWith('+') ? d : d ? `+${d}` : '';
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
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 300,
      messages: [
        {
          role: 'system',
          content: `You are calling a service provider on behalf of an emergency dispatch line. As soon as the call is answered, deliver your first message in full: read the request details, then ask them to press 1 to accept or 2 to decline. Do not end the call until they have accepted or declined. When they say "one", "1", "accept", or "I'll take it", call dispatch_accept. When they say "two", "2", "decline", "no", or "I can't", call dispatch_decline. Keep the call short; no small talk.`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'dispatch_accept',
            description: 'Call this when the provider accepts the job (e.g. says yes, 1, or accept).',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'dispatch_decline',
            description: 'Call this when the provider declines (e.g. says no, 2, or decline).',
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
      endpointing: 300,
    },
  };
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
    'Press 1 to accept this job, or 2 to decline.',
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
    const { data: req } = await supabaseClient.from('emergency_service_requests').select('status').eq('id', requestId).single();
    if (req && req.status === 'Contacting Providers') {
      await supabaseClient
        .from('emergency_service_requests')
        .update({ status: 'Needs Manual Assist', updated_at: new Date().toISOString() })
        .eq('id', requestId);
      console.log('[EmergencyDispatch] No eligible provider to call for request', requestId, '— status set to Needs Manual Assist. Add plumbers in Emergency Dispatch → Providers and set is_available.');
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
