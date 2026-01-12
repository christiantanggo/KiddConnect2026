'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function AffiliatesPage() {
  const [activeTab, setActiveTab] = useState('program');

  const tabs = [
    { id: 'program', label: 'Affiliate Program' },
    { id: 'product', label: 'Product Details' },
    { id: 'thank-you', label: 'Thank You' },
  ];

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

      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Tavari Affiliate Program
          </h1>
          <p className="text-xl text-gray-600">
            Earn 75% commission promoting AI receptionist software for small businesses
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {/* Affiliate Program Tab */}
            {activeTab === 'program' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Join Our Affiliate Program</h2>
                  <p className="text-lg text-gray-700 mb-6">
                    Promote Tavari AI and earn generous commissions on every sale. Perfect for marketers, content creators, business consultants, and anyone with an audience of small business owners.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="bg-blue-50 rounded-lg p-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">💰 Commission Structure</h3>
                    <ul className="space-y-3 text-gray-700">
                      <li className="flex items-start">
                        <span className="text-blue-600 font-bold mr-2">75%</span>
                        <span>Commission on initial sale</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 font-bold mr-2">$119</span>
                        <span>Monthly subscription price</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 font-bold mr-2">$89.25</span>
                        <span>You earn per sale (75% of $119)</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-green-50 rounded-lg p-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">✨ Why Promote Tavari?</h3>
                    <ul className="space-y-3 text-gray-700">
                      <li>✅ High conversion product</li>
                      <li>✅ Recurring monthly subscriptions</li>
                      <li>✅ Perfect for small business audiences</li>
                      <li>✅ Growing market demand</li>
                      <li>✅ Easy to promote and explain</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-white border-2 border-blue-200 rounded-lg p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">🚀 Get Started</h3>
                  <p className="text-gray-700 mb-6">
                    Join our affiliate program and earn commissions promoting AI receptionist software to small businesses. We provide all the tools you need to succeed.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <a
                      href="mailto:info@tanggo.ca?subject=Affiliate Program Inquiry"
                      className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
                    >
                      Apply to Join →
                    </a>
                    <Link
                      href="/affiliates?tab=product"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab('product');
                      }}
                      className="bg-gray-100 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-center"
                    >
                      View Product Details →
                    </Link>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">How It Works</h3>
                  <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
                    <li>Apply to join our affiliate program</li>
                    <li>Get approved and receive your unique affiliate link and tracking code</li>
                    <li>Promote Tavari AI receptionist software to your audience</li>
                    <li>Earn 75% commission on every sale ($89.25 per sale at $119/month)</li>
                    <li>Track your earnings in real-time through our affiliate dashboard</li>
                    <li>Get paid monthly via direct deposit or PayPal</li>
                  </ol>
                  <p className="text-sm text-gray-600 mt-4">
                    <strong>Note:</strong> Commissions are paid on initial sales only. Recurring subscription revenue helps us maintain the service and support customers.
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">What We Provide</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Unique tracking links and codes for all your campaigns</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Marketing materials (banners, copy, product information)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Real-time affiliate dashboard to track clicks and conversions</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Support from our team to help you succeed</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-600 mr-2">✓</span>
                      <span>Marketing tips and best practices for promoting software</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Product Details Tab */}
            {activeTab === 'product' && (
              <div className="space-y-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Tavari AI - Product Details</h2>
                  <p className="text-lg text-gray-700 mb-6">
                    Everything you need to know about Tavari AI receptionist software to promote it effectively.
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-3">What is Tavari AI?</h3>
                    <p className="text-gray-700 mb-4">
                      Tavari AI is AI receptionist software designed specifically for small businesses. 
                      This software automatically handles customer communication, answers FAQs using your business information, 
                      and captures messages - all through a web-based dashboard. It's perfect for businesses that want to 
                      provide 24/7 customer service without hiring a full-time receptionist.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-3">Key Features</h3>
                    <ul className="grid md:grid-cols-2 gap-4 text-gray-700">
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>24/7 phone answering - never miss a call</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Answers FAQs using your business information</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Takes messages and callbacks</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Handles business hours and holidays</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Instant email summaries</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Professional, natural voice</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Setup in 10 minutes - no coding required</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-600 mr-2">✓</span>
                        <span>Works with any phone number</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-3">Target Audience</h3>
                    <p className="text-gray-700 mb-4">
                      Perfect for small businesses that:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                      <li>Miss calls during busy periods or after hours</li>
                      <li>Can't afford a full-time receptionist</li>
                      <li>Want to provide 24/7 customer service</li>
                      <li>Need to capture every lead and inquiry</li>
                      <li>Want professional phone answering without the cost</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-3">Pricing</h3>
                    <div className="bg-blue-50 rounded-lg p-6">
                      <p className="text-2xl font-bold text-gray-900 mb-2">
                        Founder Price: $119/month
                      </p>
                      <p className="text-gray-700">
                        Special launch pricing for the first 12 months. Includes everything: unlimited calls, 
                        phone number, AI agent, and all features.
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-3">Promotional Materials</h3>
                    <p className="text-gray-700 mb-4">
                      Use these key messages when promoting Tavari:
                    </p>
                    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                      <div>
                        <p className="font-semibold text-gray-900 mb-2">Headline:</p>
                        <p className="text-gray-700">"Never Miss Another Call - AI Phone Agent for Small Businesses"</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 mb-2">Value Proposition:</p>
                        <p className="text-gray-700">
                          "Tavari AI answers every call, 24/7, using your business information. 
                          Handle customer inquiries, answer FAQs, and take messages - all automatically."
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 mb-2">Call to Action:</p>
                        <p className="text-gray-700">
                          "Try Tavari free on our website. See how it answers your phone in 10 seconds. 
                          No credit card required."
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Thank You Tab */}
            {activeTab === 'thank-you' && (
              <div className="space-y-8">
                <div className="text-center">
                  <div className="text-green-600 text-6xl mb-6">✓</div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You for Your Purchase!</h2>
                  <p className="text-lg text-gray-700 mb-8">
                    Welcome to Tavari AI. Your AI phone agent is ready to start answering calls.
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-8">
                  <h3 className="text-2xl font-semibold text-gray-900 mb-4">Next Steps</h3>
                  <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-6">
                    <li>Check your email for your account login credentials</li>
                    <li>Log in to your Tavari dashboard</li>
                    <li>Complete the quick setup wizard (takes 10 minutes)</li>
                    <li>Your AI phone agent will be live and answering calls!</li>
                  </ol>
                  <div className="flex gap-4">
                    <Link
                      href="/login"
                      className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Go to Dashboard →
                    </Link>
                    <Link
                      href="/"
                      className="bg-gray-100 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                    >
                      Back to Home
                    </Link>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-xl font-semibold text-gray-900 mb-3">Need Help?</h4>
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
                    <h4 className="text-xl font-semibold text-gray-900 mb-3">Quick Links</h4>
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
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p>&copy; {new Date().getFullYear()} Tavari. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

