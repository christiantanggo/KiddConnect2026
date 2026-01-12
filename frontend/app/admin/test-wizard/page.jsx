'use client';

/**
 * Admin Test Wizard Page
 * Allows admins to test the setup wizard without creating a new business
 */

import { useState } from 'react';
import NewSetupWizard from '@/app/dashboard/setup/new-wizard';
import AuthGuard from '@/components/AuthGuard';

export default function AdminTestWizardPage() {
  const [showWizard, setShowWizard] = useState(false);

  if (!showWizard) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <div className="container mx-auto px-4 py-8">
            <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
              <h1 className="text-2xl font-bold mb-4 text-gray-900">Test Setup Wizard</h1>
              <p className="text-gray-600 mb-6">
                This page allows you to test the setup wizard without creating a new business account.
                The wizard will run in test mode, which means:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 mb-6">
                <li>No actual data will be saved to your business account</li>
                <li>Payment processing will be skipped</li>
                <li>Phone number purchases will be skipped</li>
                <li>You can navigate through all 9 steps to test the flow</li>
              </ul>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowWizard(true)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Start Test Wizard
                </button>
                <a
                  href="/admin-dashboard"
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
                >
                  Back to Admin Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-4">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Test Setup Wizard (Test Mode)</h1>
          <button
            onClick={() => setShowWizard(false)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Exit Test Mode
          </button>
        </div>
      </div>
      <NewSetupWizard testMode={true} />
    </div>
  );
}

