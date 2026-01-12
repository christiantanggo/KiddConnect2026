'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import { Bell } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function V2DashboardHeader() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
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

  const loadUnreadCount = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/notifications/unread-count`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch (err) {
      // Silently fail - notifications are not critical
      console.error('[V2DashboardHeader] Error loading unread count:', err);
    }
  };

  return (
    <nav 
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        height: 'var(--topbar-height)',
      }}
    >
      <div className="max-w-full" style={{ paddingLeft: 'var(--padding-base)', paddingRight: 'var(--padding-base)' }}>
        <div className="flex justify-between items-center" style={{ height: 'var(--topbar-height)' }}>
          {/* Logo/Brand */}
          <Link href="/dashboard/v2" className="flex items-center">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-primary)' }}>
              Tavari AI
            </h1>
          </Link>

          {/* Middle Section - Empty for now */}
          <div className="flex items-center space-x-4">
          </div>

          {/* Right Section - Navigation */}
          <div className="flex items-center space-x-4">
            <Link 
              href="/dashboard/v2/settings" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(pathname?.startsWith('/dashboard/v2/settings') 
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!pathname?.startsWith('/dashboard/v2/settings')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!pathname?.startsWith('/dashboard/v2/settings')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              Settings
            </Link>

            <span style={{ color: 'var(--color-border)' }}>|</span>

            <Link 
              href="/dashboard/v2/support" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(pathname?.includes('/support')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!pathname?.includes('/support')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!pathname?.includes('/support')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              Support
            </Link>

            <span style={{ color: 'var(--color-border)' }}>|</span>

            <Link 
              href="/dashboard/v2/notifications" 
              className={`px-3 py-2 text-sm font-medium transition-colors relative flex items-center`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(pathname?.includes('/notifications')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!pathname?.includes('/notifications')) {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!pathname?.includes('/notifications')) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center"
                  style={{
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>

            <span style={{ color: 'var(--color-border)' }}>|</span>
            
            <button 
              onClick={logout} 
              className="px-3 py-2 text-sm transition-colors"
              style={{
                color: 'var(--color-text-main)',
                borderRadius: 'var(--button-radius)',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                e.target.style.color = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = 'var(--color-text-main)';
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
