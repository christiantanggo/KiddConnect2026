'use client';

import { useState, useEffect, useMemo } from 'react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  return document.cookie.split(';').find(c => c.trim().startsWith('admin_token='))?.split('=')[1]?.trim() || null;
}

const TABS = [
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'add-delivery', label: 'Add delivery' },
  { key: 'settings', label: 'Settings' },
];

const SETTINGS_SUB_TABS = [
  { key: 'line-agent', label: 'Delivery line & agent' },
  { key: 'delivery-apis', label: 'Delivery company APIs' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'legal', label: 'Legal & SMS' },
  { key: 'billing', label: 'Dispatch rate / Billing' },
  { key: 'service-line', label: 'Service line name' },
];

const BROKER_OPTIONS = [
  { id: 'shipday', name: 'Shipday', description: 'Connect your Shipday account to dispatch deliveries. API key from Shipday dashboard.', baseUrlPlaceholder: 'https://api.shipday.com (optional)' },
  // Add more brokers here as needed, e.g. { id: 'doordash', name: 'DoorDash', description: '...', comingSoon: true }
];

function AdminDeliveryOperatorPage() {
  const [activeTab, setActiveTab] = useState('deliveries');
  const [settingsSubTab, setSettingsSubTab] = useState('line-agent');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Add delivery (manual) state
  const [businesses, setBusinesses] = useState([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [addDeliveryForm, setAddDeliveryForm] = useState({
    business_id: '',
    callback_phone: '',
    delivery_address: '',
    pickup_address: '',
    recipient_name: '',
    package_description: '',
    priority: 'Schedule',
  });
  const [addDeliverySubmitting, setAddDeliverySubmitting] = useState(false);
  const [addDeliverySuccess, setAddDeliverySuccess] = useState(null);
  const [businessSearchQuery, setBusinessSearchQuery] = useState('');
  const [businessDropdownOpen, setBusinessDropdownOpen] = useState(false);

  // Businesses are stored sorted A–Z; filter by search (keeps sort)
  const filteredBusinesses = useMemo(() => {
    const q = (businessSearchQuery || '').trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter(
      (b) =>
        (b.name || '').toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q)
    );
  }, [businesses, businessSearchQuery]);

  // Settings state
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [agentLoading, setAgentLoading] = useState(null); // 'create' | 'link'
  const [testingBrokerId, setTestingBrokerId] = useState(null); // broker id while testing connection
  const [configForm, setConfigForm] = useState({
    delivery_phone_numbers: [],
    notification_email: '',
    notification_sms_number: '',
    email_enabled: true,
    sms_enabled: false,
    escalation_email_enabled: true,
    escalation_sms_enabled: false,
    customer_sms_enabled: false,
    customer_sms_message: '',
    customer_sms_legal: '',
    service_line_name: 'Last-Mile Delivery',
    billing: { price_basic_cents: '', price_priority_cents: '', sms_fee_cents: '' },
    brokers: {},
  });

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

  useEffect(() => {
    if (activeTab === 'deliveries') load();
  }, [statusFilter, activeTab]);

  useEffect(() => {
    if (activeTab === 'add-delivery' && businesses.length === 0) {
      const token = getAdminToken();
      if (!token) return;
      setBusinessesLoading(true);
      fetch(`${API_URL}/api/admin/accounts?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.ok ? res.json() : { businesses: [] })
        .then((data) => {
          const list = (data.businesses || []).slice();
          list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
          setBusinesses(list);
        })
        .catch(() => setBusinesses([]))
        .finally(() => setBusinessesLoading(false));
    }
  }, [activeTab]);

  const loadConfig = async () => {
    const token = getAdminToken();
    if (!token) return;
    setConfigLoading(true);
    try {
      const [configRes, numbersRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/admin/delivery-operator/config`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v2/admin/delivery-operator/phone-numbers`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const configData = configRes.ok ? await configRes.json() : {};
      const numbersData = numbersRes.ok ? await numbersRes.json() : {};
      setConfig(configData);
      setPhoneNumbers(numbersData.phone_numbers || []);
      setConfigForm({
        delivery_phone_numbers: Array.isArray(configData.delivery_phone_numbers) ? configData.delivery_phone_numbers : [],
        notification_email: configData.notification_email || '',
        notification_sms_number: configData.notification_sms_number || '',
        email_enabled: configData.email_enabled !== false,
        sms_enabled: !!configData.sms_enabled,
        escalation_email_enabled: configData.escalation_email_enabled !== false,
        escalation_sms_enabled: !!configData.escalation_sms_enabled,
        customer_sms_enabled: !!configData.customer_sms_enabled,
        customer_sms_message: configData.customer_sms_message || '',
        customer_sms_legal: configData.customer_sms_legal || '',
        service_line_name: configData.service_line_name || 'Last-Mile Delivery',
        billing: {
          price_basic_cents: configData.billing?.price_basic_cents ?? '',
          price_priority_cents: configData.billing?.price_priority_cents ?? '',
          sms_fee_cents: configData.billing?.sms_fee_cents ?? '',
        },
        brokers: configData.brokers && typeof configData.brokers === 'object' ? configData.brokers : {},
      });
    } catch (e) {
      console.error(e);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') loadConfig();
  }, [activeTab]);

  const saveConfig = async () => {
    const token = getAdminToken();
    if (!token) return;
    setConfigSaving(true);
    try {
      const body = {
        delivery_phone_numbers: configForm.delivery_phone_numbers,
        notification_email: configForm.notification_email || null,
        notification_sms_number: configForm.notification_sms_number || null,
        email_enabled: configForm.email_enabled,
        sms_enabled: configForm.sms_enabled,
        escalation_email_enabled: configForm.escalation_email_enabled,
        escalation_sms_enabled: configForm.escalation_sms_enabled,
        customer_sms_enabled: configForm.customer_sms_enabled,
        customer_sms_message: configForm.customer_sms_message || null,
        customer_sms_legal: configForm.customer_sms_legal || null,
        service_line_name: configForm.service_line_name || null,
        billing: {
          price_basic_cents: typeof configForm.billing.price_basic_cents === 'number' ? configForm.billing.price_basic_cents : (configForm.billing.price_basic_cents === '' ? undefined : Math.round(Number(configForm.billing.price_basic_cents))),
          price_priority_cents: typeof configForm.billing.price_priority_cents === 'number' ? configForm.billing.price_priority_cents : (configForm.billing.price_priority_cents === '' ? undefined : Math.round(Number(configForm.billing.price_priority_cents))),
          sms_fee_cents: typeof configForm.billing.sms_fee_cents === 'number' ? configForm.billing.sms_fee_cents : (configForm.billing.sms_fee_cents === '' ? undefined : Math.round(Number(configForm.billing.sms_fee_cents))),
        },
        brokers: configForm.brokers && typeof configForm.brokers === 'object' ? configForm.brokers : {},
      };
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json())?.error || res.statusText);
      await loadConfig();
    } catch (e) {
      alert(e.message || 'Save failed');
    } finally {
      setConfigSaving(false);
    }
  };

  const createAgent = async () => {
    const token = getAdminToken();
    if (!token) return;
    setAgentLoading('create');
    try {
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/create-agent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.link_result?.errors?.length) {
        alert(`Agent created. Link result: ${data.link_result.linked?.length || 0} linked; ${data.link_result.errors.join('; ')}`);
      }
      await loadConfig();
    } catch (e) {
      alert(e.message || 'Create agent failed');
    } finally {
      setAgentLoading(null);
    }
  };

  const testBrokerConnection = async (brokerId) => {
    const entry = configForm.brokers?.[brokerId] || {};
    const apiKey = (entry.api_key || '').trim();
    if (!apiKey) {
      alert('Enter an API key first.');
      return;
    }
    setTestingBrokerId(brokerId);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/test-broker-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          broker_id: brokerId,
          api_key: apiKey,
          base_url: (entry.base_url || '').trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Connection successful. The API key is valid.');
      } else {
        alert(data.error || 'Connection test failed.');
      }
    } catch (e) {
      alert(e.message || 'Connection test failed.');
    } finally {
      setTestingBrokerId(null);
    }
  };

  const linkAgent = async () => {
    const token = getAdminToken();
    if (!token) return;
    setAgentLoading('link');
    try {
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/link-agent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.errors?.length) alert(data.message || data.errors.join('; '));
      else alert(data.message || 'Linked.');
      await loadConfig();
    } catch (e) {
      alert(e.message || 'Link failed');
    } finally {
      setAgentLoading(null);
    }
  };

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
  const baseDisplayRequests = statusFilter ? requests : rest;

  const matchSearch = (r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const fields = [
      r.business_name,
      r.delivery_address,
      r.pickup_address,
      r.callback_phone,
      r.caller_phone,
      r.reference_number,
      r.recipient_name,
    ].filter(Boolean).map((s) => String(s).toLowerCase());
    return fields.some((f) => f.includes(q));
  };
  const filteredEscalated = escalated.filter(matchSearch);
  const displayRequests = baseDisplayRequests.filter(matchSearch);

  const toggleDeliveryNumber = (num) => {
    const list = configForm.delivery_phone_numbers || [];
    const next = list.includes(num) ? list.filter(n => n !== num) : [...list, num];
    setConfigForm(f => ({ ...f, delivery_phone_numbers: next }));
  };

  const handleAddDeliverySubmit = async (e) => {
    e.preventDefault();
    setAddDeliverySuccess(null);
    if (!addDeliveryForm.business_id?.trim()) {
      alert('Please select a business.');
      return;
    }
    if (!addDeliveryForm.callback_phone?.trim()) {
      alert('Contact phone is required.');
      return;
    }
    if (!addDeliveryForm.delivery_address?.trim()) {
      alert('Delivery address is required.');
      return;
    }
    setAddDeliverySubmitting(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/v2/admin/delivery-operator/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          business_id: addDeliveryForm.business_id.trim(),
          callback_phone: addDeliveryForm.callback_phone.trim(),
          delivery_address: addDeliveryForm.delivery_address.trim(),
          pickup_address: addDeliveryForm.pickup_address?.trim() || undefined,
          recipient_name: addDeliveryForm.recipient_name?.trim() || undefined,
          package_description: addDeliveryForm.package_description?.trim() || undefined,
          priority: addDeliveryForm.priority,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setAddDeliverySuccess({ reference_number: data.reference_number, request_id: data.request_id });
      setAddDeliveryForm({
        business_id: addDeliveryForm.business_id,
        callback_phone: '',
        delivery_address: '',
        pickup_address: '',
        recipient_name: '',
        package_description: '',
        priority: 'Schedule',
      });
      setBusinessSearchQuery('');
      setBusinessDropdownOpen(false);
    } catch (err) {
      alert(err.message || 'Failed to create delivery.');
    } finally {
      setAddDeliverySubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Delivery operator</h1>
        </div>

          <div className="flex gap-2 border-b border-slate-200 mb-6">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
                  activeTab === key
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'settings' && (
            <>
              <div className="flex gap-2 border-b border-slate-200 mb-4">
                {SETTINGS_SUB_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSettingsSubTab(key)}
                    className={`px-3 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
                      settingsSubTab === key
                        ? 'border-slate-600 text-slate-800 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="min-h-[320px]">
              {configLoading ? (
                <p className="text-slate-500">Loading settings…</p>
              ) : (
                <>
                  {settingsSubTab === 'line-agent' && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Delivery line & agent</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Delivery line number(s)</label>
                        <p className="text-xs text-slate-500 mb-2">Calls to these numbers are routed to the delivery assistant.</p>
                        <div className="flex flex-wrap gap-2">
                          {phoneNumbers.map((pn) => {
                            const n = pn.number || pn.e164;
                            const selected = (configForm.delivery_phone_numbers || []).includes(n);
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => toggleDeliveryNumber(n)}
                                className={`px-3 py-1.5 rounded text-sm border ${
                                  selected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {n} {selected ? '✓' : ''}
                              </button>
                            );
                          })}
                          {phoneNumbers.length === 0 && <span className="text-slate-500 text-sm">No numbers available. Add numbers in Telnyx/VAPI.</span>}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Delivery assistant (VAPI)</label>
                        <p className="text-sm text-slate-600 mb-2">
                          {config?.delivery_vapi_assistant_id ? (
                            <span className="font-mono">{config.delivery_vapi_assistant_id}</span>
                          ) : (
                            <span className="text-amber-600">Not set</span>
                          )}
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={createAgent} disabled={agentLoading !== null} className="px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">Rebuild agent</button>
                          <button type="button" onClick={linkAgent} disabled={agentLoading !== null || !config?.delivery_vapi_assistant_id} className="px-4 py-2 rounded bg-slate-600 text-white text-sm hover:bg-slate-700 disabled:opacity-50">Link agent to numbers</button>
                          {agentLoading && <span className="text-slate-500 text-sm self-center">…</span>}
                        </div>
                      </div>
                    </div>
                  </section>
                  )}

                  {settingsSubTab === 'delivery-apis' && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-2">Delivery company APIs</h2>
                    <p className="text-sm text-slate-600 mb-6">Connect courier or delivery networks. When a delivery is requested, the system will use these APIs to dispatch to the connected providers. Add API keys from each provider’s dashboard.</p>
                    <div className="space-y-6">
                      {BROKER_OPTIONS.map((broker) => {
                        const entry = configForm.brokers?.[broker.id] || { enabled: false, api_key: '', base_url: '' };
                        return (
                          <div key={broker.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <input
                                type="checkbox"
                                id={`broker-${broker.id}-enabled`}
                                checked={!!entry.enabled}
                                onChange={(e) => setConfigForm(f => ({
                                  ...f,
                                  brokers: {
                                    ...(f.brokers || {}),
                                    [broker.id]: { ...(f.brokers?.[broker.id] || {}), enabled: e.target.checked },
                                  },
                                }))}
                                className="rounded border-slate-300"
                              />
                              <label htmlFor={`broker-${broker.id}-enabled`} className="font-medium text-slate-800">{broker.name}</label>
                            </div>
                            <p className="text-sm text-slate-600 mb-3">{broker.description}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm text-slate-700 mb-1">API key</label>
                                <input
                                  type="password"
                                  autoComplete="off"
                                  value={entry.api_key || ''}
                                  onChange={(e) => setConfigForm(f => ({
                                    ...f,
                                    brokers: {
                                      ...(f.brokers || {}),
                                      [broker.id]: { ...(f.brokers?.[broker.id] || {}), api_key: e.target.value },
                                    },
                                  }))}
                                  placeholder="Paste API key from provider"
                                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-sm text-slate-700 mb-1">Base URL (optional)</label>
                                <input
                                  type="url"
                                  value={entry.base_url || ''}
                                  onChange={(e) => setConfigForm(f => ({
                                    ...f,
                                    brokers: {
                                      ...(f.brokers || {}),
                                      [broker.id]: { ...(f.brokers?.[broker.id] || {}), base_url: e.target.value },
                                    },
                                  }))}
                                  placeholder={broker.baseUrlPlaceholder || 'https://api.example.com'}
                                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                                />
                              </div>
                            </div>
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => testBrokerConnection(broker.id)}
                                disabled={testingBrokerId !== null || !(entry.api_key || '').trim()}
                                className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {testingBrokerId === broker.id ? 'Testing…' : 'Test connection'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 mt-4">API keys are stored in the delivery config. For production, ensure your backend and database are secured. More delivery providers can be added here in future updates.</p>
                  </section>
                  )}

                  {settingsSubTab === 'notifications' && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Notifications</h2>
                    <div className="space-y-4">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={configForm.email_enabled} onChange={(e) => setConfigForm(f => ({ ...f, email_enabled: e.target.checked }))} className="rounded border-slate-300" />
                        <span className="text-sm text-slate-700">Send email when new delivery request</span>
                      </label>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">Notification email</label>
                        <input type="email" value={configForm.notification_email} onChange={(e) => setConfigForm(f => ({ ...f, notification_email: e.target.value }))} placeholder="admin@example.com" className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={configForm.sms_enabled} onChange={(e) => setConfigForm(f => ({ ...f, sms_enabled: e.target.checked }))} className="rounded border-slate-300" />
                        <span className="text-sm text-slate-700">Send SMS when new request</span>
                      </label>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">SMS number</label>
                        <input type="text" value={configForm.notification_sms_number} onChange={(e) => setConfigForm(f => ({ ...f, notification_sms_number: e.target.value }))} placeholder="+1234567890" className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={configForm.escalation_email_enabled} onChange={(e) => setConfigForm(f => ({ ...f, escalation_email_enabled: e.target.checked }))} className="rounded border-slate-300" />
                        <span className="text-sm text-slate-700">Email on escalation (Needs Manual Assist)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={configForm.escalation_sms_enabled} onChange={(e) => setConfigForm(f => ({ ...f, escalation_sms_enabled: e.target.checked }))} className="rounded border-slate-300" />
                        <span className="text-sm text-slate-700">SMS on escalation</span>
                      </label>
                    </div>
                  </section>
                  )}

                  {settingsSubTab === 'legal' && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Legal & SMS</h2>
                    <div className="space-y-4">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={configForm.customer_sms_enabled} onChange={(e) => setConfigForm(f => ({ ...f, customer_sms_enabled: e.target.checked }))} className="rounded border-slate-300" />
                        <span className="text-sm text-slate-700">Send SMS to customer (e.g. confirmation)</span>
                      </label>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">Customer SMS message template</label>
                        <input type="text" value={configForm.customer_sms_message} onChange={(e) => setConfigForm(f => ({ ...f, customer_sms_message: e.target.value }))} placeholder="Optional default message" className="w-full max-w-md px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">Legal / compliance text for SMS</label>
                        <textarea value={configForm.customer_sms_legal} onChange={(e) => setConfigForm(f => ({ ...f, customer_sms_legal: e.target.value }))} placeholder="e.g. Msg & data rates may apply" rows={2} className="w-full max-w-md px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                    </div>
                  </section>
                  )}

                  {settingsSubTab === 'billing' && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Dispatch rate / Billing (defaults)</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">Basic price (cents)</label>
                        <input type="number" value={configForm.billing.price_basic_cents} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, price_basic_cents: e.target.value } }))} placeholder="e.g. 1800" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">Priority price (cents)</label>
                        <input type="number" value={configForm.billing.price_priority_cents} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, price_priority_cents: e.target.value } }))} placeholder="e.g. 2200" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">SMS fee (cents)</label>
                        <input type="number" value={configForm.billing.sms_fee_cents} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, sms_fee_cents: e.target.value } }))} placeholder="e.g. 2" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                      </div>
                    </div>
                  </section>
                  )}

                  {settingsSubTab === 'service-line' && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-semibold text-slate-800 mb-2">Service line name</h2>
                    <input type="text" value={configForm.service_line_name} onChange={(e) => setConfigForm(f => ({ ...f, service_line_name: e.target.value }))} placeholder="Last-Mile Delivery" className="w-full max-w-md px-3 py-2 border border-slate-300 rounded text-sm" />
                  </section>
                  )}

                  <div className="flex items-center gap-4 mt-6">
                    <button type="button" onClick={saveConfig} disabled={configSaving} className="px-6 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">Save settings</button>
                    {configSaving && <span className="text-slate-500 text-sm">Saving…</span>}
                  </div>

                  <p className="text-sm text-slate-500">Approved numbers are managed per business in each business’s delivery dashboard. Website page labels and public form content can be configured in the delivery module settings per business.</p>
                </>
              )}
              </div>
            </>
          )}

          {activeTab === 'add-delivery' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Add delivery for a business</h2>
              <p className="text-sm text-slate-600 mb-6">Create a delivery request on behalf of a business when needed (e.g. account issues). Dispatch will run automatically after creation.</p>
              {addDeliverySuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                  Delivery created. Reference: <strong>{addDeliverySuccess.reference_number}</strong>. You can find it in the Deliveries tab.
                </div>
              )}
              <form onSubmit={handleAddDeliverySubmit} className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Business <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    value={businessSearchQuery}
                    onChange={(e) => {
                      setBusinessSearchQuery(e.target.value);
                      setBusinessDropdownOpen(true);
                      if (!e.target.value.trim()) setAddDeliveryForm(f => ({ ...f, business_id: '' }));
                    }}
                    onFocus={() => setBusinessDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setBusinessDropdownOpen(false), 200)}
                    placeholder="Type to search or select a business"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 bg-white"
                    autoComplete="off"
                  />
                  <input type="hidden" name="business_id" value={addDeliveryForm.business_id} />
                  {businessDropdownOpen && (
                    <ul
                      className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded border border-slate-200 bg-white shadow-lg text-sm"
                      role="listbox"
                    >
                      {businessesLoading && businesses.length === 0 && (
                        <li className="px-3 py-2 text-slate-500">Loading…</li>
                      )}
                      {!businessesLoading && filteredBusinesses.length === 0 && (
                        <li className="px-3 py-2 text-slate-500">No businesses match</li>
                      )}
                      {filteredBusinesses.map((b) => (
                        <li
                          key={b.id}
                          role="option"
                          aria-selected={addDeliveryForm.business_id === b.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setAddDeliveryForm(f => ({ ...f, business_id: b.id }));
                            setBusinessSearchQuery([b.name, b.email].filter(Boolean).join(' — '));
                            setBusinessDropdownOpen(false);
                          }}
                          className={`px-3 py-2 cursor-pointer ${addDeliveryForm.business_id === b.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-100 text-slate-800'}`}
                        >
                          {b.name}{b.email ? ` — ${b.email}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact phone <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    value={addDeliveryForm.callback_phone}
                    onChange={(e) => setAddDeliveryForm(f => ({ ...f, callback_phone: e.target.value }))}
                    placeholder="+1234567890"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivery address <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    value={addDeliveryForm.delivery_address}
                    onChange={(e) => setAddDeliveryForm(f => ({ ...f, delivery_address: e.target.value }))}
                    placeholder="Street, city, postal code"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pickup address (optional)</label>
                  <input
                    type="text"
                    value={addDeliveryForm.pickup_address}
                    onChange={(e) => setAddDeliveryForm(f => ({ ...f, pickup_address: e.target.value }))}
                    placeholder="Leave blank if same as business"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recipient name (optional)</label>
                  <input
                    type="text"
                    value={addDeliveryForm.recipient_name}
                    onChange={(e) => setAddDeliveryForm(f => ({ ...f, recipient_name: e.target.value }))}
                    placeholder="Name of person receiving delivery"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Package description (optional)</label>
                  <input
                    type="text"
                    value={addDeliveryForm.package_description}
                    onChange={(e) => setAddDeliveryForm(f => ({ ...f, package_description: e.target.value }))}
                    placeholder="e.g. Documents, small box"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={addDeliveryForm.priority}
                    onChange={(e) => setAddDeliveryForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 bg-white"
                  >
                    <option value="Schedule">Schedule</option>
                    <option value="Same Day">Same day</option>
                    <option value="Immediate">Immediate</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={addDeliverySubmitting}
                    className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {addDeliverySubmitting ? 'Creating…' : 'Create delivery'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('deliveries')}
                    className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                  >
                    View deliveries
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'deliveries' && (
            <>
              <div className="mb-4 flex flex-wrap gap-3 items-center">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by business name, address, phone, reference…"
                  className="flex-1 min-w-[200px] max-w-md px-3 py-2 border border-slate-300 rounded text-sm"
                />
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
                  {filteredEscalated.length > 0 && (
                    <section className="mb-6">
                      <h2 className="text-lg font-semibold text-amber-800 mb-2">Escalated ({filteredEscalated.length})</h2>
                      <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-amber-50 border-b border-amber-200 text-left text-slate-600">
                              <th className="p-2">Reference</th>
                              <th className="p-2">Business</th>
                              <th className="p-2">Callback</th>
                              <th className="p-2">Delivery address</th>
                              <th className="p-2">Status</th>
                              <th className="p-2">Created</th>
                              <th className="p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEscalated.map((r) => (
                              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="p-2 font-mono">{r.reference_number}</td>
                                <td className="p-2 max-w-[140px] truncate" title={r.business_name || '—'}>{r.business_name || '—'}</td>
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
                    <h2 className="text-lg font-semibold text-slate-800 mb-2">Deliveries</h2>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                            <th className="p-2">Reference</th>
                            <th className="p-2">Business</th>
                            <th className="p-2">Callback</th>
                            <th className="p-2">Delivery address</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Payment</th>
                            <th className="p-2">Created</th>
                            <th className="p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRequests.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="p-2 font-mono">{r.reference_number}</td>
                              <td className="p-2 max-w-[140px] truncate" title={r.business_name || '—'}>{r.business_name || '—'}</td>
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
                    {displayRequests.length === 0 && <p className="text-slate-500 py-4">No delivery requests.</p>}
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
  );
}

export default AdminDeliveryOperatorPage;
