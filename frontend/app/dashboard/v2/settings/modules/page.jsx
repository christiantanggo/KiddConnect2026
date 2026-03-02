'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft, CheckCircle2, Lock, Settings, ExternalLink, Loader, Phone } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function ModuleSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);
  const [phoneAgentEnabled, setPhoneAgentEnabled] = useState(null);
  const [phoneAgentToggling, setPhoneAgentToggling] = useState(false);

  useEffect(() => {
    loadModules();
  }, []);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const getActiveBusinessId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
  };

  const loadModules = async () => {
    try {
      setError(null);
      setLoading(true);
      const headers = getAuthHeaders();
      const businessId = getActiveBusinessId();

      if (!businessId) {
        setError('Please select an organization first');
        setLoading(false);
        return;
      }

      headers['X-Active-Business-Id'] = businessId;

      const [modulesRes, userRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/modules`, { headers }),
        fetch(`${API_URL}/api/auth/user`, { headers }),
      ]);

      if (modulesRes.ok) {
        const data = await modulesRes.json();
        setModules(data.modules || []);
      } else {
        const errorData = await modulesRes.json().catch(() => ({ error: 'Failed to load modules' }));
        setError(errorData.error || 'Failed to load modules');
      }

      if (userRes.ok) {
        const userData = await userRes.json();
        const biz = userData.business;
        if (biz) setPhoneAgentEnabled(biz.ai_enabled ?? true);
      }
    } catch (err) {
      console.error('[Module Settings] Error:', err);
      setError('Failed to load modules. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const togglePhoneAgent = async (enabled) => {
    setPhoneAgentToggling(true);
    const prev = phoneAgentEnabled;
    setPhoneAgentEnabled(enabled);
    try {
      const headers = getAuthHeaders();
      const businessId = getActiveBusinessId();
      headers['X-Active-Business-Id'] = businessId;
      const res = await fetch(`${API_URL}/api/business/settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ai_enabled: enabled }),
      });
      if (!res.ok) {
        setPhoneAgentEnabled(prev);
        console.error('[Module Settings] Failed to toggle phone agent');
      }
    } catch (err) {
      setPhoneAgentEnabled(prev);
      console.error('[Module Settings] Toggle phone agent error:', err);
    } finally {
      setPhoneAgentToggling(false);
    }
  };

  const getModuleSettingsPath = (moduleKey) => {
    // Map module keys to their settings paths
    const paths = {
      'reviews': '/review-reply-ai/dashboard/settings',
      'phone-agent': '/tavari-ai-phone/dashboard/settings',
      'orbix-network': '/dashboard/v2/modules/orbix-network/settings',
      'emergency-dispatch': '/dashboard/v2/modules/emergency-dispatch',
    };
    return paths[moduleKey] || null;
  };

  const getModuleDashboardPath = (moduleKey) => {
    // Map module keys to their dashboard paths
    const paths = {
      'reviews': '/review-reply-ai/dashboard',
      'phone-agent': '/tavari-ai-phone/dashboard',
      'orbix-network': '/dashboard/v2/modules/orbix-network/dashboard',
      'emergency-dispatch': '/dashboard/v2/modules/emergency-dispatch',
    };
    return paths[moduleKey] || `/dashboard/v2/modules/${moduleKey}/dashboard`;
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-screen">
            <Loader className="animate-spin" size={24} style={{ color: 'var(--color-accent)' }} />
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard/v2/settings"
              className="text-sm mb-4 inline-block transition-colors flex items-center gap-1"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--color-text-main)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
            >
              <ArrowLeft className="w-4 h-4" /> Back to Settings
            </Link>
            <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
              Module Settings
            </h1>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Configure and manage your active modules
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-md" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* Modules List */}
          <div className="space-y-4">
            {modules.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                <p>No modules available</p>
              </div>
            ) : (
              modules.map((module) => {
                const isSubscribed = module.subscribed || module.subscription_status === 'active';
                const settingsPath = getModuleSettingsPath(module.key);
                const dashboardPath = getModuleDashboardPath(module.key);
                const isPhoneAgent = module.key === 'phone-agent';

                return (
                  <div
                    key={module.key}
                    className="p-6 rounded-lg border transition-shadow"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>
                            {module.name || module.key}
                          </h3>
                          {isSubscribed ? (
                            <span 
                              className="px-2 py-1 text-xs font-medium flex items-center gap-1"
                              style={{
                                backgroundColor: 'rgba(20, 184, 166, 0.1)',
                                color: 'var(--color-accent)',
                                borderRadius: 'var(--button-radius)',
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <span 
                              className="px-2 py-1 text-xs font-medium flex items-center gap-1"
                              style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                color: 'var(--color-text-muted)',
                                borderRadius: 'var(--button-radius)',
                              }}
                            >
                              <Lock className="w-3 h-3" /> Not Subscribed
                            </span>
                          )}
                        </div>
                        {module.description && (
                          <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                            {module.description}
                          </p>
                        )}
                        {isSubscribed && module.usage_limit && (
                          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                            Usage Limit: {module.usage_limit} per billing cycle
                          </p>
                        )}

                        {/* Phone Agent quick on/off toggle */}
                        {isPhoneAgent && isSubscribed && phoneAgentEnabled !== null && (
                          <div
                            className="mt-3 pt-3 flex items-center gap-3"
                            style={{ borderTop: '1px solid var(--color-border)' }}
                          >
                            <Phone className="w-4 h-4 flex-shrink-0" style={{ color: phoneAgentEnabled ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
                            <div className="flex-1">
                              <p className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                                AI Agent {phoneAgentEnabled ? 'is answering calls' : 'is off — calls go straight to your number'}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {phoneAgentEnabled
                                  ? 'Turn off to temporarily disable the AI and forward all calls directly.'
                                  : 'Turn on to have the AI answer calls again.'}
                              </p>
                            </div>
                            <button
                              onClick={() => togglePhoneAgent(!phoneAgentEnabled)}
                              disabled={phoneAgentToggling}
                              className="relative inline-flex items-center flex-shrink-0"
                              style={{ cursor: phoneAgentToggling ? 'wait' : 'pointer' }}
                              aria-label={phoneAgentEnabled ? 'Disable phone agent' : 'Enable phone agent'}
                            >
                              <span
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all"
                                style={{
                                  backgroundColor: phoneAgentEnabled ? 'rgba(239,68,68,0.1)' : 'rgba(20,184,166,0.1)',
                                  color: phoneAgentEnabled ? '#ef4444' : 'var(--color-accent)',
                                  borderRadius: 'var(--button-radius)',
                                  border: `1px solid ${phoneAgentEnabled ? '#ef4444' : 'var(--color-accent)'}`,
                                  opacity: phoneAgentToggling ? 0.6 : 1,
                                }}
                              >
                                {phoneAgentToggling ? (
                                  <Loader className="w-3 h-3 animate-spin" />
                                ) : phoneAgentEnabled ? (
                                  'Turn Off'
                                ) : (
                                  'Turn On'
                                )}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        {isSubscribed && settingsPath && (
                          <Link
                            href={settingsPath}
                            className="px-3 py-1.5 text-sm rounded-md border transition-colors flex items-center gap-1"
                            style={{
                              backgroundColor: 'var(--color-surface)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text-main)',
                              borderRadius: 'var(--button-radius)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                            }}
                          >
                            <Settings className="w-3 h-3" />
                            Settings
                          </Link>
                        )}
                        {isSubscribed && (
                          <Link
                            href={dashboardPath}
                            className="px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1"
                            style={{
                              backgroundColor: 'var(--color-accent)',
                              color: 'white',
                              borderRadius: 'var(--button-radius)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '0.9';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                          >
                            Open
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                        {!isSubscribed && (
                          <Link
                            href="/dashboard"
                            className="px-3 py-1.5 text-sm rounded-md transition-colors"
                            style={{
                              backgroundColor: 'var(--color-accent)',
                              color: 'white',
                              borderRadius: 'var(--button-radius)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '0.9';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                          >
                            Subscribe
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 p-4 rounded-lg" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <strong>Note:</strong> Module settings are managed individually. Click "Settings" on an active module to configure it, 
              or visit the module dashboard to use it.
            </p>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

