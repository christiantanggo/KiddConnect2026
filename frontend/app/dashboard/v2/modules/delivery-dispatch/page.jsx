'use client';

/**
 * Last-Mile Delivery — CUSTOMER (business) dashboard only.
 * Customers can: request a pickup (enter addresses), view their deliveries, manage saved addresses.
 * All admin functions (incoming Communication log, Dispatched view, phone numbers, email/SMS on new request, legal, agent rebuild) live in Tavari admin only.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { deliveryNetworkAPI } from '@/lib/api';
import { savedLocationRowToParts, savedLocationContactPhone } from '@/lib/canadianAddressParts';
import { useBusinessTimezone } from '@/hooks/useBusinessTimezone';
import { ArrowLeft, Loader, RefreshCw, Trash2, Truck, MapPin, Package, X, Camera, FileImage, BookmarkPlus, Pencil } from 'lucide-react';

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

/** My deliveries: column id → row field or special key */
const DELIVERY_SORT = {
  reference_number: { field: 'reference_number' },
  recipient_name: { field: 'recipient_name' },
  pickup_address: { field: 'pickup_address' },
  delivery_address: { field: 'delivery_address' },
  status: { field: 'status' },
  pod: { special: 'pod' },
  created_at: { special: 'date' },
};

function deliverySortHint(colKey, dir) {
  if (colKey === 'created_at') return dir === 'desc' ? 'Newest first' : 'Oldest first';
  if (colKey === 'pod') return dir === 'asc' ? 'No proof first' : 'Has proof first';
  return dir === 'asc' ? 'A–Z' : 'Z–A';
}

