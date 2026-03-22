'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function ReviewReplyThankYouPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold text-blue-600">Tavari AI</span>
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
            Your Tavari AI Review Reply subscription has been activated.
          </p>
        </div>

        {/* ClickBank Trust Badge */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 mb-8 text-center">
          <div className="mb-4">
            <img 
              src="https://www.clickbank.com/trust-badge.png" 
              alt="ClickBank Trust Badge" 
              className="mx-auto h-16"
            />
          </div>
          <p className="text-sm text-gray-600">
            Your purchase is protected by ClickBank's money-back guarantee.
          </p>
        </div>

        {/* Product Access Instructions */}
        <div className="bg-blue-50 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">How to Access Your Account</h2>
          <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-6">
            <li>Check your email for your account login credentials (sent to the email address used for purchase)</li>
            <li>Log in to your Tavari AI dashboard at <a href="/login" className="text-blue-600 hover:text-blue-700 underline">www.tavarios.com/login</a></li>
            <li>Complete the quick setup wizard (takes approximately 10 minutes)</li>
            <li>Start generating professional review responses instantly!</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/login"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
            >
              Go to Dashboard →
            </Link>
            <Link
              href="/review-reply-ai/landing"
              className="bg-gray-100 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-center"
            >
              Learn More About Tavari AI Review Reply
            </Link>
          </div>
        </div>

        {/* Seller Contact Information */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Need Help?</h3>
            <p className="text-gray-700 mb-4">
              Our support team is here to help you get started with your AI review reply system.
            </p>
            <div className="space-y-2 text-gray-700">
              <p>
                <strong>Email:</strong>{' '}
                <a href="mailto:info@tanggo.ca" className="text-blue-600 hover:text-blue-700">
                  info@tanggo.ca
                </a>
              </p>
              <p>
                <strong>Support:</strong>{' '}
                <Link href="/support" className="text-blue-600 hover:text-blue-700">
                  Visit Support Center
                </Link>
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Quick Links</h3>
            <ul className="space-y-2 text-gray-700">
              <li>
                <Link href="/review-reply-ai/dashboard" className="text-blue-600 hover:text-blue-700">
                  Dashboard →
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

        {/* What Happens Next */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 mb-8">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4">What Happens Next?</h3>
          <div className="space-y-4 text-gray-700">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">1. Check Your Email</h4>
              <p>
                You'll receive an email with your account login credentials and detailed instructions on how to get started with Tavari AI Review Reply.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">2. Complete Setup</h4>
              <p>
                Log in to your dashboard and complete our quick setup wizard. This takes about 10 minutes and includes: adding your business information, configuring your brand voice and tone preferences, setting up your review response strategy, and connecting your review platforms.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">3. Start Responding</h4>
              <p>
                Once setup is complete, you can start generating professional, personalized review responses instantly. Simply paste a review, and our AI will generate multiple response options tailored to your business and brand voice.
              </p>
            </div>
          </div>
        </div>

        {/* Required Disclaimers */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Important Information</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              <strong>Billing Statement:</strong> Your purchase will appear on your credit card or bank statement as "CLICKBANK" or "CLICKBANK.COM".
            </p>
            <p>
              <strong>ClickBank Disclaimer:</strong> ClickBank is the retailer of products on this site. CLICKBANK® is a registered trademark of Click Sales Inc., a Delaware corporation located at 1444 S. Entertainment Ave., Suite 410, Boise, Idaho, 83709, USA and used by permission. ClickBank's role as retailer does not constitute an endorsement, approval or review of these products or any claim, statement or opinion used in promotion of these products.
            </p>
            <p>
              <strong>Refund Policy:</strong> ClickBank offers a 60-day money-back guarantee. If you are not satisfied with your purchase, please contact ClickBank customer service for a refund.
            </p>
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
              <Link href="/privacy" className="hover:text-blue-600 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-blue-600 transition-colors">
                Terms of Service
              </Link>
              <Link href="/support" className="hover:text-blue-600 transition-colors">
                Support
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

