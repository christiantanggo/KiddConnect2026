'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { Bell, Menu, X, Settings, HelpCircle, LogOut } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

export default function V2DashboardHeader({ onMobileMenuToggle, mobileMenuOpen }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const isLoadingRef = useRef(false);
  const rateLimitedRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    loadUnreadCount();
    intervalRef.current = setInterval(() => {
      if (!rateLimitedRef.current && !isLoadingRef.current) {
        loadUnreadCount();
      }
    }, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setDropdownOpen(false); }, [pathname]);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const loadUnreadCount = async () => {
    if (isLoadingRef.current || rateLimitedRef.current) return;
    isLoadingRef.current = true;
    try {
      const res = await fetch(`${API_URL}/api/v2/notifications/unread-count`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
        rateLimitedRef.current = false;
      } else if (res.status === 429) {
        rateLimitedRef.current = true;
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setTimeout(() => {
          rateLimitedRef.current = false;
          if (!intervalRef.current) {
            intervalRef.current = setInterval(() => {
              if (!rateLimitedRef.current && !isLoadingRef.current) loadUnreadCount();
            }, 30000);
          }
        }, 60000);
      }
    } catch (err) {
      // Network errors (e.g. Failed to fetch when API is down or CORS) are common; avoid noisy logs
      if (process.env.NODE_ENV === 'development' && err?.name !== 'TypeError') {
        console.warn('[V2DashboardHeader] Unread count:', err?.message || err);
      }
    } finally {
      isLoadingRef.current = false;
    }
  };

  const navLinkStyle = (active) => ({
    borderRadius: 'var(--button-radius)',
    ...(active
      ? { backgroundColor: 'rgba(20,184,166,0.1)', color: 'var(--color-accent)' }
      : { color: 'var(--color-text-main)' }),
  });

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', height: 'var(--topbar-height)' }}
    >
      <div className="max-w-full h-full flex items-center justify-between" style={{ paddingLeft: 'var(--padding-base)', paddingRight: 'var(--padding-base)' }}>

        {/* Left: hamburger (mobile) + brand */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger — toggles sidebar */}
          <button
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg"
            style={{ color: 'var(--color-text-main)' }}
            onClick={onMobileMenuToggle}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/dashboard/v2" className="flex items-center">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-primary)' }}>{APP_DISPLAY_NAME}</h1>
          </Link>
        </div>

        {/* Right: desktop nav links + mobile dropdown trigger */}
        <div className="flex items-center gap-1">

          {/* Desktop nav — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1">
            <Link href="/dashboard/v2/settings" className="px-3 py-2 text-sm font-medium transition-colors" style={navLinkStyle(pathname?.startsWith('/dashboard/v2/settings'))}>
              Settings
            </Link>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <Link href="/dashboard/v2/support" className="px-3 py-2 text-sm font-medium transition-colors" style={navLinkStyle(pathname?.includes('/support'))}>
              Support
            </Link>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <Link href="/dashboard/v2/notifications" className="relative px-3 py-2 text-sm font-medium transition-colors flex items-center" style={navLinkStyle(pathname?.includes('/notifications'))}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center" style={{ minWidth: 18, height: 18, padding: '0 4px', fontSize: 10, fontWeight: 'bold' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <button onClick={logout} className="px-3 py-2 text-sm transition-colors" style={{ color: 'var(--color-text-main)', borderRadius: 'var(--button-radius)' }}>
              Logout
            </button>
          </div>

          {/* Mobile: bell icon + hamburger dropdown */}
          <div className="flex md:hidden items-center gap-1">
            <Link href="/dashboard/v2/notifications" className="relative p-2 flex items-center justify-center" style={{ color: 'var(--color-text-main)' }}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full flex items-center justify-center" style={{ minWidth: 16, height: 16, padding: '0 3px', fontSize: 9, fontWeight: 'bold' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>

            {/* Mobile dropdown menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ color: 'var(--color-text-main)' }}
                aria-label="More options"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 rounded-xl shadow-lg border overflow-hidden"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', top: '100%', zIndex: 100 }}
                >
                  <Link
                    href="/dashboard/v2/settings"
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium"
                    style={{ color: 'var(--color-text-main)' }}
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Settings className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                    Settings
                  </Link>
                  <Link
                    href="/dashboard/v2/support"
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium"
                    style={{ color: 'var(--color-text-main)', borderTop: '1px solid var(--color-border)' }}
                    onClick={() => setDropdownOpen(false)}
                  >
                    <HelpCircle className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                    Support
                  </Link>
                  <button
                    onClick={() => { setDropdownOpen(false); logout(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium"
                    style={{ color: '#ef4444', borderTop: '1px solid var(--color-border)' }}
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
