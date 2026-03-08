/**
 * Tavari Emergency Network API.
 * Separate stream: does not touch existing agent. Dedicated number + form.
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { supabaseClient } from '../../config/database.js';
import { createServiceRequest } from '../../services/emergency-network/intake.js';
import { startDispatch, callNextProvider } from '../../services/emergency-network/dispatch.js';
import { getEmergencyConfig, invalidateEmergencyConfigCache } from '../../services/emergency-network/config.js';
import { createEmergencyNetworkAssistant } from '../../services/emergency-network/create-vapi-assistant.js';
import { getAllVapiPhoneNumbers, checkIfNumberProvisionedInVAPI, linkAssistantToNumber, provisionPhoneNumber, getVapiPhoneNumberId } from '../../services/vapi.js';

const router = express.Router();

/**
 * Link the emergency assistant to all emergency_phone_numbers.
 * Same flow as the existing phone agent: provision from Telnyx to VAPI if not already there, then link.
 * @param {string} assistantId - emergency_vapi_assistant_id
 * @param {string[]} phoneNumbers - emergency_phone_numbers (E.164 or any format we normalize)
 * @returns {{ linked: string[], notInVapi: string[], errors: string[] }}
 */
async function linkEmergencyAssistantToNumbers(assistantId, phoneNumbers) {
  const result = { linked: [], notInVapi: [], errors: [] };
  if (!assistantId || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return result;
  for (const raw of phoneNumbers) {
    const e164 = normalizeE164(raw);
    if (!e164) continue;
    try {
      let vapiNumber = await checkIfNumberProvisionedInVAPI(e164);
      if (!vapiNumber) {
        try {
          vapiNumber = await provisionPhoneNumber(e164, null);
          console.log('[EmergencyNetwork] Provisioned number to VAPI (same as phone agent):', e164);
        } catch (provisionErr) {
          result.notInVapi.push(e164);
          result.errors.push(`${e164}: provision to VAPI failed — ${provisionErr?.message || provisionErr}`);
          continue;
        }
      }
      const phoneNumberId = getVapiPhoneNumberId(vapiNumber);
      if (!phoneNumberId) {
        console.warn('[EmergencyNetwork] VAPI number object missing id for', e164, 'keys:', vapiNumber ? Object.keys(vapiNumber) : []);
        result.errors.push(`${e164}: no VAPI phone number id (number may not be provisioned in VAPI)`);
        continue;
      }
      await linkAssistantToNumber(assistantId, phoneNumberId);
      result.linked.push(e164);
      console.log('[EmergencyNetwork] Linked emergency assistant to number', e164);
    } catch (err) {
      result.errors.push(`${e164}: ${err?.message || err}`);
      console.warn('[EmergencyNetwork] Link number failed:', e164, err?.message || err);
    }
  }
  return result;
}

/** Normalize to E.164 for display/dedupe. */
function normalizeE164(value) {
  if (!value || typeof value !== 'string') return '';
  const d = value.replace(/[^0-9+]/g, '').trim();
  return d.startsWith('+') ? d : d ? `+${d}` : '';
}

/**
 * Get all phone numbers Tavari owns from Telnyx (same source as current agent / admin).
 * Falls back to VAPI if Telnyx is not configured or returns empty.
 */
async function getOwnedPhoneNumbersForDropdown() {
  const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
  const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';
  const seen = new Set();
  const result = [];

  if (TELNYX_API_KEY) {
    try {
      const axios = (await import('axios')).default;
      const telnyxResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
        headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
        params: { 'page[size]': 100 },
      });
      const allTelnyxNumbers = telnyxResponse.data?.data || [];
      for (const telnyxNum of allTelnyxNumbers) {
        const raw = telnyxNum.phone_number || telnyxNum.number;
        const e164 = normalizeE164(raw);
        if (e164 && !seen.has(e164)) {
          seen.add(e164);
          result.push({ number: e164, e164 });
        }
      }
      if (result.length > 0) {
        console.log(`[EmergencyNetwork] phone-numbers: ${result.length} from Telnyx`);
        return result;
      }
    } catch (err) {
      console.warn('[EmergencyNetwork] Telnyx phone_numbers failed, falling back to VAPI:', err?.message || err);
    }
  } else {
    console.warn('[EmergencyNetwork] TELNYX_API_KEY not set, using VAPI for phone-numbers');
  }

  const vapiNumbers = await getAllVapiPhoneNumbers();
  for (const n of vapiNumbers) {
    const raw = n.phoneNumber || n.phone_number || n.number;
    const e164 = normalizeE164(raw);
    if (e164 && !seen.has(e164)) {
      seen.add(e164);
      result.push({ number: e164, e164 });
    }
  }
  if (result.length > 0) {
    console.log(`[EmergencyNetwork] phone-numbers: ${result.length} from VAPI`);
  }
  return result;
}

