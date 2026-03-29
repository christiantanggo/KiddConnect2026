/**
 * Format a server timestamp (UTC) in a given IANA timezone.
 * Use this across the app so all dates respect the business timezone from settings.
 *
 * For components: use the useBusinessTimezone() hook from @/hooks/useBusinessTimezone
 * and call formatDate(isoString) so the business timezone from settings is applied.
 * For one-off formatting with a known timezone, call formatDateInTimezone(iso, tz) directly.
 *
 * @param {string|number|Date|null|undefined} isoOrDate - ISO string, ms, or Date (server sends UTC)
 * @param {string} timezone - IANA timezone (e.g. 'America/New_York'). Defaults to browser local if not set.
 * @param {{ dateStyle?: string, timeStyle?: string, hour12?: boolean }} options - Intl options
 * @returns {string} Formatted string or '—' if empty/invalid
 */
export function formatDateInTimezone(isoOrDate, timezone = undefined, options = {}) {
  if (isoOrDate == null || isoOrDate === '') return '—';
  const s = typeof isoOrDate === 'string' ? isoOrDate.trim() : (typeof isoOrDate === 'number' || isoOrDate instanceof Date ? isoOrDate : String(isoOrDate));
  if (s === '') return '—';
  const hasTz = typeof s === 'string' && /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
  const toParse = typeof s === 'string' && !hasTz ? s + 'Z' : s;
  try {
    const d = new Date(toParse);
    if (Number.isNaN(d.getTime())) return typeof s === 'string' ? s : '—';
    const opts = {
      dateStyle: options.dateStyle ?? 'short',
      timeStyle: options.timeStyle ?? 'short',
      hour12: options.hour12 ?? true,
      ...(timezone ? { timeZone: timezone } : {}),
    };
    return d.toLocaleString(undefined, opts);
  } catch {
    return typeof s === 'string' ? s : '—';
  }
}
