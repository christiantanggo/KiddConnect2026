'use client';

import { useState } from 'react';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('activity');

  return (
    <div className="min-h-screen bg-gray-50">
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
  );
}

export default SettingsPage;

