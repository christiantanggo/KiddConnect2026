'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

export default function ReviewReplyAIClickBankPage() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/billing/packages?module_key=reviews&clickbank=true`);
      if (!response.ok) {
        throw new Error('Failed to load pricing');
      }
      const data = await response.json();
      // If clickbank=true, the API returns { package, packages }
      const clickBankPackage = data.package || (data.packages && data.packages[0]) || null;
      setPackages(clickBankPackage ? [clickBankPackage] : []);
    } catch (err) {
      console.error('Failed to load pricing packages:', err);
      setError('Failed to load pricing information');
    } finally {
      setLoading(false);
    }
  };

  // Get the ClickBank package data
  const clickBankPackage = packages.length > 0 ? packages[0] : null;
  
  // Determine the price to use (sale price if on sale and available, otherwise monthly price)
  const effectivePrice = clickBankPackage && clickBankPackage.isOnSale && clickBankPackage.saleAvailable && clickBankPackage.sale_price
    ? clickBankPackage.sale_price
    : (clickBankPackage ? clickBankPackage.monthly_price : 99);
  
  const basePrice = effectivePrice;
  const commissionRate = clickBankPackage && clickBankPackage.clickbank_commission_rate 
    ? clickBankPackage.clickbank_commission_rate / 100 
    : 0.75; // Default to 75% if not set
  const commissionEarned = basePrice * commissionRate;

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
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Tavari AI Review Reply - ClickBank Affiliate
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Promote AI-powered review response software and earn generous commissions
          </p>
          <div className="flex justify-center gap-4">
            <a
              href="#payment"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Get Payment Link →
            </a>
            <Link
              href="/affiliates"
              className="bg-gray-100 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 font-medium">⚠️ {error}</p>
            <p className="text-sm text-yellow-700 mt-1">
              Please ensure a pricing package is marked as the ClickBank package in the admin panel.
            </p>
          </div>
        )}

        {!loading && !error && !clickBankPackage && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 font-medium">⚠️ ClickBank Package Not Configured</p>
            <p className="text-sm text-yellow-700 mt-1">
              No ClickBank package found for Review Reply AI. Please mark a package as the ClickBank package in the admin panel.
            </p>
          </div>
        )}

        {/* Commission Structure */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">💰 Commission Structure</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-blue-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {loading ? '...' : `${(commissionRate * 100).toFixed(0)}%`}
              </div>
              <div className="text-gray-700 font-medium">Commission Rate</div>
              <div className="text-sm text-gray-600 mt-2">On every sale</div>
            </div>
            <div className="bg-green-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-green-600 mb-2">
                {loading ? '...' : `$${basePrice.toFixed(2)}`}
              </div>
              <div className="text-gray-700 font-medium">Starting Price</div>
              <div className="text-sm text-gray-600 mt-2">
                {loading ? 'Loading...' : clickBankPackage ? (
                  <>
                    {clickBankPackage.isOnSale && clickBankPackage.saleAvailable ? (
                      <>
                        <span className="line-through text-gray-400">${clickBankPackage.monthly_price.toFixed(2)}</span>
                        <span className="ml-2 font-semibold">${basePrice.toFixed(2)}/month</span>
                        {clickBankPackage.sale_name && <div className="text-xs text-green-600 mt-1">{clickBankPackage.sale_name}</div>}
                      </>
                    ) : (
                      `$${basePrice.toFixed(2)}/month`
                    )}
                  </>
                ) : 'Per subscription'}
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-purple-600 mb-2">
                {loading ? '...' : `$${commissionEarned.toFixed(2)}`}
              </div>
              <div className="text-gray-700 font-medium">You Earn</div>
              <div className="text-sm text-gray-600 mt-2">
                {loading ? 'Loading...' : `Per sale (${(commissionRate * 100).toFixed(0)}% of $${basePrice.toFixed(2)})`}
              </div>
            </div>
          </div>
        </div>

        {/* Product Overview */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">What is Tavari AI Review Reply?</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <p className="text-lg text-gray-700 mb-4">
                Tavari AI Review Reply is AI-powered software that helps businesses respond to online reviews 
                professionally and quickly. It generates multiple response options, ensures legal compliance, 
                and maintains brand voice consistency.
              </p>
              <p className="text-gray-700 mb-4">
                Perfect for businesses that receive many reviews and want to respond to all of them 
                without spending hours crafting individual responses.
              </p>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Generate multiple response options instantly</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Legal compliance built-in</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Sentiment analysis and tone adjustment</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Save 90% of your time on review responses</span>
                </li>
              </ul>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Perfect For:</h3>
              <ul className="space-y-3 text-gray-700">
                <li>• Businesses with many online reviews</li>
                <li>• Companies wanting consistent brand voice</li>
                <li>• Businesses needing legal compliance</li>
                <li>• Companies that want to respond to every review</li>
                <li>• Businesses looking to save time</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Target Audience */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">🎯 Target Audience</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Restaurants</h3>
              <p className="text-gray-700">
                Respond to Yelp, Google, and TripAdvisor reviews quickly and professionally
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Service Businesses</h3>
              <p className="text-gray-700">
                Maintain professional responses across all review platforms
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">E-commerce</h3>
              <p className="text-gray-700">
                Handle product reviews and customer feedback efficiently
              </p>
            </div>
          </div>
        </div>

        {/* Why Promote */}
        <div className="bg-blue-50 rounded-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">✨ Why Promote Tavari AI Review Reply?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">✓</span>
                <span>High demand product - every business gets reviews</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">✓</span>
                <span>Recurring monthly subscriptions - stable income</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">✓</span>
                <span>Perfect for small business audiences</span>
              </li>
            </ul>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">✓</span>
                <span>Growing market for AI-powered business tools</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">✓</span>
                <span>Easy to understand and promote</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">✓</span>
                <span>75% commission - one of the highest rates</span>
              </li>
            </ul>
          </div>
        </div>

        {/* CTA Section */}
        <div id="payment" className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Earning?</h2>
          <p className="text-xl mb-6 opacity-90">
            Get your ClickBank payment link and start promoting today
          </p>
          <Link
            href="/review-reply-ai/clickbank/payment"
            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Get Payment Link →
          </Link>
        </div>
      </main>
    </div>
  );
}

