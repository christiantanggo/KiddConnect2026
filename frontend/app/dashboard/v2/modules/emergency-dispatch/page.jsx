'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { emergencyNetworkAPI } from '@/lib/api';
import { ArrowLeft, Loader, RefreshCw, Phone, MessageSquare, Globe, Save, Plus, Edit2, Trash2, Bot } from 'lucide-react';

const STATUS_OPTIONS = ['New', 'Contacting Providers', 'Accepted', 'Connected', 'Closed', 'Needs Manual Assist'];
const TRADE_TYPES = ['Plumbing', 'HVAC', 'Gas', 'Other'];
const TIER_OPTIONS = ['premium', 'priority', 'basic'];

export default function EmergencyDispatchPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [providers, setProviders] = useState([]);
  const [config, setConfig] = useState({ emergency_phone_numbers: [], emergency_vapi_assistant_id: '', max_dispatch_attempts: 5, notification_email: '' });
  const [analytics, setAnalytics] = useState(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({ business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '', verification_status: 'pending', priority_tier: 'basic', is_available: true });
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createAgentError, setCreateAgentError] = useState(null);
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState([]);
  const [selectedNumberToAdd, setSelectedNumberToAdd] = useState('');
  const [configSaveMessage, setConfigSaveMessage] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const [configRes, requestsRes, providersRes, analyticsRes, phoneNumbersRes] = await Promise.all([
        emergencyNetworkAPI.getConfig().catch(() => ({ data: config })),
        emergencyNetworkAPI.getRequests().catch(() => ({ data: { requests: [] } })),
        emergencyNetworkAPI.getProviders().catch(() => ({ data: { providers: [] } })),
        emergencyNetworkAPI.getAnalytics().catch(() => ({ data: {} })),
        emergencyNetworkAPI.getPhoneNumbers().catch(() => ({ data: { phone_numbers: [] } })),
      ]);
      setConfig({
        emergency_phone_numbers: configRes.data?.emergency_phone_numbers ?? [],
        emergency_vapi_assistant_id: configRes.data?.emergency_vapi_assistant_id ?? '',
        max_dispatch_attempts: configRes.data?.max_dispatch_attempts ?? 5,
        notification_email: configRes.data?.notification_email ?? '',
      });
      setRequests(requestsRes.data?.requests ?? []);
      setProviders(providersRes.data?.providers ?? []);
      setAnalytics(analyticsRes.data ?? null);
      setAvailablePhoneNumbers(phoneNumbersRes.data?.phone_numbers ?? []);
    } catch (e) {
      console.error('[EmergencyDispatch] load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveConfig = async (overrides = null) => {
    try {
      setConfigSaving(true);
      setConfigSaveMessage(null);
      const c = overrides ? { ...config, ...overrides } : config;
      const toSend = {
        emergency_phone_numbers: Array.isArray(c.emergency_phone_numbers) ? c.emergency_phone_numbers : [],
        emergency_vapi_assistant_id: c.emergency_vapi_assistant_id || null,
        max_dispatch_attempts: c.max_dispatch_attempts ?? 5,
        notification_email: (c.notification_email && String(c.notification_email).trim()) || null,
      };
      await emergencyNetworkAPI.updateConfig(toSend);
      setConfig(toSend);
      setConfigDirty(false);
      setConfigSaveMessage('Saved');
      setTimeout(() => setConfigSaveMessage(null), 3000);
      await load();
    } catch (e) {
      console.error('[EmergencyDispatch] save config error', e);
      setConfigSaveMessage(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setConfigSaving(false);
    }
  };

  const addPhoneNumber = async () => {
    const trimmed = newPhone.replace(/[^0-9+]/g, '').trim();
    if (!trimmed) return;
    const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    const list = [...(config.emergency_phone_numbers || []), withPlus];
    setConfig((c) => ({ ...c, emergency_phone_numbers: list }));
    setNewPhone('');
    await saveConfig({ emergency_phone_numbers: list });
  };

  const addSelectedPhoneNumber = async () => {
    if (!selectedNumberToAdd) return;
    const list = [...(config.emergency_phone_numbers || []), selectedNumberToAdd];
    setConfig((c) => ({ ...c, emergency_phone_numbers: list }));
    setSelectedNumberToAdd('');
    await saveConfig({ emergency_phone_numbers: list });
  };

  const removePhoneNumber = async (idx) => {
    const list = (config.emergency_phone_numbers || []).filter((_, i) => i !== idx);
    setConfig((c) => ({ ...c, emergency_phone_numbers: list }));
    await saveConfig({ emergency_phone_numbers: list });
  };

  const createAgent = async () => {
    setCreateAgentError(null);
    setCreatingAgent(true);
    try {
      const res = await emergencyNetworkAPI.createAgent();
      const id = res.data?.assistant_id;
      if (id) {
        setConfig((c) => ({ ...c, emergency_vapi_assistant_id: id }));
        setConfigDirty(false);
      }
      await load();
    } catch (e) {
      setCreateAgentError(e.response?.data?.error || e.message || 'Failed to create agent');
    } finally {
      setCreatingAgent(false);
    }
  };

  const createProvider = async () => {
    try {
      await emergencyNetworkAPI.createProvider({
        ...providerForm,
        service_areas: providerForm.service_areas ? providerForm.service_areas.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      setShowAddProvider(false);
      setProviderForm({ business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '', verification_status: 'pending', priority_tier: 'basic', is_available: true });
      load();
    } catch (e) {
      console.error('[EmergencyDispatch] create provider error', e);
    }
  };

  const updateRequestStatus = async (id, status) => {
    try {
      await emergencyNetworkAPI.updateRequest(id, { status });
      load();
    } catch (e) {
      console.error('[EmergencyDispatch] update request error', e);
    }
  };

  const deleteProviderById = async (id) => {
    if (!confirm('Remove this provider?')) return;
    try {
      await emergencyNetworkAPI.deleteProvider(id);
      load();
    } catch (e) {
      console.error('[EmergencyDispatch] delete provider error', e);
    }
  };

  if (loading && requests.length === 0) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader className="animate-spin w-8 h-8 text-slate-400" />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/dashboard/v2/settings/modules" className="text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-semibold">Emergency Dispatch</h1>
            <button type="button" onClick={load} className="ml-auto p-2 rounded-lg border border-slate-200 hover:bg-slate-50" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <p className="text-slate-600 mb-6">
            24/7 Emergency & Priority Service Network — requests, providers, and config. Public page: <a href="/emergency" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/emergency</a>
          </p>

          {/* Config */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <h2 className="text-lg font-medium mb-3">Config</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Emergency phone numbers (for routing calls/SMS)</label>
                {config.webhook_url && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 mb-1">Calls won’t work until VAPI is set up</p>
                    <p className="text-xs text-amber-700 mb-2">Same backend as the rest of the app (Railway). In the <strong>VAPI dashboard</strong>, open each emergency number above and set:</p>
                    <ul className="text-xs text-amber-700 list-disc list-inside mb-2">
                      <li><strong>Server URL</strong> to this exact URL (so we get assistant-request when someone calls):</li>
                    </ul>
                    <code className="block px-2 py-1.5 bg-white border border-amber-200 rounded text-xs font-mono break-all select-all">
                      {config.webhook_url}
                    </code>
                    <p className="text-xs text-amber-700 mt-2">Leave <strong>Assistant</strong> unset (use server / dynamic assistant). Otherwise VAPI never calls this URL and you’ll hear “can’t get an assistant”.</p>
                    {config.webhook_url && (config.webhook_url.includes('localhost') || config.webhook_url.includes('127.0.0.1')) && (
                      <p className="text-xs text-red-600 mt-2 font-medium">You’re on a local run — this URL is localhost so VAPI can’t reach it. On Railway the URL comes from BACKEND_URL or RAILWAY_PUBLIC_DOMAIN; use that Railway URL in VAPI.</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-2">
                  {(config.emergency_phone_numbers || []).map((n, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-sm">
                      {n}
                      <button type="button" onClick={() => removePhoneNumber(i)} className="text-red-600 hover:underline">×</button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mb-1">Select from numbers Tavari owns (VAPI):</p>
                <div className="flex gap-2 mb-2">
                  <select
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={selectedNumberToAdd}
                    onChange={(e) => setSelectedNumberToAdd(e.target.value)}
                  >
                    <option value="">Choose a number...</option>
                    {(availablePhoneNumbers || [])
                      .filter((pn) => !(config.emergency_phone_numbers || []).includes(pn.e164 || pn.number))
                      .map((pn) => {
                        const num = pn.e164 || pn.number;
                        return (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        );
                      })}
                  </select>
                  <button
                    type="button"
                    onClick={addSelectedPhoneNumber}
                    disabled={!selectedNumberToAdd || configSaving}
                    className="px-3 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {configSaving ? 'Saving…' : 'Add selected'}
                  </button>
                </div>
                {configSaveMessage && (
                  <p className={`text-sm mt-1 ${configSaveMessage === 'Saved' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {configSaveMessage}
                  </p>
                )}
                <p className="text-xs text-slate-500 mb-1">Or enter a number manually:</p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="+15551234567"
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                  <button type="button" onClick={addPhoneNumber} className="px-3 py-2 bg-slate-200 rounded text-sm hover:bg-slate-300">Add</button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Emergency Network AI agent (VAPI)</label>
                {config.emergency_vapi_assistant_id ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="px-2 py-1.5 bg-slate-100 rounded text-sm font-mono break-all">{config.emergency_vapi_assistant_id}</code>
                    <span className="text-slate-500 text-sm">Agent is configured. Calls to your emergency number will use this agent.</span>
                    <button
                      type="button"
                      onClick={createAgent}
                      disabled={creatingAgent}
                      className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {creatingAgent ? 'Creating…' : 'Create new (replace)'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={createAgent}
                      disabled={creatingAgent}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {creatingAgent ? <Loader className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                      {creatingAgent ? 'Creating agent…' : 'Create Emergency Network agent'}
                    </button>
                    <p className="text-slate-500 text-xs mt-1">Creates the VAPI assistant and saves its ID here. No manual VAPI dashboard step.</p>
                  </div>
                )}
                {createAgentError && (
                  <p className="text-red-600 text-sm mt-1">{createAgentError}</p>
                )}
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm mt-2"
                  placeholder="Or paste an existing VAPI assistant ID"
                  value={config.emergency_vapi_assistant_id || ''}
                  onChange={(e) => { setConfig((c) => ({ ...c, emergency_vapi_assistant_id: e.target.value })); setConfigDirty(true); }}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Max dispatch attempts</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="w-24 rounded border border-slate-300 px-3 py-2 text-sm"
                  value={config.max_dispatch_attempts}
                  onChange={(e) => { setConfig((c) => ({ ...c, max_dispatch_attempts: parseInt(e.target.value, 10) || 5 })); setConfigDirty(true); }}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Notification email (phone intake)</label>
                <input
                  type="email"
                  className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="email@example.com"
                  value={config.notification_email || ''}
                  onChange={(e) => { setConfig((c) => ({ ...c, notification_email: e.target.value })); setConfigDirty(true); }}
                />
                <p className="text-xs text-slate-500 mt-1">Intake details from phone calls are sent to this address.</p>
              </div>
              {configDirty && (
                <button type="button" onClick={saveConfig} disabled={configSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                  <Save className="w-4 h-4" /> {configSaving ? 'Saving...' : 'Save config'}
                </button>
              )}
            </div>
          </section>

          {/* Analytics */}
          {analytics && (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Requests today</p>
                <p className="text-2xl font-semibold">{analytics.requests_today ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Total requests</p>
                <p className="text-2xl font-semibold">{analytics.total_requests ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">Acceptance rate</p>
                <p className="text-2xl font-semibold">{analytics.acceptance_rate ?? 0}%</p>
              </div>
            </section>
          )}

          {/* Live request feed */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <h2 className="text-lg font-medium mb-3">Live request feed</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2">Phone</th>
                    <th className="pb-2 pr-2">Service</th>
                    <th className="pb-2 pr-2">Urgency</th>
                    <th className="pb-2 pr-2">Location</th>
                    <th className="pb-2 pr-2">Channel</th>
                    <th className="pb-2 pr-2">Status</th>
                    <th className="pb-2 pr-2">Created</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan={9} className="py-4 text-slate-500 text-center">No requests yet</td></tr>
                  ) : (
                    requests.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2">{r.caller_name || '—'}</td>
                        <td className="py-2 pr-2">{r.callback_phone}</td>
                        <td className="py-2 pr-2">{r.service_category}</td>
                        <td className="py-2 pr-2">{r.urgency_level}</td>
                        <td className="py-2 pr-2 max-w-[120px] truncate" title={r.location}>{r.location || '—'}</td>
                        <td className="py-2 pr-2">
                          {r.intake_channel === 'phone' && <Phone className="w-4 h-4 inline" />}
                          {r.intake_channel === 'sms' && <MessageSquare className="w-4 h-4 inline" />}
                          {r.intake_channel === 'form' && <Globe className="w-4 h-4 inline" />}
                          {r.intake_channel}
                        </td>
                        <td className="py-2 pr-2">{r.status}</td>
                        <td className="py-2 pr-2">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                        <td className="py-2">
                          <select
                            value={r.status}
                            onChange={(e) => updateRequestStatus(r.id, e.target.value)}
                            className="rounded border border-slate-300 text-xs py-1"
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Provider directory */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">Provider directory</h2>
              <button
                type="button"
                onClick={() => setShowAddProvider(true)}
                className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
              >
                <Plus className="w-4 h-4" /> Add provider
              </button>
            </div>
            {showAddProvider && (
              <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-2">
                <input placeholder="Business name" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.business_name} onChange={(e) => setProviderForm((f) => ({ ...f, business_name: e.target.value }))} />
                <select className="w-full rounded border px-3 py-2 text-sm" value={providerForm.trade_type} onChange={(e) => setProviderForm((f) => ({ ...f, trade_type: e.target.value }))}>
                  {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Phone" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.phone} onChange={(e) => setProviderForm((f) => ({ ...f, phone: e.target.value }))} />
                <input placeholder="Service areas (comma-separated)" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.service_areas} onChange={(e) => setProviderForm((f) => ({ ...f, service_areas: e.target.value }))} />
                <select className="w-full rounded border px-3 py-2 text-sm" value={providerForm.priority_tier} onChange={(e) => setProviderForm((f) => ({ ...f, priority_tier: e.target.value }))}>
                  {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={providerForm.is_available} onChange={(e) => setProviderForm((f) => ({ ...f, is_available: e.target.checked }))} />
                  Available
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={createProvider} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm">Create</button>
                  <button type="button" onClick={() => setShowAddProvider(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-2 pr-2">Business</th>
                    <th className="pb-2 pr-2">Trade</th>
                    <th className="pb-2 pr-2">Phone</th>
                    <th className="pb-2 pr-2">Tier</th>
                    <th className="pb-2 pr-2">Verified</th>
                    <th className="pb-2 pr-2">Available</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.length === 0 ? (
                    <tr><td colSpan={7} className="py-4 text-slate-500 text-center">No providers. Add one to start dispatching.</td></tr>
                  ) : (
                    providers.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-2 pr-2">{p.business_name}</td>
                        <td className="py-2 pr-2">{p.trade_type}</td>
                        <td className="py-2 pr-2">{p.phone}</td>
                        <td className="py-2 pr-2">{p.priority_tier}</td>
                        <td className="py-2 pr-2">{p.verification_status}</td>
                        <td className="py-2 pr-2">{p.is_available ? 'Yes' : 'No'}</td>
                        <td className="py-2">
                          <button type="button" onClick={() => deleteProviderById(p.id)} className="text-red-600 hover:underline text-xs"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
