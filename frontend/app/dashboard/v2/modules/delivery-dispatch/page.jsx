'use client';

/**
 * Last-Mile Delivery — CUSTOMER (business) dashboard only.
 * Customers can: request a pickup (enter addresses), view their deliveries, manage saved addresses.
 * All admin functions (incoming Communication log, Dispatched view, phone numbers, email/SMS on new request, legal, agent rebuild) live in Tavari admin only.
 */
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { deliveryNetworkAPI } from '@/lib/api';
import { savedLocationRowToParts } from '@/lib/canadianAddressParts';
import { useBusinessTimezone } from '@/hooks/useBusinessTimezone';
import { ArrowLeft, Loader, RefreshCw, Trash2, Truck, MapPin, Package, X, Camera, FileImage, BookmarkPlus } from 'lucide-react';

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

const LAST_PICKUP_STORAGE_KEY = 'deliveryDashboard:lastPickup';
const LAST_DELIVERY_STORAGE_KEY = 'deliveryDashboard:lastDelivery';

function readLastStoredAddress(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

export default function DeliveryDispatchPage() {
  const { formatDate } = useBusinessTimezone();
  const [activeTab, setActiveTab] = useState('request');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);

  const getTomorrowLocal = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Request form
  const [pickup_address, setPickupAddress] = useState('');
  const [pickup_city, setPickupCity] = useState('');
  const [pickup_province, setPickupProvince] = useState('');
  const [pickup_postal_code, setPickupPostalCode] = useState('');
  const [delivery_address, setDeliveryAddress] = useState('');
  const [delivery_city, setDeliveryCity] = useState('');
  const [delivery_province, setDeliveryProvince] = useState('');
  const [delivery_postal_code, setDeliveryPostalCode] = useState('');
  const [callback_phone, setCallbackPhone] = useState('');
  const [recipient_name, setRecipientName] = useState('');
  const [package_description, setPackageDescription] = useState('');
  const [priority, setPriority] = useState('Schedule');
  const [scheduled_date, setScheduledDate] = useState(getTomorrowLocal());
  const [scheduled_time, setScheduledTime] = useState('13:00');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  /** Quick-fill: '' = manual, '__lastPickup__' / '__lastDelivery__', or saved location id */
  const [pickupFillSource, setPickupFillSource] = useState('');
  const [deliveryFillSource, setDeliveryFillSource] = useState('');

  const pickupSavedList = useMemo(
    () => (savedLocations || []).filter((l) => l.type === 'default_pickup' || l.type === 'named_pickup'),
    [savedLocations],
  );
  const deliverySavedList = useMemo(
    () => (savedLocations || []).filter((l) => l.type === 'frequent_delivery'),
    [savedLocations],
  );
  const [lastPickupSnap, setLastPickupSnap] = useState(null);
  const [lastDeliverySnap, setLastDeliverySnap] = useState(null);

  useEffect(() => {
    setLastPickupSnap(readLastStoredAddress(LAST_PICKUP_STORAGE_KEY));
    setLastDeliverySnap(readLastStoredAddress(LAST_DELIVERY_STORAGE_KEY));
  }, []);

  // Saved address form
  const [newLocType, setNewLocType] = useState('frequent_delivery');
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddressLine, setNewLocAddressLine] = useState('');
  const [newLocCity, setNewLocCity] = useState('');
  const [newLocProvince, setNewLocProvince] = useState('');
  const [newLocPostal, setNewLocPostal] = useState('');
  const [newLocContact, setNewLocContact] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  /** Saving current request-form pickup/delivery into saved locations */
  const [savingFromRequest, setSavingFromRequest] = useState(null); // 'pickup-default' | 'pickup-named' | 'delivery'
  const [requestSaveNotice, setRequestSaveNotice] = useState(null);

  const pickupCompleteForSave =
    !!pickup_address?.trim() && !!pickup_city?.trim() && !!pickup_province?.trim() && !!pickup_postal_code?.trim();
  const deliveryCompleteForSave =
    !!delivery_address?.trim() && !!delivery_city?.trim() && !!delivery_province?.trim() && !!delivery_postal_code?.trim();

  const saveAddressFromRequest = async (kind) => {
    setRequestSaveNotice(null);
    if (kind === 'pickup-default') {
      if (!pickupCompleteForSave) {
        alert('Fill in pickup street, city, province, and postal code first.');
        return;
      }
      setSavingFromRequest('pickup-default');
      try {
        await deliveryNetworkAPI.createSavedLocation({
          type: 'default_pickup',
          address_line: pickup_address.trim(),
          city: pickup_city.trim(),
          province: pickup_province.trim(),
          postal_code: pickup_postal_code.trim(),
        });
        setRequestSaveNotice('Default pickup saved — choose it from the pickup dropdown next time.');
        await load();
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Could not save pickup address.');
      } finally {
        setSavingFromRequest(null);
      }
      return;
    }
    if (kind === 'pickup-named') {
      if (!pickupCompleteForSave) {
        alert('Fill in pickup street, city, province, and postal code first.');
        return;
      }
      const label = window.prompt('Name for this pickup (e.g. North warehouse, Shop):', '')?.trim();
      if (label === undefined) return;
      if (!label) {
        alert('Enter a short name so you can find it in the list.');
        return;
      }
      setSavingFromRequest('pickup-named');
      try {
        await deliveryNetworkAPI.createSavedLocation({
          type: 'named_pickup',
          name: label,
          address_line: pickup_address.trim(),
          city: pickup_city.trim(),
          province: pickup_province.trim(),
          postal_code: pickup_postal_code.trim(),
        });
        setRequestSaveNotice(`Saved “${label}” — it appears in the pickup dropdown.`);
        await load();
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Could not save pickup address.');
      } finally {
        setSavingFromRequest(null);
      }
      return;
    }
    if (kind === 'delivery') {
      if (!deliveryCompleteForSave) {
        alert('Fill in delivery street, city, province, and postal code first.');
        return;
      }
      const labelRaw = window.prompt(
        'Optional label for this delivery address (e.g. ACME Corp). Leave blank to use a generic name:',
        '',
      );
      if (labelRaw === undefined) return;
      const label = labelRaw.trim() || undefined;
      setSavingFromRequest('delivery');
      try {
        await deliveryNetworkAPI.createSavedLocation({
          type: 'frequent_delivery',
          name: label,
          address_line: delivery_address.trim(),
          city: delivery_city.trim(),
          province: delivery_province.trim(),
          postal_code: delivery_postal_code.trim(),
        });
        setRequestSaveNotice(
          label
            ? `Saved frequent delivery “${label}” — pick it from the delivery dropdown next time.`
            : 'Frequent delivery address saved — pick it from the delivery dropdown next time.',
        );
        await load();
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Could not save delivery address.');
      } finally {
        setSavingFromRequest(null);
      }
    }
  };

  const applyPickupFromSource = (value) => {
    setPickupFillSource(value);
    if (!value) return;
    if (value === '__lastPickup__') {
      const s = readLastStoredAddress(LAST_PICKUP_STORAGE_KEY);
      if (s?.pickup_address) {
        setPickupAddress(String(s.pickup_address));
        setPickupCity(String(s.pickup_city || ''));
        setPickupProvince(String(s.pickup_province || ''));
        setPickupPostalCode(String(s.pickup_postal_code || ''));
      }
      return;
    }
    const loc = savedLocations.find((l) => l.id === value);
    if (!loc) return;
    const f = savedLocationRowToParts(loc);
    if (f) {
      setPickupAddress(f.street);
      setPickupCity(f.city);
      setPickupProvince(f.province);
      setPickupPostalCode(f.postal);
    }
  };

  const applyDeliveryFromSource = (value) => {
    setDeliveryFillSource(value);
    if (!value) return;
    if (value === '__lastDelivery__') {
      const s = readLastStoredAddress(LAST_DELIVERY_STORAGE_KEY);
      if (s?.delivery_address) {
        setDeliveryAddress(String(s.delivery_address));
        setDeliveryCity(String(s.delivery_city || ''));
        setDeliveryProvince(String(s.delivery_province || ''));
        setDeliveryPostalCode(String(s.delivery_postal_code || ''));
      }
      return;
    }
    const loc = savedLocations.find((l) => l.id === value);
    if (!loc) return;
    const f = savedLocationRowToParts(loc);
    if (f) {
      setDeliveryAddress(f.street);
      setDeliveryCity(f.city);
      setDeliveryProvince(f.province);
      setDeliveryPostalCode(f.postal);
    }
  };

  /** Selected row: proof of delivery (POD) from Shipday — tap row to open. */
  const [detailRequest, setDetailRequest] = useState(null);
  const [podRefreshing, setPodRefreshing] = useState(false);
  const [podError, setPodError] = useState(null);

  const isDeliveryCompleted = (status) => {
    const s = String(status || '').toLowerCase().replace(/\s+/g, '_');
    return s === 'completed' || s === 'already_delivered' || s === 'delivered';
  };

  const hasPodContent = (r) => {
    if (!r) return false;
    if (r.pod_signature_url && String(r.pod_signature_url).trim()) return true;
    const photos = r.pod_photo_urls;
    return Array.isArray(photos) && photos.some((u) => typeof u === 'string' && u.trim());
  };

  const mergeRequestInList = (patch) => {
    if (!patch?.id) return;
    setRequests((prev) => prev.map((x) => (x.id === patch.id ? { ...x, ...patch } : x)));
    setDetailRequest((d) => (d && d.id === patch.id ? { ...d, ...patch } : d));
  };

  const refreshPodFromShipday = async (requestId) => {
    setPodError(null);
    setPodRefreshing(true);
    try {
      const res = await deliveryNetworkAPI.syncRequestPod(requestId);
      const pod = res.data?.pod;
      if (pod && typeof pod === 'object') {
        mergeRequestInList({
          id: requestId,
          pod_signature_url: pod.pod_signature_url,
          pod_photo_urls: pod.pod_photo_urls,
          pod_captured_at: pod.pod_captured_at,
          pod_latitude: pod.pod_latitude,
          pod_longitude: pod.pod_longitude,
        });
      } else {
        await load();
      }
    } catch (e) {
      setPodError(e.response?.data?.error || e.message || 'Could not refresh proof of delivery.');
    } finally {
      setPodRefreshing(false);
    }
  };

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
    setRequestSaveNotice(null);
    if (!callback_phone?.trim()) { setSubmitError('Contact phone is required'); return; }
    if (!delivery_address?.trim()) { setSubmitError('Delivery street address is required'); return; }
    if (!delivery_city?.trim()) { setSubmitError('Delivery city is required'); return; }
    if (!delivery_province?.trim()) { setSubmitError('Delivery province is required'); return; }
    if (!delivery_postal_code?.trim()) { setSubmitError('Delivery postal code is required'); return; }
    const hasPickup = pickup_address?.trim() || pickup_city?.trim() || pickup_province?.trim() || pickup_postal_code?.trim();
    if (hasPickup) {
      if (!pickup_address?.trim()) { setSubmitError('Pickup street address is required'); return; }
      if (!pickup_city?.trim()) { setSubmitError('Pickup city is required'); return; }
      if (!pickup_province?.trim()) { setSubmitError('Pickup province is required'); return; }
      if (!pickup_postal_code?.trim()) { setSubmitError('Pickup postal code is required'); return; }
    }
    setSubmitting(true);
    try {
      const pStreet = pickup_address.trim();
      const pCity = pickup_city.trim();
      const pProv = pickup_province.trim();
      const pPost = pickup_postal_code.trim();
      const dStreet = delivery_address.trim();
      const dCity = delivery_city.trim();
      const dProv = delivery_province.trim();
      const dPost = delivery_postal_code.trim();

      if (pStreet && pCity && pProv && pPost) {
        const snap = {
          pickup_address: pStreet,
          pickup_city: pCity,
          pickup_province: pProv,
          pickup_postal_code: pPost,
        };
        try {
          window.localStorage.setItem(LAST_PICKUP_STORAGE_KEY, JSON.stringify(snap));
        } catch (_) { /* ignore */ }
        setLastPickupSnap(snap);
      }
      const delSnap = {
        delivery_address: dStreet,
        delivery_city: dCity,
        delivery_province: dProv,
        delivery_postal_code: dPost,
      };
      try {
        window.localStorage.setItem(LAST_DELIVERY_STORAGE_KEY, JSON.stringify(delSnap));
      } catch (_) { /* ignore */ }
      setLastDeliverySnap(delSnap);

      const res = await deliveryNetworkAPI.createRequest({
        pickup_address: pStreet || undefined,
        pickup_city: pCity || undefined,
        pickup_province: pProv || undefined,
        pickup_postal_code: pPost || undefined,
        delivery_address: dStreet,
        delivery_city: dCity,
        delivery_province: dProv,
        delivery_postal_code: dPost,
        callback_phone: callback_phone.trim(),
        recipient_name: recipient_name.trim() || undefined,
        package_description: package_description.trim() || undefined,
        priority,
        ...(priority === 'Schedule' && {
          scheduled_date: scheduled_date?.trim() || undefined,
          scheduled_time: scheduled_time?.trim() || undefined,
        }),
      });
      setSubmitSuccess(res.data?.reference_number ? `Delivery scheduled. Reference: ${res.data.reference_number}` : 'Delivery scheduled.');
      setPickupAddress('');
      setPickupCity('');
      setPickupProvince('');
      setPickupPostalCode('');
      setPickupFillSource('');
      setDeliveryAddress('');
      setDeliveryCity('');
      setDeliveryProvince('');
      setDeliveryPostalCode('');
      setDeliveryFillSource('');
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
    if (!newLocAddressLine?.trim() || !newLocCity?.trim() || !newLocProvince?.trim() || !newLocPostal?.trim()) {
      alert('Street, city, province, and postal code are required.');
      return;
    }
    setAddingLocation(true);
    try {
      await deliveryNetworkAPI.createSavedLocation({
        type: newLocType,
        name: newLocName.trim() || undefined,
        address_line: newLocAddressLine.trim(),
        city: newLocCity.trim(),
        province: newLocProvince.trim(),
        postal_code: newLocPostal.trim(),
        contact: newLocContact.trim() || undefined,
      });
      setNewLocName('');
      setNewLocAddressLine('');
      setNewLocCity('');
      setNewLocProvince('');
      setNewLocPostal('');
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
              <p className="text-slate-600 text-sm mb-6">
                Use <strong>Saved addresses</strong> or <strong>last used</strong> to fill pickup and delivery in one click. We’ll schedule a driver for you.
              </p>
              <form onSubmit={handleSubmitRequest} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pickup address (optional — enter all fields for accurate distance)</label>
                  <div className="mb-2">
                    <label htmlFor="pickup-quick-fill" className="sr-only">Quick fill pickup from saved address</label>
                    <select
                      id="pickup-quick-fill"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                      value={pickupFillSource}
                      onChange={(e) => applyPickupFromSource(e.target.value)}
                    >
                      <option value="">Type manually or choose a saved pickup…</option>
                      {lastPickupSnap?.pickup_address ? (
                        <option value="__lastPickup__">Last used pickup</option>
                      ) : null}
                      {pickupSavedList.map((loc) => {
                        const label = loc.name?.trim()
                          || (loc.type === 'default_pickup' ? 'Default pickup' : 'Named pickup');
                        return (
                          <option key={loc.id} value={loc.id}>
                            {label} — {loc.address?.slice(0, 60) || '—'}{loc.address?.length > 60 ? '…' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Add <strong>Default pickup</strong> or <strong>Named pickup</strong> under Saved addresses so your warehouse or shop fills in instantly.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Street address"
                        value={pickup_address}
                        onChange={(e) => { setPickupFillSource(''); setPickupAddress(e.target.value); }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="City"
                        value={pickup_city}
                        onChange={(e) => { setPickupFillSource(''); setPickupCity(e.target.value); }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Province (e.g. ON)"
                        value={pickup_province}
                        onChange={(e) => { setPickupFillSource(''); setPickupProvince(e.target.value); }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Postal code"
                        value={pickup_postal_code}
                        onChange={(e) => { setPickupFillSource(''); setPickupPostalCode(e.target.value); }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <span className="text-xs font-medium text-slate-600">Save for later:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!pickupCompleteForSave || savingFromRequest !== null}
                        onClick={() => saveAddressFromRequest('pickup-default')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
                        {savingFromRequest === 'pickup-default' ? 'Saving…' : 'Save as default pickup'}
                      </button>
                      <button
                        type="button"
                        disabled={!pickupCompleteForSave || savingFromRequest !== null}
                        onClick={() => saveAddressFromRequest('pickup-named')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
                        {savingFromRequest === 'pickup-named' ? 'Saving…' : 'Save as named pickup…'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 sm:w-full">
                      Use this when you’ve typed a pickup once and want it in the dropdown for future requests.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivery address <span className="text-red-600">*</span></label>
                  <div className="mb-2">
                    <label htmlFor="delivery-quick-fill" className="sr-only">Quick fill delivery from saved address</label>
                    <select
                      id="delivery-quick-fill"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                      value={deliveryFillSource}
                      onChange={(e) => applyDeliveryFromSource(e.target.value)}
                    >
                      <option value="">Type manually or choose a frequent delivery address…</option>
                      {lastDeliverySnap?.delivery_address ? (
                        <option value="__lastDelivery__">Last used delivery</option>
                      ) : null}
                      {deliverySavedList.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {(loc.name?.trim() || 'Frequent stop')} — {loc.address?.slice(0, 60) || '—'}{loc.address?.length > 60 ? '…' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Street address"
                        value={delivery_address}
                        onChange={(e) => { setDeliveryFillSource(''); setDeliveryAddress(e.target.value); }}
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="City"
                        value={delivery_city}
                        onChange={(e) => { setDeliveryFillSource(''); setDeliveryCity(e.target.value); }}
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Province (e.g. ON)"
                        value={delivery_province}
                        onChange={(e) => { setDeliveryFillSource(''); setDeliveryProvince(e.target.value); }}
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Postal code"
                        value={delivery_postal_code}
                        onChange={(e) => { setDeliveryFillSource(''); setDeliveryPostalCode(e.target.value); }}
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <span className="text-xs font-medium text-slate-600">Save for later:</span>
                    <button
                      type="button"
                      disabled={!deliveryCompleteForSave || savingFromRequest !== null}
                      onClick={() => saveAddressFromRequest('delivery')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed w-fit"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
                      {savingFromRequest === 'delivery' ? 'Saving…' : 'Save as frequent delivery'}
                    </button>
                    <p className="text-xs text-slate-500 sm:w-full">
                      Adds this drop-off to your saved list so you can auto-fill it on repeat runs.
                    </p>
                  </div>
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
                {priority === 'Schedule' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Delivery date</label>
                    <input
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={scheduled_date || ''}
                        onChange={(e) => setScheduledDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Delivery time</label>
                      <input
                        type="time"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={scheduled_time || '13:00'}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                  </div>
                  </>
                )}
                {requestSaveNotice && (
                  <p className="text-emerald-700 text-sm rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">{requestSaveNotice}</p>
                )}
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
              <p className="text-slate-600 text-sm mb-4">
                Tap a delivery to see details and proof of delivery (when the driver has finished drop-off).
              </p>
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
                        <th className="pb-2 pr-2">POD</th>
                        <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                      {requests.map((r) => (
                          <tr
                            key={r.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => { setDetailRequest(r); setPodError(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailRequest(r); setPodError(null); } }}
                            className="border-b border-slate-100 cursor-pointer hover:bg-emerald-50/60 transition-colors"
                          >
                          <td className="py-2 pr-2 font-mono">{r.reference_number || '—'}</td>
                          <td className="py-2 pr-2 max-w-[140px] truncate" title={r.pickup_address}>{r.pickup_address || '—'}</td>
                          <td className="py-2 pr-2 max-w-[140px] truncate" title={r.delivery_address}>{r.delivery_address || '—'}</td>
                            <td className="py-2 pr-2">{r.status}</td>
                            <td className="py-2 pr-2 text-center" title={hasPodContent(r) ? 'Proof on file' : 'After delivery'}>
                              {hasPodContent(r) ? (
                                <span className="text-emerald-600 font-medium">✓</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          <td className="py-2">{formatDate(r.created_at)}</td>
                          </tr>
                      ))}
                  </tbody>
                </table>
                </div>
              )}

              {detailRequest && (
                <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title">
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/40"
                    aria-label="Close"
                    onClick={() => { setDetailRequest(null); setPodError(null); }}
                  />
                  <div className="relative w-full max-w-md max-h-full overflow-y-auto bg-white shadow-xl border-l border-slate-200 p-5 md:p-6">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <h3 id="delivery-detail-title" className="text-lg font-semibold text-slate-900 pr-8">
                        Delivery <span className="font-mono text-emerald-700">{detailRequest.reference_number || detailRequest.id}</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => { setDetailRequest(null); setPodError(null); }}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <dl className="space-y-2 text-sm text-slate-700 mb-6">
                      <div><dt className="text-slate-500 text-xs uppercase tracking-wide">Status</dt><dd className="font-medium">{detailRequest.status}</dd></div>
                      <div><dt className="text-slate-500 text-xs uppercase tracking-wide">Pickup</dt><dd>{detailRequest.pickup_address || '—'}</dd></div>
                      <div><dt className="text-slate-500 text-xs uppercase tracking-wide">Delivery</dt><dd>{detailRequest.delivery_address || '—'}</dd></div>
                      {detailRequest.recipient_name && (
                        <div><dt className="text-slate-500 text-xs uppercase tracking-wide">Recipient</dt><dd>{detailRequest.recipient_name}</dd></div>
                      )}
                      <div><dt className="text-slate-500 text-xs uppercase tracking-wide">Requested</dt><dd>{formatDate(detailRequest.created_at)}</dd></div>
                    </dl>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Camera className="w-5 h-5 text-slate-600 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">Proof of delivery</p>
                            <p className="text-xs text-slate-500">Photo from the driver’s app (Shipday) and any signature we have on file.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={podRefreshing}
                          onClick={() => refreshPodFromShipday(detailRequest.id)}
                          className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {podRefreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                      </div>
                      {podError && <p className="text-sm text-red-600">{podError}</p>}

                      {!isDeliveryCompleted(detailRequest.status) && (
                        <p className="text-sm text-slate-600">
                          Proof of delivery will appear here after your delivery is marked <strong>complete</strong>. You can open this again once the drop-off is finished.
                        </p>
                      )}

                      {isDeliveryCompleted(detailRequest.status) && !hasPodContent(detailRequest) && (
                        <p className="text-sm text-slate-600">
                          Proof of delivery isn’t available yet. The driver may still be uploading it in their app — tap <strong>Refresh</strong> to pull the latest from Shipday.
                        </p>
                      )}

                      {isDeliveryCompleted(detailRequest.status) && hasPodContent(detailRequest) && (
                        <div className="space-y-4">
                          {detailRequest.pod_captured_at && (
                            <p className="text-xs text-slate-500">Last updated: {new Date(detailRequest.pod_captured_at).toLocaleString()}</p>
                          )}
                          {detailRequest.pod_signature_url ? (
                            <div>
                              <p className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FileImage className="w-3.5 h-3.5" /> Signature</p>
                              <a href={detailRequest.pod_signature_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Open full size</a>
                              <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden bg-white max-h-56">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={detailRequest.pod_signature_url} alt="Delivery signature" className="max-w-full max-h-56 object-contain mx-auto" />
                              </div>
                            </div>
                          ) : null}
                          {Array.isArray(detailRequest.pod_photo_urls) && detailRequest.pod_photo_urls.length > 0 ? (
                            <div>
                              <p className="text-xs font-medium text-slate-600 mb-2">Photos ({detailRequest.pod_photo_urls.length})</p>
                              <div className="grid grid-cols-1 gap-2">
                                {detailRequest.pod_photo_urls.map((url, i) => (
                                  typeof url === 'string' && url.trim() ? (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-slate-200 overflow-hidden bg-white">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} alt={`Proof of delivery ${i + 1}`} className="w-full max-h-64 object-contain" />
                                    </a>
                                  ) : null
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {!loading && activeTab === 'addresses' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Saved addresses</h2>
              <p className="text-slate-600 text-sm mb-6">Store pickup and delivery addresses for quick use when requesting a pickup.</p>

              <form onSubmit={handleAddSavedLocation} className="space-y-4 max-w-xl mb-8">
                <h3 className="text-sm font-medium text-slate-700">Add address</h3>
                        <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={newLocType}
                    onChange={(e) => setNewLocType(e.target.value)}
                  >
                    {SAVED_LOCATION_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                                  </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. Home, Office"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                  />
                                  </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Street <span className="text-red-600">*</span></label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Street address"
                      value={newLocAddressLine}
                      onChange={(e) => setNewLocAddressLine(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City <span className="text-red-600">*</span></label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="City"
                      value={newLocCity}
                      onChange={(e) => setNewLocCity(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Province <span className="text-red-600">*</span></label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="e.g. ON"
                      value={newLocProvince}
                      onChange={(e) => setNewLocProvince(e.target.value)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Postal code <span className="text-red-600">*</span></label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Postal code"
                      value={newLocPostal}
                      onChange={(e) => setNewLocPostal(e.target.value)}
                      required
                    />
                  </div>
                </div>
                        <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Phone or name"
                    value={newLocContact}
                    onChange={(e) => setNewLocContact(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={addingLocation} className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                  {addingLocation ? 'Adding…' : 'Add address'}
                </button>
              </form>

              <h3 className="text-sm font-medium text-slate-700 mb-2">Your saved addresses</h3>
              {savedLocations.length === 0 ? (
                <p className="text-slate-500 py-6">No saved addresses yet. Add one above.</p>
              ) : (
                <ul className="space-y-3">
                  {savedLocations.map((loc) => (
                    <li key={loc.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate">{loc.name || (SAVED_LOCATION_TYPES.find(t => t.value === loc.type)?.label ?? loc.type)}</p>
                        <p className="text-sm text-slate-600 truncate" title={loc.address}>{loc.address}</p>
                        {loc.contact && <p className="text-xs text-slate-500">{loc.contact}</p>}
                        <span className="inline-block mt-1 text-xs text-slate-400">{SAVED_LOCATION_TYPES.find(t => t.value === loc.type)?.label ?? loc.type}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedLocation(loc.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                                </li>
                              ))}
                            </ul>
                          )}
            </section>
                    )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