function DeliverySortTh({ colKey, label, sort, onSort, className, align = 'left' }) {
  const active = sort.key === colKey;
  const alignCls = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  return (
    <th scope="col" className={className}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSort(colKey);
        }}
        className={`group inline-flex flex-col text-sm font-medium text-slate-600 hover:text-slate-900 rounded-md px-1 py-0.5 -mx-1 w-full min-w-0 ${alignCls} ${active ? 'text-slate-900' : ''}`}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {active ? (
            <span className="text-emerald-600 shrink-0" aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>
          ) : (
            <span className="text-slate-300 group-hover:text-slate-400 text-xs shrink-0" aria-hidden>↕</span>
          )}
        </span>
        {active && (
          <span className="block text-[10px] font-normal text-slate-400 leading-tight mt-0.5">
            {deliverySortHint(colKey, sort.dir)}
          </span>
        )}
      </button>
    </th>
  );
}

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

  /** On-demand: choose third-party carrier after Shipday order is created (Tavari customer price). */
  const [carrierModal, setCarrierModal] = useState(null); // { requestId, referenceNumber } | null
  const [carrierOptionsRefreshKey, setCarrierOptionsRefreshKey] = useState(0);
  const [carrierOptionsLoading, setCarrierOptionsLoading] = useState(false);
  const [carrierOptionsError, setCarrierOptionsError] = useState(null);
  const [carrierEstimates, setCarrierEstimates] = useState([]);
  const [carrierDisclaimer, setCarrierDisclaimer] = useState('');
  const [carrierFleetFallback, setCarrierFleetFallback] = useState(false);
  const [carrierPick, setCarrierPick] = useState(null); // { estimate_id, provider_name }
  const [carrierConfirming, setCarrierConfirming] = useState(false);

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

  /** Inline edit for Saved addresses list */
  const [editingSavedId, setEditingSavedId] = useState(null);
  const [editLocType, setEditLocType] = useState('frequent_delivery');
  const [editLocName, setEditLocName] = useState('');
  const [editLocAddressLine, setEditLocAddressLine] = useState('');
  const [editLocCity, setEditLocCity] = useState('');
  const [editLocProvince, setEditLocProvince] = useState('');
  const [editLocPostal, setEditLocPostal] = useState('');
  const [editLocContact, setEditLocContact] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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
          ...(callback_phone?.trim() ? { contact: callback_phone.trim() } : {}),
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
        if (s.callback_phone && String(s.callback_phone).trim()) {
          setCallbackPhone(String(s.callback_phone).trim());
        }
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
    const phone = savedLocationContactPhone(loc);
    if (phone) setCallbackPhone(phone);
  };

  /** Selected row: proof of delivery (POD) from Shipday — tap row to open. */
  const [detailRequest, setDetailRequest] = useState(null);
  const [podRefreshing, setPodRefreshing] = useState(false);
  const [podError, setPodError] = useState(null);

  const isDeliveryCompleted = (status) => {
    const s = String(status || '').toLowerCase().replace(/\s+/g, '_');
    return s === 'completed' || s === 'already_delivered' || s === 'delivered';
  };

  const hasPodContent = useCallback((r) => {
    if (!r) return false;
    if (r.pod_signature_url && String(r.pod_signature_url).trim()) return true;
    const photos = r.pod_photo_urls;
    return Array.isArray(photos) && photos.some((u) => typeof u === 'string' && u.trim());
  }, []);

  /** My deliveries: default newest first */
  const [deliveryListSort, setDeliveryListSort] = useState({ key: 'created_at', dir: 'desc' });
  const [deliveryFilterStatus, setDeliveryFilterStatus] = useState('');
  const [deliveryFilterPod, setDeliveryFilterPod] = useState(''); // '' | 'yes' | 'no'
  const [deliverySearchQuery, setDeliverySearchQuery] = useState('');

  const deliveryUniqueStatuses = useMemo(() => {
    const set = new Set();
    (requests || []).forEach((r) => {
      if (r?.status != null && String(r.status).trim()) set.add(String(r.status).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [requests]);

  const deliveriesSortedFiltered = useMemo(() => {
    const compareRows = (a, b, sortKey, dir) => {
      const spec = DELIVERY_SORT[sortKey];
      if (!spec) return 0;
      if (spec.special === 'date') {
        const ta = new Date(a?.created_at || 0).getTime();
        const tb = new Date(b?.created_at || 0).getTime();
        return dir === 'asc' ? ta - tb : tb - ta;
      }
      if (spec.special === 'pod') {
        const pa = hasPodContent(a) ? 1 : 0;
        const pb = hasPodContent(b) ? 1 : 0;
        return dir === 'asc' ? pa - pb : pb - pa;
      }
      const field = spec.field;
      const va = a?.[field];
      const vb = b?.[field];
      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      const c = sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
      return dir === 'asc' ? c : -c;
    };

    let list = Array.isArray(requests) ? [...requests] : [];
    const q = deliverySearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.reference_number,
          r.pickup_address,
          r.delivery_address,
          r.recipient_name,
          r.status,
          r.package_description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (deliveryFilterStatus) {
      list = list.filter((r) => String(r.status || '') === deliveryFilterStatus);
    }
    if (deliveryFilterPod === 'yes') {
      list = list.filter((r) => hasPodContent(r));
    } else if (deliveryFilterPod === 'no') {
      list = list.filter((r) => !hasPodContent(r));
    }
    const { key, dir } = deliveryListSort;
    list.sort((a, b) => compareRows(a, b, key, dir));
    return list;
  }, [
    requests,
    deliverySearchQuery,
    deliveryFilterStatus,
    deliveryFilterPod,
    deliveryListSort,
    hasPodContent,
  ]);

  const handleDeliverySortClick = (columnKey) => {
    setDeliveryListSort((prev) => {
      if (prev.key === columnKey) {
        return { key: columnKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      const isDate = columnKey === 'created_at';
      return { key: columnKey, dir: isDate ? 'desc' : 'asc' };
    });
  };

  const deliveryFiltersActive =
    Boolean(deliveryFilterStatus) || Boolean(deliveryFilterPod) || Boolean(deliverySearchQuery.trim());

  const clearDeliveryFilters = () => {
    setDeliveryFilterStatus('');
    setDeliveryFilterPod('');
    setDeliverySearchQuery('');
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

  useEffect(() => {
    if (!carrierModal?.requestId) return;
    let cancelled = false;
    (async () => {
      setCarrierOptionsLoading(true);
      setCarrierOptionsError(null);
      setCarrierEstimates([]);
      setCarrierDisclaimer('');
      setCarrierFleetFallback(false);
      setCarrierPick(null);
      try {
        const res = await deliveryNetworkAPI.getCarrierOptions(carrierModal.requestId);
        if (cancelled) return;
        const list = res.data?.estimates || [];
        setCarrierEstimates(list);
        setCarrierDisclaimer(res.data?.disclaimer || '');
        setCarrierFleetFallback(!!res.data?.fleet_fallback_available);
        const first = list[0];
        if (first?.provider_name) {
          setCarrierPick({
            estimate_id: first.estimate_id != null ? String(first.estimate_id) : '',
            provider_name: String(first.provider_name).trim(),
          });
        }
      } catch (e) {
        if (!cancelled) {
          setCarrierOptionsError(e.response?.data?.error || e.message || 'Failed to load delivery options.');
        }
      } finally {
        if (!cancelled) setCarrierOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carrierModal?.requestId, carrierOptionsRefreshKey]);

  const closeCarrierModal = useCallback(() => {
    setCarrierModal(null);
    setCarrierOptionsRefreshKey(0);
    setCarrierOptionsLoading(false);
    setCarrierOptionsError(null);
    setCarrierEstimates([]);
    setCarrierDisclaimer('');
    setCarrierFleetFallback(false);
    setCarrierPick(null);
    setCarrierConfirming(false);
  }, []);

  const openCarrierChoice = useCallback((requestId, referenceNumber) => {
    setCarrierModal({ requestId, referenceNumber: referenceNumber || '' });
    setCarrierOptionsRefreshKey(0);
  }, []);

  useEffect(() => {
    if (activeTab !== 'addresses') setEditingSavedId(null);
  }, [activeTab]);

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
      const msg =
        res.data?.message ||
        (res.data?.reference_number ? `Delivery scheduled. Reference: ${res.data.reference_number}` : 'Delivery scheduled.');
      setSubmitSuccess(msg);
      if (res.data?.needs_carrier_choice && res.data?.request_id) {
        openCarrierChoice(res.data.request_id, res.data.reference_number || '');
      }
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

  const cancelEditSavedLocation = () => {
    setEditingSavedId(null);
    setSavingEdit(false);
  };

  const beginEditSavedLocation = (loc) => {
    const f = savedLocationRowToParts(loc);
    setEditingSavedId(loc.id);
    setEditLocType(loc.type || 'frequent_delivery');
    setEditLocName(loc.name || '');
    setEditLocAddressLine(f?.street || (loc.address_line != null ? String(loc.address_line) : '') || '');
    setEditLocCity(f?.city || (loc.city != null ? String(loc.city) : '') || '');
    setEditLocProvince(f?.province || (loc.province != null ? String(loc.province) : '') || '');
    setEditLocPostal(f?.postal || (loc.postal_code != null ? String(loc.postal_code) : '') || '');
    setEditLocContact(loc.contact != null ? String(loc.contact) : '');
  };

  const handleSaveEditedLocation = async (e) => {
    e.preventDefault();
    if (!editingSavedId) return;
    if (!editLocAddressLine?.trim() || !editLocCity?.trim() || !editLocProvince?.trim() || !editLocPostal?.trim()) {
      alert('Street, city, province, and postal code are required.');
      return;
    }
    setSavingEdit(true);
    try {
      await deliveryNetworkAPI.updateSavedLocation(editingSavedId, {
        type: editLocType,
        name: editLocName.trim() || null,
        address_line: editLocAddressLine.trim(),
        city: editLocCity.trim(),
        province: editLocProvince.trim(),
        postal_code: editLocPostal.trim(),
        contact: editLocContact.trim() || null,
      });
      cancelEditSavedLocation();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Could not update address.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSavedLocation = async (id) => {
    try {
      if (editingSavedId === id) cancelEditSavedLocation();
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
                      <option value="">Type manually or choose a frequent delivery address (contact phone fills in when saved on the address)…</option>
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
                      Adds this drop-off and the contact phone above (if filled) so both auto-fill next time.
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
                  <p className="mt-1 text-xs text-slate-500">Choosing a <strong>frequent delivery</strong> address fills this if you saved a contact phone on that address.</p>
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
                Tap a row for details and proof of delivery. <strong>Tap a column header</strong> to sort (tap again to reverse). Use filters to narrow the list.
              </p>
              {requests.length === 0 ? (
                <p className="text-slate-500 py-8 text-center">No deliveries yet. Use “Request a pickup” to schedule one.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end mb-4">
                    <div className="min-w-[160px]">
                      <label htmlFor="delivery-filter-status" className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                      <select
                        id="delivery-filter-status"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                        value={deliveryFilterStatus}
                        onChange={(e) => setDeliveryFilterStatus(e.target.value)}
                      >
                        <option value="">All statuses</option>
                        {deliveryUniqueStatuses.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[160px]">
                      <label htmlFor="delivery-filter-pod" className="block text-xs font-medium text-slate-600 mb-1">Proof of delivery</label>
                      <select
                        id="delivery-filter-pod"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                        value={deliveryFilterPod}
                        onChange={(e) => setDeliveryFilterPod(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="yes">Has proof</option>
                        <option value="no">No proof yet</option>
                      </select>
                    </div>
                    <div className="min-w-[200px] flex-1 max-w-md">
                      <label htmlFor="delivery-filter-search" className="block text-xs font-medium text-slate-600 mb-1">Search</label>
                      <input
                        id="delivery-filter-search"
                        type="search"
                        placeholder="Reference, address, recipient, status…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={deliverySearchQuery}
                        onChange={(e) => setDeliverySearchQuery(e.target.value)}
                      />
                    </div>
                    {deliveryFiltersActive && (
                      <button
                        type="button"
                        onClick={clearDeliveryFilters}
                        className="text-sm text-emerald-700 font-medium hover:underline py-2 sm:py-0"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  {deliveriesSortedFiltered.length === 0 ? (
                    <p className="text-slate-500 py-8 text-center">
                      No deliveries match your filters.{' '}
                      <button type="button" className="text-emerald-700 underline font-medium" onClick={clearDeliveryFilters}>
                        Clear filters
                      </button>
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left align-top">
                            <DeliverySortTh
                              colKey="reference_number"
                              label="Reference"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              className="pb-2 pr-2 align-bottom"
                            />
                            <DeliverySortTh
                              colKey="recipient_name"
                              label="Recipient"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              className="pb-2 pr-2 align-bottom"
                            />
                            <DeliverySortTh
                              colKey="pickup_address"
                              label="Pickup"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              className="pb-2 pr-2 align-bottom"
                            />
                            <DeliverySortTh
                              colKey="delivery_address"
                              label="Delivery"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              className="pb-2 pr-2 align-bottom"
                            />
                            <DeliverySortTh
                              colKey="status"
                              label="Status"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              className="pb-2 pr-2 align-bottom"
                            />
                            <DeliverySortTh
                              colKey="pod"
                              label="POD"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              align="center"
                              className="pb-2 pr-2 align-bottom"
                            />
                            <DeliverySortTh
                              colKey="created_at"
                              label="Date"
                              sort={deliveryListSort}
                              onSort={handleDeliverySortClick}
                              className="pb-2 align-bottom"
                            />
                          </tr>
                        </thead>
                        <tbody>
                          {deliveriesSortedFiltered.map((r) => (
                            <tr
                              key={r.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => { setDetailRequest(r); setPodError(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailRequest(r); setPodError(null); } }}
                              className="border-b border-slate-100 cursor-pointer hover:bg-emerald-50/60 transition-colors"
                            >
                              <td className="py-2 pr-2 font-mono">{r.reference_number || '—'}</td>
                              <td className="py-2 pr-2 max-w-[120px] truncate" title={r.recipient_name || ''}>{r.recipient_name?.trim() || '—'}</td>
                              <td className="py-2 pr-2 max-w-[130px] truncate" title={r.pickup_address}>{r.pickup_address || '—'}</td>
                              <td className="py-2 pr-2 max-w-[130px] truncate" title={r.delivery_address}>{r.delivery_address || '—'}</td>
                              <td className="py-2 pr-2 align-top">
                                <div>{r.status}</div>
                                {r.status === 'ChoosingCarrier' && (
                                  <button
                                    type="button"
                                    className="mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCarrierChoice(r.id, r.reference_number || '');
                                    }}
                                  >
                                    Choose service
                                  </button>
                                )}
                              </td>
                              <td className="py-2 pr-2 text-center" title={hasPodContent(r) ? 'Proof on file' : 'After delivery'}>
                                {hasPodContent(r) ? (
                                  <span className="text-emerald-600 font-medium">✓</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 whitespace-nowrap">{formatDate(r.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {carrierModal && (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="carrier-choice-title"
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close"
                    onClick={() => {
                      if (!carrierConfirming) closeCarrierModal();
                    }}
                  />
                  <div className="relative z-10 w-full max-w-md max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-5 md:p-6">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div>
                        <h3 id="carrier-choice-title" className="text-lg font-semibold text-slate-900">
                          Choose a delivery service
                        </h3>
                        {carrierModal.referenceNumber ? (
                          <p className="text-sm text-slate-600 mt-0.5 font-mono">Ref {carrierModal.referenceNumber}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={carrierConfirming}
                        onClick={closeCarrierModal}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0 disabled:opacity-50"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {carrierOptionsLoading && (
                      <div className="flex items-center gap-2 text-slate-600 py-6">
                        <Loader className="w-5 h-5 animate-spin shrink-0" />
                        <span className="text-sm">Loading prices…</span>
                      </div>
                    )}

                    {!carrierOptionsLoading && carrierOptionsError && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 mb-3">
                        {carrierOptionsError}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-amber-900 underline"
                            onClick={() => setCarrierOptionsRefreshKey((k) => k + 1)}
                          >
                            Try again
                          </button>
                        </div>
                      </div>
                    )}

                    {!carrierOptionsLoading && !carrierOptionsError && carrierEstimates.length === 0 && (
                      <p className="text-sm text-slate-600 mb-4">
                        No instant quotes are available right now. You can use your own fleet if it is configured, or close this and try again in a moment.
                      </p>
                    )}

                    {!carrierOptionsLoading && carrierEstimates.length > 0 && (
                      <ul className="space-y-2 mb-4" role="listbox" aria-label="Delivery options">
                        {carrierEstimates.map((est, idx) => {
                          const id = `carrier-opt-${idx}`;
                          const selected =
                            carrierPick &&
                            carrierPick.provider_name === String(est.provider_name || '').trim() &&
                            String(carrierPick.estimate_id || '') === String(est.estimate_id != null ? est.estimate_id : '');
                          return (
                            <li key={`${est.estimate_id}-${est.provider_name}-${idx}`}>
                              <label
                                htmlFor={id}
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                  selected ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  id={id}
                                  type="radio"
                                  name="carrier-choice"
                                  className="mt-1"
                                  checked={!!selected}
                                  onChange={() =>
                                    setCarrierPick({
                                      estimate_id: est.estimate_id != null ? String(est.estimate_id) : '',
                                      provider_name: String(est.provider_name || '').trim(),
                                    })
                                  }
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-900">{est.provider_name}</p>
                                  <p className="text-lg font-semibold text-emerald-700 mt-0.5">
                                    {est.price_cad != null && est.price_cad !== '' ? String(est.price_cad) : '—'}
                                  </p>
                                  {est.disclaimer ? (
                                    <p className="text-xs text-slate-500 mt-1 leading-snug">{est.disclaimer}</p>
                                  ) : null}
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {carrierDisclaimer ? (
                      <p className="text-xs text-slate-500 leading-relaxed mb-4 border-t border-slate-100 pt-3">{carrierDisclaimer}</p>
                    ) : null}

                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                      {carrierFleetFallback && (
                        <button
                          type="button"
                          disabled={carrierConfirming || carrierOptionsLoading}
                          onClick={async () => {
                            setCarrierConfirming(true);
                            setCarrierOptionsError(null);
                            try {
                              await deliveryNetworkAPI.confirmCarrier(carrierModal.requestId, { mode: 'fleet' });
                              closeCarrierModal();
                              await load();
                              setSubmitSuccess(
                                carrierModal.referenceNumber
                                  ? `Fleet driver assigned for ${carrierModal.referenceNumber}.`
                                  : 'Fleet driver assigned.',
                              );
                            } catch (e) {
                              setCarrierOptionsError(
                                e.response?.data?.error ||
                                  e.response?.data?.message ||
                                  e.message ||
                                  'Could not assign fleet.',
                              );
                            } finally {
                              setCarrierConfirming(false);
                            }
                          }}
                          className="order-2 sm:order-1 px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {carrierConfirming ? 'Assigning…' : 'Use our fleet'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={
                          carrierConfirming ||
                          carrierOptionsLoading ||
                          !carrierPick ||
                          carrierEstimates.length === 0
                        }
                        onClick={async () => {
                          if (!carrierModal?.requestId || !carrierPick) return;
                          setCarrierConfirming(true);
                          setCarrierOptionsError(null);
                          try {
                            await deliveryNetworkAPI.confirmCarrier(carrierModal.requestId, {
                              provider_name: carrierPick.provider_name,
                              estimate_id: carrierPick.estimate_id,
                            });
                            closeCarrierModal();
                            await load();
                            setSubmitSuccess(
                              carrierModal.referenceNumber
                                ? `Carrier confirmed for ${carrierModal.referenceNumber}.`
                                : 'Carrier confirmed.',
                            );
                          } catch (e) {
                            setCarrierOptionsError(
                              e.response?.data?.error ||
                                e.response?.data?.message ||
                                e.message ||
                                'Could not confirm carrier.',
                            );
                          } finally {
                            setCarrierConfirming(false);
                          }
                        }}
                        className="order-1 sm:order-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {carrierConfirming ? 'Confirming…' : 'Confirm this service'}
                      </button>
                    </div>
                  </div>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {newLocType === 'frequent_delivery' ? 'Delivery contact phone (optional)' : 'Contact (optional)'}
                  </label>
                  <input
                    type="tel"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={newLocType === 'frequent_delivery' ? '+1 555 123 4567 — fills in when you pick this address' : 'Phone or name'}
                    value={newLocContact}
                    onChange={(e) => setNewLocContact(e.target.value)}
                  />
                  {newLocType === 'frequent_delivery' && (
                    <p className="mt-1 text-xs text-slate-500">Stored with this drop-off so the contact phone field auto-fills on “Request a pickup”.</p>
                  )}
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
                    <li key={loc.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      {editingSavedId === loc.id ? (
                        <form onSubmit={handleSaveEditedLocation} className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-slate-800">Edit address</span>
                            <button
                              type="button"
                              onClick={cancelEditSavedLocation}
                              className="text-xs text-slate-600 hover:text-slate-900 underline"
                            >
                              Cancel
                            </button>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                            <select
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                              value={editLocType}
                              onChange={(e) => setEditLocType(e.target.value)}
                            >
                              {SAVED_LOCATION_TYPES.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Name (optional)</label>
                            <input
                              type="text"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              value={editLocName}
                              onChange={(e) => setEditLocName(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Street <span className="text-red-600">*</span></label>
                              <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                value={editLocAddressLine}
                                onChange={(e) => setEditLocAddressLine(e.target.value)}
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">City <span className="text-red-600">*</span></label>
                              <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                value={editLocCity}
                                onChange={(e) => setEditLocCity(e.target.value)}
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Province <span className="text-red-600">*</span></label>
                              <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                value={editLocProvince}
                                onChange={(e) => setEditLocProvince(e.target.value)}
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Postal code <span className="text-red-600">*</span></label>
                              <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                value={editLocPostal}
                                onChange={(e) => setEditLocPostal(e.target.value)}
                                required
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              {editLocType === 'frequent_delivery' ? 'Delivery contact phone (optional)' : 'Contact (optional)'}
                            </label>
                            <input
                              type="tel"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              value={editLocContact}
                              onChange={(e) => setEditLocContact(e.target.value)}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {savingEdit ? 'Saving…' : 'Save changes'}
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-800 truncate">{loc.name || (SAVED_LOCATION_TYPES.find((t) => t.value === loc.type)?.label ?? loc.type)}</p>
                            <p className="text-sm text-slate-600 truncate" title={loc.address}>{loc.address}</p>
                            {loc.contact && <p className="text-xs text-slate-500">{loc.contact}</p>}
                            <span className="inline-block mt-1 text-xs text-slate-400">{SAVED_LOCATION_TYPES.find((t) => t.value === loc.type)?.label ?? loc.type}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => beginEditSavedLocation(loc)}
                              className="p-2 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedLocation(loc.id)}
                              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
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
