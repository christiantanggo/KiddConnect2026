/**
 * Tavari Delivery Network API.
 * Copy of emergency-network; delivery-specific: approved numbers, delivery_requests, broker dispatch.
 */
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { verifySubscriptionWithStripe } from '../../middleware/v2/verifySubscriptionWithStripe.js';
import { supabaseClient } from '../../config/database.js';
import { createDeliveryRequest } from '../../services/delivery-network/intake.js';
import { startDispatch } from '../../services/delivery-network/dispatch.js';
import { getDeliveryConfig, invalidateDeliveryConfigCache } from '../../services/delivery-network/config.js';
import { getEmergencyConfig } from '../../services/emergency-network/config.js';
import { getPhoneNumbersForBusiness } from '../../utils/businessPhoneNumbersForDropdown.js';
import { createDeliveryNetworkAssistant } from '../../services/delivery-network/create-vapi-assistant.js';
import { linkDeliveryAssistantToNumbers } from '../../services/delivery-network/linkAgent.js';
import { getAllVapiPhoneNumbers } from '../../services/vapi.js';

const router = express.Router();

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
        console.log(`[DeliveryNetwork] phone-numbers: ${result.length} from Telnyx`);
        return result;
      }
    } catch (err) {
      console.warn('[DeliveryNetwork] Telnyx phone_numbers failed, falling back to VAPI:', err?.message || err);
    }
  } else {
    console.warn('[DeliveryNetwork] TELNYX_API_KEY not set, using VAPI for phone-numbers');
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
    console.log(`[DeliveryNetwork] phone-numbers: ${result.length} from VAPI`);
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
    const config = await getDeliveryConfig();
    const numbers = config.delivery_phone_numbers || [];
    const phone = numbers.length > 0 ? numbers[0] : null;
    res.json({ phone });
  } catch (err) {
    console.error('[DeliveryNetwork] public/phone error:', err?.message || err);
    res.status(500).json({ phone: null });
  }
});

/**
 * GET /api/v2/emergency-network/public/transcript/:token
 * Public (no auth) view of the intake call transcript. Link is sent to providers via SMS/email after they accept.
 */
router.get('/public/transcript/:token', async (req, res) => {
  const token = req.params.token && String(req.params.token).trim();
  if (!token) {
    return res.status(404).send('Not found');
  }
  try {
    const { data: row, error } = await supabaseClient
      .from('delivery_requests')
      .select('intake_transcript')
      .eq('transcript_access_token', token)
      .single();
    if (error || !row) {
      return res.status(404).send('Not found');
    }
    const transcript = row.intake_transcript || '';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Call transcript</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    h1 { font-size: 1.25rem; margin-bottom: 16px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; padding: 16px; border-radius: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Intake call transcript</h1>
  <pre>${escapeHtml(transcript) || 'No transcript available.'}</pre>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[DeliveryNetwork] public/transcript error:', err?.message || err);
    res.status(500).send('Something went wrong.');
  }
});

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const WEBSITE_HERO_BUCKET = 'website-hero';
const uploadHero = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

/** Default content when no row exists (public and dashboard). */
const DEFAULT_WEBSITE_PAGE = {
  'emergency-main': { hero_image_url: '', hero_header: 'Need Help Right Now?', hero_subtext: 'Call our 24/7 local emergency network.', buttons: [{ label: 'CALL NOW — AVAILABLE 24/7', url: 'tel' }, { label: 'Text Us', url: 'sms' }, { label: 'Request Help Online', url: '#form' }] },
  'plumbing-main': { hero_image_url: '', hero_header: '24/7 Emergency Plumbing', hero_subtext: 'Leaks, clogs, no hot water—we connect you with licensed local plumbers.', buttons: [{ label: 'Call now — 24/7', url: 'tel' }, { label: 'Text us', url: 'sms' }, { label: 'Request help online', url: '#form' }] },
  'terms-of-service': { page_title: 'Terms of Service', page_subtext: 'Emergency Dispatch Service', sections: [{ id: '1', header: '', content: '' }] },
};

/**
 * GET /api/v2/emergency-network/public/website-page/:key
 * Public (no auth). Returns JSON content for the page (emergency-main | plumbing-main | terms-of-service).
 * Returns default content when no row exists so customer pages always load.
 */
router.get('/public/website-page/:key', async (req, res) => {
  const key = req.params.key && String(req.params.key).trim();
  if (!key || !['emergency-main', 'plumbing-main', 'terms-of-service'].includes(key)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { data, error } = await supabaseClient
      .from('website_page_content')
      .select('content')
      .eq('page_key', key)
      .single();
    if (error || !data) {
      return res.json(DEFAULT_WEBSITE_PAGE[key] || {});
    }
    let content = data.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch (_) {
        content = {};
      }
    }
    res.set('Cache-Control', 'public, max-age=60'); // allow short cache; updates (e.g. hero image) show within a minute
    res.json(content && typeof content === 'object' ? content : {});
  } catch (err) {
    console.error('[DeliveryNetwork] public/website-page error:', err?.message || err);
    res.status(500).json({ error: 'Failed to load page content' });
  }
});

