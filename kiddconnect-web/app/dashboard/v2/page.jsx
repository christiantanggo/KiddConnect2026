'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowRight, AlertTriangle, Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { isYoutubeStyleModule, getV2ModuleSidebarHref } from '@/lib/archived-module-keys';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

export default function V2DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  useEffect(() => {
    loadData();
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

  const loadData = async () => {
    try {
      setError(null);
      const headers = getAuthHeaders();
      const businessId = getActiveBusinessId();

      // Load all organizations first
      const orgsRes = await fetch(`${API_URL}/api/v2/organizations`, { headers });
      let loadedOrgs = [];
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        loadedOrgs = orgsData.organizations || [];
        setOrganizations(loadedOrgs);
      }

      // Load current organization
      // First, try to get businessId from localStorage, or use first org if available
      let activeBusinessId = businessId;
      if (!activeBusinessId && loadedOrgs.length > 0) {
        // If we have organizations, use the first one
        activeBusinessId = loadedOrgs[0].id;
      }
      
      const currentOrgHeaders = { ...headers };
      if (activeBusinessId) {
        currentOrgHeaders['X-Active-Business-Id'] = activeBusinessId;
      }
      const currentRes = await fetch(`${API_URL}/api/v2/organizations/current`, { 
        headers: currentOrgHeaders 
      });
      if (currentRes.ok) {
        const currentData = await currentRes.json();
        if (currentData.organization) {
          setCurrentOrg(currentData.organization);
          // Store in localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('activeBusinessId', currentData.organization.id);
          }
        } else if (loadedOrgs.length === 1) {
          // Auto-select single organization
          const singleOrg = loadedOrgs[0];
          setCurrentOrg({
            id: singleOrg.id,
            name: singleOrg.name,
            role: singleOrg.role
          });
          if (typeof window !== 'undefined') {
            localStorage.setItem('activeBusinessId', singleOrg.id);
          }
          // Try to select it on the backend
          try {
            await fetch(`${API_URL}/api/v2/organizations/select`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ business_id: singleOrg.id }),
            });
          } catch (err) {
            console.warn('Failed to select organization:', err);
          }
        }
      }

      // Load modules (if we have an active org)
      if (businessId || currentOrg?.id) {
        const modulesHeaders = { ...headers };
        modulesHeaders['X-Active-Business-Id'] = businessId || currentOrg?.id;
        const modulesRes = await fetch(`${API_URL}/api/v2/modules`, { 
          headers: modulesHeaders 
        });
        if (modulesRes.ok) {
          const modulesData = await modulesRes.json();
          setModules(modulesData.modules || []);
        }
      }
    } catch (err) {
      console.error('[V2 Dashboard] Error loading data:', err);
      setError('Failed to load dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
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

  const activeModules = modules.filter(m => m.subscribed && m.health_status !== 'offline' && isYoutubeStyleModule(m));
  const availableModules = modules.filter(m => !m.subscribed && isYoutubeStyleModule(m));
  const archivedModules = modules.filter(m => !isYoutubeStyleModule(m));

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
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
              {APP_DISPLAY_NAME} — Dashboard
            </h1>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Manage your organizations, modules, and subscriptions
            </p>
          </div>

          {error && (
            <div 
              className="px-4 py-3 mb-6"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-danger)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              {error}
            </div>
          )}

          {/* Organization Selector - Removed from here since it's now in header */}

          {/* No Organization Warning */}
          {!currentOrg && (
            <div 
              className="p-6 mb-6"
              style={{
                backgroundColor: 'rgba(250, 204, 21, 0.1)',
                border: '1px solid rgba(250, 204, 21, 0.2)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-accent-2)' }}>
                No Active Organization
              </h3>
              <p className="mb-4" style={{ color: 'var(--color-text-main)' }}>
                Please select an organization from the header to view your modules and dashboard.
              </p>
            </div>
          )}

          {/* Active Modules */}
          {currentOrg && activeModules.length > 0 && (
            <div 
              className="shadow mb-8"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-main)' }}>Active Modules</h2>
                <Link
                  href="/dashboard/v2/modules"
                  className="text-sm transition-colors"
                  style={{ color: 'var(--color-accent)' }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  View All <ArrowRight className="w-4 h-4 inline ml-1" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeModules.map((module) => {
                  const dashboardHref = getV2ModuleSidebarHref(module);
                  
                  return (
                    <Link
                      key={module.key}
                      href={dashboardHref}
                      className="p-4 transition-shadow hover:shadow-md block"
                      style={{
                        border: `1px solid var(--color-border)`,
                        borderRadius: 'var(--card-radius)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                        e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>{module.name}</h3>
                        {module.health_status === 'healthy' && (
                          <span className="text-sm" style={{ color: 'var(--color-accent)' }}>●</span>
                        )}
                        {module.health_status === 'degraded' && (
                          <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-accent-2)' }} />
                        )}
                        {module.health_status === 'offline' && (
                          <span className="text-sm" style={{ color: 'var(--color-danger)' }}>●</span>
                        )}
                      </div>
                      {module.description && (
                        <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>{module.description}</p>
                      )}
                      <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                        Status: <span className="font-medium">{module.subscription_status}</span>
                      </div>
                      {module.subscription_plan && (
                        <div className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                          Plan: <span className="font-medium">{module.subscription_plan}</span>
                        </div>
                      )}
                      <div className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                        Open Dashboard <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Archive (collapsible, collapsed by default) */}
          {currentOrg && archivedModules.length > 0 && (
            <div 
              className="shadow mb-8"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setArchiveExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-6 py-4 text-left transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.03)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-5 h-5" />
                  <h2 className="text-xl font-semibold">Archive</h2>
                  <span className="text-sm">({archivedModules.length})</span>
                </div>
                {archiveExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>
              {archiveExpanded && (
                <div style={{ padding: '0 var(--padding-base) var(--padding-base)' }}>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    Archived modules are still accessible but no longer shown in the main active list.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedModules.map((module) => {
                  const dashboardHref = getV2ModuleSidebarHref(module);
                  return (
                    <Link
                      key={module.key}
                      href={dashboardHref}
                      className="p-4 transition-shadow hover:shadow-md block"
                      style={{
                        border: `1px solid var(--color-border)`,
                        borderRadius: 'var(--card-radius)',
                        cursor: 'pointer',
                        opacity: 0.9,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.08)';
                        e.currentTarget.style.borderColor = 'var(--color-text-muted)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold" style={{ color: 'var(--color-text-muted)' }}>{module.name}</h3>
                        <Archive className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                      </div>
                      {module.description && (
                        <p className="text-sm mb-2 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{module.description}</p>
                      )}
                      {module.subscribed && (
                        <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                          Status: <span className="font-medium">{module.subscription_status}</span>
                        </div>
                      )}
                      <div className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                        {module.subscribed ? 'Open' : 'Learn more'} <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                  );
                })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Available Modules */}
          {currentOrg && availableModules.length > 0 && (
            <div 
              className="shadow mb-8"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-main)' }}>Available Modules</h2>
                <Link
                  href="/dashboard/v2/modules"
                  className="text-sm transition-colors"
                  style={{ color: 'var(--color-accent)' }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  Browse Marketplace <ArrowRight className="w-4 h-4 inline ml-1" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableModules.slice(0, 6).map((module) => (
                  <div
                    key={module.key}
                    className="p-4 transition-shadow hover:shadow-md"
                    style={{
                      border: `1px solid var(--color-border)`,
                      borderRadius: 'var(--card-radius)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <h3 className="font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>{module.name}</h3>
                    {module.description && (
                      <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                        {module.description}
                      </p>
                    )}
                    <Link
                      href={`/dashboard/v2/modules/${module.key}`}
                      className="text-sm transition-colors"
                      style={{ color: 'var(--color-accent)' }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      Learn More <ArrowRight className="w-4 h-4 inline ml-1" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {currentOrg && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Link
                href="/dashboard/v2/modules"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Module Marketplace</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Browse and activate new AI modules
                </p>
              </Link>

              <Link
                href="/dashboard/v2/settings"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Settings</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Configure your modules and preferences
                </p>
              </Link>

              <div 
                className="shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Documentation</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Learn how to use {APP_DISPLAY_NAME}
                </p>
              </div>
            </div>
          )}

          {/* Stats Summary */}
          {currentOrg && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div 
                className="shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
              >
                <div className="text-2xl font-bold" style={{ color: 'var(--color-text-main)' }}>{activeModules.length}</div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Active Modules</div>
              </div>
              <div 
                className="shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
              >
                <div className="text-2xl font-bold" style={{ color: 'var(--color-text-main)' }}>{modules.length}</div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Modules</div>
              </div>
              <Link
                href="/dashboard/v2/settings/organizations"
                className="shadow transition-shadow cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div className="text-2xl font-bold" style={{ color: 'var(--color-text-main)' }}>
                  {organizations.length || 1}
                </div>
                <div className="text-sm flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  Organization{organizations.length !== 1 ? 's' : ''}
                  <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            </div>
          )}
          </div>
      </V2AppShell>
    </AuthGuard>
  );
}

