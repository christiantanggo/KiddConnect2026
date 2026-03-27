/**
 * Look up recent emergency service requests by caller phone (for callback detection).
 * Used at call start so the AI can ask if they're calling to cancel, update, or new issue.
 */
import { supabaseClient } from '../../config/database.js';

/**
 * Normalize phone to a comparable form (digits only, E.164-ish for US 10-digit).
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

/**
 * Get recent emergency service requests for this phone number (any intake channel).
 * @param {string} callerPhone - Inbound caller number (any format)
 * @param {{ days?: number }} options - days to look back (default 7)
 * @returns {Promise<Array<{ id: string, status: string, created_at: string, service_category: string, caller_name: string | null }>>}
 */
export async function getRecentRequestsByPhone(callerPhone, options = {}) {
  const days = typeof options.days === 'number' ? options.days : 7;
  const normalized = normalizePhone(callerPhone);
  if (!normalized) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const { data: rows, error } = await supabaseClient
    .from('emergency_service_requests')
    .select('id, status, created_at, service_category, caller_name, callback_phone')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[EmergencyNetwork] getRecentRequestsByPhone error:', error.message);
    return [];
  }

  const normalizedCaller = normalized;
  const matches = (rows || []).filter((r) => normalizePhone(r.callback_phone) === normalizedCaller);

  return matches.map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    service_category: r.service_category || 'Service',
    caller_name: r.caller_name || null,
  }));
}
