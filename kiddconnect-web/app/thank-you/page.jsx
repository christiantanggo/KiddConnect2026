'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function ThankYouPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center">
              <Image
                src="/tavari-logo.png"
                alt="Tavari AI"
                width={400}
                height={114}
                className="h-28 w-auto"
                style={{ width: 'auto', height: '7rem' }}
                priority
              />
            </Link>
            <div className="flex items-center space-x-6">
              <Link href="/" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Home
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/login" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <div className="text-green-600 text-6xl mb-6">✓</div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Thank You for Your Purchase!
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Welcome to Tavari AI. Your AI phone agent is ready to start answering calls.
          </p>
        </div>

        <div className="bg-blue-50 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Next Steps</h2>
          <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-6">
            <li>Check your email for your account login credentials</li>
            <li>Log in to your Tavari dashboard</li>
            <li>Complete the quick setup wizard (takes 10 minutes)</li>
            <li>Your AI phone agent will be live and answering calls!</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/login"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
            >
              Go to Dashboard →
            </Link>
            <Link
              href="/"
              className="bg-gray-100 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-center"
            >
              Back to Home
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Need Help?</h3>
            <p className="text-gray-700 mb-4">
              Our support team is here to help you get started.
            </p>
            <a
              href="mailto:info@tanggo.ca"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Email: info@tanggo.ca →
            </a>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Quick Links</h3>
            <ul className="space-y-2 text-gray-700">
              <li>
                <Link href="/support" className="text-blue-600 hover:text-blue-700">
                  Customer Support →
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-blue-600 hover:text-blue-700">
                  Terms of Service →
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-blue-600 hover:text-blue-700">
                  Privacy Policy →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-8">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4">What Happens Next?</h3>
          <div className="space-y-4 text-gray-700">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">1. Check Your Email</h4>
              <p>
                You'll receive an email with your account login credentials and instructions on how to get started.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">2. Complete Setup</h4>
              <p>
                Log in to your dashboard and complete our quick setup wizard. This takes about 10 minutes and includes:
                adding your business information, setting up business hours, and configuring your AI agent.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">3. Go Live</h4>
              <p>
                Once setup is complete, your AI phone agent will be live and ready to answer calls 24/7!
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-center text-gray-600 mb-4 md:mb-0">
              <p>&copy; {new Date().getFullYear()} Tavari. All rights reserved.</p>
            </div>
            <div className="flex space-x-6 text-sm text-gray-600">
              <Link href="/legal/privacy" className="hover:text-blue-600 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/legal/terms" className="hover:text-blue-600 transition-colors">
                Terms of Service
              </Link>
              <Link href="/affiliates" className="hover:text-blue-600 transition-colors">
                Affiliates
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

