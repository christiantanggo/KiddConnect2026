'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminGuard from '@/components/AdminGuard';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('admin_token='));
  return tokenCookie ? tokenCookie.split('=')[1] : null;
}

function AdminActivityPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, []);

  const loadActivity = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/activity`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to load activity:', error);
    } finally {
      setLoading(false);
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
        <main className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.action.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.business_id ? (
                          <Link
                            href={`/admin/accounts/${log.business_id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {log.business_id}
                          </Link>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {log.details ? (
                          <pre className="text-xs bg-gray-50 p-2 rounded max-w-md overflow-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  No activity logs
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default AdminActivityPage;

