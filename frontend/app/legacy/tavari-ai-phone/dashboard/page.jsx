'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
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
      console.log('[Dashboard] Load already in progress, skipping...');
      return;
    }

    // Debounce: Don't load if called within last 2 seconds
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 2000) {
      console.log('[Dashboard] Load called too soon, skipping...');
      return;
    }

    isLoadingRef.current = true;
    lastLoadTimeRef.current = now;

    try {
      console.log('[Dashboard] ========== LOADING DATA START ==========');
      
      // Load user data first (required)
      let userRes;
      try {
        userRes = await authAPI.getMe();
        console.log('[Dashboard] ✅ User data loaded:', userRes.data);
        console.log('[Dashboard] User structure:', {
          hasUser: !!userRes.data?.user,
          hasBusiness: !!userRes.data?.business,
          userKeys: Object.keys(userRes.data?.user || {}),
          businessKeys: Object.keys(userRes.data?.business || {}),
        });
        setUser(userRes.data);
      } catch (error) {
        console.error('[Dashboard] ❌ Failed to load user data:', error);
        console.error('[Dashboard] Error details:', error.response?.data || error.message);
        // User data is critical, so we should still show loading or error
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
        console.log('[Dashboard] ✅ Usage data loaded:', usageRes.value.data);
        setUsage(usageRes.value.data || { minutes_used: 0, minutes_total: 0, minutes_remaining: 0, usage_percent: 0 });
        setApiError(null);
      } else {
        console.error('[Dashboard] ❌ Failed to load usage:', usageRes.reason);
        setUsage({ minutes_used: 0, minutes_total: 0, minutes_remaining: 0, usage_percent: 0 });
        setApiError('Some data failed to load. Please refresh the page.');
      }

      // Handle calls
      if (callsRes.status === 'fulfilled') {
        console.log('[Dashboard] ✅ Calls data loaded:', callsRes.value.data?.calls?.length || 0, 'calls');
        setCalls(callsRes.value.data?.calls || []);
      } else {
        console.error('[Dashboard] ❌ Failed to load calls:', callsRes.reason);
        setCalls([]);
      }

      // Handle messages
      if (messagesRes.status === 'fulfilled') {
        console.log('[Dashboard] ✅ Messages data loaded:', messagesRes.value.data?.messages?.length || 0, 'messages');
        setMessages(messagesRes.value.data?.messages || []);
      } else {
        console.error('[Dashboard] ❌ Failed to load messages:', messagesRes.reason);
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

      console.log('[Dashboard] ========== LOADING DATA COMPLETE ==========');
    } catch (error) {
      console.error('[Dashboard] ========== LOADING DATA ERROR ==========');
      console.error('[Dashboard] Critical error loading dashboard data:', error);
      // Set defaults to prevent UI from breaking
      // Even if user data fails, try to show something
      if (!user) {
        // If user data failed, we can't show the dashboard
        console.error('[Dashboard] Cannot show dashboard without user data');
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

  // Reload data whenever pathname changes to /dashboard
  useEffect(() => {
    if (pathname === '/dashboard' && prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      loadData();
      if (searchParams.get('refresh')) {
        router.replace('/dashboard', { scroll: false });
      }
    }
  }, [pathname, searchParams, router]);

  // Reload data when page becomes visible (debounced)
  useEffect(() => {
    let visibilityTimeout;
    let focusTimeout;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Debounce visibility changes
        clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(() => {
          loadData();
        }, 3000); // Wait 3 seconds after becoming visible
      }
    };

    // Remove focus handler - it was too aggressive and causing rate limits
    // Users can manually refresh if needed

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(visibilityTimeout);
      clearTimeout(focusTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Check if checklist should be shown
  const shouldShowChecklist = () => {
    if (!user?.business) return true;
    const business = user.business;
    
    // Checklist is complete when everything except SMS is done
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

  // Import date formatter
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    // Ensure the date string is treated as UTC if it doesn't have timezone info
    let date;
    if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
      // Already has timezone info
      date = new Date(dateString);
    } else {
      // Assume UTC if no timezone specified (database timestamps are typically UTC)
      date = new Date(dateString + 'Z');
    }
    
    // Convert to local timezone for display
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // If no user data, show error
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <main className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-semibold">Failed to load dashboard data</p>
            <p className="text-sm mt-1">Please refresh the page or contact support if the problem persists.</p>
          </div>
        </main>
      </div>
    );
  }

  const business = user?.business;
  const showChecklist = shouldShowChecklist();

  console.log('[Dashboard Render] State:', {
    hasUser: !!user,
    hasBusiness: !!business,
    usage,
    callsCount: calls.length,
    messagesCount: messages.length,
    loading,
    showChecklist,
  });

  return (
    <div className="min-h-screen bg-gray-50" style={{ color: '#000000' }}>
      <DashboardHeader />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back!</h2>
          <p className="text-gray-600">
            {business?.name || user?.business?.name || 'Business'} • {user?.user?.email || user?.email || 'Loading...'}
          </p>
          {apiError && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
              <p className="text-sm">{apiError}</p>
            </div>
          )}
        </div>

        {/* SMS Activation Banner */}
        {showSmsBanner && !showChecklist && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg relative">
            <button
              onClick={dismissSmsBanner}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Activate SMS for important messages</h3>
                <p className="text-sm text-blue-700">Get instant SMS alerts when callers request urgent callbacks</p>
              </div>
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Activate SMS
              </button>
            </div>
          </div>
        )}

        {/* Setup Checklist */}
        {showChecklist && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Setup Checklist</h2>
            <div className="space-y-3">
              {/* Phone Number */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {business?.vapi_phone_number ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm ${business?.vapi_phone_number ? 'text-gray-900' : 'text-gray-500'}`}>
                    Phone number provisioned
                  </span>
                </div>
                {!business?.vapi_phone_number && (
                  <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                    Select phone number →
                  </Link>
                )}
              </div>

              {/* Email Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {business?.email_ai_answered !== false ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm ${business?.email_ai_answered !== false ? 'text-gray-900' : 'text-gray-500'}`}>
                    Email notifications enabled
                  </span>
                </div>
                {business?.email_ai_answered === false && (
                  <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                    Enable →
                  </Link>
                )}
              </div>

              {/* AI Agent Active */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {business?.ai_enabled ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm ${business?.ai_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                    AI Phone Agent active
                  </span>
                </div>
                {!business?.ai_enabled && (
                  <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                    Enable →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Cards - Always show this section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Your AI Agent Number */}
          {business?.vapi_phone_number && (
            <button
              onClick={() => router.push('/dashboard/settings')}
              className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-left hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between mb-2">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className={`inline-block w-3 h-3 rounded-full ${business?.ai_enabled ? 'bg-green-400' : 'bg-gray-400'}`}></span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">Your AI Agent Number</h3>
              <p className="text-blue-100 text-sm mb-2">{business.vapi_phone_number}</p>
              <p className="text-blue-200 text-xs">Click to manage settings</p>
            </button>
          )}

          {/* Minutes Used */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Minutes Used</h3>
            <p className="text-3xl font-bold text-gray-900 mb-2" style={{ color: '#000000' }}>
              {Math.round(usage?.minutes_used || 0)} / {usage?.minutes_total || 0}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  (usage?.usage_percent || 0) >= 100
                    ? 'bg-red-500'
                    : (usage?.usage_percent || 0) >= 80
                    ? 'bg-yellow-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(usage?.usage_percent || 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {usage?.minutes_remaining || 0} minutes remaining
            </p>
          </div>

          {/* AI Handled Calls */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">AI Handled Calls</h3>
            <p className="text-3xl font-bold text-gray-900 mb-1" style={{ color: '#000000' }}>{aiHandledCalls}</p>
            <p className="text-xs text-gray-500">Calls handled completely by AI</p>
          </div>

          {/* Recent Calls */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Recent Calls</h3>
            <p className="text-3xl font-bold text-gray-900 mb-1" style={{ color: '#000000' }}>{calls.length}</p>
            <p className="text-xs text-gray-500">Total calls received</p>
          </div>
        </div>

        {/* Recent Calls and Messages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Recent Calls */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Recent Calls</h3>
              <Link href="/dashboard/calls" className="text-sm text-blue-600 hover:underline">
                View all →
              </Link>
            </div>
            {calls.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No calls yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.slice(0, 5).map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {call.caller_number || 'Unknown'}
                        </span>
                        {call.message_taken && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Message
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatDate(call.started_at)}</span>
                        <span>•</span>
                        <span>{formatDuration(call.duration_seconds)}</span>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/calls/${call.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Messages */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Recent Messages</h3>
              <Link href="/dashboard/messages" className="text-sm text-blue-600 hover:underline">
                View all →
              </Link>
            </div>
            {messages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No messages yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  // Sort messages: newest unread first, then follow up, then most recent read
                  const sortedMessages = [...messages].sort((a, b) => {
                    const aIsNew = !a.is_read && a.status !== 'follow_up';
                    const bIsNew = !b.is_read && b.status !== 'follow_up';
                    const aIsFollowUp = a.status === 'follow_up';
                    const bIsFollowUp = b.status === 'follow_up';
                    
                    // New messages first
                    if (aIsNew && !bIsNew) return -1;
                    if (!aIsNew && bIsNew) return 1;
                    
                    // Follow up messages second
                    if (aIsFollowUp && !bIsFollowUp && !bIsNew) return -1;
                    if (!aIsFollowUp && bIsFollowUp && !aIsNew) return 1;
                    
                    // Within same category, sort by date (newest first)
                    const dateA = new Date(a.created_at);
                    const dateB = new Date(b.created_at);
                    return dateB - dateA;
                  });
                  
                  return sortedMessages.slice(0, 5).map((message) => (
                    <div
                      key={message.id}
                      className={`p-3 rounded-lg hover:bg-gray-50 transition ${
                        !message.is_read && message.status !== 'follow_up'
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : message.status === 'follow_up'
                          ? 'bg-yellow-50 border-l-4 border-yellow-500'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {message.caller_name || 'Unknown Caller'}
                        </span>
                        {!message.is_read && message.status !== 'follow_up' && (
                          <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                            New
                          </span>
                        )}
                        {message.status === 'follow_up' && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-600 text-white rounded-full">
                            Follow Up
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{formatDate(message.created_at)}</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{message.message_text}</p>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

function DashboardWithSearchParams() {
  return <DashboardContent />;
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50">
          <DashboardHeader />
          <main className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-lg">Loading dashboard...</div>
            </div>
          </main>
        </div>
      }>
        <DashboardWithSearchParams />
      </Suspense>
    </AuthGuard>
  );
}
