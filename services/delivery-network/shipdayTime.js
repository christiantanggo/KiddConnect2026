/**
 * Shipday API expects expectedDeliveryDate and expectedPickupTime/expectedDeliveryTime in UTC.
 * This module converts business-timezone date/time to UTC for the API.
 */

/**
 * Convert a local date and time in a given IANA timezone to UTC.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:mm or HH:mm:ss (local time in the given zone)
 * @param {string} timeZone - IANA timezone (e.g. America/New_York)
 * @returns {{ date: string, time: string } | null} - UTC date (YYYY-MM-DD) and time (HH:mm:ss), or null if invalid
 */
export function localToUTC(dateStr, timeStr, timeZone) {
  if (!dateStr || !timeStr || typeof dateStr !== 'string' || typeof timeStr !== 'string') return null;
  const trimmed = dateStr.trim().slice(0, 10);
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d] = match.map(Number);
  const tParts = timeStr.trim().split(':').map((x) => parseInt(x, 10) || 0);
  const hour = tParts[0] ?? 0;
  const min = tParts[1] ?? 0;
  const sec = tParts[2] ?? 0;
  const targetHH = String(hour).padStart(2, '0');
  const targetMM = String(min).padStart(2, '0');

  // Find UTC moment that when displayed in timeZone equals target date and time (search ~48h window)
  const startUtc = Date.UTC(y, mo - 1, d - 1, 0, 0, 0);
  const endUtc = Date.UTC(y, mo - 1, d + 2, 0, 0, 0);
  const step = 15 * 60 * 1000; // 15 min
  for (let t = startUtc; t < endUtc; t += step) {
    const date = new Date(t);
    const dateStrTz = date.toLocaleDateString('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const timeStrTz = date.toLocaleTimeString('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
    const dateMatch = dateStrTz === trimmed || dateStrTz.replace(/-/g, '') === trimmed.replace(/-/g, '');
    const timeMatch = (timeStrTz === `${targetHH}:${targetMM}`) || (timeStrTz.startsWith(targetHH + ':'));
    if (dateMatch && timeMatch) {
      const utcDate = date.toISOString().slice(0, 10);
      const utcTime = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
      return { date: utcDate, time: utcTime };
    }
  }
  return null;
}

/**
 * Normalize time string to HH:mm:ss.
 * @param {string} s
 * @returns {string|null}
 */
export function toHHmmss(s) {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  const parts = t.split(':').map((x) => x.padStart(2, '0'));
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}:${(parts[2] || '00').slice(0, 2)}`;
  return null;
}
