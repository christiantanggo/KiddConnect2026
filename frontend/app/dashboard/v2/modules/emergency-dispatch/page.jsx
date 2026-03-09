'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { emergencyNetworkAPI } from '@/lib/api';
import { useBusinessTimezone } from '@/hooks/useBusinessTimezone';
import {
  ArrowLeft, Loader, RefreshCw, Phone, MessageSquare, Globe, Save, Plus, Trash2, Bot, Pencil,
  Settings, ListChecks, Wrench, RotateCcw, PhoneCall, Mail, Truck, GripVertical, ChevronUp, ChevronDown,
  LayoutDashboard, Layers, X,
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
  { id: 'greeting-script', label: 'Greeting & script' },
  { id: 'services', label: 'Emergency Services (Provider Directory)' },
  { id: 'communication', label: 'Communication Settings' },
  { id: 'website-pages', label: 'Website pages' },
];

const WEBSITE_PAGE_OPTIONS = [
  { value: 'emergency-main', label: 'Emergency Response Main Page' },
  { value: 'plumbing-main', label: 'Plumbing Main Page' },
  { value: 'terms-of-service', label: 'Terms of Service' },
];

const DEFAULT_HERO_PAGE_CONTENT = {
  hero_image_url: '',
  hero_header: '',
  hero_subtext: '',
  buttons: [{ label: '', url: 'tel' }, { label: '', url: 'sms' }, { label: '', url: '#form' }],
};
const DEFAULT_TERMS_PAGE_CONTENT = {
  page_title: 'Terms of Service',
  page_subtext: 'Emergency Dispatch Service',
  sections: [{ id: '1', header: '', content: '' }],
};
function getDefaultWebsiteContent(pageKey) {
  if (pageKey === 'terms-of-service') return { ...DEFAULT_TERMS_PAGE_CONTENT };
  return { ...DEFAULT_HERO_PAGE_CONTENT };
}

