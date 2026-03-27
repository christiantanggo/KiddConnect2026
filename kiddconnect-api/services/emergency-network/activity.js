/**
 * Log request-level activity for emergency dispatch (resets, status changes).
 * source: 'manual' = dashboard/staff, 'ai' = VAPI/dispatch system
 */

/**
 * @param {string} requestId - emergency_service_requests.id
 * @param {'dispatch_reset'|'status_change'} activityType
 * @param {{ from_status?: string, to_status?: string, source: 'manual'|'ai', changed_by?: string }} opts
 */
export async function logRequestActivity(requestId, activityType, opts) {
  try {
    const { supabaseClient } = await import("../../config/database.js");
    const { from_status, to_status, source, changed_by } = opts;
    console.log('[EmergencyNetwork] logRequestActivity insert', { requestId, activityType, from_status, to_status, source });
    const { data, error } = await supabaseClient.from('emergency_request_activity').insert({
      service_request_id: requestId,
      activity_type: activityType,
      from_status: from_status ?? null,
      to_status: to_status ?? null,
      source,
      changed_by: changed_by ?? null,
    }).select('id');
    if (error) {
      console.error('[EmergencyNetwork] logRequestActivity insert error', { code: error.code, message: error.message, requestId });
      if (error.code === '42P01' || String(error.message || '').includes('does not exist')) {
        console.log('[EmergencyNetwork] logRequestActivity table missing? Run migration add_emergency_request_activity.sql');
      }
      return;
    }
    const rowId = Array.isArray(data) ? data[0]?.id : data?.id;
    console.log('[EmergencyNetwork] logRequestActivity inserted', { requestId, rowId });
  } catch (err) {
    console.error('[EmergencyNetwork] logRequestActivity exception', { requestId, message: err?.message, code: err?.code });
  }
}
