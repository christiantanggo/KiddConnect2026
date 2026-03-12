'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Lock, AlertTriangle, Layout } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function V2Sidebar({ mobileOpen = false, onClose }) {
  const pathname = usePathname();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const rateLimitedRef = useRef(false);

  useEffect(() => {
    // Only load once
    if (!hasLoadedRef.current && !isLoadingRef.current) {
      hasLoadedRef.current = true;
      loadModules();
    }
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
    // Prevent concurrent calls
    if (isLoadingRef.current) {
      console.log('[V2Sidebar] Already loading modules - skipping');
      return;
    }
    
    // Don't load if rate limited
    if (rateLimitedRef.current) {
      console.log('[V2Sidebar] Rate limited - skipping loadModules');
      return;
    }
    
    isLoadingRef.current = true;
    console.log('[V2Sidebar] Loading modules...');
    
    try {
      const headers = getAuthHeaders();
      
      const res = await fetch(`${API_URL}/api/v2/modules`, { headers });
      
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
        setLoading(false);
        rateLimitedRef.current = false;
        console.log('[V2Sidebar] Modules loaded successfully');
      } else if (res.status === 429) {
        // Rate limited - stop trying
        console.warn('[V2Sidebar] Rate limited - STOPPING all requests');
        rateLimitedRef.current = true;
        setLoading(false); // Stop loading state
        
        // Clear rate limit after 60 seconds
        setTimeout(() => {
          rateLimitedRef.current = false;
        }, 60000);
      } else {
        setLoading(false);
      }
    } catch (err) {
      // Ignore JSON parse errors from rate limiting
      if (!err.message?.includes('JSON') && !err.message?.includes('429')) {
        console.error('[V2Sidebar] Error loading modules:', err);
      }
      
      // Check if it's a 429 in the error
      if (err.message?.includes('429')) {
        rateLimitedRef.current = true;
        setTimeout(() => {
          rateLimitedRef.current = false;
        }, 60000);
      }
      
      setLoading(false);
    } finally {
      isLoadingRef.current = false;
    }
  };

  const activeModules = modules.filter(m => m.subscribed && m.health_status !== 'offline');
  const availableModules = modules.filter(m => !m.subscribed);
  
  // Check if we're on the main dashboard
  const isDashboardActive = pathname === '/dashboard' && !pathname?.startsWith('/dashboard/v2');

  const handleLinkClick = () => { if (onClose) onClose(); };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

    <aside
      className="fixed left-0 bottom-0 border-r z-40 transition-transform duration-300 flex flex-col"
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        top: 'var(--topbar-height)',
        // On mobile: slide in/out. On desktop: always visible.
        transform: mobileOpen ? 'translateX(0)' : undefined,
      }}
      // Hide on mobile unless open
      data-mobile-open={mobileOpen}
    >
      <style>{`
        @media (max-width: 767px) {
          aside[data-mobile-open="false"] { transform: translateX(-100%); }
          aside[data-mobile-open="true"]  { transform: translateX(0); }
        }
      `}</style>
      <nav className="p-6 space-y-1 flex-1 overflow-y-auto">
        {/* Tavari AI Dashboard Button */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            onClick={handleLinkClick}
            className={`flex items-center px-3 py-2 text-sm font-medium transition-colors`}
            style={{
              borderRadius: 'var(--button-radius)',
              ...(isDashboardActive
                ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                : { color: 'var(--color-text-main)' }),
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
              // Special handling for certain modules that have their own dashboard paths
              const href = module.key === 'phone-agent' 
                ? '/dashboard' 
                : module.key === 'reviews'
                ? '/review-reply-ai/dashboard'
                : `/dashboard/v2/modules/${module.key}/dashboard`;
              
              // For phone-agent, check if we're on the Phone Agent dashboard
              const isActive = module.key === 'phone-agent' 
                ? pathname === '/dashboard' || pathname?.startsWith('/dashboard/') && !pathname?.startsWith('/dashboard/v2')
                : pathname?.startsWith(`/dashboard/v2/modules/${module.key}`);
              
              return (
                <Link
                  key={module.key}
                  href={href}
                  onClick={handleLinkClick}
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
                onClick={handleLinkClick}
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
      <div
        className="px-4 py-3 text-xs border-t"
        style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
      >
        Deployed March 12 2026 V1
      </div>
    </aside>
    </>
  );
}