/**
 * POST /api/v2/emergency-network/public/intake/chat
 * Web chat intake: same flow as SMS (one prompt, parse reply, follow-up if missing, then dispatch).
 * Body: { session_id?: string, message?: string }. If no message, returns initial prompt + session_id.
 */
router.post('/public/intake/chat', express.json(), async (req, res) => {
  try {
    const { session_id: clientSessionId, message } = req.body || {};
    const sessionId = typeof clientSessionId === 'string' && clientSessionId.trim()
      ? clientSessionId.trim()
      : null;
    const messageText = typeof message === 'string' ? message.trim() : '';

    const { handleWebIntake } = await import('../../services/delivery-network/sms-intake.js');

    const sid = sessionId || randomUUID();
    const result = await handleWebIntake(sid, messageText);
    res.json({ reply: result.reply, request_id: result.requestId || undefined, session_id: sid });
  } catch (err) {
    console.error('[DeliveryNetwork] public/intake/chat error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to process message' });
  }
});

/**
 * GET /api/v2/delivery-network/public/quote
 * Returns estimated amount_cents and disclaimer for display before submit. Query: business_id (optional).
 */
router.get('/public/quote', async (req, res) => {
  try {
    const businessId = req.query.business_id && String(req.query.business_id).trim() || null;
    const { getQuote } = await import('../../services/delivery-network/pricing.js');
    const quote = await getQuote(businessId);
    res.json(quote);
  } catch (err) {
    console.error('[DeliveryNetwork] public/quote error:', err?.message || err);
    res.status(500).json({ amount_cents: 2000, disclaimer: 'Final cost may vary.', currency: 'CAD' });
  }
});

/**
 * POST /api/v2/delivery-network/public/cancel
 * Cancellation: phone + delivery_address + delivery_date (YYYY-MM-DD). If multiple matches, reference_number required.
 */
function normalizePhoneForCancel(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

router.post('/public/cancel', express.json(), async (req, res) => {
  try {
    const { callback_phone, delivery_address, delivery_date, reference_number } = req.body || {};
    const phone = normalizePhoneForCancel(callback_phone);
    const address = delivery_address && String(delivery_address).trim();
    const dateStr = delivery_date && String(delivery_date).trim().slice(0, 10);
    if (!phone || !address || !dateStr) {
      return res.status(400).json({ error: 'callback_phone, delivery_address, and delivery_date are required' });
    }
    const ref = reference_number ? String(reference_number).trim() : null;

    const start = `${dateStr}T00:00:00.000Z`;
    const end = `${dateStr}T23:59:59.999Z`;
    const { data: rows, error } = await supabaseClient
      .from('delivery_requests')
      .select('id, reference_number, callback_phone, delivery_address, status, created_at')
      .in('status', ['New', 'Contacting', 'Dispatched', 'Assigned', 'PickedUp'])
      .gte('created_at', start)
      .lte('created_at', end)
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });

    const normalizedAddress = address.toLowerCase().replace(/\s+/g, ' ').trim();
    const matches = (rows || []).filter((r) => {
      const rPhone = normalizePhoneForCancel(r.callback_phone);
      const rAddr = (r.delivery_address || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const phoneMatch = rPhone === phone;
      const addrMatch = rAddr.includes(normalizedAddress) || normalizedAddress.includes(rAddr);
      if (!phoneMatch || !addrMatch) return false;
      if (ref) return (r.reference_number || '').toUpperCase() === ref.toUpperCase();
      return true;
    });

    if (matches.length === 0) {
      return res.status(404).json({ error: 'No matching delivery found for that phone, address, and date' });
    }
    if (matches.length > 1 && !ref) {
      return res.status(400).json({
        error: 'Multiple deliveries match. Please provide reference_number.',
        reference_numbers: matches.map((m) => m.reference_number),
      });
    }

    const target = matches[0];
    const { error: updateErr } = await supabaseClient
      .from('delivery_requests')
      .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
      .eq('id', target.id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });
    res.json({ success: true, message: 'Delivery cancelled.', reference_number: target.reference_number });
  } catch (err) {
    console.error('[DeliveryNetwork] public/cancel error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Cancellation failed' });
  }
});

/**
 * POST /api/v2/delivery-network/request
 * Form submission. Creates delivery request. Business requests: dispatch immediately. Individual (no business_id): return payment link, dispatch after payment.
 */
