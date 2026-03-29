'use client';

import { useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

function TestVAPIPage() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const runTest = async () => {
    setTesting(true);
    setError('');
    setResults(null);

    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/test-vapi`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setResults(data);
      } else {
        setError(data.error || 'Test failed');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setTesting(false);
    }
  };

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Test VAPI Connection</h1>
            <Link href="/admin-dashboard" className="text-gray-700 hover:text-blue-600">
              Dashboard
            </Link>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">VAPI Connection Test</h2>
            <p className="text-gray-600 mb-6">
              This test will verify that VAPI is properly configured and working:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
              <li>Test API key authentication</li>
              <li>Create a test assistant</li>
              <li>Attempt to provision a phone number</li>
              <li>Clean up test resources</li>
            </ul>

            <button
              onClick={runTest}
              disabled={testing}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {testing ? 'Running Test...' : 'Run VAPI Test'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="text-red-800 font-semibold mb-2">Test Failed</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {results && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Test Results</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Assistant Creation</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    results.tests.assistant_creation
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {results.tests.assistant_creation ? '✅ Passed' : '❌ Failed'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Phone Number Provisioning</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    results.tests.phone_provisioning
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {results.tests.phone_provisioning ? '✅ Passed' : '⚠️ Skipped (may not have available numbers)'}
                  </span>
                </div>

                {results.details && (
                  <div className="mt-6 p-4 bg-blue-50 rounded">
                    <h4 className="font-semibold text-gray-900 mb-2">Test Details</h4>
                    <div className="space-y-2 text-sm">
                      {results.details.test_assistant_id && (
                        <div>
                          <span className="font-medium">Test Assistant ID:</span>{' '}
                          <code className="bg-gray-100 px-2 py-1 rounded">{results.details.test_assistant_id}</code>
                        </div>
                      )}
                      {results.details.test_phone_number && (
                        <div>
                          <span className="font-medium">Test Phone Number:</span>{' '}
                          <code className="bg-gray-100 px-2 py-1 rounded">{results.details.test_phone_number}</code>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className={`mt-6 p-4 rounded ${
                  results.tests.assistant_creation
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <p className={`font-semibold ${
                    results.tests.assistant_creation ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {results.tests.assistant_creation
                      ? '✅ VAPI is connected and working!'
                      : '❌ VAPI connection test failed. Please check your configuration.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AdminGuard>
  );

  function getAdminToken() {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
}

export default TestVAPIPage;

