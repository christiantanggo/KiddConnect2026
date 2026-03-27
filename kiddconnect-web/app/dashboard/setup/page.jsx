'use client';

import { useState, useEffect } from 'react';
import NewSetupWizard from './new-wizard';
import { billingAPI } from '@/lib/api';

function SetupPage() {
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if Stripe is in test mode
    const checkTestMode = async () => {
      try {
        const response = await billingAPI.getTestMode();
        setTestMode(response.data?.testMode || false);
        console.log('[Setup Page] Stripe test mode detected:', response.data?.testMode || false);
      } catch (error) {
        console.error('[Setup Page] Failed to check Stripe test mode:', error);
        // Default to false (live mode) if check fails
        setTestMode(false);
      } finally {
        setLoading(false);
      }
    };

    checkTestMode();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading setup wizard...</p>
        </div>
      </div>
    );
  }

  console.log('[Setup Page] Initializing setup wizard with testMode:', testMode);
  return <NewSetupWizard testMode={testMode} />;
}

export default SetupPage;
