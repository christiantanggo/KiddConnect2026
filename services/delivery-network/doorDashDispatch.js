/**
 * DoorDash Drive v2: quote → accept → dispatched (no Shipday).
 */
import axios from 'axios';
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull } from './config.js';
import { createDoorDashDriveJwt, getDoorDashBrokerFromConfig } from './doorDashDriveAuth.js';
import {
  buildFullDeliveryAddress,
  buildFullPickupAddress,
  inferDoorDashLocale,
} from './deliveryAddresses.js';
import { calculateDeliveryPrice } from './pricingEngine.js';
import { localToUTC, toHHmmss } from './shipdayTime.js';

const LOG = '[DeliveryNetwork][DoorDash]';

const EXTERNAL_ID_MAX = 64;

function queueRevertToNew(deliveryRequestId, requestRow, detail) {
  const prev = requestRow?.status || null;
  import('./deliveryCustomerNotifications.js')
    .then(({ queueDeliveryStatusNotifications }) => {
      queueDeliveryStatusNotifications(prev, 'New', deliveryRequestId, null, {
        source: 'system',
        changed_by: 'DoorDash dispatch',
        detail: detail || null,
      });
    })
    .catch(() => {});
}

function previewText(s, maxLen = 64) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '(empty)';
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function summarizeResponseData(data, maxLen = 1500) {
  if (data == null || data === '') return '(empty)';
  if (typeof data === 'string') return data.length > maxLen ? `${data.slice(0, maxLen)}…` : data;
  try {
    const j = JSON.stringify(data);
    return j.length > maxLen ? `${j.slice(0, maxLen)}…` : j;
  } catch {
    return String(data).slice(0, maxLen);
  }
}

