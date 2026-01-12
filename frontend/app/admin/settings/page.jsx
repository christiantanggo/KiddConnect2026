'use client';

import { useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('activity');

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Settings</h1>
            <div className="flex gap-4 items-center">
              <Link href="/admin-dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/pricing" className="text-gray-700 hover:text-blue-600">
                Pricing
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/settings" className="text-blue-600 font-medium">
                Settings
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/website-analytics" className="text-gray-700 hover:text-blue-600">
                Website Analytics
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                Support Tickets
              </Link>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => {
                  document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                  window.location.href = '/admin/login';
                }}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Activity
                </button>
                <button
                  onClick={() => setActiveTab('phone-numbers')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'phone-numbers'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Phone Numbers
                </button>
                <button
                  onClick={() => setActiveTab('test-wizard')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'test-wizard'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Test Wizard
                </button>
              </nav>
            </div>
          </div>

          {/* Tab Content - Use iframes to embed the pages */}
          <div className="bg-white rounded-lg shadow" style={{ minHeight: '600px' }}>
            {activeTab === 'activity' && (
              <iframe
                src="/admin/activity"
                className="w-full border-0"
                style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                title="Activity"
              />
            )}
            {activeTab === 'phone-numbers' && (
              <iframe
                src="/admin/phone-numbers"
                className="w-full border-0"
                style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                title="Phone Numbers"
              />
            )}
            {activeTab === 'test-wizard' && (
              <iframe
                src="/admin/test-wizard"
                className="w-full border-0"
                style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                title="Test Wizard"
              />
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default SettingsPage;

