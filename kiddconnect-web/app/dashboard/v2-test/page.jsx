'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';

export default function V2TestPage() {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [results, setResults] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get token from cookies (same way api.js does it)
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
      const token = tokenCookie ? tokenCookie.split('=')[1] : null;
      
      setToken(token);
      
      // Try to get business ID from user data or localStorage
      const storedBusinessId = localStorage.getItem('businessId');
      setBusinessId(storedBusinessId);
    }
    setLoading(false);
  }, []);

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    try {
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      
      if (businessId) {
        headers['X-Active-Business-Id'] = businessId;
      }

      const options = {
        method,
        headers,
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      // Use same API URL logic as api.js
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');
      const response = await fetch(`${API_URL}${endpoint}`, options);
      
      // Check if response is HTML (error page) instead of JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        return {
          status: response.status,
          ok: false,
          error: `Server returned ${contentType || 'unknown content type'} instead of JSON. This usually means the route doesn't exist or there's a server error.`,
          rawResponse: text.substring(0, 500), // First 500 chars of HTML
        };
      }
      
      const data = await response.json();
      
      return {
        status: response.status,
        ok: response.ok,
        data,
      };
    } catch (err) {
      return {
        status: 0,
        ok: false,
        error: err.message,
      };
    }
  };

  const testEndpoint = async (name, endpoint, method = 'GET', body = null) => {
    setError(null);
    setResults(prev => ({ ...prev, [name]: { loading: true } }));
    
    const result = await apiCall(endpoint, method, body);
    
    setResults(prev => ({
      ...prev,
      [name]: {
        loading: false,
        ...result,
        timestamp: new Date().toLocaleTimeString(),
      },
    }));
  };

  const testAll = async () => {
    setError(null);
    setResults({});
    
    // Test in sequence
    await testEndpoint('Organizations', '/api/v2/organizations');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testEndpoint('Current Organization', '/api/v2/organizations/current');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testEndpoint('Modules', '/api/v2/modules');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testEndpoint('Marketplace', '/api/v2/marketplace');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testEndpoint('Module Settings', '/api/v2/settings/modules');
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <DashboardHeader />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg">Loading...</div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Tavari AI v2 API Test Page
            </h1>
            <p className="text-gray-600 mb-4">
              Test the new v2 API endpoints. This page is safe to use - it doesn't modify any existing data.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Token:</strong> {token ? '✅ Found' : '❌ Not found - Please login first'}
              </p>
              <p className="text-sm text-blue-800">
                <strong>Business ID:</strong> {businessId || 'Not set'}
              </p>
              <p className="text-sm text-blue-800">
                <strong>API Base:</strong> {(process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '')}
              </p>
              <p className="text-xs text-blue-600 mt-2">
                ⚠️ Local API URL defaults from repo <code className="text-xs">config/dev-ports.json</code> (see <code className="text-xs">PORTS.md</code>). Override with <code className="text-xs">NEXT_PUBLIC_API_URL</code> in <code className="text-xs">.env.local</code> if needed.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-4 mb-6 flex-wrap">
              <button
                onClick={testAll}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Test All Endpoints
              </button>
              
              <button
                onClick={() => testEndpoint('Organizations', '/api/v2/organizations')}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Test Organizations
              </button>
              
              <button
                onClick={() => testEndpoint('Modules', '/api/v2/modules')}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Test Modules
              </button>
              
              <button
                onClick={() => testEndpoint('Marketplace', '/api/v2/marketplace')}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Test Marketplace
              </button>
              
              <button
                onClick={() => testEndpoint('V2 Health Check', '/api/v2/health')}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Test V2 Health
              </button>
            </div>

            <div className="space-y-4">
              {Object.entries(results).map(([name, result]) => (
                <div
                  key={name}
                  className={`border rounded p-4 ${
                    result.loading
                      ? 'border-gray-300 bg-gray-50'
                      : result.ok
                      ? 'border-green-300 bg-green-50'
                      : 'border-red-300 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">{name}</h3>
                    <div className="flex items-center gap-2">
                      {result.loading && (
                        <span className="text-sm text-gray-600">Loading...</span>
                      )}
                      {!result.loading && result.ok && (
                        <span className="text-sm text-green-600">✅ Success</span>
                      )}
                      {!result.loading && !result.ok && (
                        <span className="text-sm text-red-600">❌ Failed</span>
                      )}
                      {result.timestamp && (
                        <span className="text-xs text-gray-500">{result.timestamp}</span>
                      )}
                    </div>
                  </div>
                  
                  {result.status && (
                    <p className="text-sm text-gray-600 mb-2">
                      Status: {result.status}
                    </p>
                  )}
                  
                  {result.rawResponse && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-red-600 hover:text-red-800">
                        View Raw Response (HTML Error)
                      </summary>
                      <pre className="mt-2 p-3 bg-red-50 rounded text-xs overflow-auto max-h-96 border border-red-200">
                        {result.rawResponse}
                      </pre>
                    </details>
                  )}
                  
                  {result.data && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                        View Response
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                  
                  {result.error && (
                    <p className="text-sm text-red-600 mt-2">
                      Error: {result.error}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {Object.keys(results).length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p>Click "Test All Endpoints" to start testing</p>
                <p className="text-sm mt-2">
                  Or test individual endpoints using the buttons above
                </p>
              </div>
            )}
          </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
              <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Important Notes:</h3>
              <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                <li>This page only tests the API endpoints - it doesn't modify any data</li>
                <li>You need to be logged in for these tests to work</li>
                <li>Some endpoints may return errors if database tables aren't created yet</li>
                <li>This is a test page - safe to use alongside your existing dashboard</li>
              </ul>
            </div>

            <div className="bg-red-50 border border-red-200 rounded p-4">
              <h3 className="font-semibold text-red-800 mb-2">🔧 Troubleshooting HTML Errors:</h3>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                <li><strong>If API Base shows production URL:</strong> Set <code>NEXT_PUBLIC_API_URL=http://localhost:5003</code> in <code>.env.local</code> or fix <code>config/dev-ports.json</code> / <code>PORTS.md</code></li>
                <li><strong>If server not running:</strong> Start the API (default local port <strong>5003</strong> per <code>dev-ports.json</code>)</li>
                <li><strong>If routes don't exist:</strong> Check server console for v2 route loading errors</li>
                <li><strong>Quick test:</strong> Try "Test V2 Health" button first - it should work if routes are loaded</li>
                <li><strong>Check server logs:</strong> Look for "✅ Tavari AI Core v2 routes loaded" message</li>
              </ul>
            </div>
        </div>
      </div>
    </AuthGuard>
  );
}
