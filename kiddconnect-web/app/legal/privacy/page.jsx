'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
        
        <div className="bg-white rounded-lg shadow p-8 space-y-6 text-gray-700">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Data Collection</h2>
            <p>
              We collect business information (name, address, phone number, email), call transcripts,
              caller information, and usage data to provide and improve our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Data Usage</h2>
            <p>
              We use your data to provide the AI phone receptionist service, send call summaries,
              manage billing, and improve our service quality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Data Sharing</h2>
            <p>
              We share data with third-party service providers (VAPI for AI and telephony, Stripe for billing,
              AWS for email and storage, Telnyx for SMS) as necessary to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Retention</h2>
            <p>
              We retain call transcripts and messages for the duration of your account and for a reasonable
              period after cancellation for legal and business purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Your Rights</h2>
            <p>
              You have the right to access, update, export, and delete your data. You can request data export
              or account deletion from your dashboard settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Contact</h2>
            <p>
              For privacy concerns, contact us at info@tanggo.ca
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Last Updated</h2>
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








