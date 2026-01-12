'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Lock, AlertTriangle, Layout } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function V2Sidebar() {
  const pathname = usePathname();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const loadModules = async () => {
    try {
      const headers = getAuthHeaders();
      
      const res = await fetch(`${API_URL}/api/v2/modules`, { headers });
      
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
      } else if (res.status === 429) {
        // Rate limited - silently fail, will retry on next mount
        console.warn('[V2Sidebar] Rate limited, will retry later');
      }
    } catch (err) {
      // Ignore JSON parse errors from rate limiting
      if (!err.message?.includes('JSON') && !err.message?.includes('429')) {
        console.error('[V2Sidebar] Error loading modules:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const activeModules = modules.filter(m => m.subscribed && m.health_status !== 'offline');
  const availableModules = modules.filter(m => !m.subscribed);
  
  // Check if we're on the main dashboard
  const isDashboardActive = pathname === '/dashboard' && !pathname?.startsWith('/dashboard/v2');

  return (
    <aside 
      className="fixed left-0 top-16 bottom-0 overflow-y-auto border-r"
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        top: 'var(--topbar-height)',
      }}
    >
      <nav className="p-6 space-y-1">
        {/* Tavari AI Dashboard Button */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className={`flex items-center px-3 py-2 text-sm font-medium transition-colors`}
            style={{
              borderRadius: 'var(--button-radius)',
              ...(isDashboardActive
                ? { 
                    backgroundColor: 'rgba(20, 184, 166, 0.1)', 
                    color: 'var(--color-accent)' 
                  }
                : { 
                    color: 'var(--color-text-main)' 
                  }),
            }}
            onMouseEnter={(e) => {
              if (!isDashboardActive) {
                e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDashboardActive) {
                e.target.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Layout className="w-4 h-4 mr-2" style={{ color: isDashboardActive ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
            <span>Tavari AI Dashboard</span>
          </Link>
        </div>

        {/* Active Modules */}
        {!loading && activeModules.length > 0 && (
          <div className="mb-6">
            <div 
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Active Modules
            </div>
            {activeModules.map((module) => {
              // Special handling for phone-agent module - link to existing Phone Agent dashboard
              const href = module.key === 'phone-agent' 
                ? '/dashboard' 
                : `/modules/${module.key}/dashboard`;
              
              // For phone-agent, check if we're on the Phone Agent dashboard
              const isActive = module.key === 'phone-agent' 
                ? pathname === '/dashboard' || pathname?.startsWith('/dashboard/') && !pathname?.startsWith('/dashboard/v2')
                : pathname?.includes(`/modules/${module.key}/dashboard`);
              
              return (
                <Link
                  key={module.key}
                  href={href}
                  className={`flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors`}
                  style={{
                    borderRadius: 'var(--button-radius)',
                    ...(isActive
                      ? { 
                          backgroundColor: 'rgba(20, 184, 166, 0.1)', 
                          color: 'var(--color-accent)' 
                        }
                      : { 
                          color: 'var(--color-text-main)' 
                        }),
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.target.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div className="flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-2" style={{ color: 'var(--color-accent)' }} />
                    <span>{module.name}</span>
                  </div>
                  {module.health_status === 'degraded' && (
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-accent-2)' }} />
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Available Modules */}
        {!loading && availableModules.length > 0 && (
          <div>
            <div 
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Available Modules
            </div>
            {availableModules.map((module) => (
              <Link
                key={module.key}
                href={`/dashboard/v2/modules/${module.key}`}
                className={`flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors`}
                style={{
                  borderRadius: 'var(--button-radius)',
                  color: 'var(--color-text-main)',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                <div className="flex items-center">
                  <Lock className="w-4 h-4 mr-2" style={{ color: 'var(--color-text-muted)' }} />
                  <span>{module.name}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Upgrade
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Loading modules...
          </div>
        )}

        {/* No Modules */}
        {!loading && modules.length === 0 && (
          <div className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No modules available
          </div>
        )}
      </nav>
    </aside>
  );
}
