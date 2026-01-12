'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';
import { adminSMSNumbersAPI } from '@/lib/api';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function AdminPhoneNumbersPage() {
  const [unassignedNumbers, setUnassignedNumbers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [searchBusiness, setSearchBusiness] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [numbersRes, businessesRes] = await Promise.all([
        adminSMSNumbersAPI.getUnassigned(),
        fetch(`${API_URL}/api/admin/accounts`, {
          headers: {
            'Authorization': `Bearer ${getAdminToken()}`,
          },
        }).then(r => r.json()),
      ]);
      
      setUnassignedNumbers(numbersRes.data?.numbers || []);
      setBusinesses(businessesRes.businesses || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedNumber || !selectedBusiness) {
      alert('Please select a phone number and a business');
      return;
    }

    if (!confirm(`Assign ${selectedNumber.phone_number} to ${businesses.find(b => b.id === selectedBusiness)?.name || 'this business'}?`)) {
      return;
    }

    setAssigning(true);
    try {
      await adminSMSNumbersAPI.assignSMS(selectedBusiness, selectedNumber.phone_number);
      alert('Phone number assigned successfully!');
      setSelectedNumber(null);
      setSelectedBusiness('');
      await loadData();
    } catch (error) {
      console.error('Failed to assign number:', error);
      alert(error.response?.data?.error || 'Failed to assign phone number');
    } finally {
      setAssigning(false);
    }
  };

  const filteredBusinesses = businesses.filter(b => 
    !searchBusiness || 
    b.name?.toLowerCase().includes(searchBusiness.toLowerCase()) ||
    b.email?.toLowerCase().includes(searchBusiness.toLowerCase())
  );

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
            <h1 className="text-xl font-bold text-blue-600">SMS Phone Numbers</h1>
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
                  document.cookie = 'admin_token=; path=/; max-age=0';
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
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Unassigned Phone Numbers</h2>
            <p className="text-gray-600 mb-4">
              Total numbers in Telnyx: {unassignedNumbers.length > 0 ? unassignedNumbers[0]?.total || 0 : 0} | 
              Unassigned: {unassignedNumbers.length}
            </p>
            
            {unassignedNumbers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No unassigned phone numbers found.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unassignedNumbers.map((number) => (
                    <div
                      key={number.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedNumber?.id === number.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedNumber(number)}
                    >
                      <div className="font-semibold text-lg">{number.phone_number}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Status: {number.status || 'N/A'}
                      </div>
                      {number.region_information && (
                        <div className="text-xs text-gray-400 mt-1">
                          {number.region_information.city || ''} {number.region_information.state || ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selectedNumber && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">
                Assign {selectedNumber.phone_number} to Business
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Business
                  </label>
                  <input
                    type="text"
                    value={searchBusiness}
                    onChange={(e) => setSearchBusiness(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Business
                  </label>
                  <select
                    value={selectedBusiness}
                    onChange={(e) => setSelectedBusiness(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select a business --</option>
                    {filteredBusinesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name} ({business.email}) - Current: {business.telnyx_number || 'None'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleAssign}
                    disabled={assigning || !selectedBusiness}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {assigning ? 'Assigning...' : 'Assign Number'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedNumber(null);
                      setSelectedBusiness('');
                      setSearchBusiness('');
                    }}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
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

export default AdminPhoneNumbersPage;

