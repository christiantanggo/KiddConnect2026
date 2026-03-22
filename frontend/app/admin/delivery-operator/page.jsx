'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getApiBaseUrl } from '@/lib/api';

/** Normalize to E.164 with leading + so save/load/compare are consistent. */
function normalizeE164(value) {
  if (value == null || typeof value !== 'string') return '';
  const d = String(value).replace(/[^0-9+]/g, '').trim();
  if (!d) return '';
  return d.startsWith('+') ? d : `+${d}`;
}

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  return document.cookie.split(';').find(c => c.trim().startsWith('admin_token='))?.split('=')[1]?.trim() || null;
}

/** Format scheduled pickup date and time for display. scheduled_date: YYYY-MM-DD, scheduled_time: HH:mm or HH:mm:ss. */
function formatScheduled(scheduled_date, scheduled_time) {
  const d = scheduled_date && String(scheduled_date).trim();
  const t = scheduled_time && String(scheduled_time).trim();
  if (!d) return null;
  const [year, month, day] = d.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const timeParts = t ? t.split(':').map((x) => parseInt(x, 10) || 0) : [0, 0, 0];
  const hour = timeParts[0] ?? 0;
  const min = timeParts[1] ?? 0;
  const sec = timeParts[2] ?? 0;
  const date = new Date(year, month - 1, day, hour, min, sec);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
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
  const [editDeliveryId, setEditDeliveryId] = useState(null);
  const [editDelivery, setEditDelivery] = useState(null);
  const [editDeliveryLoading, setEditDeliveryLoading] = useState(false);
  const [editDeliverySaving, setEditDeliverySaving] = useState(false);
  const [editPodSyncLoading, setEditPodSyncLoading] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Add delivery (manual) state
  const [businesses, setBusinesses] = useState([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const getTomorrowLocal = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [addDeliveryForm, setAddDeliveryForm] = useState({
    business_id: '',
    callback_phone: '',
    delivery_address: '',
    delivery_city: '',
    delivery_province: '',
    delivery_postal_code: '',
    pickup_address: '',
    pickup_city: '',
    pickup_province: '',
    pickup_postal_code: '',
    recipient_name: '',
    package_description: '',
    priority: 'Schedule',
    scheduled_date: getTomorrowLocal(),
    scheduled_time: '13:00',
  });
  const [addDeliverySubmitting, setAddDeliverySubmitting] = useState(false);
  const [addDeliverySuccess, setAddDeliverySuccess] = useState(null);
  const [addDeliveryQuoteLoading, setAddDeliveryQuoteLoading] = useState(false);
  const [addDeliveryQuote, setAddDeliveryQuote] = useState(null); // { amount_cents, disclaimer, currency }
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
  const [brokerTestResult, setBrokerTestResult] = useState(null); // { brokerId, success, message, detail?, request_url?, response_status?, response_summary? } after Test connection
  const [shipdayCarriers, setShipdayCarriers] = useState([]); // { id, name, companyId, isActive, isOnShift } from GET carriers
  const [shipdayCarriersLoading, setShipdayCarriersLoading] = useState(false);
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
    billing: {
      price_basic_cents: '',
      price_priority_cents: '',
      sms_fee_cents: '',
      quote_margin_cents: '',
      margin_multiplier: 1.4,
      minimum_delivery_price_cad: 15,
      minimum_enabled: true,
      exchange_rate_source: 'manual',
      manual_exchange_rate_cad_per_usd: 1.35,
    },
    brokers: {},
  });
  /** Ref so Save always sends the latest selection (avoids stale state / closure). */
  const deliveryPhoneNumbersRef = useRef([]);

  const load = async () => {
    const token = getAdminToken();
    if (!token) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests?${params}`, {
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
      fetch(`${getApiBaseUrl()}/api/admin/accounts?limit=200`, {
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
      const cacheBust = `t=${Date.now()}`;
      const [configRes, numbersRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/config?${cacheBust}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/phone-numbers`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);
      const configData = configRes.ok ? await configRes.json() : {};
      const numbersData = numbersRes.ok ? await numbersRes.json() : {};
      const deliveryNums = (Array.isArray(configData.delivery_phone_numbers) ? configData.delivery_phone_numbers : [])
        .map(normalizeE164)
        .filter(Boolean);
      deliveryPhoneNumbersRef.current = deliveryNums;
      setConfig(configData);
      setPhoneNumbers(numbersData.phone_numbers || []);
      setConfigForm({
        delivery_phone_numbers: deliveryNums,
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
          quote_margin_cents: configData.billing?.quote_margin_cents ?? '',
          margin_multiplier: configData.billing?.margin_multiplier ?? 1.4,
          minimum_delivery_price_cad: configData.billing?.minimum_delivery_price_cad ?? 15,
          minimum_enabled: configData.billing?.minimum_enabled !== false,
          exchange_rate_source: configData.billing?.exchange_rate_source === 'automatic' ? 'automatic' : 'manual',
          manual_exchange_rate_cad_per_usd: configData.billing?.manual_exchange_rate_cad_per_usd ?? 1.35,
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
      const toSave = (deliveryPhoneNumbersRef.current || []).map(normalizeE164).filter(Boolean);
      const body = {
        delivery_phone_numbers: toSave,
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
          quote_margin_cents: typeof configForm.billing.quote_margin_cents === 'number' ? configForm.billing.quote_margin_cents : (configForm.billing.quote_margin_cents === '' ? undefined : Math.round(Number(configForm.billing.quote_margin_cents))),
          margin_multiplier: typeof configForm.billing.margin_multiplier === 'number' ? configForm.billing.margin_multiplier : (configForm.billing.margin_multiplier === '' ? undefined : Number(configForm.billing.margin_multiplier)),
          minimum_delivery_price_cad: typeof configForm.billing.minimum_delivery_price_cad === 'number' ? configForm.billing.minimum_delivery_price_cad : (configForm.billing.minimum_delivery_price_cad === '' ? undefined : Number(configForm.billing.minimum_delivery_price_cad)),
          minimum_enabled: configForm.billing.minimum_enabled,
          exchange_rate_source: configForm.billing.exchange_rate_source,
          manual_exchange_rate_cad_per_usd: typeof configForm.billing.manual_exchange_rate_cad_per_usd === 'number' ? configForm.billing.manual_exchange_rate_cad_per_usd : (configForm.billing.manual_exchange_rate_cad_per_usd === '' ? undefined : Number(configForm.billing.manual_exchange_rate_cad_per_usd)),
        },
        brokers: configForm.brokers && typeof configForm.brokers === 'object' ? configForm.brokers : {},
      };
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json())?.error || res.statusText);
      const updated = await res.json();
      deliveryPhoneNumbersRef.current = (updated.delivery_phone_numbers || []).map(normalizeE164).filter(Boolean);
      setConfig(updated);
      setConfigForm(f => ({ ...f, delivery_phone_numbers: deliveryPhoneNumbersRef.current }));
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
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/create-agent`, {
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
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/test-broker-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          broker_id: brokerId,
          api_key: apiKey,
          base_url: (entry.base_url || '').trim() || undefined,
        }),
      });
      const data = await res.json();
      setBrokerTestResult({
        brokerId,
        success: !!data.success,
        message: data.success ? (data.message || 'Connection successful.') : (data.error || 'Connection test failed.'),
        detail: data.detail || null,
        request_url: data.request_url || null,
        response_status: data.response_status,
        response_summary: data.response_summary || null,
      });
      if (!data.success) alert(data.error || 'Connection test failed.');
    } catch (e) {
      setBrokerTestResult({ brokerId, success: false, message: e.message || 'Connection test failed.', detail: null });
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
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/link-agent`, {
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
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests/${id}/retry-dispatch`, {
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
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests/${id}`, {
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

  const openEdit = async (id) => {
    setEditDeliveryId(id);
    setEditDelivery(null);
    setEditForm({});
    setEditDeliveryLoading(true);
    const token = getAdminToken();
    if (!token) return setEditDeliveryLoading(false);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json())?.error || res.statusText);
      const data = await res.json();
      let podPhotos = data.pod_photo_urls;
      if (typeof podPhotos === 'string') {
        try {
          podPhotos = JSON.parse(podPhotos);
        } catch {
          podPhotos = [];
        }
      }
      setEditDelivery({ ...data, pod_photo_urls: Array.isArray(podPhotos) ? podPhotos : [] });
      setEditForm({
        status: data.status || '',
        amount_quoted_cents: data.amount_quoted_cents ?? '',
        callback_phone: data.callback_phone || '',
        recipient_name: data.recipient_name || '',
        recipient_phone: data.recipient_phone || '',
        delivery_address: data.delivery_address || '',
        delivery_city: data.delivery_city || '',
        delivery_province: data.delivery_province || '',
        delivery_postal_code: data.delivery_postal_code || '',
        pickup_address: data.pickup_address || '',
        pickup_city: data.pickup_city || '',
        pickup_province: data.pickup_province || '',
        pickup_postal_code: data.pickup_postal_code || '',
        package_description: data.package_description || '',
        special_instructions: data.special_instructions || '',
        priority: data.priority || 'Schedule',
        scheduled_date: data.scheduled_date || '',
        scheduled_time: data.scheduled_time || '',
      });
    } catch (e) {
      alert(e.message || 'Failed to load delivery');
      setEditDeliveryId(null);
    } finally {
      setEditDeliveryLoading(false);
    }
  };

  const syncPodFromShipday = async () => {
    if (!editDeliveryId) return;
    const token = getAdminToken();
    if (!token) return;
    setEditPodSyncLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests/${editDeliveryId}/sync-pod`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setEditDelivery((d) => (d && data.stored ? { ...d, ...data.stored } : d));
      if (!data.updated && data.proof && !data.proof.signature_url && (!data.proof.photo_urls || data.proof.photo_urls.length === 0)) {
        alert('Shipday has no proof of delivery yet for this order. Try again after the driver completes delivery.');
      }
    } catch (e) {
      alert(e.message || 'Sync failed');
    } finally {
      setEditPodSyncLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editDeliveryId || !editDelivery) return;
    const token = getAdminToken();
    if (!token) return;
    setEditDeliverySaving(true);
    try {
      const payload = {
        status: editForm.status || undefined,
        amount_quoted_cents: editForm.amount_quoted_cents === '' || editForm.amount_quoted_cents == null ? undefined : Number(editForm.amount_quoted_cents),
        callback_phone: editForm.callback_phone || undefined,
        recipient_name: editForm.recipient_name || undefined,
        recipient_phone: editForm.recipient_phone || undefined,
        delivery_address: editForm.delivery_address || undefined,
        delivery_city: editForm.delivery_city || undefined,
        delivery_province: editForm.delivery_province || undefined,
        delivery_postal_code: editForm.delivery_postal_code || undefined,
        pickup_address: editForm.pickup_address || undefined,
        pickup_city: editForm.pickup_city || undefined,
        pickup_province: editForm.pickup_province || undefined,
        pickup_postal_code: editForm.pickup_postal_code || undefined,
        package_description: editForm.package_description || undefined,
        special_instructions: editForm.special_instructions || undefined,
        priority: editForm.priority || undefined,
        scheduled_date: editForm.scheduled_date || undefined,
        scheduled_time: editForm.scheduled_time || undefined,
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
      if (Object.keys(payload).length === 0) {
        setEditDeliverySaving(false);
        return;
      }
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests/${editDeliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json())?.error || res.statusText);
      await load();
      setEditDeliveryId(null);
      setEditDelivery(null);
      setEditForm({});
    } catch (e) {
      alert(e.message || 'Save failed');
    } finally {
      setEditDeliverySaving(false);
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

  /** Select exactly this number as the delivery line. Click again to clear. (Single-select: the number you click is THE one used.) */
  const selectDeliveryNumber = (num) => {
    const canonical = normalizeE164(num);
    if (!canonical) return;
    const current = (configForm.delivery_phone_numbers || []).map(normalizeE164).filter(Boolean);
    const isAlreadyOnly = current.length === 1 && current[0] === canonical;
    const next = isAlreadyOnly ? [] : [canonical];
    deliveryPhoneNumbersRef.current = next;
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
    if (!addDeliveryForm.delivery_address?.trim()) { alert('Delivery street address is required.'); return; }
    if (!addDeliveryForm.delivery_city?.trim()) { alert('Delivery city is required.'); return; }
    if (!addDeliveryForm.delivery_province?.trim()) { alert('Delivery province is required.'); return; }
    if (!addDeliveryForm.delivery_postal_code?.trim()) { alert('Delivery postal code is required.'); return; }
    const hasPickup = addDeliveryForm.pickup_address?.trim() || addDeliveryForm.pickup_city?.trim() || addDeliveryForm.pickup_province?.trim() || addDeliveryForm.pickup_postal_code?.trim();
    if (hasPickup) {
      if (!addDeliveryForm.pickup_address?.trim()) { alert('Pickup address (street) is required when entering pickup details.'); return; }
      if (!addDeliveryForm.pickup_city?.trim()) { alert('Pickup city is required.'); return; }
      if (!addDeliveryForm.pickup_province?.trim()) { alert('Pickup province is required.'); return; }
      if (!addDeliveryForm.pickup_postal_code?.trim()) { alert('Pickup postal code is required.'); return; }
    }
    setAddDeliverySubmitting(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          business_id: addDeliveryForm.business_id.trim(),
          callback_phone: addDeliveryForm.callback_phone.trim(),
          delivery_address: addDeliveryForm.delivery_address.trim(),
          delivery_city: addDeliveryForm.delivery_city.trim(),
          delivery_province: addDeliveryForm.delivery_province.trim(),
          delivery_postal_code: addDeliveryForm.delivery_postal_code.trim(),
          pickup_address: addDeliveryForm.pickup_address?.trim() || undefined,
          pickup_city: addDeliveryForm.pickup_city?.trim() || undefined,
          pickup_province: addDeliveryForm.pickup_province?.trim() || undefined,
          pickup_postal_code: addDeliveryForm.pickup_postal_code?.trim() || undefined,
          recipient_name: addDeliveryForm.recipient_name?.trim() || undefined,
          package_description: addDeliveryForm.package_description?.trim() || undefined,
          priority: addDeliveryForm.priority,
          ...(addDeliveryForm.priority === 'Schedule' && {
            scheduled_date: addDeliveryForm.scheduled_date?.trim() || undefined,
            scheduled_time: addDeliveryForm.scheduled_time?.trim() || undefined,
          }),
          ...(addDeliveryQuote?.amount_cents != null && { amount_quoted_cents: addDeliveryQuote.amount_cents }),
          // Persist winning on-demand provider so dispatch can match; omit if quote used fleet costing only (no provider_name).
          ...(addDeliveryQuote?.source === 'shipday' && addDeliveryQuote?.provider_name && { quoted_on_demand_provider: String(addDeliveryQuote.provider_name).trim() }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setAddDeliverySuccess({ reference_number: data.reference_number, request_id: data.request_id });
      setAddDeliveryForm({
        business_id: addDeliveryForm.business_id,
        callback_phone: '',
        delivery_address: '',
        delivery_city: '',
        delivery_province: '',
        delivery_postal_code: '',
        pickup_address: '',
        pickup_city: '',
        pickup_province: '',
        pickup_postal_code: '',
        recipient_name: '',
        package_description: '',
        priority: 'Schedule',
        scheduled_date: getTomorrowLocal(),
        scheduled_time: '13:00',
      });
      setBusinessSearchQuery('');
      setBusinessDropdownOpen(false);
    } catch (err) {
      alert(err.message || 'Failed to create delivery.');
    } finally {
      setAddDeliverySubmitting(false);
    }
  };

  const getAddDeliveryQuote = async () => {
    setAddDeliveryQuote(null);
    setAddDeliveryQuoteLoading(true);
    try {
      const token = getAdminToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (addDeliveryForm.business_id?.trim()) params.set('business_id', addDeliveryForm.business_id.trim());
      if (addDeliveryForm.delivery_address?.trim()) params.set('delivery_address', addDeliveryForm.delivery_address.trim());
      if (addDeliveryForm.delivery_city?.trim()) params.set('delivery_city', addDeliveryForm.delivery_city.trim());
      if (addDeliveryForm.delivery_province?.trim()) params.set('delivery_province', addDeliveryForm.delivery_province.trim());
      if (addDeliveryForm.delivery_postal_code?.trim()) params.set('delivery_postal_code', addDeliveryForm.delivery_postal_code.trim());
      if (addDeliveryForm.pickup_address?.trim()) params.set('pickup_address', addDeliveryForm.pickup_address.trim());
      if (addDeliveryForm.pickup_city?.trim()) params.set('pickup_city', addDeliveryForm.pickup_city.trim());
      if (addDeliveryForm.pickup_province?.trim()) params.set('pickup_province', addDeliveryForm.pickup_province.trim());
      if (addDeliveryForm.pickup_postal_code?.trim()) params.set('pickup_postal_code', addDeliveryForm.pickup_postal_code.trim());
      if (addDeliveryForm.callback_phone?.trim()) params.set('customer_phone', addDeliveryForm.callback_phone.trim());
      if (addDeliveryForm.recipient_name?.trim()) params.set('recipient_name', addDeliveryForm.recipient_name.trim());
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/quote?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get quote');
      setAddDeliveryQuote(data);
    } catch (e) {
      setAddDeliveryQuote({ amount_cents: null, disclaimer: e.message || 'Quote unavailable', currency: 'CAD' });
    } finally {
      setAddDeliveryQuoteLoading(false);
    }
  };

  return (
    <>
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
                        <label className="block text-sm font-medium text-slate-700 mb-2">Delivery line number</label>
                        <p className="text-xs text-slate-500 mb-2">Calls to this number are routed to the delivery assistant. Click the number you want to use (only one).</p>
                        <div className="flex flex-wrap gap-2">
                          {phoneNumbers.map((pn) => {
                            const n = pn.number || pn.e164;
                            const savedList = (configForm.delivery_phone_numbers || []).map(normalizeE164).filter(Boolean);
                            const selected = savedList.length === 1 && savedList[0] === normalizeE164(n);
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => selectDeliveryNumber(n)}
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
                        const entry = configForm.brokers?.[broker.id] || { enabled: false, api_key: '', base_url: '', preferred_carrier_ids: '', on_demand_enabled: false, preferred_on_demand_provider: '' };
                        const preferredDisplay = Array.isArray(entry.preferred_carrier_ids) ? entry.preferred_carrier_ids.join(', ') : (entry.preferred_carrier_ids ?? '');
                        const onDemandProvider = entry.preferred_on_demand_provider ?? '';
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
                            {broker.id === 'shipday' && (
                              <div className="mt-3">
                                <label className="block text-sm text-slate-700 mb-1">Preferred carrier IDs (strongly recommended)</label>
                                <p className="text-xs text-slate-500 mb-1">Required for fleet assign when on-demand hits rate limits (HTTP 429) or fails. Load carriers below, click your driver row to paste the ID, then <strong>Save settings</strong>. Comma-separated = fallback order. Ops can also set env <code className="bg-slate-100 px-0.5 rounded">DELIVERY_SHIPDAY_FLEET_CARRIER_ID</code>.</p>
                                <div className="flex gap-2 flex-wrap items-center">
                                  <input
                                    type="text"
                                    value={preferredDisplay}
                                    onChange={(e) => setConfigForm(f => ({
                                      ...f,
                                      brokers: {
                                        ...(f.brokers || {}),
                                        [broker.id]: { ...(f.brokers?.[broker.id] || {}), preferred_carrier_ids: e.target.value },
                                      },
                                    }))}
                                    placeholder="e.g. 7735 or 7735, 1234"
                                    className="flex-1 min-w-[120px] px-3 py-2 border border-slate-300 rounded text-sm font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setShipdayCarriersLoading(true);
                                      setShipdayCarriers([]);
                                      try {
                                        const token = getAdminToken();
                                        if (!token) return;
                                        const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/carriers`, { headers: { Authorization: `Bearer ${token}` } });
                                        const data = await res.json();
                                        setShipdayCarriers(Array.isArray(data.carriers) ? data.carriers : []);
                                        if (!res.ok) throw new Error(data.error || 'Failed to load carriers');
                                      } catch (e) {
                                        setShipdayCarriers([]);
                                        console.error(e);
                                      } finally {
                                        setShipdayCarriersLoading(false);
                                      }
                                    }}
                                    disabled={shipdayCarriersLoading || !(entry.api_key || '').trim()}
                                    className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {shipdayCarriersLoading ? 'Loading…' : 'Load carriers'}
                                  </button>
                                </div>
                                {shipdayCarriers.length > 0 && (
                                  <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs">
                                    <p className="font-medium text-slate-600 mb-1">Carriers (ID — Name). Click to copy ID.</p>
                                    <ul className="space-y-0.5">
                                      {shipdayCarriers.map((c) => (
                                        <li key={c.id}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const current = configForm.brokers?.shipday?.preferred_carrier_ids;
                                              const str = Array.isArray(current) ? current.join(', ') : (current ?? '');
                                              const add = str ? `${str}, ${c.id}` : String(c.id);
                                              setConfigForm(f => ({
                                                ...f,
                                                brokers: {
                                                  ...(f.brokers || {}),
                                                  shipday: { ...(f.brokers?.shipday || {}), preferred_carrier_ids: add },
                                                },
                                              }));
                                            }}
                                            className="text-left w-full px-2 py-0.5 rounded hover:bg-slate-100 font-mono"
                                          >
                                            {c.id} — {c.name || '—'} {c.isOnShift ? '(on shift)' : ''}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                            {broker.id === 'shipday' && (
                              <div className="mt-3 border-t border-slate-200 pt-3">
                                <p className="text-sm font-medium text-slate-700 mb-2">On-demand (DoorDash / Uber)</p>
                                <p className="text-xs text-slate-500 mb-2">Use Shipday’s on-demand API for quotes and dispatch. Requires Shipday Professional plan; third-party partners are often US-only. For Canada, add your fleet carrier ID below — we fall back to it when on-demand has no estimates.</p>
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    type="checkbox"
                                    id="shipday-on-demand-enabled"
                                    checked={!!entry.on_demand_enabled}
                                    onChange={(e) => setConfigForm(f => ({
                                      ...f,
                                      brokers: {
                                        ...(f.brokers || {}),
                                        shipday: { ...(f.brokers?.shipday || {}), on_demand_enabled: e.target.checked },
                                      },
                                    }))}
                                    className="rounded border-slate-300"
                                  />
                                  <label htmlFor="shipday-on-demand-enabled" className="text-sm text-slate-700">Use on-demand delivery for quotes and dispatch</label>
                                </div>
                                <div>
                                  <label className="block text-sm text-slate-700 mb-1">On-demand provider</label>
                                  <select
                                    value={onDemandProvider || 'cheapest'}
                                    onChange={(e) => setConfigForm(f => ({
                                      ...f,
                                      brokers: {
                                        ...(f.brokers || {}),
                                        shipday: { ...(f.brokers?.shipday || {}), preferred_on_demand_provider: e.target.value },
                                      },
                                    }))}
                                    className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded text-sm"
                                  >
                                    <option value="cheapest">Cheapest (lowest Shipday estimate)</option>
                                    <option value="DoorDash">DoorDash only</option>
                                    <option value="Uber">Uber only</option>
                                  </select>
                                  <p className="mt-1.5 text-xs text-slate-500 max-w-xl">
                                    <strong>Cheapest</strong> is the default: we assign the provider with the lowest quoted fee among all estimates Shipday returns. Use DoorDash/Uber only if you need to lock a brand.
                                  </p>
                                </div>
                              </div>
                            )}
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => testBrokerConnection(broker.id)}
                                disabled={testingBrokerId !== null || !(entry.api_key || '').trim()}
                                className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {testingBrokerId === broker.id ? 'Testing…' : 'Test connection'}
                              </button>
                              {brokerTestResult?.brokerId === broker.id && (
                                <div className={`mt-2 p-3 rounded text-sm ${brokerTestResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                                  <p className="font-medium">{brokerTestResult.message}</p>
                                  {brokerTestResult.success && brokerTestResult.request_url != null && (
                                    <p className="mt-2 text-xs font-mono opacity-90">
                                      <span className="font-semibold">Request:</span> GET {brokerTestResult.request_url}
                                    </p>
                                  )}
                                  {brokerTestResult.success && brokerTestResult.response_status != null && (
                                    <p className="mt-0.5 text-xs font-mono opacity-90">
                                      <span className="font-semibold">Response:</span> HTTP {brokerTestResult.response_status}
                                      {brokerTestResult.response_summary ? ` — ${brokerTestResult.response_summary}` : ''}
                                    </p>
                                  )}
                                  {brokerTestResult.detail && !brokerTestResult.request_url && (
                                    <p className="mt-1 text-xs opacity-90">{brokerTestResult.detail}</p>
                                  )}
                                </div>
                              )}
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
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">Quote margin (cents)</label>
                        <input type="number" value={configForm.billing.quote_margin_cents} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, quote_margin_cents: e.target.value } }))} placeholder="e.g. 300" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                        <p className="text-xs text-slate-500 mt-0.5">Legacy: added on top when not using pricing engine. Prefer pricing engine below for Shipday quotes.</p>
                      </div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-800 mb-3">Pricing engine (Shipday quotes)</h3>
                      <p className="text-xs text-slate-600 mb-3">Final price = CEIL(MAX(Shipday cost USD × exchange rate × margin, minimum)) in CAD. Exchange rate is applied before margin.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm text-slate-700 mb-1">Margin multiplier</label>
                          <input type="number" step="0.01" min="1" value={configForm.billing.margin_multiplier} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, margin_multiplier: e.target.value } }))} placeholder="1.40" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                          <p className="text-xs text-slate-500 mt-0.5">Default 1.40 (40% margin)</p>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-700 mb-1">Minimum delivery price (CAD)</label>
                          <input type="number" step="1" min="0" value={configForm.billing.minimum_delivery_price_cad} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, minimum_delivery_price_cad: e.target.value } }))} placeholder="15" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                          <p className="text-xs text-slate-500 mt-0.5">Default $15 CAD</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="billing-minimum-enabled" checked={!!configForm.billing.minimum_enabled} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, minimum_enabled: e.target.checked } }))} className="rounded border-slate-300" />
                          <label htmlFor="billing-minimum-enabled" className="text-sm text-slate-700">Use minimum price (when calculated &lt; minimum)</label>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-700 mb-1">Exchange rate source</label>
                          <select value={configForm.billing.exchange_rate_source} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, exchange_rate_source: e.target.value } }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                            <option value="manual">Manual (set below)</option>
                            <option value="automatic">Automatic (env DELIVERY_USD_TO_CAD_RATE or fallback to manual)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-700 mb-1">Manual exchange rate (CAD per 1 USD)</label>
                          <input type="number" step="0.01" min="0.01" value={configForm.billing.manual_exchange_rate_cad_per_usd} onChange={(e) => setConfigForm(f => ({ ...f, billing: { ...f.billing, manual_exchange_rate_cad_per_usd: e.target.value } }))} placeholder="1.35" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                          <p className="text-xs text-slate-500 mt-0.5">Used when source is Manual or when Automatic has no env rate</p>
                        </div>
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
              <p className="text-sm text-slate-600 mb-2">Create a delivery request on behalf of a business when needed (e.g. account issues). Dispatch will run automatically after creation.</p>
              <p className="text-xs text-slate-500 mb-6">Fill delivery and pickup addresses, then click Quote to get a live estimate from Shipday (create-then-cancel); otherwise the quote uses your configured rates.</p>
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
                  <p className="text-sm font-medium text-slate-700 mb-2">Delivery address <span className="text-red-600">*</span></p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Street address</label>
                      <input
                        type="text"
                        value={addDeliveryForm.delivery_address}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, delivery_address: e.target.value }))}
                        placeholder="e.g. 456 Oak Ave"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                      <input
                        type="text"
                        value={addDeliveryForm.delivery_city}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, delivery_city: e.target.value }))}
                        placeholder="e.g. Toronto"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Province</label>
                      <input
                        type="text"
                        value={addDeliveryForm.delivery_province}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, delivery_province: e.target.value }))}
                        placeholder="e.g. ON"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Postal code</label>
                      <input
                        type="text"
                        value={addDeliveryForm.delivery_postal_code}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, delivery_postal_code: e.target.value }))}
                        placeholder="e.g. M5V 1A1"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-4 mt-2">
                  <p className="text-sm font-medium text-slate-700 mb-2">Pickup address (optional — enter all four for accurate distance)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Street address</label>
                      <input
                        type="text"
                        value={addDeliveryForm.pickup_address}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, pickup_address: e.target.value }))}
                        placeholder="e.g. 123 Main St"
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                      <input
                        type="text"
                        value={addDeliveryForm.pickup_city}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, pickup_city: e.target.value }))}
                        placeholder="e.g. Toronto"
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Province</label>
                      <input
                        type="text"
                        value={addDeliveryForm.pickup_province}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, pickup_province: e.target.value }))}
                        placeholder="e.g. ON"
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Postal code</label>
                      <input
                        type="text"
                        value={addDeliveryForm.pickup_postal_code}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, pickup_postal_code: e.target.value }))}
                        placeholder="e.g. M5V 1A1"
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                  </div>
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
                {addDeliveryForm.priority === 'Schedule' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Delivery date</label>
                      <input
                        type="date"
                        value={addDeliveryForm.scheduled_date || ''}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, scheduled_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Delivery time (in business timezone)</label>
                      <input
                        type="time"
                        value={addDeliveryForm.scheduled_time || '13:00'}
                        onChange={(e) => setAddDeliveryForm(f => ({ ...f, scheduled_time: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-3 items-center pt-2">
                  <button
                    type="submit"
                    disabled={addDeliverySubmitting}
                    className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {addDeliverySubmitting ? 'Creating…' : 'Create delivery'}
                  </button>
                  <button
                    type="button"
                    onClick={getAddDeliveryQuote}
                    disabled={addDeliveryQuoteLoading}
                    className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {addDeliveryQuoteLoading ? 'Getting quote…' : 'Quote'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('deliveries')}
                    className="px-4 py-2 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
                  >
                    View deliveries
                  </button>
                  {addDeliveryQuote && (
                    <div className="ml-2 text-sm text-slate-600 space-y-1">
                      {addDeliveryQuote.source === 'shipday' && (addDeliveryQuote.shipday_cost_cents != null || addDeliveryQuote.base_cost_cad != null) ? (
                        <>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                            {addDeliveryQuote.provider_name && (
                              <span><span className="font-medium">Provider:</span> {addDeliveryQuote.provider_name}</span>
                            )}
                            {addDeliveryQuote.exchange_rate_used != null && (
                              <span><span className="font-medium">Exchange rate:</span> {Number(addDeliveryQuote.exchange_rate_used).toFixed(2)} CAD per 1 USD</span>
                            )}
                            {addDeliveryQuote.margin_multiplier != null && (
                              <span><span className="font-medium">Margin multiplier:</span> {Number(addDeliveryQuote.margin_multiplier).toFixed(2)}×</span>
                            )}
                          </div>
                          <div>
                            <span className="font-medium">Base (CAD):</span> ${(addDeliveryQuote.base_cost_cad ?? (addDeliveryQuote.shipday_cost_cents / 100))?.toFixed(2)}
                            {' · '}
                            <span className="font-medium">Margin amount:</span> ${(addDeliveryQuote.margin_amount_cad ?? (addDeliveryQuote.margin_cents / 100))?.toFixed(2)}
                            {addDeliveryQuote.applied_minimum && <span className="text-amber-700"> (min applied)</span>}
                            {' · '}
                            <span className="font-medium">Customer cost:</span> ${(addDeliveryQuote.final_price_cad ?? (addDeliveryQuote.total_cents != null ? addDeliveryQuote.total_cents / 100 : addDeliveryQuote.amount_cents / 100))?.toFixed(2)} {addDeliveryQuote.currency || 'CAD'}
                          </div>
                        </>
                      ) : (
                        <span>
                          {addDeliveryQuote.amount_cents != null
                            ? `Est. ${(addDeliveryQuote.amount_cents / 100).toFixed(2)} ${addDeliveryQuote.currency || 'CAD'}`
                            : ''}
                          <span className="text-slate-500">
                            {addDeliveryQuote.shipday_tried_no_cost
                              ? ' Shipday was contacted but did not return a price for this route (cost may only be set at dispatch). Showing your configured rate.'
                              : ' (from Settings → Billing). Fill both pickup and delivery addresses and click Quote for a live Shipday estimate.'}
                          </span>
                        </span>
                      )}
                      {addDeliveryQuote.disclaimer && (
                        <span className="text-slate-500 block mt-0.5">— {addDeliveryQuote.disclaimer}</span>
                      )}
                    </div>
                  )}
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
                              <th className="p-2">POD</th>
                              <th className="p-2">Scheduled</th>
                              <th className="p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEscalated.map((r) => (
                              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => openEdit(r.id)}>
                                <td className="p-2 font-mono">{r.reference_number}</td>
                                <td className="p-2 max-w-[140px] truncate" title={r.business_name || '—'}>{r.business_name || '—'}</td>
                                <td className="p-2">{r.callback_phone}</td>
                                <td className="p-2 max-w-[200px] truncate" title={r.delivery_address}>{r.delivery_address}</td>
                                <td className="p-2">{r.status}</td>
                                <td className="p-2 text-center" title={r.pod_captured_at ? 'Proof of delivery on file' : ''}>
                                  {r.pod_captured_at ? <span className="text-emerald-600 font-medium">✓</span> : '—'}
                                </td>
                                <td className="p-2 text-slate-500">{formatScheduled(r.scheduled_date, r.scheduled_time) || '—'}</td>
                                <td className="p-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
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
                            <th className="p-2">POD</th>
                            <th className="p-2">Scheduled</th>
                            <th className="p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRequests.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => openEdit(r.id)}>
                              <td className="p-2 font-mono">{r.reference_number}</td>
                              <td className="p-2 max-w-[140px] truncate" title={r.business_name || '—'}>{r.business_name || '—'}</td>
                              <td className="p-2">{r.callback_phone}</td>
                              <td className="p-2 max-w-[200px] truncate" title={r.delivery_address}>{r.delivery_address}</td>
                              <td className="p-2">{r.status}</td>
                              <td className="p-2">{r.payment_status || '—'}</td>
                              <td className="p-2 text-center" title={r.pod_captured_at ? 'Proof of delivery on file' : ''}>
                                {r.pod_captured_at ? <span className="text-emerald-600 font-medium">✓</span> : '—'}
                              </td>
                              <td className="p-2 text-slate-500">{formatScheduled(r.scheduled_date, r.scheduled_time) || '—'}</td>
                              <td className="p-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
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
      {/* Delivery edit panel (slide-over) */}
      {editDeliveryId ? (
        <div className="fixed inset-0 z-50 flex items-stretch">
          <div className="absolute inset-0 z-0 bg-slate-900/50" onClick={() => { if (!editDeliverySaving) { setEditDeliveryId(null); setEditDelivery(null); setEditForm({}); } }} aria-hidden />
          <div className="relative z-10 ml-auto w-full max-w-lg bg-white shadow-xl flex flex-col max-h-screen overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                {editDelivery?.reference_number ? `Delivery ${editDelivery.reference_number}` : 'Delivery details'}
              </h2>
              <button type="button" onClick={() => { if (!editDeliverySaving) { setEditDeliveryId(null); setEditDelivery(null); setEditForm({}); } }} className="p-2 rounded text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {editDeliveryLoading ? (
                <p className="text-slate-500">Loading…</p>
              ) : editDelivery ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-slate-100 p-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Cost (quoted)</p>
                    <p className="text-2xl font-semibold text-slate-800">
                      {editForm.amount_quoted_cents != null && editForm.amount_quoted_cents !== '' ? `$${(Number(editForm.amount_quoted_cents) / 100).toFixed(2)}` : '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">CAD (amount_quoted_cents). Edit below to override.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">Proof of delivery</p>
                        <p className="text-xs text-slate-500">Signature &amp; photos from Shipday (driver completes in carrier app).</p>
                      </div>
                      <button
                        type="button"
                        onClick={syncPodFromShipday}
                        disabled={editPodSyncLoading}
                        className="shrink-0 px-3 py-1.5 rounded border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {editPodSyncLoading ? 'Syncing…' : 'Sync from Shipday'}
                      </button>
                    </div>
                    {editDelivery.pod_captured_at && (
                      <p className="text-xs text-slate-500">Last synced: {new Date(editDelivery.pod_captured_at).toLocaleString()}</p>
                    )}
                    {editDelivery.pod_signature_url ? (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">Signature</p>
                        <a href={editDelivery.pod_signature_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">Open full size</a>
                        <div className="mt-2 rounded border border-slate-200 overflow-hidden bg-slate-50 max-h-48">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={editDelivery.pod_signature_url} alt="Delivery signature" className="max-w-full max-h-48 object-contain" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No signature on file yet.</p>
                    )}
                    {Array.isArray(editDelivery.pod_photo_urls) && editDelivery.pod_photo_urls.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">Photos ({editDelivery.pod_photo_urls.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {editDelivery.pod_photo_urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded border border-slate-200 overflow-hidden bg-slate-50">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`POD ${i + 1}`} className="w-full h-28 object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No delivery photos on file yet.</p>
                    )}
                    {(editDelivery.pod_latitude != null && editDelivery.pod_longitude != null) && (
                      <p className="text-xs text-slate-600">
                        GPS at completion: {Number(editDelivery.pod_latitude).toFixed(5)}, {Number(editDelivery.pod_longitude).toFixed(5)}{' '}
                        <a className="text-blue-600 underline" href={`https://www.google.com/maps?q=${editDelivery.pod_latitude},${editDelivery.pod_longitude}`} target="_blank" rel="noopener noreferrer">Map</a>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Business</label>
                    <p className="text-slate-800">{editDelivery.business_name || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                      {['New', 'Contacting', 'Dispatched', 'Assigned', 'PickedUp', 'Completed', 'Failed', 'Cancelled', 'Needs Manual Assist'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Quoted amount (cents)</label>
                    <input type="number" min={0} value={editForm.amount_quoted_cents === '' ? '' : editForm.amount_quoted_cents} onChange={(e) => setEditForm((f) => ({ ...f, amount_quoted_cents: e.target.value === '' ? '' : e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm" placeholder="e.g. 1500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Callback phone</label>
                    <input type="text" value={editForm.callback_phone} onChange={(e) => setEditForm((f) => ({ ...f, callback_phone: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Recipient name</label>
                    <input type="text" value={editForm.recipient_name} onChange={(e) => setEditForm((f) => ({ ...f, recipient_name: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Delivery address</label>
                    <input type="text" value={editForm.delivery_address} onChange={(e) => setEditForm((f) => ({ ...f, delivery_address: e.target.value }))} placeholder="Street" className="w-full px-3 py-2 border border-slate-300 rounded text-sm mb-1" />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={editForm.delivery_city} onChange={(e) => setEditForm((f) => ({ ...f, delivery_city: e.target.value }))} placeholder="City" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                      <input type="text" value={editForm.delivery_province} onChange={(e) => setEditForm((f) => ({ ...f, delivery_province: e.target.value }))} placeholder="Province" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                      <input type="text" value={editForm.delivery_postal_code} onChange={(e) => setEditForm((f) => ({ ...f, delivery_postal_code: e.target.value }))} placeholder="Postal" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Pickup address</label>
                    <input type="text" value={editForm.pickup_address} onChange={(e) => setEditForm((f) => ({ ...f, pickup_address: e.target.value }))} placeholder="Street" className="w-full px-3 py-2 border border-slate-300 rounded text-sm mb-1" />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" value={editForm.pickup_city} onChange={(e) => setEditForm((f) => ({ ...f, pickup_city: e.target.value }))} placeholder="City" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                      <input type="text" value={editForm.pickup_province} onChange={(e) => setEditForm((f) => ({ ...f, pickup_province: e.target.value }))} placeholder="Province" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                      <input type="text" value={editForm.pickup_postal_code} onChange={(e) => setEditForm((f) => ({ ...f, pickup_postal_code: e.target.value }))} placeholder="Postal" className="px-3 py-2 border border-slate-300 rounded text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Package / instructions</label>
                    <input type="text" value={editForm.package_description} onChange={(e) => setEditForm((f) => ({ ...f, package_description: e.target.value }))} placeholder="Package description" className="w-full px-3 py-2 border border-slate-300 rounded text-sm mb-1" />
                    <input type="text" value={editForm.special_instructions} onChange={(e) => setEditForm((f) => ({ ...f, special_instructions: e.target.value }))} placeholder="Special instructions" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                    <select value={editForm.priority} onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm">
                      <option value="Schedule">Schedule</option>
                      <option value="Same Day">Same Day</option>
                      <option value="Immediate">Immediate</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled date</label>
                      <input type="date" value={editForm.scheduled_date} onChange={(e) => setEditForm((f) => ({ ...f, scheduled_date: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled time</label>
                      <input type="time" value={editForm.scheduled_time ? editForm.scheduled_time.slice(0, 5) : ''} onChange={(e) => setEditForm((f) => ({ ...f, scheduled_time: e.target.value || '' }))} className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {editDelivery && (
              <div className="p-4 border-t border-slate-200">
                <button type="button" onClick={saveEdit} disabled={editDeliverySaving} className="w-full py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {editDeliverySaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default AdminDeliveryOperatorPage;