/** DoorDash external_delivery_id: [a-zA-Z0-9-._~]+ */
function sanitizeExternalDeliveryId(referenceNumber, deliveryRequestId) {
  const ref = String(referenceNumber || '').trim();
  const base = ref ? ref.replace(/[^a-zA-Z0-9-._~]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : '';
  const idShort = String(deliveryRequestId || '').replace(/-/g, '').slice(0, 12);
  let out = base || `tavari-${idShort}`;
  if (out.length > EXTERNAL_ID_MAX) out = out.slice(0, EXTERNAL_ID_MAX);
  if (!/^[a-zA-Z0-9-._~]+$/.test(out) || out.length < 3) {
    out = `tavari-${idShort}`;
  }
  return out;
}

function splitRecipientName(name) {
  const s = String(name || '').trim();
  if (!s) return { given: 'Customer', family: 'Recipient' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { given: parts[0].slice(0, 40), family: 'Customer' };
  return {
    given: parts[0].slice(0, 40),
    family: parts.slice(1).join(' ').slice(0, 40),
  };
}

function sanitizeInstruction(text, maxLen) {
  const t = String(text || '')
    .replace(/[^\w\s,.#\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, maxLen) || 'See order details';
}

/**
 * @param {object} params
 * @param {string} params.deliveryRequestId
 * @param {string} params.logRowId
 * @param {object} params.request - delivery_requests row
 */
export async function runDoorDashDispatch({ deliveryRequestId, logRowId, request }) {
  const config = await getDeliveryConfigFull();
  const creds = getDoorDashBrokerFromConfig(config);
  if (!creds) {
    console.error(`${LOG} abort: credentials missing or broker disabled`, {
      delivery_request_id: deliveryRequestId,
      dispatch_log_id: logRowId,
    });
    await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRowId);
    await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
    queueRevertToNew(deliveryRequestId, request, { reason: 'doordash_credentials_missing' });
    return;
  }

  const pickupPhone =
    (Array.isArray(config?.delivery_phone_numbers) && config.delivery_phone_numbers[0]
      ? String(config.delivery_phone_numbers[0]).trim()
      : null) || '+10000000000';
  const dropoffPhone =
    (request.callback_phone && String(request.callback_phone).trim()) ||
    (request.recipient_phone && String(request.recipient_phone).trim()) ||
    pickupPhone;

  const pickupAddress = buildFullPickupAddress(request);
  const dropoffAddress = buildFullDeliveryAddress(request);
  const locale = inferDoorDashLocale(request);
  const externalId = sanitizeExternalDeliveryId(request.reference_number, deliveryRequestId);
  const { given, family } = splitRecipientName(request.recipient_name);
  // Merchandise subtotal for DoorDash (not Tavari customer quote). Fee quote is separate in the API response.
  const orderValueCents = 1999;

  let businessTimezone = 'America/Toronto';
  if (request.business_id) {
    const { data: biz } = await supabaseClient.from('businesses').select('timezone').eq('id', request.business_id).single();
    if (biz?.timezone && String(biz.timezone).trim()) businessTimezone = String(biz.timezone).trim();
  }

  const priority = (request.priority || '').toLowerCase();
  let pickup_time;
  let dropoff_time;
  const now = new Date();
  if (priority === 'immediate') {
    pickup_time = new Date(now.getTime() + 20 * 60 * 1000).toISOString();
    dropoff_time = new Date(now.getTime() + 55 * 60 * 1000).toISOString();
  } else if (priority === 'same day') {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: businessTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(now)
      .replace(/\//g, '-');
    const utc = localToUTC(today, '17:00', businessTimezone);
    if (utc) {
      const drop = new Date(`${utc.date}T${utc.time}Z`);
      dropoff_time = drop.toISOString();
      pickup_time = new Date(drop.getTime() - 45 * 60 * 1000).toISOString();
    }
  } else if (priority === 'schedule' && request.scheduled_date) {
    const d = String(request.scheduled_date).trim().slice(0, 10);
    const t = toHHmmss(request.scheduled_time) || '13:00:00';
    const utc = localToUTC(d, t, businessTimezone);
    if (utc) {
      const drop = new Date(`${utc.date}T${utc.time}Z`);
      dropoff_time = drop.toISOString();
      pickup_time = new Date(drop.getTime() - 45 * 60 * 1000).toISOString();
    }
  }
  if (!dropoff_time) {
    dropoff_time = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    pickup_time = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
  }
  if (!pickup_time) {
    pickup_time = new Date(new Date(dropoff_time).getTime() - 45 * 60 * 1000).toISOString();
  }

  const instr = [request.special_instructions, request.package_description].filter(Boolean).join('. ');
  const quoteBody = {
    external_delivery_id: externalId,
    locale,
    order_fulfillment_method: 'standard',
    pickup_address: pickupAddress,
    pickup_business_name: 'Pickup',
    pickup_phone_number: pickupPhone,
    pickup_instructions: sanitizeInstruction(instr, 60),
    dropoff_address: dropoffAddress,
    dropoff_phone_number: dropoffPhone,
    dropoff_instructions: sanitizeInstruction(instr, 60),
    dropoff_contact_given_name: given,
    dropoff_contact_family_name: family,
    dropoff_contact_send_notifications: true,
    order_value: orderValueCents,
    pickup_time,
    dropoff_time,
  };

  let token;
  try {
    token = createDoorDashDriveJwt(creds);
  } catch (e) {
    console.error('[DeliveryNetwork] DoorDash JWT failed', e?.message || e);
    await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRowId);
    await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
    queueRevertToNew(deliveryRequestId, request, { reason: 'doordash_jwt_failed' });
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const apiBase = creds.base_url;
  const quotesUrl = `${apiBase}/drive/v2/quotes`;

  try {
    console.log(`${LOG} POST quote`, { url: quotesUrl, external_delivery_id: externalId });
    const quoteRes = await axios.post(quotesUrl, quoteBody, {
      headers,
      timeout: 35000,
      validateStatus: () => true,
    });

    const quoteSummary = {
      http_status: quoteRes.status,
      delivery_status: quoteRes.data?.delivery_status ?? null,
      fee: quoteRes.data?.fee ?? null,
      currency: quoteRes.data?.currency ?? null,
      tracking_url: quoteRes.data?.tracking_url || null,
    };
    console.log(`${LOG} quote response`, { external_delivery_id: externalId, ...quoteSummary });

    if (quoteRes.status < 200 || quoteRes.status >= 300) {
      const fe = quoteRes.data?.field_errors;
      const hint =
        Array.isArray(fe) && fe.length
          ? fe.map((x) => `${x.field}: ${x.error || x.message || ''}`).join('; ')
          : quoteRes.data?.message || quoteRes.statusText;
      console.warn(`${LOG} quote FAILED — request stays New`, {
        external_delivery_id: externalId,
        http_status: quoteRes.status,
        field_errors_summary: hint,
        body: summarizeResponseData(quoteRes.data),
      });
      await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRowId);
      await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
      queueRevertToNew(deliveryRequestId, request, { reason: 'doordash_quote_failed' });
      return;
    }

    const acceptUrl = `${apiBase}/drive/v2/quotes/${encodeURIComponent(externalId)}/accept`;
    let acceptRes = await axios.post(
      acceptUrl,
      { dropoff_phone_number: dropoffPhone },
      { headers, timeout: 35000, validateStatus: () => true }
    );
    if (acceptRes.status < 200 || acceptRes.status >= 300) {
      acceptRes = await axios.post(acceptUrl, {}, { headers, timeout: 35000, validateStatus: () => true });
    }

    if (acceptRes.status < 200 || acceptRes.status >= 300) {
      console.warn(
        '[DeliveryNetwork] DoorDash accept failed',
        acceptRes.status,
        typeof acceptRes.data === 'object' ? JSON.stringify(acceptRes.data).slice(0, 800) : acceptRes.data
      );
      await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRowId);
      await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
      queueRevertToNew(deliveryRequestId, request, { reason: 'doordash_accept_failed' });
      return;
    }

    const feeCents = acceptRes.data?.fee != null ? Number(acceptRes.data.fee) : quoteRes.data?.fee != null ? Number(quoteRes.data.fee) : null;
    const feeUsd = feeCents != null && Number.isFinite(feeCents) && feeCents >= 0 ? feeCents / 100 : null;

    let amountQuotedCents = orderValueCents;
    let finalDisclaimer = null;
    if (feeUsd != null && feeUsd >= 0) {
      const pricing = await calculateDeliveryPrice({
        cost_usd: feeUsd,
        business_id: request.business_id || null,
      });
      amountQuotedCents = Math.max(0, Math.round(Number(pricing.amount_cents) || 0));
      finalDisclaimer = pricing.disclaimer;
    }

    await supabaseClient
      .from('delivery_dispatch_log')
      .update({
        result: 'accepted',
        broker_job_id: externalId,
        attempted_at: new Date().toISOString(),
      })
      .eq('id', logRowId);

    const track = acceptRes.data?.tracking_url || quoteRes.data?.tracking_url;
    const trackTrim =
      typeof track === 'string' && track.trim() && /^https?:\/\//i.test(track.trim()) ? track.trim() : null;

    await supabaseClient
      .from('delivery_requests')
      .update({
        status: 'Dispatched',
        amount_quoted_cents: amountQuotedCents,
        quoted_on_demand_provider: 'DoorDash',
        ...(trackTrim ? { carrier_tracking_url: trackTrim } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryRequestId);
    console.log(`${LOG} SUCCESS — DB updated Dispatched`, {
      delivery_request_id: deliveryRequestId,
      dispatch_log_id: logRowId,
      external_delivery_id: externalId,
      broker_job_id_stored: externalId,
      fee_usd: feeUsd,
      amount_quoted_cents_tavari: amountQuotedCents,
      delivery_status: acceptRes.data?.delivery_status ?? quoteRes.data?.delivery_status ?? null,
      tracking_url: track || null,
    });
    try {
      const prev = request.status || 'ConfirmingDelivery';
      const { queueDeliveryStatusNotifications } = await import('./deliveryCustomerNotifications.js');
      queueDeliveryStatusNotifications(prev, 'Dispatched', deliveryRequestId, null, {
        source: 'system',
        changed_by: 'DoorDash dispatch',
      });
    } catch (nErr) {
      console.warn(`${LOG} notify:`, nErr?.message || nErr);
    }
  } catch (err) {
    const ax = err?.response;
    console.error(`${LOG} exception — request stays New`, {
      delivery_request_id: deliveryRequestId,
      dispatch_log_id: logRowId,
      message: err?.message || String(err),
      axios_status: ax?.status ?? null,
      axios_data: ax?.data != null ? summarizeResponseData(ax.data) : null,
    });
    await supabaseClient.from('delivery_dispatch_log').update({ result: 'error', attempted_at: new Date().toISOString() }).eq('id', logRowId);
    await supabaseClient.from('delivery_requests').update({ status: 'New', updated_at: new Date().toISOString() }).eq('id', deliveryRequestId);
    queueRevertToNew(deliveryRequestId, request, { reason: 'doordash_exception' });
  }
}
