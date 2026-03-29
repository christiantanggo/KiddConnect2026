'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { agentsAPI, authAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { HelpCircle, UtensilsCrossed, MessageSquare, RefreshCw, Settings } from 'lucide-react';

export default function PhoneAgentV2ActionCards() {
  const router = useRouter();
  const [rebuilding, setRebuilding] = useState(false);
  const [takeoutOrdersEnabled, setTakeoutOrdersEnabled] = useState(false);
  const { success, error: showError } = useToast();

  useEffect(() => {
    // Fetch business data to check if takeout orders is enabled
    const fetchBusinessData = async () => {
      try {
        const response = await authAPI.getMe();
        if (response.data?.business?.takeout_orders_enabled) {
          setTakeoutOrdersEnabled(true);
        } else {
          setTakeoutOrdersEnabled(false);
        }
      } catch (error) {
        console.error('Failed to fetch business data:', error);
      }
    };
    
    fetchBusinessData();
    
    // Reload when page becomes visible (user navigates back from settings)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchBusinessData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleRebuildAgent = async () => {
    if (!confirm('This will rebuild your AI agent with the latest settings. Continue?')) {
      return;
    }

    setRebuilding(true);
    try {
      const response = await agentsAPI.rebuild();
      if (response.data?.success) {
        success('AI agent rebuilt successfully! The agent now has the latest information.');
      } else {
        showError('Failed to rebuild agent. Please try again.');
      }
    } catch (error) {
      console.error('Rebuild agent error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to rebuild agent';
      showError(`Failed to rebuild agent: ${errorMessage}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
      {/* FAQs */}
      <Link
        href="/tavari-ai-phone/dashboard/faqs"
        className="shadow p-4 text-center transition-all hover:shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.borderColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'var(--color-border)';
        }}
      >
        <div className="mb-2 flex justify-center">
          <HelpCircle className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>FAQ's</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage questions</p>
      </Link>

      {/* Menu */}
      {takeoutOrdersEnabled && (
        <Link
          href="/tavari-ai-phone/dashboard/menu"
          className="shadow p-4 text-center transition-all hover:shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--card-radius)',
            border: '1px solid var(--color-border)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'var(--color-border)';
          }}
        >
          <div className="mb-2 flex justify-center">
            <UtensilsCrossed className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>Menu</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Manage items</p>
        </Link>
      )}

      {/* SMS */}
      <Link
        href="/tavari-ai-phone/dashboard/sms"
        className="shadow p-4 text-center transition-all hover:shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.borderColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'var(--color-border)';
          }}
        >
        <div className="mb-2 flex justify-center">
          <MessageSquare className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>SMS</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Send messages</p>
      </Link>

      {/* Settings */}
      <Link
        href="/tavari-ai-phone/dashboard/settings"
        className="shadow p-4 text-center transition-all hover:shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.borderColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'var(--color-border)';
        }}
      >
        <div className="mb-2 flex justify-center">
          <Settings className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>Settings</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Configure module</p>
      </Link>

      {/* Rebuild Agent */}
      <button
        onClick={handleRebuildAgent}
        disabled={rebuilding}
        className="shadow p-4 text-center transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => {
          if (!rebuilding) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = 'var(--color-warning, #f59e0b)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'var(--color-border)';
          }}
        >
        <div className="mb-2 flex justify-center">
          <RefreshCw className={`w-8 h-8 ${rebuilding ? 'animate-spin' : ''}`} style={{ color: 'var(--color-warning, #f59e0b)' }} />
        </div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>
          {rebuilding ? 'Rebuilding...' : 'Rebuild Agent'}
        </h3>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Update agent</p>
      </button>
    </div>
  );
}

