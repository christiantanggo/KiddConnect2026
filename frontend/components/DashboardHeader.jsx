'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import { agentsAPI, authAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

export default function DashboardHeader() {
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
    <nav className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">Tavari Dashboard</h1>
        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
            Dashboard
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/dashboard/faqs" className="text-gray-700 hover:text-blue-600">
            FAQ's
          </Link>
          {takeoutOrdersEnabled && (
            <>
              <span className="text-gray-300">|</span>
              <Link href="/dashboard/menu" className="text-gray-700 hover:text-blue-600">
                Menu
              </Link>
            </>
          )}
          <span className="text-gray-300">|</span>
          <Link href="/dashboard/sms" className="text-gray-700 hover:text-blue-600">
            SMS
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/dashboard/settings" className="text-gray-700 hover:text-blue-600">
            Settings
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/dashboard/billing" className="text-gray-700 hover:text-blue-600">
            Billing
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/dashboard/support" className="text-gray-700 hover:text-blue-600">
            Support
          </Link>
          <span className="text-gray-300">|</span>
          <button onClick={logout} className="text-gray-700 hover:text-blue-600">
            Logout
          </button>
          <button
            onClick={handleRebuildAgent}
            disabled={rebuilding}
            className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:bg-yellow-300 disabled:cursor-not-allowed font-medium"
            title="Rebuild AI agent with latest settings"
          >
            {rebuilding ? 'Rebuilding...' : '🔄 Rebuild Agent'}
          </button>
        </div>
      </div>
    </nav>
  );
}

