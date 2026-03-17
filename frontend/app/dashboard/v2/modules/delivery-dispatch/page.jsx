'use client';

/**
 * Last-Mile Delivery — CUSTOMER (business) dashboard only.
 * Customers can: request a pickup (enter addresses), view their deliveries, manage saved addresses.
 * All admin functions (incoming Communication log, Dispatched view, phone numbers, email/SMS on new request, legal, agent rebuild) live in Tavari admin only.
 * Entire page is gated: users must have an active delivery-dispatch subscription to see the app.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import ModuleActivationModal from '@/components/ModuleActivationModal';
import { deliveryNetworkAPI } from '@/lib/api';
import { useBusinessTimezone } from '@/hooks/useBusinessTimezone';
import { ArrowLeft, Loader, RefreshCw, Trash2, Truck, MapPin, Package, Receipt, CreditCard, Pencil, Lock } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

const TABS = [
  { id: 'request', label: 'Request a pickup', icon: Package },
  { id: 'deliveries', label: 'My deliveries', icon: Truck },
  { id: 'addresses', label: 'Saved addresses', icon: MapPin },
  { id: 'billing', label: 'Pricing & invoices', icon: Receipt },
];

const PRIORITY_OPTIONS = [
  { value: 'Schedule', label: 'Schedule' },
  { value: 'Same Day', label: 'Same day' },
  { value: 'Immediate', label: 'Immediate' },
];

const SAVED_LOCATION_TYPES = [
  { value: 'default_pickup', label: 'Default pickup' },
  { value: 'named_pickup', label: 'Named pickup' },
  { value: 'frequent_delivery', label: 'Frequent delivery address' },
];

export default function DeliveryDispatchPage() {
  const { formatDate } = useBusinessTimezone();
  const [activeTab, setActiveTab] = useState('request');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);

  // Request form
  const [pickup_address, setPickupAddress] = useState('');
  const [delivery_address, setDeliveryAddress] = useState('');
  const [callback_phone, setCallbackPhone] = useState('');
  const [recipient_name, setRecipientName] = useState('');
  const [package_description, setPackageDescription] = useState('');
  const [priority, setPriority] = useState('Schedule');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Saved address form
  const [newLocType, setNewLocType] = useState('frequent_delivery');
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocContact, setNewLocContact] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  // Billing (payment method) for Pricing & invoices tab
  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState(null);

  // Default pickup from company profile (used in Saved addresses and to prefill request form)
  const [defaultPickupAddress, setDefaultPickupAddress] = useState('');
  const [defaultPickupEditing, setDefaultPickupEditing] = useState(false);
  const [defaultPickupSaving, setDefaultPickupSaving] = useState(false);

  // Subscription gate: 'loading' | 'subscribed' | 'not_subscribed'
  const [subscriptionStatus, setSubscriptionStatus] = useState('loading');
  const [moduleInfo, setModuleInfo] = useState(null);
  const [activationModalOpen, setActivationModalOpen] = useState(false);
  const [activating, setActivating] = useState(false);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1]?.trim() : null;
    const businessId = typeof window !== 'undefined'
      ? localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId')
      : null;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (businessId) headers['X-Active-Business-Id'] = businessId;
    return headers;
  };

  const loadBilling = async () => {
    try {
      setBillingError(null);
      setBillingLoading(true);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/billing/status`, {
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      } else {
        setBilling(null);
        const errBody = await res.json().catch(() => ({}));
        setBillingError(errBody.error || `Could not load billing (${res.status})`);
      }
    } catch (err) {
      console.error('[DeliveryDispatch] loadBilling error', err);
      setBillingError('Could not load billing info');
      setBilling(null);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch(`${API_URL}/api/billing/portal`, { method: 'GET', headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      } else {
        setBillingError('Could not open billing portal');
      }
    } catch (err) {
      console.error('[DeliveryDispatch] billing portal error', err);
      setBillingError('Could not open billing portal');
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const [reqRes, locRes, businessRes] = await Promise.all([
        deliveryNetworkAPI.getRequests().catch(() => ({ data: { requests: [] } })),
        deliveryNetworkAPI.getSavedLocations().catch(() => ({ data: { saved_locations: [] } })),
        fetch(`${API_URL}/api/v2/settings/business`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : {}).catch(() => ({ business: null })),
      ]);
      setRequests(reqRes.data?.requests ?? []);
      setSavedLocations(locRes.data?.saved_locations ?? []);
      const b = businessRes?.business;
      if (b) {
        const effective = b.delivery_default_pickup_address || b.address || '';
        setDefaultPickupAddress(effective);
      }
    } catch (e) {
      console.error('[DeliveryDispatch] load error', e);
    } finally {
      setLoading(false);
    }
  };

  // 1) Check subscription first; only subscribed users see the app
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v2/modules/delivery-dispatch`, { headers: getAuthHeaders() });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const sub = data.module?.subscribed === true;
          setModuleInfo(data.module || null);
          setSubscriptionStatus(sub ? 'subscribed' : 'not_subscribed');
        } else {
          setSubscriptionStatus('not_subscribed');
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[DeliveryDispatch] subscription check error', e);
          setSubscriptionStatus('not_subscribed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Load delivery data only when subscribed
  useEffect(() => {
    if (subscriptionStatus === 'subscribed') load();
  }, [subscriptionStatus]);

  useEffect(() => {
    if (defaultPickupAddress && !pickup_address && activeTab === 'request') {
      setPickupAddress(defaultPickupAddress);
    }
  }, [defaultPickupAddress, activeTab]);

  const saveDefaultPickup = async () => {
    setDefaultPickupSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/settings/business`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ delivery_default_pickup_address: defaultPickupAddress.trim() || null }),
      });
      if (res.ok) {
        setDefaultPickupEditing(false);
      }
    } catch (e) {
      console.error('[DeliveryDispatch] save default pickup error', e);
    } finally {
      setDefaultPickupSaving(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'billing') loadBilling();
  }, [activeTab]);

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!callback_phone?.trim()) { setSubmitError('Contact phone is required'); return; }
    if (!delivery_address?.trim()) { setSubmitError('Delivery address is required'); return; }
    setSubmitting(true);
    try {
      const res = await deliveryNetworkAPI.createRequest({
        pickup_address: pickup_address.trim() || undefined,
        delivery_address: delivery_address.trim(),
        callback_phone: callback_phone.trim(),
        recipient_name: recipient_name.trim() || undefined,
        package_description: package_description.trim() || undefined,
        priority,
      });
      setSubmitSuccess(res.data?.reference_number ? `Delivery scheduled. Reference: ${res.data.reference_number}` : 'Delivery scheduled.');
      setPickupAddress('');
      setDeliveryAddress('');
      setRecipientName('');
      setPackageDescription('');
      load();
      setActiveTab('deliveries');
    } catch (err) {
      setSubmitError(err.response?.data?.error || err.message || 'Could not schedule delivery.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSavedLocation = async (e) => {
    e.preventDefault();
    if (!newLocAddress?.trim()) return;
    setAddingLocation(true);
    try {
      await deliveryNetworkAPI.createSavedLocation({
        type: newLocType,
        name: newLocName.trim() || undefined,
        address: newLocAddress.trim(),
        contact: newLocContact.trim() || undefined,
      });
      setNewLocName('');
      setNewLocAddress('');
      setNewLocContact('');
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Could not add address.');
    } finally {
      setAddingLocation(false);
    }
  };

  const handleDeleteSavedLocation = async (id) => {
    try {
      await deliveryNetworkAPI.deleteSavedLocation(id);
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Could not remove.');
    }
  };

  // Subscription required gate: show activate UI so "Learn more" from Tavari AI dashboard leads to activation
  if (subscriptionStatus === 'loading') {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="p-4 md:p-6 max-w-4xl mx-auto flex items-center justify-center min-h-[40vh]">
            <Loader className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  if (subscriptionStatus === 'not_subscribed') {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="p-4 md:p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-4">
              <Link href="/dashboard/v2/settings/modules" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl font-semibold">Last-Mile Delivery</h1>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
              <Lock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Subscription required</h2>
              <p className="text-slate-600 text-sm mb-6">
                Last-Mile Delivery is available with an active subscription. Activate the module to schedule pickups, manage deliveries, and use saved addresses.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setActivationModalOpen(true)}
                  disabled={activating}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                >
                  {activating ? 'Activating…' : 'Activate module'}
                </button>
                <Link
                  href="/dashboard/v2/settings/billing"
                  className="px-6 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  View billing
                </Link>
              </div>
            </div>
            <ModuleActivationModal
              isOpen={activationModalOpen}
              onClose={() => setActivationModalOpen(false)}
              moduleName={moduleInfo?.name || 'Last-Mile Delivery'}
              moduleKey="delivery-dispatch"
              onConfirm={async () => {
                setActivating(true);
                try {
                  const headers = getAuthHeaders();
                  const termsVersion = process.env.NEXT_PUBLIC_TERMS_VERSION || '1.0.0';
                  await fetch(`${API_URL}/api/v2/auth/accept-terms`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ terms_version: termsVersion }),
                  });
                  const res = await fetch(`${API_URL}/api/v2/modules/delivery-dispatch/activate`, {
                    method: 'POST',
                    headers,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    if (res.status === 403 && (data.code === 'TERMS_NOT_ACCEPTED' || data.redirect_to === '/accept-terms')) {
                      window.location.href = `/accept-terms?return=${encodeURIComponent('/dashboard/v2/modules/delivery-dispatch')}`;
                      return;
                    }
                    throw new Error(data.message || data.error || 'Activation failed');
                  }
                  setActivationModalOpen(false);
                  if (data.redirect_to) {
                    window.location.href = data.redirect_to;
                  } else {
                    window.location.reload();
                  }
                } catch (e) {
                  setActivating(false);
                  throw e;
                }
              }}
            />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/dashboard/v2/settings/modules" className="text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-semibold">Last-Mile Delivery</h1>
            <div className="ml-auto">
              <button type="button" onClick={load} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-slate-600 mb-6">
            Schedule pickups and deliveries. Public page: <a href="/deliverydispatch" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/deliverydispatch</a>
          </p>

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

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          )}

          {!loading && activeTab === 'request' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Request a pickup</h2>
              <p className="text-slate-600 text-sm mb-6">Enter pickup and delivery addresses. We’ll schedule a driver for you.</p>
              <form onSubmit={handleSubmitRequest} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pickup address</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Street, city, postal code"
                    value={pickup_address}
                    onChange={(e) => setPickupAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivery address <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Street, city, postal code"
                    value={delivery_address}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact phone <span className="text-red-600">*</span></label>
                  <input
                    type="tel"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="+1 555 123 4567"
                    value={callback_phone}
                    onChange={(e) => setCallbackPhone(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recipient name (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Name"
                    value={recipient_name}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Package description (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Box, envelope"
                    value={package_description}
                    onChange={(e) => setPackageDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">When</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {submitError && <p className="text-red-600 text-sm">{submitError}</p>}
                {submitSuccess && <p className="text-emerald-600 text-sm">{submitSuccess}</p>}
                <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                  {submitting ? 'Scheduling…' : 'Schedule delivery'}
                </button>
              </form>
            </section>
          )}

          {!loading && activeTab === 'deliveries' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">My deliveries</h2>
              <p className="text-slate-600 text-sm mb-4">Delivery requests you’ve scheduled and their status.</p>
              {requests.length === 0 ? (
                <p className="text-slate-500 py-8 text-center">No deliveries yet. Use “Request a pickup” to schedule one.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="pb-2 pr-2">Reference</th>
                        <th className="pb-2 pr-2">Pickup</th>
                        <th className="pb-2 pr-2">Delivery</th>
                        <th className="pb-2 pr-2">Status</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="py-2 pr-2 font-mono">{r.reference_number || '—'}</td>
                          <td className="py-2 pr-2 max-w-[140px] truncate" title={r.pickup_address}>{r.pickup_address || '—'}</td>
                          <td className="py-2 pr-2 max-w-[140px] truncate" title={r.delivery_address}>{r.delivery_address || '—'}</td>
                          <td className="py-2 pr-2">{r.status}</td>
                          <td className="py-2">{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {!loading && activeTab === 'addresses' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Saved addresses</h2>
              <p className="text-slate-600 text-sm mb-4">Save pickup and delivery addresses for quick fill when you request a pickup.</p>

              <div className="mb-6 p-4 bg-slate-50 rounded-lg max-w-xl">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Default pickup location</h3>
                <p className="text-slate-600 text-xs mb-3">Used when you request a pickup (e.g. warehouse). You can set a different address here without changing your company address elsewhere.</p>
                {defaultPickupEditing ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      type="text"
                      className="flex-1 min-w-[200px] rounded border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Street, city, postal code"
                      value={defaultPickupAddress}
                      onChange={(e) => setDefaultPickupAddress(e.target.value)}
                    />
                    <button type="button" onClick={saveDefaultPickup} disabled={defaultPickupSaving} className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-60">
                      {defaultPickupSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setDefaultPickupEditing(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-800 text-sm">{defaultPickupAddress || 'Not set (company address will be used)'}</span>
                    <button type="button" onClick={() => setDefaultPickupEditing(true)} className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 text-xs">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                )}
              </div>

              <form onSubmit={handleAddSavedLocation} className="mb-6 p-4 bg-slate-50 rounded-lg space-y-3 max-w-xl">
                <h3 className="text-sm font-medium text-slate-700">Add address</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Type</label>
                    <select
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                      value={newLocType}
                      onChange={(e) => setNewLocType(e.target.value)}
                    >
                      {SAVED_LOCATION_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Name (optional)</label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. Office, Home"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Address *</label>
                  <input
                    type="text"
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Street, city, postal code"
                    value={newLocAddress}
                    onChange={(e) => setNewLocAddress(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Contact (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Phone or name"
                    value={newLocContact}
                    onChange={(e) => setNewLocContact(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={addingLocation} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-60">
                  {addingLocation ? 'Adding…' : 'Add address'}
                </button>
              </form>

              {savedLocations.length === 0 ? (
                <p className="text-slate-500 py-4">No saved addresses yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="pb-2 pr-2">Type</th>
                        <th className="pb-2 pr-2">Name</th>
                        <th className="pb-2 pr-2">Address</th>
                        <th className="pb-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedLocations.map((loc) => (
                        <tr key={loc.id} className="border-b border-slate-100">
                          <td className="py-2 pr-2">{loc.type?.replace(/_/g, ' ')}</td>
                          <td className="py-2 pr-2">{loc.name || '—'}</td>
                          <td className="py-2 pr-2 max-w-[200px] truncate" title={loc.address}>{loc.address || '—'}</td>
                          <td className="py-2">
                            <button type="button" onClick={() => handleDeleteSavedLocation(loc.id)} className="text-red-600 hover:underline text-xs inline-flex items-center gap-1">
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {!loading && activeTab === 'billing' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Pricing, invoices & expenses</h2>
              <p className="text-slate-600 text-sm mb-6">Delivery pricing, invoices, and payment method for your account.</p>

              {/* Payment method (saved card) - Stripe */}
              <div className="mb-8 p-4 rounded-xl border border-slate-200 bg-slate-50/50 max-w-2xl">
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  Payment method
                </h3>
                {billingLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                    <Loader className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : billingError ? (
                  <p className="text-amber-600 text-sm">{billingError}</p>
                ) : billing?.payment_method?.card ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-slate-800 font-medium capitalize">{billing.payment_method.card.brand}</p>
                      <p className="text-slate-600 text-sm">•••• •••• •••• {billing.payment_method.card.last4}</p>
                      <p className="text-slate-500 text-xs">Expires {billing.payment_method.card.exp_month}/{billing.payment_method.card.exp_year}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                    >
                      Update payment method
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-600 text-sm mb-3">No payment method on file. Add a card to pay for deliveries and invoices. Payment method is shared across the app—manage it in Settings.</p>
                    <Link
                      href="/dashboard/v2/settings/billing"
                      className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                    >
                      Add payment method (Settings → Billing)
                    </Link>
                    <button
                      type="button"
                      onClick={loadBilling}
                      className="ml-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">Pricing</h3>
                  <p className="text-slate-600 text-sm">
                    Delivery rates depend on distance, priority (schedule, same day, or immediate), and package details. 
                    You’ll see a quote before confirming each delivery. Prices may vary slightly (±5%) based on courier network costs.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">Invoices</h3>
                  <p className="text-slate-600 text-sm">
                    Invoices for your deliveries are sent to your account email. You can also view and download invoices from your 
                    account billing section in Settings.
                  </p>
                  <Link href="/dashboard/v2/settings/billing" className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-sm font-medium mt-2">
                    View billing & invoices →
                  </Link>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">Expenses</h3>
                  <p className="text-slate-600 text-sm">
                    Delivery expenses (per-trip charges, fees) appear on your invoices. For detailed expense reports or export, 
                    use the billing section or contact support.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
