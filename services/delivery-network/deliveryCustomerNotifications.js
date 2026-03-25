/**
 * Customer + ops SMS/email on delivery_requests status transitions.
 * Uses global delivery_network_config: customer_sms_*, notification_email, email_enabled, sms_enabled, etc.
 */
import crypto from 'crypto';
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull, normalizePhone } from './config.js';
import { getApiPublicBaseUrl } from '../../config/public-urls.js';
import { sendSMSDirect, sendEmail, addBusinessIdentification } from '../notifications.js';

const NOTIFY_ON_STATUSES = new Set(['Dispatched', 'Assigned', 'PickedUp', 'Completed', 'Failed', 'Cancelled']);

const STATUS_CUSTOMER_LINE = {
  Dispatched: 'Your delivery is confirmed and has been dispatched.',
  Assigned: 'A driver has been assigned to your delivery.',
  PickedUp: 'Your package has been picked up and is on the way.',
  Completed: 'Your delivery is complete.',
  Failed: 'Your delivery could not be completed. We will follow up if needed.',
  Cancelled: 'Your delivery request has been cancelled.',
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function podSummaryLine(row) {
  const sig = row.pod_signature_url && String(row.pod_signature_url).trim();
  const photos = row.pod_photo_urls;
  const arr = Array.isArray(photos) ? photos : typeof photos === 'string' ? (() => { try { return JSON.parse(photos); } catch { return []; } })() : [];
  const n = Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()).length : 0;
  if (sig && n) return 'Signature and photos are available.';
  if (sig) return 'A delivery signature is available.';
  if (n) return `${n} proof photo(s) available.`;
  return '';
}

/**
 * Ensure row has customer_notify_token; persist if missing.
 * @param {object} row - delivery_requests row with id
 * @returns {Promise<string|null>}
 */
