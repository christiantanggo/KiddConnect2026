'use client';

import { useState } from 'react';

function PricingPage() {
  const [activeTab, setActiveTab] = useState('packages');

  return (
    <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('packages')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'packages'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Packages
                </button>
                <button
                  onClick={() => setActiveTab('invoice-settings')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'invoice-settings'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Invoice Settings
                </button>
              </nav>
            </div>
          </div>

          {/* Tab Content - Use iframes to embed the pages */}
          <div className="bg-white rounded-lg shadow" style={{ minHeight: '600px' }}>
            {activeTab === 'packages' && (
              <iframe
                src="/admin/packages"
                className="w-full border-0"
                style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                title="Packages"
              />
            )}
            {activeTab === 'invoice-settings' && (
              <iframe
                src="/admin/invoice-settings"
                className="w-full border-0"
                style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                title="Invoice Settings"
              />
            )}
          </div>
        </main>
    </div>
  );
}

export default PricingPage;