router.post('/request', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const callback_phone = body.phone || body.callback_phone;
    if (!callback_phone || !String(callback_phone).trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const delivery_address = body.delivery_address || body.address || body.address_or_postal_code;
    if (!delivery_address || !String(delivery_address).trim()) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }

    const businessId = body.business_id && String(body.business_id).trim() ? body.business_id.trim() : null;
    const isIndividual = !businessId;

    const request = await createDeliveryRequest({
      business_id: businessId,
      caller_phone: body.caller_phone || null,
      callback_phone: String(callback_phone).trim(),
      delivery_address: String(delivery_address).trim(),
      recipient_name: body.recipient_name || body.name || null,
      recipient_phone: body.recipient_phone || null,
      package_description: body.package_description || body.issue_description || null,
      package_size: body.package_size || null,
      package_weight: body.package_weight || null,
      special_instructions: body.special_instructions || null,
      priority: body.priority === 'Immediate' || body.priority === 'Same Day' ? body.priority : 'Schedule',
      scheduled_date: body.scheduled_date?.trim() || null,
      scheduled_time: body.scheduled_time?.trim() || null,
      intake_channel: 'form',
      payment_status: isIndividual ? 'pending_payment' : null,
    });

    if (isIndividual) {
      try {
        const { createPaymentLinkForDelivery, DEFAULT_AMOUNT_CENTS } = await import('../../services/delivery-network/payment.js');
        const baseUrl = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'https://api.kiddconnect.com';
        const successUrl = `${baseUrl.replace(/\/$/, '')}/deliverydispatch?paid=1&ref=${encodeURIComponent(request.reference_number)}`;
        const cancelUrl = `${baseUrl.replace(/\/$/, '')}/deliverydispatch?cancel=1`;
        const amountCents = body.amount_quoted_cents != null ? Math.max(50, parseInt(body.amount_quoted_cents, 10)) : DEFAULT_AMOUNT_CENTS;
        const { url } = await createPaymentLinkForDelivery(request.id, amountCents, successUrl, cancelUrl, body.email || null);
        const { sendEmail } = await import('../../services/notifications.js');
        if (body.email && String(body.email).trim()) {
          const subject = `Complete your delivery payment — ${request.reference_number}`;
          const bodyText = `Pay for your delivery here: ${url}\n\nReference: ${request.reference_number}`;
          sendEmail(body.email.trim(), subject, bodyText, null, 'Tavari Delivery', null).catch((e) => console.warn('[DeliveryNetwork] Payment link email failed', e?.message));
        }
        return res.status(201).json({
          success: true,
          message: 'Please pay to confirm your delivery. We’ll schedule it once payment is received.',
          request_id: request.id,
          reference_number: request.reference_number,
          payment_required: true,
          payment_link_url: url,
        });
      } catch (payErr) {
        console.error('[DeliveryNetwork] Payment link creation error:', payErr?.message || payErr);
        return res.status(500).json({ error: 'Request created but payment link could not be generated. Please contact support with reference ' + request.reference_number });
      }
    }

    startDispatch(request.id).catch((err) =>
      console.error('[DeliveryNetwork] startDispatch error:', err?.message || err)
    );

    res.status(201).json({
      success: true,
      message: "Thanks — we're scheduling your delivery. You'll get updates shortly.",
      request_id: request.id,
      reference_number: request.reference_number,
    });
  } catch (err) {
    console.error('[DeliveryNetwork] Form submit error:', err?.message || err);
    res.status(500).json({ error: 'Could not submit request. Please try again or call us.' });
  }
});

// ---------- AUTHENTICATED (dashboard): require active delivery-dispatch subscription (same billing as rest of app) ----------
router.use(authenticate);
router.use(requireBusinessContext);
router.use((req, res, next) => {
  req.module_key = 'delivery-dispatch';
  next();
});
router.use(verifySubscriptionWithStripe);

function getVapiWebhookUrl() {
  let base = process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL || process.env.SERVER_URL || 'https://api.kiddconnect.com';
  if (base && !base.startsWith('http')) base = `https://${base}`;
  return `${base}/api/vapi/webhook`;
}

/**
 * GET /api/v2/emergency-network/config
 * Get emergency config (phone numbers, assistant id, max_dispatch_attempts, webhook_url for VAPI setup).
 */
router.get('/config', async (req, res) => {
  try {
    const config = await getDeliveryConfig();
    res.json({ ...config, webhook_url: getVapiWebhookUrl() });
  } catch (err) {
    console.error('[DeliveryNetwork] config get error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load config' });
  }
});

/**
 * GET /api/v2/delivery-network/phone-numbers
 * List phone numbers assigned to this business for the delivery config dropdown (not the full Tavari pool).
 * Excludes numbers already assigned to the emergency dispatch so the same number cannot be used for both.
 */
router.get('/phone-numbers', async (req, res) => {
  try {
    const businessNumbers = await getPhoneNumbersForBusiness(req.business);
    const emergencyConfig = await getEmergencyConfig();
    const emergencyNumbers = new Set(
      (emergencyConfig?.emergency_phone_numbers || [])
        .map((n) => normalizeE164(n))
        .filter(Boolean)
    );
    const phone_numbers = businessNumbers.filter((pn) => {
      const e164 = pn.e164 || pn.number;
      return e164 && !emergencyNumbers.has(normalizeE164(e164));
    });
    res.json({ phone_numbers });
  } catch (err) {
    console.error('[DeliveryNetwork] phone-numbers get error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load phone numbers' });
  }
});

