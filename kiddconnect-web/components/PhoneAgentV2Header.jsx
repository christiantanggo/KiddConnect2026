'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import { agentsAPI, authAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

export default function PhoneAgentV2Header() {
  const pathname = usePathname();
  const [rebuilding, setRebuilding] = useState(false);
  const [takeoutOrdersEnabled, setTakeoutOrdersEnabled] = useState(false);
  const { success, error: showError } = useToast();

  useEffect(() => {
    // Fetch business data to check if takeout orders is enabled
    const fetchBusinessData = async () => {
      try {
        const headers = {
          'Authorization': `Bearer ${document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]}`,
          'Content-Type': 'application/json',
        };
        const response = await fetch(`${API_URL}/api/auth/me`, { headers });
        if (response.ok) {
          const data = await response.json();
          if (data?.business?.takeout_orders_enabled) {
            setTakeoutOrdersEnabled(true);
          } else {
            setTakeoutOrdersEnabled(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch business data:', error);
      }
    };
    
    fetchBusinessData();
  }, []);

  const handleRebuildAgent = async () => {
    if (!confirm('This will rebuild your AI agent with the latest settings. Continue?')) {
      return;
    }

    setRebuilding(true);
    try {
      const headers = {
        'Authorization': `Bearer ${document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]}`,
        'Content-Type': 'application/json',
      };
      const response = await fetch(`${API_URL}/api/agents/rebuild`, {
        method: 'POST',
        headers,
      });
      const data = await response.json();
      
      if (data?.success) {
        success('AI agent rebuilt successfully! The agent now has the latest information.');
      } else {
        showError('Failed to rebuild agent. Please try again.');
      }
    } catch (error) {
      console.error('Rebuild agent error:', error);
      showError('Failed to rebuild agent. Please try again.');
    } finally {
      setRebuilding(false);
    }
  };

  const isActive = (path) => {
    return pathname?.includes(path);
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
      <div className="max-w-full" style={{ paddingLeft: 'calc(var(--sidebar-width) + var(--padding-base))', paddingRight: 'var(--padding-base)' }}>
        <div className="flex justify-between items-center" style={{ height: 'var(--topbar-height)' }}>
          {/* Logo/Brand */}
          <Link href="/modules/phone-agent-v2/dashboard" className="flex items-center">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-primary)' }}>
              Tavari Phone Agent V2
            </h1>
          </Link>

          {/* Right Section - Navigation */}
          <div className="flex items-center space-x-4">
            <Link 
              href="/modules/phone-agent-v2/dashboard" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(pathname === '/modules/phone-agent-v2/dashboard' 
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (pathname !== '/modules/phone-agent-v2/dashboard') {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/modules/phone-agent-v2/dashboard') {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              Dashboard
            </Link>

            <Link 
              href="/modules/phone-agent-v2/dashboard/faqs" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(isActive('/faqs')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!isActive('/faqs')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/faqs')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              FAQ's
            </Link>

            {takeoutOrdersEnabled && (
              <Link 
                href="/modules/phone-agent-v2/dashboard/menu" 
                className={`px-3 py-2 text-sm font-medium transition-colors`}
                style={{
                  borderRadius: 'var(--button-radius)',
                  ...(isActive('/menu')
                    ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                    : { color: 'var(--color-text-main)' }),
                }}
                onMouseEnter={(e) => {
                  if (!isActive('/menu')) {
                    e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive('/menu')) {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                Menu
              </Link>
            )}

            <Link 
              href="/modules/phone-agent-v2/dashboard/sms" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(isActive('/sms')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!isActive('/sms')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/sms')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              SMS
            </Link>

            <Link 
              href="/modules/phone-agent-v2/dashboard/settings" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(isActive('/settings')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!isActive('/settings')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/settings')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              Settings
            </Link>

            <Link 
              href="/modules/phone-agent-v2/dashboard/billing" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(isActive('/billing')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!isActive('/billing')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/billing')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              Billing
            </Link>

            <Link 
              href="/dashboard/v2/support" 
              className={`px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                borderRadius: 'var(--button-radius)',
                ...(isActive('/support')
                  ? { backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }
                  : { color: 'var(--color-text-main)' }),
              }}
              onMouseEnter={(e) => {
                if (!isActive('/support')) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/support')) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              Support
            </Link>

            <span style={{ color: 'var(--color-border)' }}>|</span>

            <button
              onClick={handleRebuildAgent}
              disabled={rebuilding}
              className={`px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{
                borderRadius: 'var(--button-radius)',
                color: rebuilding ? 'var(--color-text-muted)' : 'var(--color-warning, #f59e0b)',
              }}
              onMouseEnter={(e) => {
                if (!rebuilding) {
                  e.target.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              {rebuilding ? 'Rebuilding...' : '🔄 Rebuild Agent'}
            </button>

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