// ---------- PUBLIC (no auth) ----------

/**
 * GET /api/v2/emergency-network/public/phone
 * Returns the primary emergency phone number for the customer-facing /emergency page (CALL NOW / TEXT US links).
 */
router.get('/public/phone', async (req, res) => {
  try {
    const config = await getEmergencyConfig();
    const numbers = config.emergency_phone_numbers || [];
    const phone = numbers.length > 0 ? numbers[0] : null;
    res.json({ phone });
  } catch (err) {
    console.error('[EmergencyNetwork] public/phone error:', err?.message || err);
    res.status(500).json({ phone: null });
  }
});

/**
 * POST /api/v2/emergency-network/request
 * Form submission from tavari.com/emergency. Creates service request and triggers intake.
 */
router.post('/request', express.json(), async (req, res) => {
  try {
    const {
      name,
      phone,
      service_type,
      address_or_postal_code,
      issue_description,
      urgency_level,
    } = req.body || {};

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const request = await createServiceRequest({
      caller_name: name?.trim() || null,
      callback_phone: String(phone).trim(),
      service_category: ['Plumbing', 'HVAC', 'Gas', 'Other'].includes(service_type) ? service_type : 'Other',
      urgency_level:
        urgency_level === 'Immediate Emergency' || urgency_level === 'Same Day' || urgency_level === 'Schedule'
          ? urgency_level
          : 'Schedule',
      location: address_or_postal_code?.trim() || null,
      issue_summary: issue_description?.trim() || null,
      intake_channel: 'form',
    });

    startDispatch(request.id).catch((err) =>
      console.error('[EmergencyNetwork] startDispatch error:', err?.message || err)
    );

    res.status(201).json({
      success: true,
      message: "Thanks — we're contacting available professionals now. You may receive a call or text shortly.",
      request_id: request.id,
    });
  } catch (err) {
    console.error('[EmergencyNetwork] Form submit error:', err?.message || err);
    res.status(500).json({ error: 'Could not submit request. Please try again or call us.' });
  }
});

// ---------- ADMIN (authenticate + business context for dashboard) ----------
router.use(authenticate);
router.use(requireBusinessContext);

function getVapiWebhookUrl() {
  let base = process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL || process.env.SERVER_URL || 'https://api.tavarios.com';
  if (base && !base.startsWith('http')) base = `https://${base}`;
  return `${base}/api/vapi/webhook`;
}

/**
 * GET /api/v2/emergency-network/config
 * Get emergency config (phone numbers, assistant id, max_dispatch_attempts, webhook_url for VAPI setup).
 */
router.get('/config', async (req, res) => {
  try {
    const config = await getEmergencyConfig();
    res.json({ ...config, webhook_url: getVapiWebhookUrl() });
  } catch (err) {
    console.error('[EmergencyNetwork] config get error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load config' });
  }
});

/**
 * GET /api/v2/emergency-network/phone-numbers
 * List phone numbers Tavari owns (from Telnyx, same as current agent; fallback VAPI) for the emergency config dropdown.
 */