/**
 * POST /api/v2/emergency-network/create-agent
 * Create the Emergency Network VAPI assistant and save its ID to config.
 */
router.post('/create-agent', async (req, res) => {
  try {
    const assistant = await createDeliveryNetworkAssistant();
    const assistantId = assistant.id;

    const { data: row, error: fetchError } = await supabaseClient
      .from('delivery_network_config')
      .select('value')
      .eq('key', 'settings')
      .single();

    const current = (fetchError || !row) ? {} : (row.value && typeof row.value === 'object' ? row.value : {});
    const newValue = { ...current, delivery_vapi_assistant_id: assistantId };

    const { error: upsertError } = await supabaseClient
      .from('delivery_network_config')
      .upsert({ key: 'settings', value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (upsertError) {
      return res.status(500).json({ error: 'Agent created but failed to save config: ' + upsertError.message });
    }
    invalidateDeliveryConfigCache();

    // Attach the new agent to emergency dispatch phone number(s) in VAPI
    const numbers = Array.isArray(newValue.delivery_phone_numbers) ? newValue.delivery_phone_numbers : [];
    if (numbers.length > 0) {
      try {
        const linkResult = await linkDeliveryAssistantToNumbers(assistantId, numbers);
        if (linkResult.linked.length) {
          console.log('[DeliveryNetwork] create-agent: linked to', linkResult.linked.length, 'number(s) in VAPI');
        }
        if (linkResult.notInVapi.length) {
          console.warn('[DeliveryNetwork] create-agent: numbers not in VAPI (link in VAPI or add to Telnyx first):', linkResult.notInVapi);
        }
        if (linkResult.errors.length) {
          console.warn('[DeliveryNetwork] create-agent: link errors', linkResult.errors);
        }
      } catch (linkErr) {
        console.warn('[DeliveryNetwork] create-agent: link to numbers failed (non-blocking)', linkErr?.message || linkErr);
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
    console.error('[DeliveryNetwork] create-agent error:', err?.message || err, vapiBody ? { status, vapiBody } : '');
    const message = vapiMessage || err?.message || 'Failed to create agent';
    res.status(status === 400 ? 400 : 500).json({ error: message });
  }
});

/**
 * POST /api/v2/emergency-network/link-agent
 * Explicitly link the emergency assistant to all configured delivery_phone_numbers in VAPI.
 * Use this to "attach" the agent to the dispatch number(s) if it was not done on config save.
 */
router.post('/link-agent', async (req, res) => {
  try {
    const config = await getDeliveryConfig();
    const assistantId = config.delivery_vapi_assistant_id || null;
    const numbers = config.delivery_phone_numbers || [];
    if (!assistantId) {
      return res.status(400).json({ error: 'No emergency assistant configured. Create an agent first.', linked: [], notInVapi: [], errors: [] });
    }
    if (numbers.length === 0) {
      return res.status(400).json({ error: 'No emergency phone numbers configured. Add at least one number in Settings.', linked: [], notInVapi: [], errors: [] });
    }
    const result = await linkDeliveryAssistantToNumbers(assistantId, numbers);
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
    console.error('[DeliveryNetwork] link-agent error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to link agent', linked: [], notInVapi: [], errors: [] });
  }
});

/**
 * GET /api/v2/emergency-network/website-pages
 * List all website page content keys and content (for dashboard).
 */
router.get('/website-pages', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('website_page_content')
      .select('page_key, content, updated_at')
      .order('page_key');
    if (error) throw error;
    res.json({ pages: data || [] });
  } catch (err) {
    console.error('[DeliveryNetwork] website-pages list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load website pages', pages: [] });
  }
});

/**
 * GET /api/v2/emergency-network/website-pages/:key
 * Get one page content by key. Returns default content when no row exists (so UI and upload work before migration).
 */
router.get('/website-pages/:key', async (req, res) => {
  const key = req.params.key && String(req.params.key).trim();
  if (!key || !['emergency-main', 'plumbing-main', 'terms-of-service'].includes(key)) {
    return res.status(400).json({ error: 'Invalid page key' });
  }
  try {
    const { data, error } = await supabaseClient
      .from('website_page_content')
      .select('page_key, content, updated_at')
      .eq('page_key', key)
      .single();
    if (error || !data) {
      const content = DEFAULT_WEBSITE_PAGE[key] || {};
      return res.json({ page_key: key, content, updated_at: null });
    }
    res.json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] website-pages get error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load page' });
  }
});

/**
 * PUT /api/v2/emergency-network/website-pages/:key
 * Update page content. Body: { content } (full JSON for the page). Upserts so first save works when no row exists.
 */
