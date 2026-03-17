'use client';

/**
 * Last-Mile Delivery — CUSTOMER (business) dashboard only.
 * Customers can: request a pickup (enter addresses), view their deliveries, manage saved addresses.
 * All admin functions (incoming Communication log, Dispatched view, phone numbers, email/SMS on new request, legal, agent rebuild) live in Tavari admin only.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { deliveryNetworkAPI } from '@/lib/api';
import { useBusinessTimezone } from '@/hooks/useBusinessTimezone';
import { ArrowLeft, Loader, RefreshCw, Trash2, Truck, MapPin, Package } from 'lucide-react';

const TABS = [
  { id: 'request', label: 'Request a pickup', icon: Package },
  { id: 'deliveries', label: 'My deliveries', icon: Truck },
  { id: 'addresses', label: 'Saved addresses', icon: MapPin },
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

  const load = async () => {
    try {
      setLoading(true);
      const [reqRes, locRes] = await Promise.all([
        deliveryNetworkAPI.getRequests().catch(() => ({ data: { requests: [] } })),
        deliveryNetworkAPI.getSavedLocations().catch(() => ({ data: { saved_locations: [] } })),
      ]);
      setRequests(reqRes.data?.requests ?? []);
      setSavedLocations(locRes.data?.saved_locations ?? []);
    } catch (e) {
      console.error('[DeliveryDispatch] load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