router.get('/phone-numbers', async (req, res) => {
  try {
    const phone_numbers = await getOwnedPhoneNumbersForDropdown();
    res.json({ phone_numbers });
  } catch (err) {
    console.error('[EmergencyNetwork] phone-numbers get error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load phone numbers' });
  }
});

/**
 * POST /api/v2/emergency-network/create-agent
 * Create the Emergency Network VAPI assistant and save its ID to config.
 */
router.post('/create-agent', async (req, res) => {
  try {
    const assistant = await createEmergencyNetworkAssistant();
    const assistantId = assistant.id;

    const { data: row, error: fetchError } = await supabaseClient
      .from('emergency_network_config')
      .select('value')
      .eq('key', 'settings')
      .single();

    const current = (fetchError || !row) ? {} : (row.value && typeof row.value === 'object' ? row.value : {});
    const newValue = { ...current, emergency_vapi_assistant_id: assistantId };

    const { error: upsertError } = await supabaseClient
      .from('emergency_network_config')
      .upsert({ key: 'settings', value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (upsertError) {
      return res.status(500).json({ error: 'Agent created but failed to save config: ' + upsertError.message });
    }
    invalidateEmergencyConfigCache();

    // Attach the new agent to emergency dispatch phone number(s) in VAPI
    const numbers = Array.isArray(newValue.emergency_phone_numbers) ? newValue.emergency_phone_numbers : [];
    if (numbers.length > 0) {
      try {
        const linkResult = await linkEmergencyAssistantToNumbers(assistantId, numbers);
        if (linkResult.linked.length) {
          console.log('[EmergencyNetwork] create-agent: linked to', linkResult.linked.length, 'number(s) in VAPI');
        }
        if (linkResult.notInVapi.length) {
          console.warn('[EmergencyNetwork] create-agent: numbers not in VAPI (link in VAPI or add to Telnyx first):', linkResult.notInVapi);
        }
        if (linkResult.errors.length) {
          console.warn('[EmergencyNetwork] create-agent: link errors', linkResult.errors);
        }
      } catch (linkErr) {
        console.warn('[EmergencyNetwork] create-agent: link to numbers failed (non-blocking)', linkErr?.message || linkErr);
      }
    }

    res.status(201).json({
      success: true,
      assistant_id: assistantId,
      assistant_name: assistant.name,
    });
  } catch (err) {
    const status = err.response?.status;
    const vapiBody = err.response?.data;
    const vapiMessage = typeof vapiBody === 'object' && vapiBody?.message ? vapiBody.message : (typeof vapiBody === 'string' ? vapiBody : null);
    console.error('[EmergencyNetwork] create-agent error:', err?.message || err, vapiBody ? { status, vapiBody } : '');
    const message = vapiMessage || err?.message || 'Failed to create agent';
    res.status(status === 400 ? 400 : 500).json({ error: message });
  }
});

/**
 * POST /api/v2/emergency-network/link-agent
 * Explicitly link the emergency assistant to all configured emergency_phone_numbers in VAPI.
 * Use this to "attach" the agent to the dispatch number(s) if it was not done on config save.
 */
router.post('/link-agent', async (req, res) => {
  try {
    const config = await getEmergencyConfig();
    const assistantId = config.emergency_vapi_assistant_id || null;
    const numbers = config.emergency_phone_numbers || [];
    if (!assistantId) {
      return res.status(400).json({ error: 'No emergency assistant configured. Create an agent first.', linked: [], notInVapi: [], errors: [] });
    }
    if (numbers.length === 0) {
      return res.status(400).json({ error: 'No emergency phone numbers configured. Add at least one number in Settings.', linked: [], notInVapi: [], errors: [] });
    }
    const result = await linkEmergencyAssistantToNumbers(assistantId, numbers);
    const success = result.errors.length === 0 && result.linked.length > 0;
    res.status(200).json({
      success,
      message: success
        ? `Linked agent to ${result.linked.length} number(s).`
        : result.notInVapi.length
          ? `Could not provision/link: ${result.notInVapi.join(', ')}. Ensure numbers are in Telnyx and VAPI has a Telnyx credential. ${result.errors.length ? result.errors.join('; ') : ''}`
          : result.errors.join('; '),
      linked: result.linked,
      notInVapi: result.notInVapi,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[EmergencyNetwork] link-agent error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to link agent', linked: [], notInVapi: [], errors: [] });
  }
});

/**
 * PUT /api/v2/emergency-network/config
 * Update config (emergency_phone_numbers, emergency_vapi_assistant_id, max_dispatch_attempts).
 */
router.put('/config', express.json(), async (req, res) => {
  try {
    const { emergency_phone_numbers, emergency_vapi_assistant_id, max_dispatch_attempts, notification_email, intake_fields, opening_greeting, service_line_name, custom_instructions } = req.body || {};
    const updates = {};
    if (Array.isArray(emergency_phone_numbers)) updates.emergency_phone_numbers = emergency_phone_numbers;
    if (emergency_vapi_assistant_id !== undefined) updates.emergency_vapi_assistant_id = emergency_vapi_assistant_id || null;
    if (typeof max_dispatch_attempts === 'number') updates.max_dispatch_attempts = max_dispatch_attempts;
    if (notification_email !== undefined) updates.notification_email = notification_email ? String(notification_email).trim() || null : null;
    if (opening_greeting !== undefined) updates.opening_greeting = opening_greeting ? String(opening_greeting).trim() || null : null;
    if (service_line_name !== undefined) updates.service_line_name = service_line_name ? String(service_line_name).trim() || null : null;
    if (custom_instructions !== undefined) updates.custom_instructions = custom_instructions ? String(custom_instructions).trim() || null : null;
    if (intake_fields !== undefined && Array.isArray(intake_fields)) {
      updates.intake_fields = intake_fields.map((f) => ({
        key: String(f.key || '').trim() || undefined,
        label: String(f.label || '').trim() || undefined,
        required: !!f.required,
        enabled: f.enabled !== false,
      })).filter((f) => f.key);
    }

    const { data: row, error } = await supabaseClient
      .from('emergency_network_config')
      .select('value')
      .eq('key', 'settings')
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    const current = (row?.value || {}) instanceof Object ? row.value : {};
    const newValue = { ...current, ...updates };

    const { error: upsertErr } = await supabaseClient
      .from('emergency_network_config')
      .upsert({ key: 'settings', value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (upsertErr) {
      const msg = upsertErr.message || 'Database error';
      const isMissingTable = msg.includes('relation') && msg.includes('does not exist') || upsertErr.code === '42P01';
      return res.status(500).json({
        error: isMissingTable
          ? 'Emergency config table missing. Run migration: migrations/add_emergency_network.sql'
          : msg,
      });
    }
    invalidateEmergencyConfigCache();
    const finalConfig = await getEmergencyConfig();
    const assistantId = finalConfig.emergency_vapi_assistant_id || null;
    const numbers = finalConfig.emergency_phone_numbers || [];
    let linkResult = { linked: [], notInVapi: [], errors: [] };
    if (assistantId && numbers.length > 0) {
      try {
        linkResult = await linkEmergencyAssistantToNumbers(assistantId, numbers);
        if (linkResult.linked.length) {
          console.log('[EmergencyNetwork] config: linked emergency agent to', linkResult.linked.length, 'number(s) in VAPI');
        }
        if (linkResult.notInVapi.length) {
          console.warn('[EmergencyNetwork] config: numbers not in VAPI:', linkResult.notInVapi);
        }
        if (linkResult.errors.length) {
          console.warn('[EmergencyNetwork] config: link errors', linkResult.errors);
        }
      } catch (linkErr) {
        console.warn('[EmergencyNetwork] config: link to numbers failed (non-blocking)', linkErr?.message || linkErr);
        linkResult.errors.push(linkErr?.message || String(linkErr));
      }
    }
    res.json({ ...finalConfig, link_result: linkResult });
  } catch (err) {
    console.error('[EmergencyNetwork] config put error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update config' });
  }
});

/**
 * GET /api/v2/emergency-network/requests
 * Live request feed: name, phone, service, urgency, location, intake_channel, status, created_at.
 */
router.get('/requests', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('emergency_service_requests')
      .select('id, caller_name, callback_phone, service_category, urgency_level, location, issue_summary, intake_channel, status, accepted_provider_id, created_at, updated_at, custom_intake')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ requests: data || [] });
  } catch (err) {
    console.error('[EmergencyNetwork] requests list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load requests' });
  }
});