router.put('/website-pages/:key', express.json(), async (req, res) => {
  const key = req.params.key && String(req.params.key).trim();
  if (!key || !['emergency-main', 'plumbing-main', 'terms-of-service'].includes(key)) {
    return res.status(400).json({ error: 'Invalid page key' });
  }
  const content = req.body?.content;
  if (content === undefined || typeof content !== 'object') {
    return res.status(400).json({ error: 'Body must include content (object)' });
  }
  try {
    const { data, error } = await supabaseClient
      .from('website_page_content')
      .upsert({ page_key: key, content, updated_at: new Date().toISOString() }, { onConflict: 'page_key' })
      .select('page_key, content, updated_at')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] website-pages put error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to save page' });
  }
});

/**
 * POST /api/v2/emergency-network/website-pages/upload-hero
 * Upload hero image. Multipart field: file. Query: page_key (emergency-main | plumbing-main).
 * Returns { url } (public URL to use in hero_image_url).
 */
router.post('/website-pages/upload-hero', uploadHero.single('file'), async (req, res) => {
  const pageKey = req.query?.page_key && String(req.query.page_key).trim();
  if (!pageKey || !['emergency-main', 'plumbing-main'].includes(pageKey)) {
    return res.status(400).json({ error: 'Query page_key required: emergency-main or plumbing-main' });
  }
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No file uploaded. Use multipart field "file".' });
  }
  const ext = (req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/gif' ? 'gif' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg');
  const path = `${pageKey}/${Date.now()}.${ext}`;
  try {
    const { error: uploadErr } = await supabaseClient.storage
      .from(WEBSITE_HERO_BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabaseClient.storage.from(WEBSITE_HERO_BUCKET).getPublicUrl(path);
    res.json({ url: urlData?.publicUrl ?? '' });
  } catch (err) {
    console.error('[DeliveryNetwork] upload-hero error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Upload failed' });
  }
});

/**
 * PUT /api/v2/emergency-network/config
 * Update config (delivery_phone_numbers, delivery_vapi_assistant_id, max_dispatch_attempts).
 */
