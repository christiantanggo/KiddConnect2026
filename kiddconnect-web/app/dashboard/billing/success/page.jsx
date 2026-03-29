'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';

function BillingSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sessionId = searchParams.get('session_id');
  const packageId = searchParams.get('package_id');
  const fromSetup = searchParams.get('from_setup') === 'true';

  useEffect(() => {
    const verifySession = async () => {
      // If coming from setup wizard without session_id, just redirect to step 6
      if (fromSetup && packageId && !sessionId) {
        const timer = setTimeout(() => {
          router.push('/dashboard/setup?step=6&payment_completed=true');
        }, 2000);
        setLoading(false);
        return () => clearTimeout(timer);
      }

      // If we have a session_id, verify it
      if (sessionId) {
        try {
          const { billingAPI } = await import('@/lib/api');
          const response = await billingAPI.verifyStripeSession(sessionId);
          
          if (response.data.success) {
            console.log('[Billing Success] Session verified:', response.data);
            
            // If coming from setup wizard, redirect back to setup at step 6
            if (fromSetup) {
              const timer = setTimeout(() => {
                router.push('/dashboard/setup?step=6&payment_completed=true');
              }, 2000);
              setLoading(false);
              return () => clearTimeout(timer);
            }
            
            // Otherwise redirect to billing page
            const timer = setTimeout(() => {
              router.push('/dashboard/billing');
            }, 3000);
            setLoading(false);
            return () => clearTimeout(timer);
          } else {
            setError('Payment verification failed. Please contact support if payment was processed.');
            setLoading(false);
          }
        } catch (err) {
          console.error('[Billing Success] Error verifying session:', err);
          // Still redirect after delay even if verification fails (webhook may have processed it)
          const timer = setTimeout(() => {
            if (fromSetup) {
              router.push('/dashboard/setup?step=6&payment_completed=true');
            } else {
              router.push('/dashboard/billing');
            }
          }, 3000);
          setLoading(false);
          return () => clearTimeout(timer);
        }
      } else {
        // No session_id - might be legacy flow or error
        setError('No session ID found');
        setLoading(false);
      }
    };

    verifySession();
  }, [sessionId, packageId, fromSetup, router]);

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Processing...</div>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow p-8 max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-gray-700 mb-6">{error}</p>
            <Link
              href="/dashboard/billing"
              className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Return to Billing
            </Link>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
            <p className="text-gray-600">
              Your subscription has been activated. You'll be redirected to your billing page shortly.
            </p>
          </div>
          <Link
            href="/dashboard/billing"
            className="block w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Go to Billing Dashboard
          </Link>
        </div>
      </div>
    </AuthGuard>
  );
}

function BillingSuccessPage() {
  return (
    <Suspense fallback={
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    }>
      <BillingSuccessContent />
    </Suspense>
  );
}

export default BillingSuccessPage;

