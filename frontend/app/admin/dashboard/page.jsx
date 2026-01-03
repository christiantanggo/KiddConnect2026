'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [demoUsers, setDemoUsers] = useState([]);
  const [demoUsersLoading, setDemoUsersLoading] = useState(false);
  const [showMarketingConsentOnly, setShowMarketingConsentOnly] = useState(false);

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

  const handleOpenDemoModal = async () => {
    setShowDemoModal(true);
    setDemoUsersLoading(true);
    
    try {
      const token = getAdminToken();
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');
      const url = showMarketingConsentOnly 
        ? `${API_URL}/api/admin/demo-users?marketing_consent=true`
        : `${API_URL}/api/admin/demo-users`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setDemoUsers(data.demos || []);
    } catch (error) {
      console.error('Failed to load demo users:', error);
      setDemoUsers([]);
    } finally {
      setDemoUsersLoading(false);
    }
  };

  const handleCloseDemoModal = () => {
    setShowDemoModal(false);
    setDemoUsers([]);
    setShowMarketingConsentOnly(false);
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
              <button
                onClick={handleOpenDemoModal}
                className="text-center p-4 bg-blue-50 rounded hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <p className="text-2xl font-bold text-blue-600">{stats?.demo_usage?.total_demos || 0}</p>
                <p className="text-sm text-gray-600">Total Demos</p>
                <p className="text-xs text-gray-500 mt-1">{stats?.demo_usage?.total_minutes?.toFixed(2) || '0.00'} minutes</p>
                <p className="text-xs text-blue-600 mt-2 font-medium">Click to view users</p>
              </button>
              <button
                onClick={handleOpenDemoModal}
                className="text-center p-4 bg-green-50 rounded hover:bg-green-100 transition-colors cursor-pointer"
              >
                <p className="text-2xl font-bold text-green-600">{stats?.demo_usage?.total_demos_today || 0}</p>
                <p className="text-sm text-gray-600">Demos Today</p>
                <p className="text-xs text-gray-500 mt-1">{stats?.demo_usage?.total_minutes_today?.toFixed(2) || '0.00'} minutes</p>
                <p className="text-xs text-green-600 mt-2 font-medium">Click to view users</p>
              </button>
              <button
                onClick={handleOpenDemoModal}
                className="text-center p-4 bg-purple-50 rounded hover:bg-purple-100 transition-colors cursor-pointer"
              >
                <p className="text-2xl font-bold text-purple-600">{stats?.demo_usage?.total_demos_this_month || 0}</p>
                <p className="text-sm text-gray-600">This Month</p>
                <p className="text-xs text-gray-500 mt-1">{stats?.demo_usage?.total_minutes_this_month?.toFixed(2) || '0.00'} minutes</p>
                <p className="text-xs text-purple-600 mt-2 font-medium">Click to view users</p>
              </button>
            </div>
            {stats?.demo_usage?.users_with_marketing_consent !== undefined && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowMarketingConsentOnly(true);
                    handleOpenDemoModal();
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View {stats.demo_usage.users_with_marketing_consent} users with marketing consent →
                </button>
              </div>
            )}
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

        {/* Demo Users Modal */}
        {showDemoModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseDemoModal}>
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  Demo Users
                  {showMarketingConsentOnly && <span className="text-blue-600 text-lg ml-2">(Marketing Consent Only)</span>}
                </h2>
                <button
                  onClick={handleCloseDemoModal}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {demoUsersLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading demo users...</p>
                  </div>
                ) : demoUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No demo users found.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mb-4 flex justify-between items-center">
                      <p className="text-sm text-gray-600">
                        Showing {demoUsers.length} unique {showMarketingConsentOnly ? 'users with marketing consent' : 'users'}
                      </p>
                      {!showMarketingConsentOnly && (
                        <button
                          onClick={() => {
                            setShowMarketingConsentOnly(true);
                            handleOpenDemoModal();
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Filter: Marketing Consent Only →
                        </button>
                      )}
                      {showMarketingConsentOnly && (
                        <button
                          onClick={() => {
                            setShowMarketingConsentOnly(false);
                            handleOpenDemoModal();
                          }}
                          className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                        >
                          Show All Users →
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Demo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Demos</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Minutes</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marketing Consent</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {demoUsers.map((user, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <a href={`mailto:${user.email}`} className="text-blue-600 hover:text-blue-800">
                                  {user.email}
                                </a>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.business_name || '—'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {user.last_demo_date ? new Date(user.last_demo_date).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.total_demos || 0}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.total_minutes?.toFixed(2) || '0.00'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {user.marketing_consent ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    No
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={handleCloseDemoModal}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
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