router.put('/config', express.json(), async (req, res) => {
  try {
    const { delivery_phone_numbers, delivery_vapi_assistant_id, max_dispatch_attempts, notification_email, notification_sms_number, email_enabled, sms_enabled, escalation_email_enabled, escalation_sms_enabled, customer_sms_enabled, customer_sms_message, customer_sms_legal, terms_of_service_url, intake_fields, opening_greeting, service_line_name, custom_instructions, customer_callback_message, billing } = req.body || {};
    const updates = {};
    if (Array.isArray(delivery_phone_numbers)) updates.delivery_phone_numbers = delivery_phone_numbers;
    if (delivery_vapi_assistant_id !== undefined) updates.delivery_vapi_assistant_id = delivery_vapi_assistant_id || null;
    if (typeof max_dispatch_attempts === 'number') updates.max_dispatch_attempts = max_dispatch_attempts;
    if (notification_email !== undefined) updates.notification_email = notification_email ? String(notification_email).trim() || null : null;
    if (notification_sms_number !== undefined) updates.notification_sms_number = notification_sms_number ? String(notification_sms_number).trim() || null : null;
    if (email_enabled !== undefined) updates.email_enabled = !!email_enabled;
    if (sms_enabled !== undefined) updates.sms_enabled = !!sms_enabled;
    if (escalation_email_enabled !== undefined) updates.escalation_email_enabled = !!escalation_email_enabled;
    if (escalation_sms_enabled !== undefined) updates.escalation_sms_enabled = !!escalation_sms_enabled;
    if (customer_sms_enabled !== undefined) updates.customer_sms_enabled = !!customer_sms_enabled;
    if (customer_sms_message !== undefined) updates.customer_sms_message = customer_sms_message ? String(customer_sms_message).trim() || null : null;
    if (customer_sms_legal !== undefined) updates.customer_sms_legal = customer_sms_legal ? String(customer_sms_legal).trim() || null : null;
    if (terms_of_service_url !== undefined) updates.terms_of_service_url = terms_of_service_url ? String(terms_of_service_url).trim() || null : null;
    if (opening_greeting !== undefined) updates.opening_greeting = opening_greeting ? String(opening_greeting).trim() || null : null;
    if (service_line_name !== undefined) updates.service_line_name = service_line_name ? String(service_line_name).trim() || null : null;
    if (custom_instructions !== undefined) updates.custom_instructions = custom_instructions ? String(custom_instructions).trim() || null : null;
    if (customer_callback_message !== undefined) updates.customer_callback_message = customer_callback_message ? String(customer_callback_message).trim() || null : null;
    if (billing !== undefined && billing !== null && typeof billing === 'object') {
      updates.billing = {
        price_basic_cents: typeof billing.price_basic_cents === 'number' ? billing.price_basic_cents : undefined,
        price_priority_cents: typeof billing.price_priority_cents === 'number' ? billing.price_priority_cents : undefined,
        price_premium_cents: typeof billing.price_premium_cents === 'number' ? billing.price_premium_cents : undefined,
        sms_fee_cents: typeof billing.sms_fee_cents === 'number' ? billing.sms_fee_cents : undefined,
      };
      Object.keys(updates.billing).forEach((k) => { if (updates.billing[k] === undefined) delete updates.billing[k]; });
    }
    if (intake_fields !== undefined && Array.isArray(intake_fields)) {
      updates.intake_fields = intake_fields.map((f) => ({
        key: String(f.key || '').trim() || undefined,
        label: String(f.label || '').trim() || undefined,
        required: !!f.required,
        enabled: f.enabled !== false,
      })).filter((f) => f.key);
    }

    const { data: row, error } = await supabaseClient
      .from('delivery_network_config')
      .select('value')
      .eq('key', 'settings')
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    const current = (row?.value || {}) instanceof Object ? row.value : {};
    const newValue = { ...current, ...updates };
    if (updates.billing) {
      newValue.billing = { ...(current.billing || {}), ...updates.billing };
    }

    const { error: upsertErr } = await supabaseClient
      .from('delivery_network_config')
      .upsert({ key: 'settings', value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (upsertErr) {
      const msg = upsertErr.message || 'Database error';
      const isMissingTable = msg.includes('relation') && msg.includes('does not exist') || upsertErr.code === '42P01';
      return res.status(500).json({
        error: isMissingTable
          ? 'Delivery config table missing. Run migration: migrations/add_delivery_network.sql'
          : msg,
      });
    }
    invalidateDeliveryConfigCache();
    const finalConfig = await getDeliveryConfig();
    const assistantId = finalConfig.delivery_vapi_assistant_id || null;
    const numbers = finalConfig.delivery_phone_numbers || [];
    let linkResult = { linked: [], notInVapi: [], errors: [] };
    if (assistantId && numbers.length > 0) {
      try {
        linkResult = await linkDeliveryAssistantToNumbers(assistantId, numbers);
        if (linkResult.linked.length) {
          console.log('[DeliveryNetwork] config: linked emergency agent to', linkResult.linked.length, 'number(s) in VAPI');
        }
        if (linkResult.notInVapi.length) {
          console.warn('[DeliveryNetwork] config: numbers not in VAPI:', linkResult.notInVapi);
        }
        if (linkResult.errors.length) {
          console.warn('[DeliveryNetwork] config: link errors', linkResult.errors);
        }
      } catch (linkErr) {
        console.warn('[DeliveryNetwork] config: link to numbers failed (non-blocking)', linkErr?.message || linkErr);
        linkResult.errors.push(linkErr?.message || String(linkErr));
      }
    }
    res.json({ ...finalConfig, link_result: linkResult });
  } catch (err) {
    console.error('[DeliveryNetwork] config put error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update config' });
  }
});

/**
 * GET /api/v2/emergency-network/requests
 * Live request feed: name, phone, service, urgency, location, intake_channel, status, created_at.
 */
router.get('/requests', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    let query = supabaseClient
      .from('delivery_requests')
      .select('id, reference_number, caller_phone, callback_phone, pickup_address, delivery_address, recipient_name, package_description, priority, intake_channel, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (businessId) query = query.eq('business_id', businessId);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ requests: data || [] });
  } catch (err) {
    console.error('[DeliveryNetwork] requests list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load requests' });
  }
});

/**
 * POST /api/v2/delivery-network/requests
 * Customer (business) creates a new delivery request from the dashboard. Authenticated; business_id = req.active_business_id.
 */
router.post('/requests', express.json(), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) {
      return res.status(400).json({ error: 'Business context required' });
    }
    const body = req.body || {};
    const callback_phone = body.callback_phone || body.phone;
    if (!callback_phone || !String(callback_phone).trim()) {
      return res.status(400).json({ error: 'Contact phone is required' });
    }
    const delivery_address = body.delivery_address || body.address;
    if (!delivery_address || !String(delivery_address).trim()) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }

    const request = await createDeliveryRequest({
      business_id: businessId,
      callback_phone: String(callback_phone).trim(),
      pickup_address: body.pickup_address?.trim() || null,
      delivery_address: String(delivery_address).trim(),
      recipient_name: body.recipient_name?.trim() || null,
      recipient_phone: body.recipient_phone?.trim() || null,
      package_description: body.package_description?.trim() || null,
      special_instructions: body.special_instructions?.trim() || null,
      priority: body.priority === 'Immediate' || body.priority === 'Same Day' ? body.priority : 'Schedule',
      scheduled_date: body.scheduled_date?.trim() || null,
      scheduled_time: body.scheduled_time?.trim() || null,
      intake_channel: 'dashboard',
    });

    startDispatch(request.id).catch((err) =>
      console.error('[DeliveryNetwork] startDispatch error:', err?.message || err)
    );

    res.status(201).json({
      success: true,
      message: "We're scheduling your delivery. You'll get updates as it progresses.",
      request_id: request.id,
      reference_number: request.reference_number,
    });
  } catch (err) {
    console.error('[DeliveryNetwork] create request error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Could not create delivery request. Please try again.' });
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
      .from('delivery_requests')
      .select('id')
      .eq('id', requestId)
      .single();
    if (fetchErr || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    await supabaseClient.from('delivery_dispatch_calls').delete().eq('delivery_request_id', requestId);
    await supabaseClient.from('delivery_dispatch_log').delete().eq('delivery_request_id', requestId);
    const { error: updateErr } = await supabaseClient
      .from('delivery_requests')
      .update({ status: 'New', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (updateErr) {
      return res.status(500).json({ error: 'Failed to reset status: ' + (updateErr.message || updateErr) });
    }
    res.json({ success: true, message: 'Dispatch reset. You can retry dispatch again.' });
  } catch (err) {
    console.error('[DeliveryNetwork] reset-dispatch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to reset dispatch' });
  }
});