export async function ensureCustomerNotifyToken(row) {
  if (!row?.id) return null;
  const existing = row.customer_notify_token && String(row.customer_notify_token).trim();
  if (existing) return existing;
  const token = crypto.randomBytes(32).toString('hex');
  const { error } = await supabaseClient
    .from('delivery_requests')
    .update({ customer_notify_token: token, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) {
    console.warn('[DeliveryNotify] could not save customer_notify_token:', error.message);
    return null;
  }
  return token;
}

function buildPlaceholderContext(row, newStatus, apiBase) {
  const ref = row.reference_number || row.id;
  const token = row.customer_notify_token && String(row.customer_notify_token).trim();
  const deliveryLink = token ? `${apiBase}/api/v2/delivery-network/public/delivery/${encodeURIComponent(token)}` : '';
  const track = row.carrier_tracking_url && String(row.carrier_tracking_url).trim();
  const podLine = newStatus === 'Completed' ? podSummaryLine(row) : '';
  const podLink = newStatus === 'Completed' && deliveryLink ? deliveryLink : '';
  const callerName = row.recipient_name && String(row.recipient_name).trim() ? String(row.recipient_name).trim() : 'there';
  return {
    reference_number: ref,
    status: newStatus,
    status_message: STATUS_CUSTOMER_LINE[newStatus] || `Status: ${newStatus}`,
    tracking_url: track || '',
    delivery_link: deliveryLink,
    pod_link: podLink,
    pod_summary: podLine,
    recipient_name: row.recipient_name && String(row.recipient_name).trim() ? String(row.recipient_name).trim() : '',
    delivery_address: row.delivery_address && String(row.delivery_address).trim() ? String(row.delivery_address).trim() : '',
    pickup_address: row.pickup_address && String(row.pickup_address).trim() ? String(row.pickup_address).trim() : '',
    caller_name: callerName,
  };
}

function replaceDeliveryPlaceholders(text, ctx, termsUrl) {
  if (!text || typeof text !== 'string') return '';
  let out = text
    .replace(/\{\{reference_number\}\}/g, ctx.reference_number)
    .replace(/\{\{status\}\}/g, ctx.status)
    .replace(/\{\{status_message\}\}/g, ctx.status_message)
    .replace(/\{\{tracking_url\}\}/g, ctx.tracking_url)
    .replace(/\{\{delivery_link\}\}/g, ctx.delivery_link)
    .replace(/\{\{pod_link\}\}/g, ctx.pod_link)
    .replace(/\{\{pod_summary\}\}/g, ctx.pod_summary)
    .replace(/\{\{recipient_name\}\}/g, ctx.recipient_name)
    .replace(/\{\{delivery_address\}\}/g, ctx.delivery_address)
    .replace(/\{\{pickup_address\}\}/g, ctx.pickup_address)
    .replace(/\{\{caller_name\}\}/g, ctx.caller_name);
  out = out.replace(/\{\{terms_url\}\}/g, termsUrl || 'https://www.tavarios.com/termsofservice');
  return out;
}

/** Simple default when customer_sms_message is not set */
function defaultCustomerSmsBody(ctx) {
  const parts = [`${ctx.status_message} Ref ${ctx.reference_number}.`];
  if (ctx.tracking_url) parts.push(` Track: ${ctx.tracking_url}`);
  if (ctx.delivery_link) parts.push(` Details: ${ctx.delivery_link}`);
  return parts.join('');
}

/**
 * @param {string|null} previousStatus
 * @param {string} newStatus
 * @param {string} requestId
 * @param {object} [requestRow] - optional fresh row (must include notify fields after update)
 */
export async function sendDeliveryStatusNotifications(previousStatus, newStatus, requestId, requestRow = null) {
  if (!requestId || !newStatus || previousStatus === newStatus) return;
  if (!NOTIFY_ON_STATUSES.has(newStatus)) return;

  let row = requestRow;
  if (!row) {
    const { data, error } = await supabaseClient.from('delivery_requests').select('*').eq('id', requestId).single();
    if (error || !data) {
      console.warn('[DeliveryNotify] request not found', requestId);
      return;
    }
    row = data;
  }

  const config = await getDeliveryConfigFull();
  const serviceLine = (config.service_line_name && String(config.service_line_name).trim()) || 'Last-Mile Delivery';
  const termsUrl = (config.terms_of_service_url && String(config.terms_of_service_url).trim()) || 'https://www.tavarios.com/termsofservice';

  const token = await ensureCustomerNotifyToken(row);
  if (token) row = { ...row, customer_notify_token: token };

  const apiBase = getApiPublicBaseUrl().replace(/\/$/, '');
  const ctx = buildPlaceholderContext(row, newStatus, apiBase);

  const customerPhone =
    normalizePhone(row.callback_phone || '') || normalizePhone(row.recipient_phone || '') || '';
  const fromNumbers = Array.isArray(config.delivery_phone_numbers) ? config.delivery_phone_numbers : [];
  const fromRaw = fromNumbers[0] && String(fromNumbers[0]).trim();

  // —— Customer SMS ——
  if (config.customer_sms_enabled && customerPhone && fromRaw) {
    try {
      const template =
        config.customer_sms_message && String(config.customer_sms_message).trim()
          ? String(config.customer_sms_message).trim()
          : null;
      let body = template ? replaceDeliveryPlaceholders(template, ctx, termsUrl) : defaultCustomerSmsBody(ctx);
      const legalRaw = config.customer_sms_legal && String(config.customer_sms_legal).trim();
      if (legalRaw) {
        body += `\n\n${replaceDeliveryPlaceholders(legalRaw, ctx, termsUrl)}`;
      }
      const messageText = addBusinessIdentification(body, serviceLine);
      let fromE164 = fromRaw.replace(/[^0-9+]/g, '');
      if (!fromE164.startsWith('+')) fromE164 = fromE164.length === 10 ? `+1${fromE164}` : `+${fromE164}`;
      let toE164 = customerPhone.replace(/[^0-9+]/g, '');
      if (!toE164.startsWith('+')) toE164 = toE164.length === 10 ? `+1${toE164}` : `+${toE164}`;
      await sendSMSDirect(fromE164, toE164, messageText);
      console.log('[DeliveryNotify] customer SMS sent', newStatus, requestId);
    } catch (e) {
      console.error('[DeliveryNotify] customer SMS failed:', e?.message || e);
    }
  }

  // —— Ops email ——
  const toEmail = config.notification_email && String(config.notification_email).trim();
  if (config.email_enabled && toEmail) {
    try {
      const subject = `[${serviceLine}] ${ctx.reference_number} — ${newStatus}`;
      const lines = [
        `Reference: ${ctx.reference_number}`,
        `Status: ${newStatus}`,
        ctx.delivery_address ? `Deliver to: ${ctx.delivery_address}` : '',
        ctx.recipient_name ? `Recipient: ${ctx.recipient_name}` : '',
        customerPhone ? `Customer phone: ${customerPhone}` : '',
        ctx.tracking_url ? `Tracking: ${ctx.tracking_url}` : '',
        ctx.delivery_link ? `Customer details link: ${ctx.delivery_link}` : '',
      ].filter(Boolean);
      const text = lines.join('\n');
      const html = `<p><strong>${escapeHtml(serviceLine)}</strong></p><pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
      await sendEmail(toEmail, subject, text, html, serviceLine, row.business_id || null);
      console.log('[DeliveryNotify] ops email sent', newStatus, requestId);
    } catch (e) {
      console.error('[DeliveryNotify] ops email failed:', e?.message || e);
    }
  }

  // —— Ops SMS ——
  if (config.sms_enabled && config.notification_sms_number && fromRaw) {
    try {
      const short = `${serviceLine}: ${ctx.reference_number} → ${newStatus}${ctx.tracking_url ? `. Track: ${ctx.tracking_url}` : ''}`;
      let fromE164 = fromRaw.replace(/[^0-9+]/g, '');
      if (!fromE164.startsWith('+')) fromE164 = fromE164.length === 10 ? `+1${fromE164}` : `+${fromE164}`;
      let toE164 = String(config.notification_sms_number).replace(/[^0-9+]/g, '');
      if (!toE164.startsWith('+')) toE164 = toE164.length === 10 ? `+1${toE164}` : `+${toE164}`;
      await sendSMSDirect(fromE164, toE164, addBusinessIdentification(short, serviceLine));
      console.log('[DeliveryNotify] ops SMS sent', newStatus, requestId);
    } catch (e) {
      console.error('[DeliveryNotify] ops SMS failed:', e?.message || e);
    }
  }
}

/**
 * Fire-and-forget wrapper for callers after DB update.
 * Always records delivery_request_activity when status changes (even if customer SMS/email does not run for that status).
 * @param {{ source?: string, changed_by?: string|null, detail?: object|null }} [activityOptions] — default source `system`
 */
export function queueDeliveryStatusNotifications(previousStatus, newStatus, requestId, requestRow = null, activityOptions = null) {
  if (!requestId || !newStatus || previousStatus === newStatus) return;
  setImmediate(() => {
    import('./activity.js')
      .then(({ logRequestActivity }) =>
        logRequestActivity(requestId, 'status_change', {
          from_status: previousStatus ?? null,
          to_status: newStatus,
          source: activityOptions?.source ?? 'system',
          changed_by: activityOptions?.changed_by ?? null,
          detail: activityOptions?.detail ?? null,
        }),
      )
      .catch(() => {});
    sendDeliveryStatusNotifications(previousStatus, newStatus, requestId, requestRow).catch((err) =>
      console.error('[DeliveryNotify] unhandled:', err?.message || err),
    );
  });
}
