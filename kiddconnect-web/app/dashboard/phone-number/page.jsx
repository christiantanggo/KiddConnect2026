'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, businessAPI } from '@/lib/api';
import Link from 'next/link';
import TelnyxPhoneNumberSelector from '@/components/TelnyxPhoneNumberSelector';
import { extractAreaCode } from '@/lib/phoneFormatter';
import { useToast } from '@/components/ToastProvider';

function PhoneNumberPage() {
  const router = useRouter();
  const { success } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userRes = await authAPI.getMe();
      setUser(userRes.data);
      
      // If already has phone number, redirect to dashboard
      if (userRes.data?.business?.vapi_phone_number) {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProvision = async () => {
    if (!selectedNumber) {
      setError('Please select a phone number');
      return;
    }

    setProvisioning(true);
    setError('');

    try {
      const response = await businessAPI.provisionPhoneNumber({ phoneNumber: selectedNumber });
      
      if (response.data?.success) {
        success(`Phone number ${response.data.phone_number} provisioned successfully!`);
        router.push('/dashboard?refresh=' + Date.now());
      } else {
        setError('Failed to provision phone number. Please try again.');
      }
    } catch (error) {
      console.error('Provision error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to provision phone number';
      setError(errorMessage);
    } finally {
      setProvisioning(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Select Phone Number</h1>
            <div className="space-x-4">
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Choose Your Tavari Phone Number</h2>
            <p className="text-gray-600 mb-6">
              Select a toll-free phone number for your AI phone agent. Your first phone number is included in your subscription. Additional numbers beyond the first will be charged separately.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <div className="mb-6">
              <TelnyxPhoneNumberSelector
                onSelect={(number) => {
                  setSelectedNumber(number);
                  setError('');
                }}
                selectedNumber={selectedNumber}
                countryCode="US"
                areaCode={user?.business?.public_phone_number ? extractAreaCode(user.business.public_phone_number) : null}
              />
            </div>

            {selectedNumber && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-2">Selected Number:</p>
                <p className="text-2xl font-bold text-blue-600">{selectedNumber}</p>
                <p className="text-xs text-gray-600 mt-2">
                  Click "Provision Phone Number" below to complete setup.
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-4">
              <Link
                href="/dashboard"
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </Link>
              <button
                onClick={handleProvision}
                disabled={!selectedNumber || provisioning}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {provisioning ? 'Provisioning...' : 'Provision Phone Number'}
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">What happens next?</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Your selected toll-free phone number will be provisioned and configured (included in subscription)</li>
              <li>The AI assistant will be linked to this number</li>
              <li>You'll receive your Tavari phone number to forward calls to</li>
              <li>The setup checklist will be updated automatically</li>
            </ul>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default PhoneNumberPage;

