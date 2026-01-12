'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms of Service</h1>
        
        <div className="bg-white rounded-lg shadow p-8 space-y-6 text-gray-700">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Service Description</h2>
            <p>
              Tavari provides an AI phone receptionist service that answers calls on behalf of your business,
              handles basic inquiries, takes messages, and forwards call summaries to you via email.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. User Obligations</h2>
            <p>
              You agree to use Tavari in compliance with all applicable laws and regulations.
              You are responsible for maintaining the security of your account credentials.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Payment Terms and Billing</h2>
            <p>
              Subscription fees are billed monthly on the same calendar day as your signup date.
              All fees are non-refundable except as required by law. Overage charges apply when usage exceeds
              your plan's included minutes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Cancellation Policy</h2>
            <p>
              You may cancel your subscription at any time. Cancellation takes effect at the end of your
              current billing period. No refunds are provided for partial billing periods.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Limitation of Liability</h2>
            <p>
              Tavari is provided "as is" without warranties of any kind. We are not liable for any indirect,
              incidental, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Last Updated</h2>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </section>
        </div>

        <div className="mt-8">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
















