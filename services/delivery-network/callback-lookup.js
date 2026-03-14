/**
 * Look up recent delivery requests by caller/callback phone (for AI context at call start).
 */
import { supabaseClient } from '../../config/database.js';

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

/**
 * Get recent delivery requests for this phone number (callback_phone or caller_phone).
 * @param {string} callerPhone - Inbound caller number (any format)
 * @param {{ days?: number }} options - days to look back (default 7)
 * @returns {Promise<Array<{ id: string, reference_number: string, status: string, created_at: string, delivery_address: string | null }>>}
 */
export async function getRecentDeliveryRequestsByPhone(callerPhone, options = {}) {
  const days = typeof options.days === 'number' ? options.days : 7;
  const normalized = normalizePhone(callerPhone);
  if (!normalized) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const { data: rows, error } = await supabaseClient
    .from('delivery_requests')
    .select('id, reference_number, status, created_at, delivery_address, callback_phone, caller_phone')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[DeliveryNetwork] getRecentDeliveryRequestsByPhone error:', error.message);
    return [];
  }

  const matches = (rows || []).filter(
    (r) => normalizePhone(r.callback_phone) === normalized || normalizePhone(r.caller_phone) === normalized
  );
  return matches.map((r) => ({
    id: r.id,
    reference_number: r.reference_number || '',
    status: r.status,
    created_at: r.created_at,
    delivery_address: r.delivery_address || null,
  }));
}
