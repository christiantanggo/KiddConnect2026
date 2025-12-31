'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = getAdminToken();
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, ''); // Remove trailing slash
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      setStats({
        total_accounts: 0,
        active_accounts: 0,
        inactive_accounts: 0,
        by_tier: { starter: 0, core: 0, pro: 0 },
        demo_usage: {
          total_demos: 0,
          total_minutes: 0,
          total_demos_today: 0,
          total_minutes_today: 0,
          total_demos_this_month: 0,
          total_minutes_this_month: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRebuildAllAssistants = async () => {
    if (!confirm('Are you sure you want to rebuild all AI assistants? This may take several minutes.')) {
      return;
    }

    setRebuilding(true);
    setRebuildResult(null);

    try {
      const token = getAdminToken();
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, ''); // Remove trailing slash
      const response = await fetch(`${API_URL}/api/admin/rebuild-all-assistants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setRebuildResult({
        success: true,
        message: data.message,
        total: data.total,
        successful: data.successful,
        failed: data.failed,
      });
    } catch (error) {
      setRebuildResult({
        success: false,
        error: error.message || 'Failed to rebuild assistants',
      });
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Admin Dashboard</h1>
            <div className="flex gap-4">
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <Link href="/admin/packages" className="text-gray-700 hover:text-blue-600">
                Packages
              </Link>
              <Link href="/admin/invoice-settings" className="text-gray-700 hover:text-blue-600">
                Invoice Settings
              </Link>
              <Link href="/admin/activity" className="text-gray-700 hover:text-blue-600">
                Activity
              </Link>
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                Support Tickets
              </Link>
              <Link href="/admin/phone-numbers" className="text-gray-700 hover:text-blue-600">
                Phone Numbers
              </Link>
              <Link href="/admin/test-wizard" className="text-gray-700 hover:text-blue-600">
                Test Wizard
              </Link>
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Accounts</h3>
              <p className="text-3xl font-bold text-gray-900">{stats?.total_accounts || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Active Accounts</h3>
              <p className="text-3xl font-bold text-green-600">{stats?.active_accounts || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Inactive Accounts</h3>
              <p className="text-3xl font-bold text-gray-600">{stats?.inactive_accounts || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Pro Plans</h3>
              <p className="text-3xl font-bold text-blue-600">{stats?.by_tier?.pro || 0}</p>
            </div>
          </div>

          {/* Demo Usage Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Demo Usage (VAPI Costs)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded">
                <p className="text-2xl font-bold text-blue-600">{stats?.demo_usage?.total_demos || 0}</p>
                <p className="text-sm text-gray-600">Total Demos</p>
                <p className="text-xs text-gray-500 mt-1">{stats?.demo_usage?.total_minutes?.toFixed(2) || '0.00'} minutes</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded">
                <p className="text-2xl font-bold text-green-600">{stats?.demo_usage?.total_demos_today || 0}</p>
                <p className="text-sm text-gray-600">Demos Today</p>
                <p className="text-xs text-gray-500 mt-1">{stats?.demo_usage?.total_minutes_today?.toFixed(2) || '0.00'} minutes</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded">
                <p className="text-2xl font-bold text-purple-600">{stats?.demo_usage?.total_demos_this_month || 0}</p>
                <p className="text-sm text-gray-600">This Month</p>
                <p className="text-xs text-gray-500 mt-1">{stats?.demo_usage?.total_minutes_this_month?.toFixed(2) || '0.00'} minutes</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Plan Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.by_tier?.starter || 0}</p>
                <p className="text-sm text-gray-600">Starter</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.by_tier?.core || 0}</p>
                <p className="text-sm text-gray-600">Core</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.by_tier?.pro || 0}</p>
                <p className="text-sm text-gray-600">Pro</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">AI Assistant Management</h2>
            <p className="text-sm text-gray-600 mb-4">
              Rebuild all AI assistants to apply global changes (e.g., interruption settings, prompt updates).
            </p>
            <button
              onClick={handleRebuildAllAssistants}
              disabled={rebuilding}
              className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebuilding ? 'Rebuilding...' : 'Rebuild All AI Agents'}
            </button>
            {rebuildResult && (
              <div className={`mt-4 p-4 rounded-md ${rebuildResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <p className={`font-medium ${rebuildResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {rebuildResult.success ? '✓ Success' : '✗ Error'}
                </p>
                <p className={`text-sm mt-2 ${rebuildResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {rebuildResult.message || rebuildResult.error}
                </p>
                {rebuildResult.success && (
                  <p className="text-sm text-green-700 mt-2">
                    {rebuildResult.successful} successful, {rebuildResult.failed} failed out of {rebuildResult.total} total
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-4 flex-wrap">
            <Link
              href="/admin/accounts"
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Manage Accounts
            </Link>
            <Link
              href="/admin/packages"
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium"
            >
              Manage Packages
            </Link>
            <Link
              href="/admin/activity"
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
            >
              View Activity Logs
            </Link>
            <Link
              href="/admin/support"
              className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-medium"
            >
              Support Tickets
            </Link>
            <Link
              href="/admin/test-vapi"
              className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              Test VAPI Connection
            </Link>
            <Link
              href="/admin/phone-numbers"
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
            >
              Manage SMS Phone Numbers
            </Link>
          </div>
        </main>
      </div>
    </AdminGuard>
  );

  function handleLogout() {
    document.cookie = 'admin_token=; path=/; max-age=0';
    window.location.href = '/admin/login';
  }

  function getAdminToken() {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
}

export default AdminDashboardPage;

