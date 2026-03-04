'use client';

import { useState, useEffect, useCallback } from 'react';
import { orbixNetworkAPI } from '@/lib/api';
import { handleAPIError } from '@/lib/errorHandler';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

function formatLimitTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * Shows per-channel "when did we hit the upload limit" so user knows when they can upload again (24h skip).
 * Use on Dashboard and in Settings → Global.
 */
export default function UploadLimitStatusCard() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await orbixNetworkAPI.getUploadLimitStatus();
      setList(data?.channel_quota_skip_status ?? []);
    } catch (e) {
      setError(handleAPIError(e)?.message || 'Failed to load upload limit status');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        YouTube upload limit status
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Channels that hit YouTube&apos;s daily upload limit are skipped for 24 hours. Here you can see when each channel hit the limit and when you can upload again.
      </p>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 py-2">{error}</p>
      )}
      {!loading && !error && list.length === 0 && (
        <p className="text-sm text-gray-500 py-2">No channels have hit the upload limit in the last 24 hours.</p>
      )}
      {!loading && !error && list.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-700">Channel</th>
                <th className="text-left py-2 px-3 font-medium text-gray-700">Limit hit at</th>
                <th className="text-left py-2 px-3 font-medium text-gray-700">Can upload again after</th>
                <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.channel_id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-3 text-gray-900">{row.channel_name || row.channel_id}</td>
                  <td className="py-2 px-3 text-gray-700">{formatLimitTime(row.last_limit_hit_at_iso)}</td>
                  <td className="py-2 px-3 text-gray-700">{formatLimitTime(row.can_upload_after_iso)}</td>
                  <td className="py-2 px-3">
                    {row.skipped
                      ? <span className="text-amber-700 font-medium">Skipped (wait 24h)</span>
                      : <span className="text-green-700">OK to try again</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={fetchStatus}
            className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
