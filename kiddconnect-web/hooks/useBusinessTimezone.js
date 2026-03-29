'use client';

import { useState, useEffect } from 'react';
import { formatDateInTimezone } from '@/lib/formatDate';
import { settingsV2API, authAPI } from '@/lib/api';

const DEFAULT_TZ = 'America/New_York';

/**
 * Returns the business timezone from settings and a formatter that uses it.
 * Use across the app so all dates respect the business timezone.
 * @returns {{ timezone: string, formatDate: (isoOrDate: any) => string, loading: boolean }}
 */
export function useBusinessTimezone() {
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Prefer v2 settings (active business) so timezone matches the org the user is in
        const res = await settingsV2API.getBusiness();
        const tz = res.data?.business?.timezone || DEFAULT_TZ;
        if (!cancelled) setTimezone(tz);
        return;
      } catch (_) {
        // Fallback: auth/me returns user's business (may differ from active org in v2)
        try {
          const me = await authAPI.getMe();
          const tz = me.data?.business?.timezone || me.data?.business?.sms_timezone || DEFAULT_TZ;
          if (!cancelled) setTimezone(tz);
        } catch (__) {
          if (!cancelled) setTimezone(DEFAULT_TZ);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (isoOrDate) => formatDateInTimezone(isoOrDate, timezone);
  return { timezone, formatDate, loading };
}