/**
 * POST /api/v2/delivery-network/requests/:id/retry-dispatch
 * Manually retry dispatch (send to broker again).
 */
router.post('/requests/:id/call-provider', async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { data: request, error: fetchErr } = await supabaseClient
      .from('delivery_requests')
      .select('id, status')
      .eq('id', requestId)
      .single();
    if (fetchErr || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (!['New', 'Contacting'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot retry dispatch when status is "${request.status}".` });
    }
    await startDispatch(requestId);
    res.json({ success: true, message: 'Dispatch retry initiated.' });
  } catch (err) {
    console.error('[DeliveryNetwork] retry-dispatch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to retry dispatch' });
  }
});

/**
 * DELETE /api/v2/emergency-network/requests/:id
 * Permanently delete a service request and its dispatch log, activity, etc. (DB cascades).
 */
router.delete('/requests/:id', async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { data: deleted, error: deleteErr } = await supabaseClient
      .from('delivery_requests')
      .delete()
      .eq('id', requestId)
      .select('id');
    if (deleteErr) {
      return res.status(deleteErr.code === 'PGRST116' ? 404 : 500).json({ error: deleteErr.message || 'Failed to delete request' });
    }
    if (!deleted || deleted.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DeliveryNetwork] delete request error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to delete request' });
  }
});

const DELIVERY_ALLOWED_STATUSES = ['New', 'Contacting', 'Dispatched', 'Assigned', 'PickedUp', 'Completed', 'Failed', 'Cancelled', 'Needs Manual Assist'];

/**
 * PATCH /api/v2/delivery-network/requests/:id
 * Update request status only (delivery statuses).
 */
router.patch('/requests/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status || !DELIVERY_ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Valid status required', allowed: DELIVERY_ALLOWED_STATUSES });
    }
    const { data: current } = await supabaseClient.from('delivery_requests').select('status').eq('id', id).single();
    const updates = { updated_at: new Date().toISOString(), status };
    const { data, error } = await supabaseClient.from('delivery_requests').update(updates).eq('id', id).select().single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    try {
      const { logRequestActivity } = await import('../../services/delivery-network/activity.js');
      await logRequestActivity(id, 'status_change', { from_status: current?.status, to_status: status, source: 'manual', changed_by: 'Dashboard' });
    } catch (logErr) {
      console.error('[DeliveryNetwork] PATCH activity log failed for request', id, logErr?.message || logErr);
    }
    res.json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] request patch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update request' });
  }
});

/**
 * GET /api/v2/delivery-network/approved-numbers
 * Approved caller numbers for this business (for caller→business resolution).
 */
router.get('/approved-numbers', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { data, error } = await supabaseClient
      .from('delivery_approved_numbers')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ approved_numbers: data || [] });
  } catch (err) {
    console.error('[DeliveryNetwork] approved-numbers list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load approved numbers' });
  }
});

/**
 * POST /api/v2/delivery-network/approved-numbers
 */
router.post('/approved-numbers', express.json(), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { phone_number, label } = req.body || {};
    if (!phone_number || !String(phone_number).trim()) {
      return res.status(400).json({ error: 'phone_number is required' });
    }
    const payload = {
      business_id: businessId,
      phone_number: String(phone_number).trim().replace(/^(\d{10})$/, '+1$1').replace(/^(\d{11})$/, '+$1'),
      label: label ? String(label).trim() || null : null,
    };
    const { data, error } = await supabaseClient.from('delivery_approved_numbers').insert(payload).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] approved-numbers create error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to add approved number' });
  }
});

/**
 * PATCH /api/v2/delivery-network/approved-numbers/:id
 */
router.patch('/approved-numbers/:id', express.json(), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { id } = req.params;
    const { phone_number, label } = req.body || {};
    const updates = {};
    if (phone_number !== undefined) updates.phone_number = String(phone_number).trim();
    if (label !== undefined) updates.label = label ? String(label).trim() || null : null;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });
    const { data, error } = await supabaseClient
      .from('delivery_approved_numbers')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] approved-numbers patch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update' });
  }
});

/**
 * DELETE /api/v2/delivery-network/approved-numbers/:id
 */
router.delete('/approved-numbers/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { id } = req.params;
    const { error } = await supabaseClient
      .from('delivery_approved_numbers')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.status(204).end();
  } catch (err) {
    console.error('[DeliveryNetwork] approved-numbers delete error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to delete' });
  }
});

/**
 * GET /api/v2/delivery-network/saved-locations
 */
router.get('/saved-locations', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { data, error } = await supabaseClient
      .from('delivery_saved_locations')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ saved_locations: data || [] });
  } catch (err) {
    console.error('[DeliveryNetwork] saved-locations list error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load saved locations' });
  }
});

/**
 * POST /api/v2/delivery-network/saved-locations
 */
router.post('/saved-locations', express.json(), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { type, name, address, contact } = req.body || {};
    if (!type || !['default_pickup', 'named_pickup', 'frequent_delivery'].includes(type)) {
      return res.status(400).json({ error: 'type must be default_pickup, named_pickup, or frequent_delivery' });
    }
    const payload = {
      business_id: businessId,
      type,
      name: name ? String(name).trim() || null : null,
      address: address ? String(address).trim() || null : null,
      contact: contact ? String(contact).trim() || null : null,
    };
    const { data, error } = await supabaseClient.from('delivery_saved_locations').insert(payload).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] saved-locations create error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to add saved location' });
  }
});

/**
 * PATCH /api/v2/delivery-network/saved-locations/:id
 */
router.patch('/saved-locations/:id', express.json(), async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { id } = req.params;
    const { type, name, address, contact } = req.body || {};
    const updates = {};
    if (type && ['default_pickup', 'named_pickup', 'frequent_delivery'].includes(type)) updates.type = type;
    if (name !== undefined) updates.name = name ? String(name).trim() || null : null;
    if (address !== undefined) updates.address = address ? String(address).trim() || null : null;
    if (contact !== undefined) updates.contact = contact ? String(contact).trim() || null : null;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from('delivery_saved_locations')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single();
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[DeliveryNetwork] saved-locations patch error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to update' });
  }
});

/**
 * DELETE /api/v2/delivery-network/saved-locations/:id
 */
router.delete('/saved-locations/:id', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const { id } = req.params;
    const { error } = await supabaseClient
      .from('delivery_saved_locations')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message });
    res.status(204).end();
  } catch (err) {
    console.error('[DeliveryNetwork] saved-locations delete error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to delete' });
  }
});

/**
 * GET /api/v2/delivery-network/dispatch-log?request_id=xxx
 * Returns broker attempt log for delivery requests.
 */
router.get('/dispatch-log', async (req, res) => {
  try {
    const requestId = req.query.request_id;
    let q = supabaseClient
      .from('delivery_dispatch_log')
      .select('id, delivery_request_id, broker_id, attempt_order, result, attempted_at, broker_job_id, cost_quote_cents')
      .order('attempted_at', { ascending: false });
    if (requestId) q = q.eq('delivery_request_id', requestId);
    const { data, error } = await q.limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ log: data || [] });
  } catch (err) {
    console.error('[DeliveryNetwork] dispatch-log error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load dispatch log' });
  }
});

/**
 * GET /api/v2/delivery-network/requests/:id/activity
 * Request-level activity (optional MVP: no delivery_activity table yet).
 */
router.get('/requests/:id/activity', async (req, res) => {
  try {
    res.json({ activity: [] });
  } catch (err) {
    console.error('[DeliveryNetwork] GET request activity exception', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load activity' });
  }
});

/**
 * GET /api/v2/delivery-network/analytics
 * requests/day, dispatch rate (Dispatched or Completed).
 */
router.get('/analytics', async (req, res) => {
  try {
    const businessId = req.active_business_id;
    if (!businessId) return res.status(400).json({ error: 'Business context required' });
    const today = new Date().toISOString().slice(0, 10);
    const { data: requests, error } = await supabaseClient
      .from('delivery_requests')
      .select('id, status, created_at')
      .eq('business_id', businessId);
    if (error) {
      console.error('[DeliveryNetwork] analytics query error:', error.message);
      return res.status(500).json({ error: error.message || 'Failed to load analytics' });
    }
    const list = requests || [];
    const todayCount = list.filter((r) => r.created_at && String(r.created_at).startsWith(today)).length;
    const dispatched = list.filter((r) => r.status === 'Dispatched' || r.status === 'Completed').length;
    const total = list.length;
    res.json({
      requests_today: todayCount,
      total_requests: total,
      dispatch_rate: total ? Math.round((dispatched / total) * 100) : 0,
    });
  } catch (err) {
    console.error('[DeliveryNetwork] analytics error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to load analytics' });
  }
});

export default router;