/**
 * POST /api/v2/emergency-network/requests/:id/call-provider
 * Manually trigger placing an outbound call to the next eligible provider (e.g. plumber).
 * Use this to test the call flow. Sets status to Contacting Providers if still New, then calls callNextProvider.
 */
/**
 * POST /api/v2/emergency-network/requests/:id/reset-dispatch
 * Clear all dispatch attempts for this request and set status to New so "Call plumber" can try again.
 */
router.post('/requests/:id/reset-dispatch', async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { data: request, error: fetchErr } = await supabaseClient
      .from('emergency_service_requests')
      .select('id')
      .eq('id', requestId)
      .single();
    if (fetchErr || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    await supabaseClient.from('emergency_dispatch_calls').delete().eq('service_request_id', requestId);
    await supabaseClient.from('emergency_dispatch_log').delete().eq('service_request_id', requestId);
    const { error: updateErr } = await supabaseClient
      .from('emergency_service_requests')
      .update({ status: 'New', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (updateErr) {
      return res.status(500).json({ error: 'Failed to reset status: ' + (updateErr.message || updateErr) });
    }
    try {
      const { logRequestActivity } = await import("../../services/emergency-network/activity.js");
      await logRequestActivity(requestId, 'dispatch_reset', { source: 'manual', changed_by: 'Dashboard' });
    } catch (_) { /* activity log optional */ }
    res.json({ success: true, message: 'Dispatch reset. You can tap Call plumber again.' });
  } catch (err) {
    console.error('[EmergencyNetwork] reset-dispatch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to reset dispatch' });
  }
});

