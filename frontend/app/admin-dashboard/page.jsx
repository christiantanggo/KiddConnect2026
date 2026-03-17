'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadModules();
  }, []);

  const getAdminToken = () => {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  };

  const loadStats = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        setStats({
          total_accounts: 0,
          active_accounts: 0,
          inactive_accounts: 0,
          by_tier: { starter: 0, core: 0, pro: 0 },
        });
      }
    } catch (error) {
      setStats({
        total_accounts: 0,
        active_accounts: 0,
        inactive_accounts: 0,
        by_tier: { starter: 0, core: 0, pro: 0 },
      });
    } finally {
      setLoading(false);
    }
  };

  const loadModules = async () => {
    try {
      const token = getAdminToken();
      // Try to get modules from API, fallback to hardcoded list
      try {
        const response = await fetch(`${API_URL}/api/admin/modules`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setModules(data.modules || []);
          return;
        }
      } catch (e) {
        console.log('[Admin Dashboard] Modules API not available, using fallback');
      }
      // Fallback to hardcoded modules if endpoint doesn't exist
      setModules([
        { key: 'phone-agent', name: 'Tavari AI Phone Agent', description: 'AI phone answering and call management', is_active: true },
        { key: 'reviews', name: 'Tavari AI Review Reply', description: 'AI-powered review response generation', is_active: true },
      ]);
    } catch (error) {
      console.error('Failed to load modules:', error);
      // Fallback on error
      setModules([
        { key: 'phone-agent', name: 'Tavari AI Phone Agent', description: 'AI phone answering and call management', is_active: true },
        { key: 'reviews', name: 'Tavari AI Review Reply', description: 'AI-powered review response generation', is_active: true },
      ]);
    }
  };

  const getModuleConfig = (moduleKey) => {
    const configs = {
      'phone-agent': { icon: '📞', color: 'blue' },
      'reviews': { icon: '⭐', color: 'yellow' },
    };
    return configs[moduleKey] || { icon: '📦', color: 'gray' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8">
          {/* General Stats - Keep these */}
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

          {/* Plan Distribution - Keep this */}
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

          {/* NEW: Module Cards Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Module Administration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modules.map((module) => {
                const config = getModuleConfig(module.key);
                return (
                  <Link
                    key={module.key}
                    href={
                      module.key === 'phone-agent' ? '/tavari-ai-phone/admin-dashboard'
                      : module.key === 'reviews' ? '/review-reply-ai/admin-dashboard'
                      : module.key === 'delivery-dispatch' ? '/admin/delivery-operator'
                      : module.key === 'emergency-dispatch' ? '/dashboard/v2/modules/emergency-dispatch'
                      : module.key === 'orbix-network' ? '/dashboard/v2/modules/orbix-network'
                      : `/${module.key}/admin-dashboard`
                    }
                    className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">{config.icon}</span>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{module.name || module.key}</h3>
                          <p className="text-sm text-gray-500">{module.key}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">{module.description || 'Module administration'}</p>
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        module.is_active !== false
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {module.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-blue-600 font-medium">Manage →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Quick Actions - Keep these */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Quick Actions</h2>
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
            </div>
          </div>
        </main>
    </div>
  );
}

export default AdminDashboardPage;