const DEFAULT_OPENING_GREETING = "Thanks for calling the 24/7 Emergency Plumbing line. I can help connect you with a licensed plumber. What's going on—is it a leak, a clog, or something else?";
const DEFAULT_SERVICE_LINE_NAME = '24/7 Emergency Plumbing';
const DEFAULT_CUSTOMER_CALLBACK_MESSAGE = "Hi {{caller_name}}, this is {{service_line_name}}. Good news—we've assigned a plumber to your request. The company is {{business_name}}. You can reach them at {{provider_phone}}. If you have any questions, call us back. Goodbye.";

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
  const { formatDate } = useBusinessTimezone();
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
    notification_sms_number: '',
    email_enabled: true,
    sms_enabled: false,
    escalation_email_enabled: true,
    escalation_sms_enabled: true,
    customer_sms_enabled: false,
    customer_sms_message: '',
    customer_sms_legal: '',
    terms_of_service_url: '',
    intake_fields: [...DEFAULT_INTAKE_FIELDS],
    opening_greeting: DEFAULT_OPENING_GREETING,
    service_line_name: DEFAULT_SERVICE_LINE_NAME,
    custom_instructions: '',
    customer_callback_message: DEFAULT_CUSTOMER_CALLBACK_MESSAGE,
  });
  const [analytics, setAnalytics] = useState(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({
    business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '', email: '',
    verification_status: 'pending', priority_tier: 'basic', is_available: true,
  });
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createAgentError, setCreateAgentError] = useState(null);
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState([]);
  const [selectedNumberToAdd, setSelectedNumberToAdd] = useState('');
  const [configSaveMessage, setConfigSaveMessage] = useState(null);
  const [linkResult, setLinkResult] = useState(null); // { linked: [], notInVapi: [], errors: [] } from last save or link-agent
  const [linkingAgent, setLinkingAgent] = useState(false);
  const [callProviderLoadingId, setCallProviderLoadingId] = useState(null);
  const [resetDispatchLoadingId, setResetDispatchLoadingId] = useState(null);
  const [assigningRequestId, setAssigningRequestId] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [recentCallsSubTab, setRecentCallsSubTab] = useState('pending'); // 'pending' | 'dispatched'
  const [requestDetailLog, setRequestDetailLog] = useState([]);
  const [requestDetailActivity, setRequestDetailActivity] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [websitePageKey, setWebsitePageKey] = useState('emergency-main');
  const [websitePageContent, setWebsitePageContent] = useState(null);
  const [websitePageLoading, setWebsitePageLoading] = useState(false);
  const [websitePageDirty, setWebsitePageDirty] = useState(false);
  const [websitePageSaving, setWebsitePageSaving] = useState(false);
  const [websitePageSaveMessage, setWebsitePageSaveMessage] = useState(null);
  const [websiteHeroUploading, setWebsiteHeroUploading] = useState(false);

  const handleResetDispatch = async (requestId) => {
    setResetDispatchLoadingId(requestId);
    try {
      await emergencyNetworkAPI.resetDispatch(requestId);
      await load();
    } catch (e) {
      console.error('[EmergencyDispatch] resetDispatch error', e);
      const msg = e.response?.data?.error || e.message || 'Failed to reset dispatch';
      alert(msg);
    } finally {
      setResetDispatchLoadingId(null);
    }
  };

  const handleCallProvider = async (requestId) => {
    setCallProviderLoadingId(requestId);
    try {
      await emergencyNetworkAPI.callProvider(requestId);
      await load();
    } catch (e) {
      console.error('[EmergencyDispatch] callProvider error', e);
      const msg = e.response?.data?.error || e.message || 'Failed to place call';
      alert(msg);
    } finally {
      setCallProviderLoadingId(null);
    }
  };

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
        notification_sms_number: configRes.data?.notification_sms_number ?? '',
        email_enabled: configRes.data?.email_enabled !== false,
        sms_enabled: configRes.data?.sms_enabled ?? false,
        escalation_email_enabled: configRes.data?.escalation_email_enabled !== false,
        escalation_sms_enabled: configRes.data?.escalation_sms_enabled !== false,
        customer_sms_enabled: configRes.data?.customer_sms_enabled ?? false,
        customer_sms_message: configRes.data?.customer_sms_message ?? '',
        customer_sms_legal: configRes.data?.customer_sms_legal ?? '',
        terms_of_service_url: configRes.data?.terms_of_service_url ?? '',
        intake_fields: Array.isArray(configRes.data?.intake_fields) && configRes.data.intake_fields.length > 0
          ? configRes.data.intake_fields
          : [...DEFAULT_INTAKE_FIELDS],
        opening_greeting: configRes.data?.opening_greeting ?? DEFAULT_OPENING_GREETING,
        service_line_name: configRes.data?.service_line_name ?? DEFAULT_SERVICE_LINE_NAME,
        custom_instructions: configRes.data?.custom_instructions ?? '',
        customer_callback_message: configRes.data?.customer_callback_message ?? DEFAULT_CUSTOMER_CALLBACK_MESSAGE,
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

  // When a request is selected for detail view, fetch its dispatch log and request activity (resets, status changes)
  useEffect(() => {
    if (!selectedRequestId) {
      setRequestDetailLog([]);
      setRequestDetailActivity([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    Promise.all([
      emergencyNetworkAPI.getDispatchLog(selectedRequestId),
      emergencyNetworkAPI.getRequestActivity(selectedRequestId),
    ])
      .then(([logRes, activityRes]) => {
        if (!cancelled) {
          setRequestDetailLog(logRes.data?.log ?? []);
          setRequestDetailActivity(activityRes.data?.activity ?? []);
        }
      })
      .catch(() => { if (!cancelled) setRequestDetailLog([]); setRequestDetailActivity([]); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [selectedRequestId]);

  // Refetch requests (and dispatch log) periodically when viewing dashboard or recent calls so status updates (e.g. Accepted) appear without manual refresh
  useEffect(() => {
    if (!['dashboard', 'recent-calls', 'recent-messages', 'dispatched'].includes(activeTab)) return;
    const interval = setInterval(async () => {
      try {
        const [requestsRes, dispatchLogRes] = await Promise.all([
          emergencyNetworkAPI.getRequests(),
          emergencyNetworkAPI.getDispatchLog(),
        ]);
        setRequests(requestsRes.data?.requests ?? []);
        setDispatchLog(dispatchLogRes.data?.log ?? []);
      } catch (_) {}
    }, 15000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (websitePageKey && activeTab === 'settings' && settingsSubTab === 'website-pages') {
      setWebsitePageLoading(true);
      setWebsitePageContent(null);
      emergencyNetworkAPI.getWebsitePage(websitePageKey)
        .then((res) => {
          const content = res.data?.content;
          setWebsitePageContent(content && typeof content === 'object' ? content : getDefaultWebsiteContent(websitePageKey));
          setWebsitePageDirty(false);
        })
        .catch(() => {
          setWebsitePageContent(getDefaultWebsiteContent(websitePageKey));
        })
        .finally(() => setWebsitePageLoading(false));
    }
  }, [websitePageKey, activeTab, settingsSubTab]);

  const saveWebsitePage = async () => {
    const contentToSave = websitePageContent ?? getDefaultWebsiteContent(websitePageKey);
    if (!websitePageKey || !contentToSave) return;
    setWebsitePageSaving(true);
    setWebsitePageSaveMessage(null);
    try {
      await emergencyNetworkAPI.updateWebsitePage(websitePageKey, contentToSave);
      setWebsitePageContent(contentToSave);
      setWebsitePageDirty(false);
      setWebsitePageSaveMessage('Saved');
    } catch (e) {
      setWebsitePageSaveMessage(e.response?.data?.error || e.message || 'Failed to save');
    } finally {
      setWebsitePageSaving(false);
    }
  };

  const handleWebsiteHeroUpload = async (pageKey, file) => {
    if (!file) return;
    setWebsiteHeroUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await emergencyNetworkAPI.uploadWebsiteHero(formData, pageKey);
      const url = res.data?.url;
      if (url && websitePageContent && typeof websitePageContent === 'object') {
        setWebsitePageContent((c) => ({ ...c, hero_image_url: url }));
        setWebsitePageDirty(true);
      }
    } catch (e) {
      setWebsitePageSaveMessage(e.response?.data?.error || 'Upload failed');
    } finally {
      setWebsiteHeroUploading(false);
    }
  };

  const saveConfig = async (overrides = null) => {
    try {
      setConfigSaving(true);
      setConfigSaveMessage(null);
      setLinkResult(null);
      const c = overrides ? { ...config, ...overrides } : config;
      const toSend = {
        emergency_phone_numbers: Array.isArray(c.emergency_phone_numbers) ? c.emergency_phone_numbers : [],
        emergency_vapi_assistant_id: c.emergency_vapi_assistant_id || null,
        max_dispatch_attempts: c.max_dispatch_attempts ?? 5,
        notification_email: (c.notification_email && String(c.notification_email).trim()) || null,
        notification_sms_number: (c.notification_sms_number && String(c.notification_sms_number).trim()) || null,
        email_enabled: !!c.email_enabled,
        sms_enabled: !!c.sms_enabled,
        escalation_email_enabled: !!c.escalation_email_enabled,
        escalation_sms_enabled: !!c.escalation_sms_enabled,
        customer_sms_enabled: !!c.customer_sms_enabled,
        customer_sms_message: (c.customer_sms_message && String(c.customer_sms_message).trim()) || null,
        customer_sms_legal: (c.customer_sms_legal && String(c.customer_sms_legal).trim()) || null,
        terms_of_service_url: (c.terms_of_service_url && String(c.terms_of_service_url).trim()) || null,
        intake_fields: Array.isArray(c.intake_fields) ? c.intake_fields : [...DEFAULT_INTAKE_FIELDS],
        opening_greeting: (c.opening_greeting && String(c.opening_greeting).trim()) || null,
        service_line_name: (c.service_line_name && String(c.service_line_name).trim()) || null,
        custom_instructions: (c.custom_instructions && String(c.custom_instructions).trim()) || null,
        customer_callback_message: (c.customer_callback_message && String(c.customer_callback_message).trim()) || null,
      };
      const res = await emergencyNetworkAPI.updateConfig(toSend);
      const data = res.data || {};
      const { link_result, ...configRest } = data;
      setConfig((prev) => ({
        ...prev,
        emergency_phone_numbers: configRest.emergency_phone_numbers ?? c.emergency_phone_numbers ?? [],
        emergency_vapi_assistant_id: configRest.emergency_vapi_assistant_id ?? c.emergency_vapi_assistant_id ?? '',
        max_dispatch_attempts: configRest.max_dispatch_attempts ?? c.max_dispatch_attempts ?? 5,
        notification_email: configRest.notification_email ?? c.notification_email ?? '',
        notification_sms_number: configRest.notification_sms_number ?? c.notification_sms_number ?? '',
        email_enabled: configRest.email_enabled ?? c.email_enabled ?? true,
        sms_enabled: configRest.sms_enabled ?? c.sms_enabled ?? false,
        escalation_email_enabled: configRest.escalation_email_enabled ?? c.escalation_email_enabled ?? true,
        escalation_sms_enabled: configRest.escalation_sms_enabled ?? c.escalation_sms_enabled ?? true,
        customer_sms_enabled: configRest.customer_sms_enabled ?? c.customer_sms_enabled ?? false,
        customer_sms_message: configRest.customer_sms_message ?? c.customer_sms_message ?? '',
        customer_sms_legal: configRest.customer_sms_legal ?? c.customer_sms_legal ?? '',
        terms_of_service_url: configRest.terms_of_service_url ?? c.terms_of_service_url ?? '',
        intake_fields: Array.isArray(configRest.intake_fields) && configRest.intake_fields.length > 0 ? configRest.intake_fields : (c.intake_fields ?? []),
        opening_greeting: configRest.opening_greeting ?? c.opening_greeting ?? prev.opening_greeting ?? DEFAULT_OPENING_GREETING,
        service_line_name: configRest.service_line_name ?? c.service_line_name ?? prev.service_line_name ?? DEFAULT_SERVICE_LINE_NAME,
        custom_instructions: configRest.custom_instructions ?? c.custom_instructions ?? prev.custom_instructions ?? '',
        customer_callback_message: configRest.customer_callback_message ?? c.customer_callback_message ?? prev.customer_callback_message ?? DEFAULT_CUSTOMER_CALLBACK_MESSAGE,
      }));
      setConfigDirty(false);
      if (link_result) {
        setLinkResult(link_result);
        if (link_result.linked?.length > 0 && !link_result.errors?.length) {
          setConfigSaveMessage(`Saved. Agent linked to ${link_result.linked.length} number(s).`);
        } else if (link_result.errors?.length) {
          setConfigSaveMessage('Saved, but linking had issues. Use "Link to numbers" to retry.');
        } else if (link_result.notInVapi?.length) {
          setConfigSaveMessage('Saved. Some numbers are not in VAPI — add them in Telnyx first, then Link to numbers.');
        } else {
          setConfigSaveMessage('Saved');
        }
      } else {
        setConfigSaveMessage('Saved');
      }
      setTimeout(() => setConfigSaveMessage(null), 5000);
      await load();
    } catch (e) {
      console.error('[EmergencyDispatch] save config error', e);
      setConfigSaveMessage(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setConfigSaving(false);
    }
  };

  const linkAgentToNumbers = async () => {
    setLinkingAgent(true);
    setCreateAgentError(null);
    setLinkResult(null);
    try {
      const res = await emergencyNetworkAPI.linkAgent();
      const d = res.data || {};
      setLinkResult({ linked: d.linked || [], notInVapi: d.notInVapi || [], errors: d.errors || [] });
      if (d.linked?.length > 0 && !d.errors?.length) {
        setCreateAgentError(null);
        setConfigSaveMessage(`Linked agent to ${d.linked.length} number(s). Calls to these numbers will use the AI agent.`);
      } else if (d.notInVapi?.length && !d.linked?.length) {
        setCreateAgentError(`Could not link: ${(d.notInVapi || []).join(', ')} — ensure these numbers are in Telnyx and provisioned to VAPI (or add to Telnyx first, then try again).`);
      } else if (d.errors?.length) {
        setCreateAgentError(d.errors.join('; ') || d.message || 'Link failed');
      } else {
        setCreateAgentError(d.message || 'No numbers linked. Add emergency phone numbers in Settings and save first.');
      }
      setTimeout(() => setConfigSaveMessage(null), 5000);
      await load();
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message || 'Failed to link agent';
      setCreateAgentError(errMsg);
      setLinkResult({ linked: [], notInVapi: [], errors: [errMsg] });
    } finally {
      setLinkingAgent(false);
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
      // Attach the agent to configured emergency phone number(s) in VAPI
      try {
        const linkRes = await emergencyNetworkAPI.linkAgent();
        const d = linkRes.data || {};
        setLinkResult({ linked: d.linked || [], notInVapi: d.notInVapi || [], errors: d.errors || [] });
        if (d?.linked?.length) {
          setCreateAgentError(null);
        } else if (d?.notInVapi?.length && !d?.linked?.length) {
          setCreateAgentError(`Agent created. Could not provision/link ${d.notInVapi.join(', ')} — add numbers in Telnyx first, then go to Settings → Communication and click "Link agent to phone numbers".`);
        } else if (d?.errors?.length && !d?.linked?.length) {
          setCreateAgentError(`Agent created. Link failed: ${d.errors.join('; ')}. Use Settings → Communication → "Link agent to phone numbers" to retry.`);
        }
      } catch (_) {
        // link-agent is best-effort; create succeeded
      }
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
      setProviderForm({ business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '', email: '', verification_status: 'pending', priority_tier: 'basic', is_available: true });
      load();
    } catch (e) {
      console.error('[EmergencyDispatch] create provider error', e);
    }
  };

  const openEditProvider = (p) => {
    setEditingProviderId(p.id);
    setProviderForm({
      business_name: p.business_name || '',
      trade_type: p.trade_type || 'Plumbing',
      service_areas: Array.isArray(p.service_areas) ? p.service_areas.join(', ') : (p.service_areas || ''),
      phone: p.phone || '',
      email: p.email || '',
      verification_status: p.verification_status || 'pending',
      priority_tier: p.priority_tier || 'basic',
      is_available: p.is_available !== false,
    });
    setShowAddProvider(false);
  };

  const saveProviderEdit = async () => {
    if (!editingProviderId) return;
    try {
      await emergencyNetworkAPI.updateProvider(editingProviderId, {
        business_name: providerForm.business_name,
        trade_type: providerForm.trade_type,
        service_areas: providerForm.service_areas ? providerForm.service_areas.split(',').map((s) => s.trim()).filter(Boolean) : [],
        phone: providerForm.phone,
        email: providerForm.email?.trim() || null,
        verification_status: providerForm.verification_status,
        priority_tier: providerForm.priority_tier,
        is_available: providerForm.is_available,
      });
      setEditingProviderId(null);
      setProviderForm({ business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '', email: '', verification_status: 'pending', priority_tier: 'basic', is_available: true });
      load();
    } catch (e) {
      console.error('[EmergencyDispatch] update provider error', e);
    }
  };

  const updateRequestStatus = async (id, status) => {
    try {
      await emergencyNetworkAPI.updateRequest(id, { status });
      load();
      // If the detail modal is open for this request, refetch activity so the new status change appears
      if (selectedRequestId === id) {
        try {
          const res = await emergencyNetworkAPI.getRequestActivity(id);
          const activity = res.data?.activity ?? [];
          console.log('[EmergencyDispatch] refetched activity after status change', { id, count: activity.length, activity });
          setRequestDetailActivity(activity);
        } catch (e) {
          console.error('[EmergencyDispatch] refetch activity after status change failed', e);
        }
      }
    } catch (e) {
      console.error('[EmergencyDispatch] update request error', e);
    }
  };

  const assignProvider = async (requestId, providerId) => {
    const value = providerId && String(providerId).trim() ? providerId : null;
    setAssigningRequestId(requestId);
    try {
      await emergencyNetworkAPI.updateRequest(requestId, { accepted_provider_id: value });
      await load();
      if (selectedRequestId === requestId) {
        try {
          const res = await emergencyNetworkAPI.getRequestActivity(requestId);
          setRequestDetailActivity(res.data?.activity ?? []);
        } catch (_) {}
      }
    } catch (e) {
      console.error('[EmergencyDispatch] assign provider error', e);
      const msg = e.response?.data?.error || e.message || 'Failed to assign provider';
      alert(msg);
    } finally {
      setAssigningRequestId(null);
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
  const isDispatched = (r) => r.accepted_provider_id || ['Accepted', 'Connected', 'Closed'].includes(r.status);
  const pendingCalls = recentCalls.filter((r) => !isDispatched(r));
  const dispatchedCalls = recentCalls.filter(isDispatched);
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
            24/7 Emergency & Priority Service Network. Public pages: <a href="/emergencydispatch" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/emergencydispatch</a>, <a href="/emergency-plumbing" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/emergency-plumbing</a>, <a href="/termsofservice" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/termsofservice</a>
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
              {/* Needs escalation: declined / no provider accepted — escalate to Tavari */}
              {(() => {
                const needsEscalation = (requests || []).filter((r) => r.status === 'Needs Manual Assist');
                if (needsEscalation.length === 0) return null;
                return (
                  <div className="mb-8 p-5 rounded-xl border-2 border-amber-300 bg-amber-50">
                    <h3 className="text-lg font-bold text-amber-900 mb-1">Needs escalation to Tavari</h3>
                    <p className="text-sm text-amber-800 mb-4">These calls were declined or could not be placed. A person from Tavari should follow up with the customer.</p>
                    <div className="space-y-2">
                      {needsEscalation.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-white border border-amber-200">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.caller_name || r.callback_phone}</p>
                            <p className="text-xs text-slate-600">{r.callback_phone} · {r.service_category} · {formatDate(r.created_at)}</p>
                            {r.location && <p className="text-xs text-slate-500">{r.location}</p>}
                          </div>
                          <span className="text-xs font-medium px-2 py-1 rounded bg-amber-200 text-amber-900">Declined / needs manual assist</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setActiveTab('recent-calls')} className="mt-3 text-sm font-medium text-amber-800 underline">View in Recent calls →</button>
                  </div>
                );
              })()}
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
                        <div
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedRequestId(r.id)}
                          onKeyDown={(e) => e.key === 'Enter' && setSelectedRequestId(r.id)}
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.caller_name || r.callback_phone}</p>
                            <p className="text-xs text-slate-500">{formatDate(r.created_at)} · {r.service_category}</p>
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
                        <div
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedRequestId(r.id)}
                          onKeyDown={(e) => e.key === 'Enter' && setSelectedRequestId(r.id)}
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.caller_name || r.callback_phone}</p>
                            <p className="text-xs text-slate-500">{formatDate(r.created_at)} · {r.intake_channel}</p>
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

          {/* Settings: sub-tabs with horizontal scroll so all options are visible */}
          {activeTab === 'settings' && (
            <>
              <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto overflow-y-hidden pb-px scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <div className="flex flex-nowrap gap-1 min-w-0">
                  {SETTINGS_SUB_TABS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSettingsSubTab(id)}
                      className={`shrink-0 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${
                        settingsSubTab === id
                          ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                          : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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

              {settingsSubTab === 'greeting-script' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4">Greeting & script</h2>
              <p className="text-slate-600 text-sm mb-4">Configure how the AI answers the phone. Rebuild the agent after saving for changes to take effect.</p>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Opening greeting</label>
                  <p className="text-xs text-slate-500 mb-1">First thing the AI says when the caller is connected.</p>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px]"
                    placeholder={DEFAULT_OPENING_GREETING}
                    value={config.opening_greeting ?? ''}
                    onChange={(e) => { setConfig((c) => ({ ...c, opening_greeting: e.target.value })); setConfigDirty(true); }}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Service line name</label>
                  <p className="text-xs text-slate-500 mb-1">Used in the AI’s script (e.g. “You are the voice of a [X] dispatch line”).</p>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={DEFAULT_SERVICE_LINE_NAME}
                    value={config.service_line_name ?? ''}
                    onChange={(e) => { setConfig((c) => ({ ...c, service_line_name: e.target.value })); setConfigDirty(true); }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom instructions (optional)</label>
                  <p className="text-xs text-slate-500 mb-1">Extra rules or phrasing added to the AI’s system prompt.</p>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px]"
                    placeholder="e.g. Always confirm the callback number before ending the call."
                    value={config.custom_instructions ?? ''}
                    onChange={(e) => { setConfig((c) => ({ ...c, custom_instructions: e.target.value })); setConfigDirty(true); }}
                    rows={3}
                  />
                </div>
                {configDirty && (
                  <button type="button" onClick={saveConfig} disabled={configSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                    <Save className="w-4 h-4" /> {configSaving ? 'Saving...' : 'Save config'}
                  </button>
                )}
                {configSaveMessage && <p className={`text-sm ${configSaveMessage === 'Saved' ? 'text-emerald-600' : 'text-red-600'}`}>{configSaveMessage}</p>}
              </div>
            </section>
          )}

              {settingsSubTab === 'services' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Emergency Services (Provider Directory)</h2>
                <button type="button" onClick={() => { setShowAddProvider(true); setEditingProviderId(null); setProviderForm({ business_name: '', trade_type: 'Plumbing', service_areas: '', phone: '', email: '', verification_status: 'pending', priority_tier: 'basic', is_available: true }); }} className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700">
                  <Plus className="w-4 h-4" /> Add provider
                </button>
              </div>
              {(showAddProvider || editingProviderId) && (
                <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">{editingProviderId ? 'Edit provider' : 'Add provider'}</h3>
                  <input placeholder="Business name" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.business_name} onChange={(e) => setProviderForm((f) => ({ ...f, business_name: e.target.value }))} />
                  <select className="w-full rounded border px-3 py-2 text-sm" value={providerForm.trade_type} onChange={(e) => setProviderForm((f) => ({ ...f, trade_type: e.target.value }))}>
                    {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input placeholder="Phone" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.phone} onChange={(e) => setProviderForm((f) => ({ ...f, phone: e.target.value }))} />
                  <input type="email" placeholder="Email (optional; for Press 4 to email details)" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.email} onChange={(e) => setProviderForm((f) => ({ ...f, email: e.target.value }))} />
                  <input placeholder="Service areas (comma-separated)" className="w-full rounded border px-3 py-2 text-sm" value={providerForm.service_areas} onChange={(e) => setProviderForm((f) => ({ ...f, service_areas: e.target.value }))} />
                  <select className="w-full rounded border px-3 py-2 text-sm" value={providerForm.priority_tier} onChange={(e) => setProviderForm((f) => ({ ...f, priority_tier: e.target.value }))}>
                    {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={providerForm.is_available} onChange={(e) => setProviderForm((f) => ({ ...f, is_available: e.target.checked }))} /> Available</label>
                  <div className="flex gap-2">
                    {editingProviderId ? (
                      <button type="button" onClick={saveProviderEdit} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm">Save</button>
                    ) : (
                      <button type="button" onClick={createProvider} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm">Create</button>
                    )}
                    <button type="button" onClick={() => { setShowAddProvider(false); setEditingProviderId(null); }} className="px-4 py-2 border rounded text-sm">Cancel</button>
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
                      <th className="pb-2 pr-2">Email</th>
                      <th className="pb-2 pr-2">Tier</th>
                      <th className="pb-2 pr-2">Verified</th>
                      <th className="pb-2 pr-2">Available</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.length === 0 ? (
                      <tr><td colSpan={8} className="py-4 text-slate-500 text-center">No providers. Add one to start dispatching.</td></tr>
                    ) : (
                      providers.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="py-2 pr-2">{p.business_name}</td>
                          <td className="py-2 pr-2">{p.trade_type}</td>
                          <td className="py-2 pr-2">{p.phone}</td>
                          <td className="py-2 pr-2">{p.email || '—'}</td>
                          <td className="py-2 pr-2">{p.priority_tier}</td>
                          <td className="py-2 pr-2">{p.verification_status}</td>
                          <td className="py-2 pr-2">{p.is_available ? 'Yes' : 'No'}</td>
                          <td className="py-2 flex flex-wrap items-center gap-1">
                            <button type="button" onClick={() => openEditProvider(p)} className="text-slate-600 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50" title="Edit"><Pencil className="w-4 h-4 inline" /></button>
                            <button type="button" onClick={() => deleteProviderById(p.id)} className="text-red-600 hover:underline text-xs p-1 rounded hover:bg-red-50" title="Remove"><Trash2 className="w-4 h-4 inline" /></button>
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
                {/* Connection status: agent + numbers must be linked in VAPI for calls to work */}
                {config.emergency_vapi_assistant_id && (config.emergency_phone_numbers || []).length > 0 && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <p className="text-sm font-medium text-slate-800 mb-2">Agent ↔ phone number connection</p>
                    <p className="text-sm text-slate-600 mb-3">For calls to the emergency line to reach the AI agent, the agent must be linked to each number in VAPI. Save config or use the button below to link.</p>
                    <button type="button" onClick={linkAgentToNumbers} disabled={linkingAgent} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-60">
                      {linkingAgent ? <Loader className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                      {linkingAgent ? 'Linking…' : 'Link agent to phone numbers'}
                    </button>
                    {linkResult && (
                      <div className="mt-3 text-sm">
                        {linkResult.linked?.length > 0 && <p className="text-emerald-700">Linked: {linkResult.linked.join(', ')}</p>}
                        {linkResult.notInVapi?.length > 0 && <p className="text-amber-700">Not in VAPI (add in Telnyx first): {linkResult.notInVapi.join(', ')}</p>}
                        {linkResult.errors?.length > 0 && <p className="text-red-700">{linkResult.errors.join('; ')}</p>}
                      </div>
                    )}
                  </div>
                )}
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
                  <label className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <input type="checkbox" checked={config.email_enabled !== false} onChange={(e) => { setConfig((c) => ({ ...c, email_enabled: e.target.checked })); setConfigDirty(true); }} className="rounded border-slate-300" />
                    Send email when a new request comes in
                  </label>
                  <input type="email" className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm mt-1" placeholder="email@example.com" value={config.notification_email || ''} onChange={(e) => { setConfig((c) => ({ ...c, notification_email: e.target.value })); setConfigDirty(true); }} />
                  <p className="text-xs text-slate-500 mt-1">Intake details from phone calls are sent to this address when enabled.</p>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <input type="checkbox" checked={config.sms_enabled || false} onChange={(e) => { setConfig((c) => ({ ...c, sms_enabled: e.target.checked })); setConfigDirty(true); }} className="rounded border-slate-300" />
                    Send SMS when a new request comes in
                  </label>
                  <input type="tel" className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm mt-1" placeholder="+15551234567" value={config.notification_sms_number || ''} onChange={(e) => { setConfig((c) => ({ ...c, notification_sms_number: e.target.value })); setConfigDirty(true); }} />
                  <p className="text-xs text-slate-500 mt-1">SMS notifications use your first emergency line number as the sender. Same process as the AI phone agent.</p>
                </div>
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-2">When escalation is needed (all providers exhausted)</p>
                  <p className="text-xs text-slate-500 mb-3">Choose how you want to be notified when the AI has tried every provider and the request needs manual follow-up.</p>
                  <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                    <input type="checkbox" checked={config.escalation_email_enabled !== false} onChange={(e) => { setConfig((c) => ({ ...c, escalation_email_enabled: e.target.checked })); setConfigDirty(true); }} className="rounded border-slate-300" />
                    Send escalation email (to the address above)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={config.escalation_sms_enabled !== false} onChange={(e) => { setConfig((c) => ({ ...c, escalation_sms_enabled: e.target.checked })); setConfigDirty(true); }} className="rounded border-slate-300" />
                    Send escalation SMS (to the number above)
                  </label>
                </div>
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-1">SMS to customer after call</p>
                  <p className="text-xs text-slate-500 mb-3">Send a text to the caller after the AI collects their info: confirm details, say dispatch is looking, and include legal disclaimer. Use {'{{terms_url}}'} in the message or legal to insert the Terms of Service link. Leave message/legal blank to use defaults.</p>
                  <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                    <input type="checkbox" checked={config.customer_sms_enabled || false} onChange={(e) => { setConfig((c) => ({ ...c, customer_sms_enabled: e.target.checked })); setConfigDirty(true); }} className="rounded border-slate-300" />
                    Send SMS to customer after phone intake
                  </label>
                  <div className="mb-3">
                    <label className="block text-xs text-slate-600 mb-1">Terms of Service URL (used for {'{{terms_url}}'} in SMS)</label>
                    <input type="url" className="w-full max-w-2xl rounded border border-slate-300 px-3 py-2 text-sm" placeholder="https://tavarios.com/termsofservice" value={config.terms_of_service_url || ''} onChange={(e) => { setConfig((c) => ({ ...c, terms_of_service_url: e.target.value })); setConfigDirty(true); }} />
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs text-slate-600 mb-1">Message to customer (placeholders: {'{{caller_name}}'}, {'{{service_category}}'}, {'{{urgency_level}}'}, {'{{location}}'}, {'{{issue_summary}}'}, {'{{terms_url}}'})</label>
                    <textarea rows={3} className="w-full max-w-2xl rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Hi {{caller_name}}, we've received your {{service_category}} request ({{urgency_level}}). Our dispatch team is looking for a provider and will contact you once assigned." value={config.customer_sms_message || ''} onChange={(e) => { setConfig((c) => ({ ...c, customer_sms_message: e.target.value })); setConfigDirty(true); }} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Legal disclaimer (appended to message). Include {'{{terms_url}}'} for the terms link.</label>
                    <textarea rows={2} className="w-full max-w-2xl rounded border border-slate-300 px-3 py-2 text-sm" placeholder="We are a dispatch service only, not the provider. You are responsible for verifying the provider's license, insurance, and terms when they contact you. Terms: {{terms_url}}" value={config.customer_sms_legal || ''} onChange={(e) => { setConfig((c) => ({ ...c, customer_sms_legal: e.target.value })); setConfigDirty(true); }} />
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-1">Call back to customer when a provider accepts</p>
                  <p className="text-xs text-slate-500 mb-3">When a plumber accepts the job, we call the customer back and read this message. Use placeholders: {'{{caller_name}}'}, {'{{service_line_name}}'}, {'{{business_name}}'}, {'{{provider_phone}}'}. Leave blank to use the default message.</p>
                  <textarea
                    rows={4}
                    className="w-full max-w-2xl rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder={DEFAULT_CUSTOMER_CALLBACK_MESSAGE}
                    value={config.customer_callback_message ?? ''}
                    onChange={(e) => { setConfig((c) => ({ ...c, customer_callback_message: e.target.value })); setConfigDirty(true); }}
                  />
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

              {settingsSubTab === 'website-pages' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-4">Website pages</h2>
              <p className="text-slate-600 text-sm mb-4">Edit hero and content for the public Emergency Response, Plumbing, and Terms of Service pages.</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Page</label>
                <select
                  className="rounded border border-slate-300 px-3 py-2 text-sm bg-white min-w-[240px]"
                  value={websitePageKey}
                  onChange={(e) => { setWebsitePageKey(e.target.value); setWebsitePageSaveMessage(null); }}
                >
                  {WEBSITE_PAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {websitePageLoading && <p className="text-slate-500 text-sm">Loading...</p>}
              {!websitePageLoading && (() => {
                const displayContent = websitePageContent ?? getDefaultWebsiteContent(websitePageKey);
                return (
                <div className="space-y-6 max-w-2xl">
                  {(websitePageKey === 'emergency-main' || websitePageKey === 'plumbing-main') && (
                    <>
                      <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hero image</label>
                        <p className="text-xs text-slate-500 mb-2">Upload an image to show behind the hero on this page (and on Emergency Dispatch landing). Leave empty for a solid background.</p>
                        {displayContent.hero_image_url && (
                          <div className="mb-3">
                            <img src={displayContent.hero_image_url} alt="Hero preview" className="max-h-40 rounded border border-slate-200 object-cover" />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium cursor-pointer hover:bg-slate-700 disabled:opacity-50">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              className="sr-only"
                              disabled={websiteHeroUploading}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleWebsiteHeroUpload(websitePageKey, f);
                                e.target.value = '';
                              }}
                            />
                            {websiteHeroUploading ? 'Uploading...' : (displayContent.hero_image_url ? 'Replace image' : 'Upload hero image')}
                          </label>
                          {websiteHeroUploading && <span className="text-sm text-slate-500">Uploading...</span>}
                        </div>
                        <p className="text-xs text-amber-700 mt-2">After uploading, click <strong>Save page</strong> below to keep the image.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hero header</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                          value={displayContent.hero_header ?? ''}
                          onChange={(e) => { setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), hero_header: e.target.value })); setWebsitePageDirty(true); }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hero subtext</label>
                        <textarea
                          rows={2}
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                          value={displayContent.hero_subtext ?? ''}
                          onChange={(e) => { setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), hero_subtext: e.target.value })); setWebsitePageDirty(true); }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Buttons (label + URL)</label>
                        <p className="text-xs text-slate-500 mb-2">Use <code className="bg-slate-100 px-1 rounded">tel</code> for Call, <code className="bg-slate-100 px-1 rounded">sms</code> for Text, <code className="bg-slate-100 px-1 rounded">#form</code> for scroll-to-form.</p>
                        {(displayContent.buttons || []).map((btn, i) => (
                          <div key={i} className="flex gap-2 mb-2">
                            <input
                              type="text"
                              placeholder="Button label"
                              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                              value={btn.label ?? ''}
                              onChange={(e) => {
                                const next = [...(displayContent.buttons || [])];
                                next[i] = { ...next[i], label: e.target.value };
                                setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), buttons: next }));
                                setWebsitePageDirty(true);
                              }}
                            />
                            <input
                              type="text"
                              placeholder="URL (tel, sms, #form, or full URL)"
                              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                              value={btn.url ?? ''}
                              onChange={(e) => {
                                const next = [...(displayContent.buttons || [])];
                                next[i] = { ...next[i], url: e.target.value };
                                setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), buttons: next }));
                                setWebsitePageDirty(true);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {websitePageKey === 'terms-of-service' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Page title</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                          value={displayContent.page_title ?? ''}
                          onChange={(e) => { setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), page_title: e.target.value })); setWebsitePageDirty(true); }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Page subtext</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                          value={displayContent.page_subtext ?? ''}
                          onChange={(e) => { setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), page_subtext: e.target.value })); setWebsitePageDirty(true); }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Sections (header + content)</label>
                        {(displayContent.sections || []).map((sec, i) => (
                          <div key={sec.id || i} className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50/50">
                            <input
                              type="text"
                              placeholder="Section header"
                              className="w-full rounded border border-slate-300 px-3 py-2 text-sm mb-2"
                              value={sec.header ?? ''}
                              onChange={(e) => {
                                const next = [...(displayContent.sections || [])];
                                next[i] = { ...next[i], header: e.target.value };
                                setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), sections: next }));
                                setWebsitePageDirty(true);
                              }}
                            />
                            <textarea
                              rows={4}
                              placeholder="Section content"
                              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                              value={sec.content ?? ''}
                              onChange={(e) => {
                                const next = [...(displayContent.sections || [])];
                                next[i] = { ...next[i], content: e.target.value };
                                setWebsitePageContent((c) => ({ ...(c ?? getDefaultWebsiteContent(websitePageKey)), sections: next }));
                                setWebsitePageDirty(true);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {websitePageSaveMessage && <p className={`text-sm ${websitePageSaveMessage === 'Saved' ? 'text-emerald-600' : 'text-red-600'}`}>{websitePageSaveMessage}</p>}
                  {(websitePageDirty || !websitePageContent) && (
                    <button type="button" onClick={saveWebsitePage} disabled={websitePageSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-60">
                      <Save className="w-4 h-4" /> {websitePageSaving ? 'Saving...' : 'Save page'}
                    </button>
                  )}
                </div>
                );
              })()}
            </section>
          )}
            </>
          )}

          {/* Recent calls */}
          {activeTab === 'recent-calls' && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-medium mb-2">Recent calls</h2>
              <p className="text-slate-600 text-sm mb-4">Service requests from phone intake.</p>
              <div className="flex gap-1 border-b border-slate-200 mb-4">
                <button
                  type="button"
                  onClick={() => setRecentCallsSubTab('pending')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                    recentCallsSubTab === 'pending'
                      ? 'bg-white border-slate-200 -mb-px border-b-white text-slate-800'
                      : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Pending {pendingCalls.length > 0 && <span className="ml-1 text-slate-500">({pendingCalls.length})</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setRecentCallsSubTab('dispatched')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                    recentCallsSubTab === 'dispatched'
                      ? 'bg-white border-slate-200 -mb-px border-b-white text-slate-800'
                      : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Dispatched {dispatchedCalls.length > 0 && <span className="ml-1 text-slate-500">({dispatchedCalls.length})</span>}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 6px' }}>
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="pb-2 pr-2">Name</th>
                      <th className="pb-2 pr-2">Phone</th>
                      <th className="pb-2 pr-2">Service</th>
                      <th className="pb-2 pr-2">Urgency</th>
                      <th className="pb-2 pr-2">Location</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2 pr-2">Assigned to</th>
                      <th className="pb-2 pr-2">Created</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentCallsSubTab === 'pending' ? pendingCalls : dispatchedCalls).length === 0 ? (
                      <tr><td colSpan={9} className="py-4 text-slate-500 text-center">{recentCallsSubTab === 'pending' ? 'No pending calls' : 'No dispatched calls yet'}</td></tr>
                    ) : (
                      (recentCallsSubTab === 'pending' ? pendingCalls : dispatchedCalls).map((r) => {
                        const assignedProvider = r.accepted_provider_id ? providerById(r.accepted_provider_id) : null;
                        const providersForService = (providers || []).filter((p) => p.trade_type === (r.service_category || 'Other'));
                        const isHandled = r.accepted_provider_id || ['Accepted', 'Connected', 'Closed'].includes(r.status);
                        const rowBg = isHandled
                          ? 'bg-emerald-50/80 hover:bg-emerald-100/80 border-l-4 border-l-emerald-500'
                          : 'bg-red-50/80 hover:bg-red-100/80 border-l-4 border-l-red-400';
                        return (
                          <tr
                            key={r.id}
                            className={`border border-slate-200 cursor-pointer ${rowBg}`}
                            onClick={() => setSelectedRequestId(r.id)}
                          >
                            <td className="py-2 pr-2">{r.caller_name || '—'}</td>
                            <td className="py-2 pr-2">{r.callback_phone}</td>
                            <td className="py-2 pr-2">{r.service_category}</td>
                            <td className="py-2 pr-2">{r.urgency_level}</td>
                            <td className="py-2 pr-2 max-w-[120px] truncate" title={r.location}>{r.location || '—'}</td>
                            <td className="py-2 pr-2">{r.status}</td>
                            <td className="py-2 pr-2">{assignedProvider ? assignedProvider.business_name : '—'}</td>
                            <td className="py-2 pr-2">{formatDate(r.created_at)}</td>
                            <td className="py-2 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {['New', 'Contacting Providers', 'Needs Manual Assist'].includes(r.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleResetDispatch(r.id)}
                                  disabled={resetDispatchLoadingId === r.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-500 text-white text-xs font-medium hover:bg-slate-600 disabled:opacity-60"
                                  title="Clear dispatch attempts so Call plumber can try again"
                                >
                                  {resetDispatchLoadingId === r.id ? <Loader className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                  Reset dispatch
                                </button>
                              )}
                              {['New', 'Contacting Providers'].includes(r.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleCallProvider(r.id)}
                                  disabled={callProviderLoadingId === r.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                                  title="Place outbound call to next plumber"
                                >
                                  {callProviderLoadingId === r.id ? <Loader className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
                                  Call plumber
                                </button>
                              )}
                              <select
                                value={r.accepted_provider_id || ''}
                                onChange={(e) => assignProvider(r.id, e.target.value)}
                                disabled={assigningRequestId === r.id}
                                className="rounded border border-slate-300 text-xs py-1 min-w-[100px]"
                                title="Assign a provider (e.g. after manual escalation)"
                              >
                                <option value="">Assign...</option>
                                {providersForService.map((p) => (
                                  <option key={p.id} value={p.id}>{p.business_name}</option>
                                ))}
                              </select>
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
                      <th className="pb-2 pr-2">Assigned to</th>
                      <th className="pb-2 pr-2">Created</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMessages.length === 0 ? (
                      <tr><td colSpan={9} className="py-4 text-slate-500 text-center">No form or SMS requests yet</td></tr>
                    ) : (
                      recentMessages.map((r) => {
                        const assignedProvider = r.accepted_provider_id ? providerById(r.accepted_provider_id) : null;
                        const providersForService = (providers || []).filter((p) => p.trade_type === (r.service_category || 'Other'));
                        return (
                          <tr
                            key={r.id}
                            className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                            onClick={() => setSelectedRequestId(r.id)}
                          >
                            <td className="py-2 pr-2">{r.intake_channel === 'form' ? <Globe className="w-4 h-4 inline" /> : <MessageSquare className="w-4 h-4 inline" />} {r.intake_channel}</td>
                            <td className="py-2 pr-2">{r.caller_name || '—'}</td>
                            <td className="py-2 pr-2">{r.callback_phone}</td>
                            <td className="py-2 pr-2">{r.service_category}</td>
                            <td className="py-2 pr-2">{r.urgency_level}</td>
                            <td className="py-2 pr-2">{r.status}</td>
                            <td className="py-2 pr-2">{assignedProvider ? assignedProvider.business_name : '—'}</td>
                            <td className="py-2 pr-2">{formatDate(r.created_at)}</td>
                            <td className="py-2 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {['New', 'Contacting Providers', 'Needs Manual Assist'].includes(r.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleResetDispatch(r.id)}
                                  disabled={resetDispatchLoadingId === r.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-500 text-white text-xs font-medium hover:bg-slate-600 disabled:opacity-60"
                                  title="Clear dispatch attempts so Call plumber can try again"
                                >
                                  {resetDispatchLoadingId === r.id ? <Loader className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                  Reset dispatch
                                </button>
                              )}
                              {['New', 'Contacting Providers'].includes(r.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleCallProvider(r.id)}
                                  disabled={callProviderLoadingId === r.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                                  title="Place outbound call to next plumber"
                                >
                                  {callProviderLoadingId === r.id ? <Loader className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
                                  Call plumber
                                </button>
                              )}
                              <select
                                value={r.accepted_provider_id || ''}
                                onChange={(e) => assignProvider(r.id, e.target.value)}
                                disabled={assigningRequestId === r.id}
                                className="rounded border border-slate-300 text-xs py-1 min-w-[100px]"
                                title="Assign a provider (e.g. after manual escalation)"
                              >
                                <option value="">Assign...</option>
                                {providersForService.map((p) => (
                                  <option key={p.id} value={p.id}>{p.business_name}</option>
                                ))}
                              </select>
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
                            <td className="py-2 pr-2">{formatDate(r.created_at)}</td>
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
                              <td className="py-1">{formatDate(entry.attempted_at)}</td>
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

          {/* Request detail modal: what happened (provider call-outs, email, SMS) */}
          {selectedRequestId && (() => {
            const req = requests.find((r) => r.id === selectedRequestId);
            const activity = [...(requestDetailLog || [])].reverse(); // chronological: first call first
            const resultLabel = (r) => ({ accepted: 'Accepted', declined: 'Declined', no_answer: 'No answer', voicemail: 'Voicemail', error: 'Error', pending: 'Pending' })[r] || r;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedRequestId(null)}>
                <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-800">Request details & activity</h3>
                    <button type="button" onClick={() => setSelectedRequestId(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 space-y-4">
                    {req ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <p><span className="text-slate-500">Caller</span> {req.caller_name || '—'}</p>
                          <p><span className="text-slate-500">Callback</span> {req.callback_phone}</p>
                          <p><span className="text-slate-500">Service</span> {req.service_category}</p>
                          <p><span className="text-slate-500">Urgency</span> {req.urgency_level}</p>
                          <p><span className="text-slate-500">Status</span> <span className="font-medium">{req.status}</span></p>
                          <p><span className="text-slate-500">Created</span> {formatDate(req.created_at)}</p>
                          {req.location && <p className="sm:col-span-2"><span className="text-slate-500">Location</span> {req.location}</p>}
                          {req.issue_summary && <p className="sm:col-span-2"><span className="text-slate-500">Issue</span> {req.issue_summary}</p>}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 mb-2">What happened</h4>
                          {loadingDetail ? (
                            <p className="text-slate-500 flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Loading activity…</p>
                          ) : activity.length === 0 ? (
                            <p className="text-slate-500">No provider call-outs yet.</p>
                          ) : (
                            <ul className="space-y-3">
                              {activity.map((entry) => {
                                const didNotAnswer = entry.result === 'no_answer' || entry.result === 'voicemail';
                                return (
                                <li
                                  key={entry.id}
                                  className={`p-3 rounded-lg border text-sm ${didNotAnswer ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50/50'}`}
                                >
                                  <div className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                                    <PhoneCall className={`w-4 h-4 ${didNotAnswer ? 'text-red-500' : 'text-slate-500'}`} />
                                    {entry.provider_business_name || entry.emergency_providers?.business_name || 'Provider'}
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${didNotAnswer ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-700'}`}>
                                      {resultLabel(entry.result)}
                                    </span>
                                    {entry.attempted_at && (
                                      <span className="text-slate-500 text-xs">{formatDate(entry.attempted_at)}</span>
                                    )}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-3 text-slate-600">
                                    {entry.email_sent_at && (
                                      <span className="inline-flex items-center gap-1">
                                        <Mail className="w-3.5 h-3.5 text-emerald-600" />
                                        Email sent {formatDate(entry.email_sent_at)}
                                      </span>
                                    )}
                                    {entry.sms_sent_at && (
                                      <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                        SMS sent {formatDate(entry.sms_sent_at)}
                                      </span>
                                    )}
                                  </div>
                                </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        {/* Request activity: dispatch resets and status changes (manual vs AI) */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 mb-2">Request activity</h4>
                          {loadingDetail ? null : (requestDetailActivity || []).length === 0 ? (
                            <p className="text-slate-500 text-sm">No resets or status changes logged yet.</p>
                          ) : (
                            <ul className="space-y-2">
                              {[...(requestDetailActivity || [])].reverse().map((ev) => (
                                <li key={ev.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm">
                                  {ev.activity_type === 'dispatch_reset' ? (
                                    <>
                                      <span className="font-medium text-slate-800">Dispatch reset</span>
                                      <span className="text-slate-500 text-xs ml-2">{ev.source === 'ai' ? 'by AI' : 'by staff'}{ev.changed_by ? ` (${ev.changed_by})` : ''}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-medium text-slate-800">Status changed</span>
                                      <span className="text-slate-600"> {ev.from_status || '—'} → {ev.to_status || '—'}</span>
                                      <span className="text-slate-500 text-xs ml-2">{ev.source === 'ai' ? 'by AI' : 'by staff'}{ev.changed_by ? ` (${ev.changed_by})` : ''}</span>
                                    </>
                                  )}
                                  {ev.created_at && <span className="block text-xs text-slate-500 mt-0.5">{formatDate(ev.created_at)}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-slate-500">Request not found.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
