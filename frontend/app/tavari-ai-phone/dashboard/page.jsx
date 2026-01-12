'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import PhoneAgentV2ActionCards from '@/components/PhoneAgentV2ActionCards';
import { authAPI, usageAPI, callsAPI, messagesAPI } from '@/lib/api';

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState({ minutes_used: 0, minutes_total: 0, minutes_remaining: 0, usage_percent: 0 });
  const [calls, setCalls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSmsBanner, setShowSmsBanner] = useState(false);
  const [apiError, setApiError] = useState(null);
  const prevPathnameRef = useRef(pathname);
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);

  const loadData = async () => {
    // Prevent concurrent calls
    if (isLoadingRef.current) {
      console.log('[Phone Agent V2 Dashboard] Load already in progress, skipping...');
      return;
    }

    // Debounce: Don't load if called within last 2 seconds
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 2000) {
      console.log('[Phone Agent V2 Dashboard] Load called too soon, skipping...');
      return;
    }

    isLoadingRef.current = true;
    lastLoadTimeRef.current = now;

    try {
      console.log('[Phone Agent V2 Dashboard] ========== LOADING DATA START ==========');
      
      // Load user data first (required)
      let userRes;
      try {
        userRes = await authAPI.getMe();
        console.log('[Phone Agent V2 Dashboard] ✅ User data loaded:', userRes.data);
        setUser(userRes.data);
      } catch (error) {
        console.error('[Phone Agent V2 Dashboard] ❌ Failed to load user data:', error);
        throw error;
      }

      // Load other data in parallel (non-critical)
      const [usageRes, callsRes, messagesRes] = await Promise.allSettled([
        usageAPI.getStatus(),
        callsAPI.list({ limit: 10 }),
        messagesAPI.list({ limit: 10 }),
      ]);

      // Handle usage
      if (usageRes.status === 'fulfilled') {
        console.log('[Phone Agent V2 Dashboard] ✅ Usage data loaded:', usageRes.value.data);
        setUsage(usageRes.value.data || { minutes_used: 0, minutes_total: 0, minutes_remaining: 0, usage_percent: 0 });
        setApiError(null);
      } else {
        console.error('[Phone Agent V2 Dashboard] ❌ Failed to load usage:', usageRes.reason);
        setUsage({ minutes_used: 0, minutes_total: 0, minutes_remaining: 0, usage_percent: 0 });
        setApiError('Some data failed to load. Please refresh the page.');
      }

      // Handle calls
      if (callsRes.status === 'fulfilled') {
        console.log('[Phone Agent V2 Dashboard] ✅ Calls data loaded:', callsRes.value.data?.calls?.length || 0, 'calls');
        setCalls(callsRes.value.data?.calls || []);
      } else {
        console.error('[Phone Agent V2 Dashboard] ❌ Failed to load calls:', callsRes.reason);
        setCalls([]);
      }

      // Handle messages
      if (messagesRes.status === 'fulfilled') {
        console.log('[Phone Agent V2 Dashboard] ✅ Messages data loaded:', messagesRes.value.data?.messages?.length || 0, 'messages');
        setMessages(messagesRes.value.data?.messages || []);
      } else {
        console.error('[Phone Agent V2 Dashboard] ❌ Failed to load messages:', messagesRes.reason);
        setMessages([]);
      }

      // Check if SMS banner should be shown (checklist complete but SMS not enabled)
      const business = userRes.data?.business;
      if (business) {
        const checklistComplete = 
          business.vapi_phone_number &&
          business.email_ai_answered !== false &&
          business.ai_enabled;
        
        if (checklistComplete && !business.sms_enabled) {
          // Check if user has dismissed the banner
          const dismissed = localStorage.getItem('sms_banner_dismissed');
          setShowSmsBanner(!dismissed);
        }
      }

      console.log('[Phone Agent V2 Dashboard] ========== LOADING DATA COMPLETE ==========');
    } catch (error) {
      console.error('[Phone Agent V2 Dashboard] ========== LOADING DATA ERROR ==========');
      console.error('[Phone Agent V2 Dashboard] Critical error loading dashboard data:', error);
      if (!user) {
        console.error('[Phone Agent V2 Dashboard] Cannot show dashboard without user data');
      }
      setUsage({ minutes_used: 0, minutes_total: 0, minutes_remaining: 0, usage_percent: 0 });
      setCalls([]);
      setMessages([]);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reload data whenever pathname changes
  useEffect(() => {
    if (pathname?.includes('/tavari-ai-phone/dashboard') && prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      loadData();
      if (searchParams?.get('refresh')) {
        router.replace(pathname, { scroll: false });
      }
    }
  }, [pathname, searchParams, router]);

  // Reload data when page becomes visible (debounced)
  useEffect(() => {
    let visibilityTimeout;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(() => {
          loadData();
        }, 3000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(visibilityTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Check if checklist should be shown
  const shouldShowChecklist = () => {
    if (!user?.business) return true;
    const business = user.business;
    
    const isComplete = 
      business.vapi_phone_number &&
      business.email_ai_answered !== false &&
      business.ai_enabled;
    
    return !isComplete;
  };

  // Count AI handled calls (completed calls without messages)
  const aiHandledCalls = calls.filter(
    call => call.status === 'completed' && !call.message_taken
  ).length;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      date = new Date(dateString);
    } else {
      date = new Date(dateString + 'Z');
    }
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const dismissSmsBanner = () => {
    localStorage.setItem('sms_banner_dismissed', 'true');
    setShowSmsBanner(false);
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading dashboard...</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  if (!user) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div 
            className="px-4 py-3 mb-6"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-danger)',
              borderRadius: 'var(--card-radius)',
            }}
          >
            <p className="font-semibold">Failed to load dashboard data</p>
            <p className="text-sm mt-1">Please refresh the page or contact support if the problem persists.</p>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  const business = user?.business;
  const showChecklist = shouldShowChecklist();

  return (
    <AuthGuard>
      <V2AppShell>
        <div 
          style={{ 
            maxWidth: 'var(--max-content-width)', 
            margin: '0 auto',
            padding: 'calc(var(--padding-base) * 1.5) var(--padding-base)',
            minHeight: 'calc(100vh - var(--topbar-height))',
          }}
        >
          {apiError && (
            <div 
              className="mb-6 px-4 py-3"
              style={{
                backgroundColor: 'rgba(250, 204, 21, 0.1)',
                border: '1px solid rgba(250, 204, 21, 0.2)',
                color: 'var(--color-accent-2)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <p className="text-sm">{apiError}</p>
            </div>
          )}

          {/* SMS Activation Banner */}
          {showSmsBanner && !showChecklist && (
            <div 
              className="p-4 mb-6 relative"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderLeft: '4px solid var(--color-accent)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <button
                onClick={dismissSmsBanner}
                className="absolute top-2 right-2"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-main)' }}>Activate SMS for important messages</h3>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Get instant SMS alerts when callers request urgent callbacks</p>
                </div>
                <button
                  onClick={() => router.push('/tavari-ai-phone/dashboard/settings')}
                  className="px-4 py-2 text-white font-medium transition-opacity"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  Activate SMS
                </button>
              </div>
            </div>
          )}

          {/* Setup Checklist */}
          {showChecklist && (
            <div 
              className="shadow mb-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--color-text-main)' }}>Setup Checklist</h2>
              <div className="space-y-3">
                {/* Phone Number */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {business?.vapi_phone_number ? (
                      <svg className="w-5 h-5" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span style={{ color: business?.vapi_phone_number ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                      Phone number provisioned
                    </span>
                  </div>
                  {!business?.vapi_phone_number && (
                    <Link href="/tavari-ai-phone/dashboard/settings" style={{ color: 'var(--color-accent)' }}>
                      Select phone number →
                    </Link>
                  )}
                </div>

                {/* Email Notifications */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {business?.email_ai_answered !== false ? (
                      <svg className="w-5 h-5" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span style={{ color: business?.email_ai_answered !== false ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                      Email notifications enabled
                    </span>
                  </div>
                  {business?.email_ai_answered === false && (
                    <Link href="/tavari-ai-phone/dashboard/settings" style={{ color: 'var(--color-accent)' }}>
                      Enable →
                    </Link>
                  )}
                </div>

                {/* AI Agent Active */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {business?.ai_enabled ? (
                      <svg className="w-5 h-5" style={{ color: 'var(--color-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span style={{ color: business?.ai_enabled ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                      AI Phone Agent active
                    </span>
                  </div>
                  {!business?.ai_enabled && (
                    <Link href="/tavari-ai-phone/dashboard/settings" style={{ color: 'var(--color-accent)' }}>
                      Enable →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Module Action Cards */}
          <PhoneAgentV2ActionCards />

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Your AI Agent Number */}
            {business?.vapi_phone_number && (
              <button
                onClick={() => router.push('/tavari-ai-phone/dashboard/settings')}
                className="shadow-lg p-6 text-left transition-all hover:shadow-xl"
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent) 0%, #0d9488 100%)',
                  borderRadius: 'var(--card-radius)',
                  color: 'white',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div className="flex items-center justify-between mb-2">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className={`inline-block w-3 h-3 rounded-full ${business?.ai_enabled ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                </div>
                <h3 className="font-semibold text-lg mb-1">Your AI Agent Number</h3>
                <p className="text-sm mb-2 opacity-90">{business.vapi_phone_number}</p>
                <p className="text-xs opacity-75">Click to manage settings</p>
              </button>
            )}

            {/* Minutes Used */}
            <div 
              className="shadow-lg p-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                borderLeft: '4px solid var(--color-accent)',
              }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Minutes Used</h3>
              <p className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
                {Math.round(usage?.minutes_used || 0)} / {usage?.minutes_total || 0}
              </p>
              <div className="w-full mb-2" style={{ backgroundColor: 'var(--color-border)', borderRadius: '4px', height: '10px' }}>
                <div
                  className="rounded"
                  style={{ 
                    height: '10px',
                    backgroundColor: (usage?.usage_percent || 0) >= 100 
                      ? 'var(--color-danger)' 
                      : (usage?.usage_percent || 0) >= 80 
                      ? 'var(--color-accent-2)' 
                      : 'var(--color-accent)',
                    width: `${Math.min(usage?.usage_percent || 0, 100)}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {usage?.minutes_remaining || 0} minutes remaining
              </p>
            </div>

            {/* AI Handled Calls */}
            <div 
              className="shadow-lg p-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                borderLeft: '4px solid var(--color-accent)',
              }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>AI Handled Calls</h3>
              <p className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>{aiHandledCalls}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Calls handled completely by AI</p>
            </div>

            {/* Recent Calls */}
            <div 
              className="shadow-lg p-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                borderLeft: '4px solid var(--color-accent)',
              }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Recent Calls</h3>
              <p className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>{calls.length}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total calls received</p>
            </div>
          </div>

          {/* Recent Calls and Messages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Recent Calls */}
            <div 
              className="shadow-lg p-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>Recent Calls</h3>
                <Link href="/tavari-ai-phone/dashboard/calls" style={{ color: 'var(--color-accent)' }}>
                  View all →
                </Link>
              </div>
              {calls.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                  <p>No calls yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {calls.slice(0, 5).map((call) => (
                    <div 
                      key={call.id} 
                      className="flex items-center justify-between p-3 transition-colors"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderRadius: 'var(--card-radius)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-background)'}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                            {call.caller_number || 'Unknown'}
                          </span>
                          {call.message_taken && (
                            <span 
                              className="px-2 py-0.5 text-xs rounded-full"
                              style={{
                                backgroundColor: 'rgba(20, 184, 166, 0.1)',
                                color: 'var(--color-accent)',
                              }}
                            >
                              Message
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          <span>{formatDate(call.started_at)}</span>
                          <span>•</span>
                          <span>{formatDuration(call.duration_seconds)}</span>
                        </div>
                      </div>
                      <Link
                        href={`/tavari-ai-phone/dashboard/calls/${call.id}`}
                        className="text-sm font-medium transition-opacity"
                        style={{ color: 'var(--color-accent)' }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Messages */}
            <div 
              className="shadow-lg p-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>Recent Messages</h3>
                <Link href="/tavari-ai-phone/dashboard/messages" style={{ color: 'var(--color-accent)' }}>
                  View all →
                </Link>
              </div>
              {messages.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                  <p>No messages yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const sortedMessages = [...messages].sort((a, b) => {
                      const aIsNew = !a.is_read && a.status !== 'follow_up';
                      const bIsNew = !b.is_read && b.status !== 'follow_up';
                      const aIsFollowUp = a.status === 'follow_up';
                      const bIsFollowUp = b.status === 'follow_up';
                      
                      if (aIsNew && !bIsNew) return -1;
                      if (!aIsNew && bIsNew) return 1;
                      
                      if (aIsFollowUp && !bIsFollowUp && !bIsNew) return -1;
                      if (!aIsFollowUp && bIsFollowUp && !aIsNew) return 1;
                      
                      const dateA = new Date(a.created_at);
                      const dateB = new Date(b.created_at);
                      return dateB - dateA;
                    });
                    
                    return sortedMessages.slice(0, 5).map((message) => (
                      <div
                        key={message.id}
                        className="p-3 transition-colors"
                        style={{
                          borderRadius: 'var(--card-radius)',
                          backgroundColor: !message.is_read && message.status !== 'follow_up'
                            ? 'rgba(20, 184, 166, 0.1)'
                            : message.status === 'follow_up'
                            ? 'rgba(250, 204, 21, 0.1)'
                            : 'var(--color-background)',
                          borderLeft: (!message.is_read && message.status !== 'follow_up') || message.status === 'follow_up'
                            ? '4px solid ' + (!message.is_read && message.status !== 'follow_up' ? 'var(--color-accent)' : 'var(--color-accent-2)')
                            : 'none',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = !message.is_read && message.status !== 'follow_up'
                            ? 'rgba(20, 184, 166, 0.1)'
                            : message.status === 'follow_up'
                            ? 'rgba(250, 204, 21, 0.1)'
                            : 'var(--color-background)';
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                            {message.caller_name || 'Unknown Caller'}
                          </span>
                          {!message.is_read && message.status !== 'follow_up' && (
                            <span 
                              className="px-2 py-0.5 text-xs rounded-full text-white"
                              style={{ backgroundColor: 'var(--color-accent)' }}
                            >
                              New
                            </span>
                          )}
                          {message.status === 'follow_up' && (
                            <span 
                              className="px-2 py-0.5 text-xs rounded-full text-white"
                              style={{ backgroundColor: 'var(--color-accent-2)' }}
                            >
                              Follow Up
                            </span>
                          )}
                        </div>
                        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>{formatDate(message.created_at)}</p>
                        <p className="text-sm line-clamp-2" style={{ color: 'var(--color-text-main)' }}>{message.message_text}</p>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

function DashboardWithSearchParams() {
  return <DashboardContent />;
}

export default function PhoneAgentV2DashboardPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading dashboard...</div>
          </div>
        </V2AppShell>
      }>
        <DashboardWithSearchParams />
      </Suspense>
    </AuthGuard>
  );
}

