'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { emergencyNetworkAPI } from '@/lib/api';
import {
  ArrowLeft, Loader, RefreshCw, Phone, MessageSquare, Globe, Save, Plus, Trash2, Bot,
  Settings, ListChecks, Wrench, RotateCcw, PhoneCall, Mail, Truck, GripVertical, ChevronUp, ChevronDown,
  LayoutDashboard, Layers,
} from 'lucide-react';

const STATUS_OPTIONS = ['New', 'Contacting Providers', 'Accepted', 'Connected', 'Closed', 'Needs Manual Assist'];
const TRADE_TYPES = ['Plumbing', 'HVAC', 'Gas', 'Other'];
const TIER_OPTIONS = ['premium', 'priority', 'basic'];

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'recent-calls', label: 'Recent calls', icon: PhoneCall },
  { id: 'recent-messages', label: 'Recent messages', icon: Mail },
  { id: 'dispatched', label: 'Dispatched', icon: Truck },
];

const SETTINGS_SUB_TABS = [
  { id: 'service-types', label: 'Services we collect for' },
  { id: 'ai-collects', label: 'What the AI collects' },
  { id: 'services', label: 'Emergency Services (Provider Directory)' },
  { id: 'communication', label: 'Communication Settings' },
];

const BUILT_IN_KEYS = new Set(['caller_name', 'callback_phone', 'service_category', 'urgency_level', 'location', 'issue_summary']);
const DEFAULT_INTAKE_FIELDS = [
  { key: 'caller_name', label: "Caller's name", required: false, enabled: true },
  { key: 'callback_phone', label: 'Callback phone number', required: true, enabled: true },
  { key: 'service_category', label: 'Confirm: plumbing (pipe, drain, water heater, leak, etc.)', required: false, enabled: true },
  { key: 'urgency_level', label: 'Urgency (Immediate Emergency, Same Day, Schedule)', required: false, enabled: true },
  { key: 'location', label: 'Address or postal code', required: false, enabled: true },
  { key: 'issue_summary', label: 'Brief description of the issue', required: false, enabled: true },
];

