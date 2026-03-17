/**
 * Delivery Network dispatch: send delivery request to broker(s).
 * Phase 1: one broker (or stub). Phase 4: multi-broker, cheapest-first.
 * Broker API keys can be set in Admin → Last-Mile Delivery → Settings → Delivery company APIs, or via env DELIVERY_SHIPDAY_API_KEY.
 */
import { supabaseClient } from '../../config/database.js';
import { getDeliveryConfigFull } from './config.js';

const DEFAULT_BROKER_ID = 'shipday'; // or 'stub' when no API key

/**
 * Resolve whether we have a valid Shipday (or first enabled broker) API key: from delivery config (UI) or env.
 */
async function getEffectiveBrokerId() {
  const config = await getDeliveryConfigFull();
  const shipday = config?.brokers?.shipday;
  if (shipday?.enabled && shipday?.api_key) return DEFAULT_BROKER_ID;
  if (process.env.DELIVERY_SHIPDAY_API_KEY) return DEFAULT_BROKER_ID;
  return 'stub';
}

/**
 * Get Shipday API key for use when calling Shipday API. Prefers UI config, then env.
 */
export async function getShipdayApiKey() {
  const config = await getDeliveryConfigFull();
  const shipday = config?.brokers?.shipday;
  if (shipday?.enabled && shipday?.api_key) return shipday.api_key;
  return process.env.DELIVERY_SHIPDAY_API_KEY || null;
}

/**
 * Start dispatch for a delivery request: create broker job and log attempt.
 * If no Shipday API key (config or env) is set, stub: create log row and mark as dispatched after short delay.
 */
export async function startDispatch(deliveryRequestId) {
  const { data: request, error: reqErr } = await supabaseClient
    .from('delivery_requests')
    .select('*')
    .eq('id', deliveryRequestId)
    .single();
  if (reqErr || !request) {
    console.warn('[DeliveryNetwork] startDispatch: request not found', deliveryRequestId);
    return;
  }
  if (!['New'].includes(request.status)) {
    console.warn('[DeliveryNetwork] startDispatch: request already in progress', deliveryRequestId, request.status);
    return;
  }

  await supabaseClient
    .from('delivery_requests')
    .update({ status: 'Contacting', updated_at: new Date().toISOString() })
    .eq('id', deliveryRequestId);

  const brokerId = await getEffectiveBrokerId();
  const { data: logRow, error: logErr } = await supabaseClient
    .from('delivery_dispatch_log')
    .insert({
      delivery_request_id: deliveryRequestId,
      broker_id: brokerId,
      attempt_order: 1,
      result: 'pending',
      attempted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (logErr) {
    console.error('[DeliveryNetwork] startDispatch: failed to insert dispatch log', logErr.message);
    return;
  }

  if (brokerId === 'stub') {
    // Stub: after a short delay, mark as dispatched (simulate broker accepting).
    setImmediate(async () => {
      await supabaseClient
        .from('delivery_dispatch_log')
        .update({
          result: 'accepted',
          broker_job_id: `stub-${deliveryRequestId.slice(0, 8)}`,
          attempted_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
      await supabaseClient
        .from('delivery_requests')
        .update({ status: 'Dispatched', updated_at: new Date().toISOString() })
        .eq('id', deliveryRequestId);
      console.log('[DeliveryNetwork] startDispatch: stub accepted', deliveryRequestId);
    });
    return;
  }

  // TODO Phase 1: call Shipday (or other) API to create delivery job.
  // On success: update delivery_dispatch_log.broker_job_id, delivery_requests.status = 'Dispatched'.
  // On failure: update result to 'no_driver' or 'error', then Phase 4 could try next broker.
  console.log('[DeliveryNetwork] startDispatch: broker', brokerId, 'integration not yet implemented; request', deliveryRequestId);
}
