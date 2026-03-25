/**
 * Delivery request activity / audit log (timeline in dashboard).
 */
import { supabaseClient } from '../../config/database.js';

const LOG = '[DeliveryActivity]';

/**
 * @param {string} deliveryRequestId - delivery_requests.id
 * @param {'status_change'|'request_created'|'dispatch_reset'|'dispatch_retry'|'operator_action'} activityType
 * @param {{ from_status?: string|null, to_status?: string|null, source: string, changed_by?: string|null, detail?: object|null }} opts
 */
export async function logRequestActivity(deliveryRequestId, activityType, opts) {
  if (!deliveryRequestId || !activityType || !opts?.source) return;
  try {
    const { from_status, to_status, source, changed_by, detail } = opts;
    const { error } = await supabaseClient.from('delivery_request_activity').insert({
      delivery_request_id: deliveryRequestId,
      activity_type: activityType,
      from_status: from_status ?? null,
      to_status: to_status ?? null,
      source,
      changed_by: changed_by ?? null,
      detail: detail && typeof detail === 'object' ? detail : null,
    });
    if (error) {
      if (error.code === '42P01' || String(error.message || '').includes('does not exist')) {
        console.warn(`${LOG} table missing — run migrations/add_delivery_request_activity.sql`);
      } else {
        console.error(`${LOG} insert error`, error.code, error.message, deliveryRequestId);
      }
    }
  } catch (err) {
    console.error(`${LOG} exception`, deliveryRequestId, err?.message || err);
  }
}