/**
 * POST /api/v2/emergency-network/requests/:id/call-provider
 * Manually trigger placing an outbound call to the next eligible provider (e.g. plumber).
 * Use this to test the call flow. Sets status to Contacting Providers if still New, then calls callNextProvider.
 */
router.post('/requests/:id/call-provider', async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { data: request, error: fetchErr } = await supabaseClient
      .from('emergency_service_requests')
      .select('id, status')
      .eq('id', requestId)
      .single();
    if (fetchErr || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (!['New', 'Contacting Providers'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot place provider call when status is "${request.status}". Use New or Contacting Providers.` });
    }
    if (request.status === 'New') {
      const { error: updateErr } = await supabaseClient
        .from('emergency_service_requests')
        .update({ status: 'Contacting Providers', updated_at: new Date().toISOString() })
        .eq('id', requestId);
      if (updateErr) {
        return res.status(500).json({ error: 'Failed to update status: ' + (updateErr.message || updateErr) });
      }
      try {
        const { logRequestActivity } = await import("../../services/emergency-network/activity.js");
        await logRequestActivity(requestId, 'status_change', { from_status: 'New', to_status: 'Contacting Providers', source: 'manual', changed_by: 'Dashboard' });
      } catch (_) { /* activity log optional */ }
    }
    await callNextProvider(requestId);
    res.json({ success: true, message: 'Call to next provider initiated.' });
  } catch (err) {
    console.error('[EmergencyNetwork] call-provider error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to place call' });
  }
});

/**
 * PATCH /api/v2/emergency-network/requests/:id
 * Update request status (e.g. Needs Manual Assist, Closed).
 */
router.patch('/requests/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, accepted_provider_id } = req.body || {};
    if (status) {
      const { data: current } = await supabaseClient.from('emergency_service_requests').select('status').eq('id', id).single();
      const updates = { updated_at: new Date().toISOString(), status };
      if (accepted_provider_id !== undefined) updates.accepted_provider_id = accepted_provider_id;
      if (status === 'Connected' || status === 'Closed') {
        updates.connected_at = status === 'Connected' ? new Date().toISOString() : undefined;
        updates.closed_at = status === 'Closed' ? new Date().toISOString() : undefined;
      }
      const { data, error } = await supabaseClient.from('emergency_service_requests').update(updates).eq('id', id).select().single();
      if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
      console.log('[EmergencyNetwork] PATCH request status updated', { id, from_status: current?.status, to_status: status });
      try {
        const { logRequestActivity } = await import("../../services/emergency-network/activity.js");
        await logRequestActivity(id, 'status_change', { from_status: current?.status, to_status: status, source: 'manual', changed_by: 'Dashboard' });
        console.log('[EmergencyNetwork] PATCH activity logged for request', id);
      } catch (logErr) {
        console.error('[EmergencyNetwork] PATCH activity log failed for request', id, logErr?.message || logErr);
      }
      return res.json(data);
    }
    const updates = { updated_at: new Date().toISOString() };
    if (accepted_provider_id !== undefined) updates.accepted_provider_id = accepted_provider_id;
    const { data, error } = await supabaseClient.from('emergency_service_requests').update(updates).eq('id', id).select().single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[EmergencyNetwork] request patch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update request' });
  }
});

/**
 * GET /api/v2/emergency-network/providers
 * Provider directory.
 */
router.get('/providers', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('emergency_providers')
      .select('*')
      .order('priority_tier', { ascending: true })
      .order('business_name');

    if (error) return res.status(500).json({ error: error.message });
    res.json({ providers: data || [] });
  } catch (err) {
    console.error('[EmergencyNetwork] providers list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load providers' });
  }
});

/**
 * POST /api/v2/emergency-network/providers
 */
router.post('/providers', express.json(), async (req, res) => {
  try {
    const { business_name, trade_type, service_areas, phone, email, verification_status, priority_tier, is_available } = req.body || {};
    if (!business_name || !trade_type || !phone) {
      return res.status(400).json({ error: 'business_name, trade_type, and phone are required' });
    }
    const payload = {
      business_name: String(business_name).trim(),
      trade_type: String(trade_type).trim(),
      service_areas: Array.isArray(service_areas) ? service_areas : [],
      phone: String(phone).trim(),
      verification_status: verification_status === 'verified' ? 'verified' : 'pending',
      priority_tier: ['premium', 'priority', 'basic'].includes(priority_tier) ? priority_tier : 'basic',
      is_available: is_available !== false,
    };
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      payload.email = String(email).trim();
    }
    const { data, error } = await supabaseClient.from('emergency_providers').insert(payload).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    console.error('[EmergencyNetwork] provider create error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to create provider' });
  }
});

/**
 * PATCH /api/v2/emergency-network/providers/:id
 */
router.patch('/providers/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const allowed = ['business_name', 'trade_type', 'service_areas', 'phone', 'email', 'verification_status', 'priority_tier', 'is_available'];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) {
        updates[k] = k === 'email' ? (body[k] == null || String(body[k]).trim() === '' ? null : String(body[k]).trim()) : body[k];
      }
    }
    const { data, error } = await supabaseClient.from('emergency_providers').update(updates).eq('id', id).select().single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[EmergencyNetwork] provider patch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update provider' });
  }
});

/**
 * DELETE /api/v2/emergency-network/providers/:id
 */
router.delete('/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseClient.from('emergency_providers').delete().eq('id', id);
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.status(204).end();
  } catch (err) {
    console.error('[EmergencyNetwork] provider delete error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to delete provider' });
  }
});

/**
 * GET /api/v2/emergency-network/dispatch-log?request_id=xxx
 * Returns log entries with provider business_name and email_sent_at, sms_sent_at when present.
 * Falls back to basic columns + separate provider fetch if new columns or embed are missing (e.g. migration not run yet).
 */
router.get('/dispatch-log', async (req, res) => {
  try {
    const requestId = req.query.request_id;
    // Try full query first (new columns + provider embed)
    let q = supabaseClient
      .from('emergency_dispatch_log')
      .select('id, service_request_id, provider_id, attempt_order, result, attempted_at, email_sent_at, sms_sent_at, emergency_providers(business_name)')
      .order('attempted_at', { ascending: false });
    if (requestId) q = q.eq('service_request_id', requestId);
    let { data, error } = await q.limit(100);

    // Fallback: if columns or embed fail (e.g. migration not run), use basic select and fetch provider names separately
    if (error) {
      console.warn('[EmergencyNetwork] dispatch-log fallback:', error.message);
      let basicQ = supabaseClient
        .from('emergency_dispatch_log')
        .select('id, service_request_id, provider_id, attempt_order, result, attempted_at')
        .order('attempted_at', { ascending: false });
      if (requestId) basicQ = basicQ.eq('service_request_id', requestId);
      const basicRes = await basicQ.limit(100);
      if (basicRes.error) return res.status(500).json({ error: basicRes.error.message });
      data = basicRes.data || [];
      const providerIds = [...new Set((data).map((r) => r.provider_id).filter(Boolean))];
      let providers = [];
      if (providerIds.length > 0) {
        const { data: provData } = await supabaseClient
          .from('emergency_providers')
          .select('id, business_name')
          .in('id', providerIds);
        providers = provData || [];
      }
      const provById = Object.fromEntries(providers.map((p) => [p.id, p]));
      const log = (data || []).map((row) => ({
        ...row,
        email_sent_at: null,
        sms_sent_at: null,
        provider_business_name: provById[row.provider_id]?.business_name ?? null,
      }));
      return res.json({ log });
    }

    // Normalize: Supabase may return emergency_providers as object or array
    const log = (data || []).map((row) => ({
      ...row,
      provider_business_name: row.emergency_providers?.business_name ?? (Array.isArray(row.emergency_providers) ? row.emergency_providers[0]?.business_name : null),
    }));
    res.json({ log });
  } catch (err) {
    console.error('[EmergencyNetwork] dispatch-log error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load dispatch log' });
  }
});

/**
 * GET /api/v2/emergency-network/requests/:id/activity
 * Request-level activity: dispatch resets and status changes (manual vs AI).
 */
router.get('/requests/:id/activity', async (req, res) => {
  try {
    const { id: requestId } = req.params;
    console.log('[EmergencyNetwork] GET request activity', { requestId });
    const { data, error } = await supabaseClient
      .from('emergency_request_activity')
      .select('id, activity_type, from_status, to_status, source, changed_by, created_at')
      .eq('service_request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[EmergencyNetwork] GET request activity error', { requestId, code: error.code, message: error.message });
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.log('[EmergencyNetwork] GET request activity table missing, returning []');
        return res.json({ activity: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    const list = data || [];
    console.log('[EmergencyNetwork] GET request activity result', { requestId, count: list.length });
    res.json({ activity: list });
  } catch (err) {
    console.error('[EmergencyNetwork] GET request activity exception', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load activity' });
  }
});

/**
 * GET /api/v2/emergency-network/analytics
 * requests/day, acceptance rate, response time (simplified).
 */
router.get('/analytics', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: requests } = await supabaseClient
      .from('emergency_service_requests')
      .select('id, status, created_at, connected_at');
    const list = requests || [];
    const todayCount = list.filter((r) => r.created_at && r.created_at.startsWith(today)).length;
    const accepted = list.filter((r) => r.status === 'Accepted' || r.status === 'Connected').length;
    const total = list.length;
    res.json({
      requests_today: todayCount,
      total_requests: total,
      acceptance_rate: total ? Math.round((accepted / total) * 100) : 0,
    });
  } catch (err) {
    console.error('[EmergencyNetwork] analytics error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load analytics' });
  }
});

export default router;