export default function EmergencyDispatchPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsSubTab, setSettingsSubTab] = useState('communication');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [providers, setProviders] = useState([]);
  const [dispatchLog, setDispatchLog] = useState([]);
  const [config, setConfig] = useState({
    emergency_phone_numbers: [],
    emergency_vapi_assistant_id: '',
    max_dispatch_attempts: 5,
    notification_email: '',
    intake_fields: [...DEFAULT_INTAKE_FIELDS],
  });
  const [analytics, setAnalytics] = useState(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({
    business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '',
    verification_status: 'pending', priority_tier: 'basic', is_available: true,
  });
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createAgentError, setCreateAgentError] = useState(null);
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState([]);
  const [selectedNumberToAdd, setSelectedNumberToAdd] = useState('');
  const [configSaveMessage, setConfigSaveMessage] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const [configRes, requestsRes, providersRes, analyticsRes, phoneNumbersRes, dispatchLogRes] = await Promise.all([
        emergencyNetworkAPI.getConfig().catch(() => ({ data: config })),
        emergencyNetworkAPI.getRequests().catch(() => ({ data: { requests: [] } })),
        emergencyNetworkAPI.getProviders().catch(() => ({ data: { providers: [] } })),
        emergencyNetworkAPI.getAnalytics().catch(() => ({ data: {} })),
        emergencyNetworkAPI.getPhoneNumbers().catch(() => ({ data: { phone_numbers: [] } })),
        emergencyNetworkAPI.getDispatchLog().catch(() => ({ data: { log: [] } })),
      ]);
      setConfig({
        emergency_phone_numbers: configRes.data?.emergency_phone_numbers ?? [],
        emergency_vapi_assistant_id: configRes.data?.emergency_vapi_assistant_id ?? '',
        max_dispatch_attempts: configRes.data?.max_dispatch_attempts ?? 5,
        notification_email: configRes.data?.notification_email ?? '',
        intake_fields: Array.isArray(configRes.data?.intake_fields) && configRes.data.intake_fields.length > 0
          ? configRes.data.intake_fields
          : [...DEFAULT_INTAKE_FIELDS],
      });
      setRequests(requestsRes.data?.requests ?? []);
      setProviders(providersRes.data?.providers ?? []);
      setAnalytics(analyticsRes.data ?? null);
      setAvailablePhoneNumbers(phoneNumbersRes.data?.phone_numbers ?? []);
      setDispatchLog(dispatchLogRes.data?.log ?? []);
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
        intake_fields: Array.isArray(c.intake_fields) ? c.intake_fields : [...DEFAULT_INTAKE_FIELDS],
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
      if (id) setConfig((c) => ({ ...c, emergency_vapi_assistant_id: id }));
      setConfigDirty(false);
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

  const providerById = (id) => providers.find((p) => p.id === id) || null;
  const recentCalls = requests.filter((r) => r.intake_channel === 'phone').slice(0, 50);
  const recentMessages = requests.filter((r) => r.intake_channel === 'form' || r.intake_channel === 'sms').slice(0, 50);
  const dispatchedRequests = requests.filter(
    (r) => r.accepted_provider_id || ['Accepted', 'Connected', 'Closed'].includes(r.status)
  );

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
          <div className="flex items-center gap-4 mb-4">
            <Link href="/dashboard/v2/settings/modules" className="text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-semibold">Emergency Dispatch</h1>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={createAgent} disabled={creatingAgent} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60" title="Create or replace VAPI assistant">
                {creatingAgent ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Rebuild Agent
              </button>
              <button type="button" onClick={load} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          {createAgentError && <p className="text-red-600 text-sm mb-2">Rebuild: {createAgentError}</p>}
          <p className="text-slate-600 mb-4">
            24/7 Emergency & Priority Service Network. Public page: <a href="/emergency" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/emergency</a>
          </p>

          {/* Single row of square nav buttons (all pages) — one row, sizes scale with screen */}
          <div className="flex flex-nowrap gap-1 sm:gap-2 mb-6 w-full">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center p-2 sm:p-3 md:p-4 rounded-xl border text-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                  activeTab === id
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-800 hover:shadow-md hover:border-emerald-300'
                }`}
              >
                <Icon className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-emerald-600 shrink-0 mb-0.5 sm:mb-1" />
                <span className="text-[10px] sm:text-xs md:text-sm font-semibold truncate w-full leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* Dashboard home (like AI phone agent) */}
          {activeTab === 'dashboard' && (
            <>
              {(!config.notification_email || !String(config.notification_email).trim()) && (
                <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50">
                  <h3 className="text-sm font-semibold text-amber-800 mb-1">Set notification email</h3>
                  <p className="text-sm text-amber-700 mb-2">Intake details from phone calls are emailed to you. Add an address in Settings.</p>
                  <button type="button" onClick={() => setActiveTab('settings')} className="text-sm font-medium text-amber-800 underline">Go to Settings →</button>
                </div>
              )}
              {/* Stats cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {(config.emergency_phone_numbers || [])[0] && (
                  <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg">
                    <Phone className="w-8 h-8 mb-2 opacity-90" />
                    <h3 className="text-sm font-semibold opacity-90">Emergency line</h3>
                    <p className="text-lg font-bold mt-1">{(config.emergency_phone_numbers || [])[0]}</p>
                    <p className="text-xs opacity-80 mt-1">Primary number</p>
                  </div>
                )}
                <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm border-l-4 border-l-emerald-500">
                  <h3 className="text-sm font-semibold text-slate-500">Requests today</h3>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{analytics?.requests_today ?? 0}</p>
                </div>
                <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm border-l-4 border-l-emerald-500">
                  <h3 className="text-sm font-semibold text-slate-500">Total requests</h3>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{analytics?.total_requests ?? 0}</p>
                </div>
                <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm border-l-4 border-l-emerald-500">
                  <h3 className="text-sm font-semibold text-slate-500">Acceptance rate</h3>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{analytics?.acceptance_rate ?? 0}%</p>
                </div>
              </div>
              {/* Recent activity: two columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Recent calls</h3>
                    <button type="button" onClick={() => setActiveTab('recent-calls')} className="text-sm font-medium text-emerald-600 hover:underline">View all →</button>
                  </div>
                  {recentCalls.length === 0 ? (
                    <p className="text-center py-6 text-slate-500">No phone calls yet</p>
                  ) : (
                    <div className="space-y-2">
                      {recentCalls.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.caller_name || r.callback_phone}</p>
                            <p className="text-xs text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleString() : ''} · {r.service_category}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{r.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Recent messages</h3>
                    <button type="button" onClick={() => setActiveTab('recent-messages')} className="text-sm font-medium text-emerald-600 hover:underline">View all →</button>
                  </div>
                  {recentMessages.length === 0 ? (
                    <p className="text-center py-6 text-slate-500">No form or SMS requests yet</p>
                  ) : (
                    <div className="space-y-2">
                      {recentMessages.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.caller_name || r.callback_phone}</p>
                            <p className="text-xs text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleString() : ''} · {r.intake_channel}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700">{r.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Settings: 4 sub-tabs (Services we collect for, What the AI collects, Provider Directory, Communication Settings) */}
          {activeTab === 'settings' && (
            <>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
                {SETTINGS_SUB_TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsSubTab(id)}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                      settingsSubTab === id
                        ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {settingsSubTab === 'service-types' && (() => {
            const full = config.intake_fields || [];
            const serviceCategoryField = full.find((f) => f.key === 'service_category') || { key: 'service_category', label: 'Confirm: plumbing (pipe, drain, water heater, leak, etc.)', required: false, enabled: true };
            const idx = full.findIndex((f) => f.key === 'service_category');
            const updateServiceCategory = (patch) => {
              if (idx >= 0) {
                const next = full.map((f, i) => i === idx ? { ...f, ...patch } : f);
                setConfig((c) => ({ ...c, intake_fields: next }));
              } else {
                setConfig((c) => ({ ...c, intake_fields: [...full, { ...serviceCategoryField, ...patch }] }));
              }
              setConfigDirty(true);
            };
            return (
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-medium mb-4">Services we collect for</h2>
                <p className="text-slate-600 text-sm mb-4">Configure which service type this line collects (e.g. plumbing). The phrase below is what the AI uses to confirm with the caller. Rebuild the agent after saving.</p>
                <div className="max-w-2xl space-y-3">
                  <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                    <label className="flex items-center gap-1 shrink-0">
                      <input
                        type="checkbox"
                        checked={serviceCategoryField.enabled !== false}
                        onChange={(e) => updateServiceCategory({ enabled: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm">Collect</span>
                    </label>
                    <input
                      type="text"
                      className="flex-1 min-w-[200px] rounded border border-slate-300 px-2 py-1.5 text-sm"
                      placeholder="e.g. Confirm: plumbing (pipe, drain, water heater, leak, etc.)"
                      value={serviceCategoryField.label || ''}
                      onChange={(e) => updateServiceCategory({ label: e.target.value })}
                    />
                    <label className="flex items-center gap-1 shrink-0 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={!!serviceCategoryField.required}
                        onChange={(e) => updateServiceCategory({ required: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      Required
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4">
                  {configDirty && (
                    <button type="button" onClick={saveConfig} disabled={configSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                      <Save className="w-4 h-4" /> {configSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
                {configSaveMessage && <p className={`text-sm mt-2 ${configSaveMessage === 'Saved' ? 'text-emerald-600' : 'text-red-600'}`}>{configSaveMessage}</p>}
              </section>
            );
          })()}

              {settingsSubTab === 'ai-collects' && (() => {
            const fullFields = config.intake_fields || [];
            const displayedFields = fullFields.filter((f) => f.key !== 'service_category');
            const mergeIntakeFields = (newDisplayed) => {
              const serviceCat = fullFields.find((f) => f.key === 'service_category');
              const next = [];
              let j = 0;
              for (let i = 0; i < fullFields.length; i++) {
                if (fullFields[i].key === 'service_category') next.push(serviceCat || fullFields[i]);
                else if (j < newDisplayed.length) next.push(newDisplayed[j++]);
              }
              while (j < newDisplayed.length) next.push(newDisplayed[j++]);
              return next;
            };
            return (
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-medium mb-4">What the AI collects</h2>
                <p className="text-slate-600 text-sm mb-4">Configure which details the AI asks for on the phone (excluding service type, which is in Services we collect for). Reorder with the arrows. Rebuild the agent after saving to apply changes.</p>
                <div className="space-y-2 mb-4">
                  {displayedFields.map((field, displayIndex) => {
                    const fullIdx = fullFields.findIndex((f) => f.key === field.key);
                    return (
                      <div key={field.key || displayIndex} className="flex items-center gap-2 flex-wrap p-2 rounded-lg border border-slate-200 bg-slate-50/50">
                        <span className="text-slate-400" title="Drag to reorder"><GripVertical className="w-4 h-4" /></span>
                        <label className="flex items-center gap-1 shrink-0">
                          <input
                            type="checkbox"
                            checked={field.enabled !== false}
                            onChange={(e) => {
                              const next = fullFields.map((f, i) => i === fullIdx ? { ...f, enabled: e.target.checked } : f);
                              setConfig((c) => ({ ...c, intake_fields: next }));
                              setConfigDirty(true);
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm">Collect</span>
                        </label>
                        {BUILT_IN_KEYS.has(field.key) ? (
                          <span className="flex-1 min-w-[200px] text-sm text-slate-700">{field.label}</span>
                        ) : (
                          <input
                            type="text"
                            className="flex-1 min-w-[180px] rounded border border-slate-300 px-2 py-1.5 text-sm"
                            placeholder="Field label (e.g. Preferred contact time)"
                            value={field.label || ''}
                            onChange={(e) => {
                              const next = fullFields.map((f, i) => i === fullIdx ? { ...f, label: e.target.value } : f);
                              setConfig((c) => ({ ...c, intake_fields: next }));
                              setConfigDirty(true);
                            }}
                          />
                        )}
                        <label className="flex items-center gap-1 shrink-0 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={!!field.required}
                            onChange={(e) => {
                              const next = fullFields.map((f, i) => i === fullIdx ? { ...f, required: e.target.checked } : f);
                              setConfig((c) => ({ ...c, intake_fields: next }));
                              setConfigDirty(true);
                            }}
                            className="rounded border-slate-300"
                          />
                          Required
                        </label>
                        <div className="flex gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={displayIndex === 0}
                            onClick={() => {
                              if (displayIndex === 0) return;
                              const reordered = [...displayedFields];
                              [reordered[displayIndex - 1], reordered[displayIndex]] = [reordered[displayIndex], reordered[displayIndex - 1]];
                              setConfig((c) => ({ ...c, intake_fields: mergeIntakeFields(reordered) }));
                              setConfigDirty(true);
                            }}
                            className="p-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
                            title="Move up"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={displayIndex === displayedFields.length - 1}
                            onClick={() => {
                              if (displayIndex >= displayedFields.length - 1) return;
                              const reordered = [...displayedFields];
                              [reordered[displayIndex], reordered[displayIndex + 1]] = [reordered[displayIndex + 1], reordered[displayIndex]];
                              setConfig((c) => ({ ...c, intake_fields: mergeIntakeFields(reordered) }));
                              setConfigDirty(true);
                            }}
                            className="p-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
                            title="Move down"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                        {!BUILT_IN_KEYS.has(field.key) && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = displayedFields.filter((_, i) => i !== displayIndex);
                              setConfig((c) => ({ ...c, intake_fields: mergeIntakeFields(next) }));
                              setConfigDirty(true);
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Remove field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      const next = mergeIntakeFields([...displayedFields, { key: `custom_${Date.now()}`, label: 'New field', required: false, enabled: true }]);
                      setConfig((c) => ({ ...c, intake_fields: next }));
                      setConfigDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
                  >
                    <Plus className="w-4 h-4" /> Add field
                  </button>
                  {configDirty && (
                    <button type="button" onClick={saveConfig} disabled={configSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                      <Save className="w-4 h-4" /> {configSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
                {configSaveMessage && <p className={`text-sm mt-2 ${configSaveMessage === 'Saved' ? 'text-emerald-600' : 'text-red-600'}`}>{configSaveMessage}</p>}
              </section>
            );
          })()}

              {settingsSubTab === 'services' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Emergency Services (Provider Directory)</h2>
                <button type="button" onClick={() => setShowAddProvider(true)} className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700">
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
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={providerForm.is_available} onChange={(e) => setProviderForm((f) => ({ ...f, is_available: e.target.checked }))} /> Available</label>
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
          )}

              {settingsSubTab === 'communication' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4">Communication Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Emergency phone numbers</label>
                  {config.webhook_url && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                      <p className="font-medium text-amber-800 mb-1">VAPI setup</p>
                      <p className="text-amber-700 mb-2">In VAPI dashboard, set each number’s <strong>Server URL</strong> to:</p>
                      <code className="block px-2 py-1.5 bg-white border border-amber-200 rounded text-xs font-mono break-all select-all">{config.webhook_url}</code>
                      <p className="text-amber-700 mt-2 text-xs">Leave Assistant unset (dynamic).</p>
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
                  <div className="flex gap-2 mb-2">
                    <select
                      className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm bg-white max-w-xs"
                      value={selectedNumberToAdd}
                      onChange={(e) => setSelectedNumberToAdd(e.target.value)}
                    >
                      <option value="">Choose number...</option>
                      {(availablePhoneNumbers || []).filter((pn) => !(config.emergency_phone_numbers || []).includes(pn.e164 || pn.number)).map((pn) => {
                        const num = pn.e164 || pn.number;
                        return <option key={num} value={num}>{num}</option>;
                      })}
                    </select>
                    <button type="button" onClick={addSelectedPhoneNumber} disabled={!selectedNumberToAdd || configSaving} className="px-3 py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700 disabled:opacity-50">
                      Add selected
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="tel" placeholder="+15551234567" className="flex-1 max-w-xs rounded border border-slate-300 px-3 py-2 text-sm" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                    <button type="button" onClick={addPhoneNumber} className="px-3 py-2 bg-slate-200 rounded text-sm hover:bg-slate-300">Add</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Notification email (phone intake)</label>
                  <input type="email" className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm" placeholder="email@example.com" value={config.notification_email || ''} onChange={(e) => { setConfig((c) => ({ ...c, notification_email: e.target.value })); setConfigDirty(true); }} />
                  <p className="text-xs text-slate-500 mt-1">Intake details from phone calls are sent here.</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Max dispatch attempts</label>
                  <input type="number" min={1} max={20} className="w-24 rounded border border-slate-300 px-3 py-2 text-sm" value={config.max_dispatch_attempts} onChange={(e) => { setConfig((c) => ({ ...c, max_dispatch_attempts: parseInt(e.target.value, 10) || 5 })); setConfigDirty(true); }} />
                </div>
                {configSaveMessage && <p className={`text-sm ${configSaveMessage === 'Saved' ? 'text-emerald-600' : 'text-red-600'}`}>{configSaveMessage}</p>}
                {configDirty && (
                  <button type="button" onClick={saveConfig} disabled={configSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                    <Save className="w-4 h-4" /> {configSaving ? 'Saving...' : 'Save config'}
                  </button>
                )}
              </div>
            </section>
          )}
            </>
          )}

          {/* Recent calls */}
          {activeTab === 'recent-calls' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4">Recent calls</h2>
              <p className="text-slate-600 text-sm mb-4">Service requests from phone intake.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="pb-2 pr-2">Name</th>
                      <th className="pb-2 pr-2">Phone</th>
                      <th className="pb-2 pr-2">Service</th>
                      <th className="pb-2 pr-2">Urgency</th>
                      <th className="pb-2 pr-2">Location</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2 pr-2">Created</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCalls.length === 0 ? (
                      <tr><td colSpan={8} className="py-4 text-slate-500 text-center">No phone calls yet</td></tr>
                    ) : (
                      recentCalls.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="py-2 pr-2">{r.caller_name || '—'}</td>
                          <td className="py-2 pr-2">{r.callback_phone}</td>
                          <td className="py-2 pr-2">{r.service_category}</td>
                          <td className="py-2 pr-2">{r.urgency_level}</td>
                          <td className="py-2 pr-2 max-w-[120px] truncate" title={r.location}>{r.location || '—'}</td>
                          <td className="py-2 pr-2">{r.status}</td>
                          <td className="py-2 pr-2">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                          <td className="py-2">
                            <select value={r.status} onChange={(e) => updateRequestStatus(r.id, e.target.value)} className="rounded border border-slate-300 text-xs py-1">
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
          )}

          {/* Recent messages */}
          {activeTab === 'recent-messages' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4">Recent messages</h2>
              <p className="text-slate-600 text-sm mb-4">Service requests from form or SMS.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="pb-2 pr-2">Channel</th>
                      <th className="pb-2 pr-2">Name</th>
                      <th className="pb-2 pr-2">Phone</th>
                      <th className="pb-2 pr-2">Service</th>
                      <th className="pb-2 pr-2">Urgency</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2 pr-2">Created</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMessages.length === 0 ? (
                      <tr><td colSpan={8} className="py-4 text-slate-500 text-center">No form or SMS requests yet</td></tr>
                    ) : (
                      recentMessages.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="py-2 pr-2">{r.intake_channel === 'form' ? <Globe className="w-4 h-4 inline" /> : <MessageSquare className="w-4 h-4 inline" />} {r.intake_channel}</td>
                          <td className="py-2 pr-2">{r.caller_name || '—'}</td>
                          <td className="py-2 pr-2">{r.callback_phone}</td>
                          <td className="py-2 pr-2">{r.service_category}</td>
                          <td className="py-2 pr-2">{r.urgency_level}</td>
                          <td className="py-2 pr-2">{r.status}</td>
                          <td className="py-2 pr-2">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                          <td className="py-2">
                            <select value={r.status} onChange={(e) => updateRequestStatus(r.id, e.target.value)} className="rounded border border-slate-300 text-xs py-1">
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
          )}

          {/* Dispatched */}
          {activeTab === 'dispatched' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4">Dispatched</h2>
              <p className="text-slate-600 text-sm mb-4">Customer emergencies that have been dispatched and to whom.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="pb-2 pr-2">Customer</th>
                      <th className="pb-2 pr-2">Phone</th>
                      <th className="pb-2 pr-2">Service</th>
                      <th className="pb-2 pr-2">Urgency</th>
                      <th className="pb-2 pr-2">Dispatched to</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2 pr-2">Created</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchedRequests.length === 0 ? (
                      <tr><td colSpan={8} className="py-4 text-slate-500 text-center">No dispatched requests yet</td></tr>
                    ) : (
                      dispatchedRequests.map((r) => {
                        const provider = r.accepted_provider_id ? providerById(r.accepted_provider_id) : null;
                        return (
                          <tr key={r.id} className="border-b border-slate-100">
                            <td className="py-2 pr-2">{r.caller_name || '—'}</td>
                            <td className="py-2 pr-2">{r.callback_phone}</td>
                            <td className="py-2 pr-2">{r.service_category}</td>
                            <td className="py-2 pr-2">{r.urgency_level}</td>
                            <td className="py-2 pr-2">{provider ? provider.business_name : (r.accepted_provider_id ? '—' : '—')}</td>
                            <td className="py-2 pr-2">{r.status}</td>
                            <td className="py-2 pr-2">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                            <td className="py-2">
                              <select value={r.status} onChange={(e) => updateRequestStatus(r.id, e.target.value)} className="rounded border border-slate-300 text-xs py-1">
                                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {dispatchLog.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Dispatch log (attempts)</h3>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-600">
                          <th className="pb-1 pr-2">Request ID</th>
                          <th className="pb-1 pr-2">Provider</th>
                          <th className="pb-1 pr-2">Order</th>
                          <th className="pb-1 pr-2">Result</th>
                          <th className="pb-1">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dispatchLog.slice(0, 30).map((entry) => {
                          const prov = providerById(entry.provider_id);
                          return (
                            <tr key={entry.id} className="border-b border-slate-100">
                              <td className="py-1 pr-2 font-mono text-slate-500">{String(entry.service_request_id).slice(0, 8)}…</td>
                              <td className="py-1 pr-2">{prov ? prov.business_name : entry.provider_id}</td>
                              <td className="py-1 pr-2">{entry.attempt_order}</td>
                              <td className="py-1 pr-2">{entry.result || '—'}</td>
                              <td className="py-1">{entry.attempted_at ? new Date(entry.attempted_at).toLocaleString() : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Analytics (show on Settings when visible) */}
          {analytics && activeTab === 'settings' && (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
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
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
