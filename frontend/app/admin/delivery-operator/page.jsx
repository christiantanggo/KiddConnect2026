'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  return document.cookie.split(';').find(c => c.trim().startsWith('admin_token='))?.split('=')[1]?.trim() || null;
}

function AdminDeliveryOperatorPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const load = async () => {
    const token = getAdminToken();
    if (!token) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/requests?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (e) {
      console.error(e);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const retryDispatch = async (id) => {
    const token = getAdminToken();
    if (!token) return;
    setActionLoadingId(id);
    try {
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/requests/${id}/retry-dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json())?.error || res.statusText);
      await load();
    } catch (e) {
      alert(e.message || 'Retry failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const updateStatus = async (id, status) => {
    const token = getAdminToken();
    if (!token) return;
    setActionLoadingId(id);
    try {
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || res.statusText);
      await load();
    } catch (e) {
      alert(e.message || 'Update failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const escalated = requests.filter(r => r.status === 'Needs Manual Assist');
  const rest = requests.filter(r => r.status !== 'Needs Manual Assist');

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Delivery operator</h1>
            <Link href="/admin/support" className="text-slate-600 hover:text-slate-900">← Admin</Link>
          </div>

          <div className="mb-4 flex gap-2 items-center">
            <label className="text-sm text-slate-600">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="Needs Manual Assist">Needs Manual Assist</option>
              <option value="New">New</option>
              <option value="Contacting">Contacting</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Failed">Failed</option>
            </select>
            <button type="button" onClick={load} className="px-3 py-1.5 rounded bg-slate-200 text-slate-800 text-sm hover:bg-slate-300">Refresh</button>
          </div>

          {loading ? (
            <p className="text-slate-500">Loading…</p>
          ) : (
            <>
              {escalated.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-lg font-semibold text-amber-800 mb-2">Escalated ({escalated.length})</h2>
                  <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-amber-50 border-b border-amber-200 text-left text-slate-600">
                          <th className="p-2">Reference</th>
                          <th className="p-2">Callback</th>
                          <th className="p-2">Delivery address</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Created</th>
                          <th className="p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {escalated.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2 font-mono">{r.reference_number}</td>
                            <td className="p-2">{r.callback_phone}</td>
                            <td className="p-2 max-w-[200px] truncate" title={r.delivery_address}>{r.delivery_address}</td>
                            <td className="p-2">{r.status}</td>
                            <td className="p-2 text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                            <td className="p-2 flex flex-wrap gap-1">
                              <button type="button" onClick={() => retryDispatch(r.id)} disabled={actionLoadingId === r.id} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50">Retry dispatch</button>
                              <button type="button" onClick={() => updateStatus(r.id, 'Cancelled')} disabled={actionLoadingId === r.id} className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs hover:bg-red-200 disabled:opacity-50">Cancel</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">Recent deliveries</h2>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                        <th className="p-2">Reference</th>
                        <th className="p-2">Callback</th>
                        <th className="p-2">Delivery address</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Payment</th>
                        <th className="p-2">Created</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(statusFilter ? requests : rest).map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 font-mono">{r.reference_number}</td>
                          <td className="p-2">{r.callback_phone}</td>
                          <td className="p-2 max-w-[200px] truncate" title={r.delivery_address}>{r.delivery_address}</td>
                          <td className="p-2">{r.status}</td>
                          <td className="p-2">{r.payment_status || '—'}</td>
                          <td className="p-2 text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                          <td className="p-2 flex flex-wrap gap-1">
                            {['New', 'Contacting', 'Needs Manual Assist'].includes(r.status) && (
                              <button type="button" onClick={() => retryDispatch(r.id)} disabled={actionLoadingId === r.id} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50">Retry</button>
                            )}
                            {!['Cancelled', 'Completed'].includes(r.status) && (
                              <button type="button" onClick={() => updateStatus(r.id, 'Cancelled')} disabled={actionLoadingId === r.id} className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs hover:bg-red-200 disabled:opacity-50">Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {requests.length === 0 && <p className="text-slate-500 py-4">No delivery requests.</p>}
              </section>
            </>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}

export default AdminDeliveryOperatorPage;
