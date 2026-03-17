'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function AdminAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    loadAccounts();
  }, [search, filterPlan, filterStatus]);

  const loadAccounts = async () => {
    try {
      const token = getAdminToken();
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterPlan) params.append('plan_tier', filterPlan);
      if (filterStatus) params.append('status', filterStatus);

      const response = await fetch(`${API_URL}/api/admin/accounts?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setAccounts(data.businesses || []);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
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
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Business name or email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">All Plans</option>
                  <option value="starter">Starter</option>
                  <option value="core">Core</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Accounts Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {account.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {account.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {account.plan_tier || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        account.ai_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {account.ai_enabled ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {account.telnyx_number || account.vapi_phone_number || 'N/A'}
                      {account.vapi_phone_number && !account.telnyx_number && (
                        <span className="ml-2 text-xs text-orange-600">(VAPI)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        href={`/admin/accounts/${account.id}`}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        View Details
                      </Link>
                      <button
                        onClick={async () => {
                          if (!confirm(`Cancel account for ${account.name}? This will stop all billing (credit card will no longer be charged) and set the account to inactive.`)) {
                            return;
                          }
                          setCancellingId(account.id);
                          try {
                            const token = getAdminToken();
                            const response = await fetch(`${API_URL}/api/admin/accounts/${account.id}/cancel`, {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                              },
                            });
                            const data = await response.json();
                            if (response.ok) {
                              alert(data.message || 'Account canceled. Billing has been stopped.');
                              loadAccounts();
                            } else {
                              alert('Error: ' + (data.error || 'Failed to cancel account'));
                            }
                          } catch (error) {
                            console.error('Cancel account error:', error);
                            alert('Failed to cancel account');
                          } finally {
                            setCancellingId(null);
                          }
                        }}
                        disabled={cancellingId === account.id}
                        className="text-red-600 hover:text-red-900 mr-3 disabled:opacity-50"
                        title="Stop billing and set account to inactive"
                      >
                        {cancellingId === account.id ? 'Cancelling…' : 'Cancel account'}
                      </button>
                      {account.vapi_phone_number && !account.telnyx_number && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Migrate ${account.vapi_phone_number} from vapi_phone_number to telnyx_number for ${account.name}?`)) {
                              return;
                            }
                            try {
                              const token = getAdminToken();
                              const response = await fetch(`${API_URL}/api/admin/phone-numbers/migrate-to-telnyx/${account.id}`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json',
                                },
                              });
                              const data = await response.json();
                              if (response.ok) {
                                alert('Phone number migrated successfully!');
                                loadAccounts();
                              } else {
                                alert('Error: ' + (data.error || 'Failed to migrate'));
                              }
                            } catch (error) {
                              console.error('Migration error:', error);
                              alert('Failed to migrate phone number');
                            }
                          }}
                          className="text-orange-600 hover:text-orange-900 text-xs"
                        >
                          Migrate to Telnyx
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accounts.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No accounts found
              </div>
            )}
          </div>
        </main>
    </div>
  );

  function getAdminToken() {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
}

export default AdminAccountsPage;

