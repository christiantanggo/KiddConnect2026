'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

function PaymentForm() {
  const searchParams = useSearchParams();
  const [affiliateId, setAffiliateId] = useState('');
  const [clickbankNickname, setClickbankNickname] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Get affiliate ID from URL params if provided
  useEffect(() => {
    const id = searchParams?.get('affiliate') || searchParams?.get('affiliate_id') || '';
    if (id) {
      setAffiliateId(id);
    }
  }, [searchParams]);

  const generatePaymentLink = () => {
    if (!clickbankNickname) {
      setError('Please enter your ClickBank nickname');
      return;
    }

    // ClickBank payment link format: https://[nickname].clickbank.net/[product_id]
    // For Tavari, you'll need to replace [product_id] with your actual ClickBank product ID
    const productId = process.env.NEXT_PUBLIC_CLICKBANK_PRODUCT_ID || 'TavariAI';
    const baseUrl = `https://${clickbankNickname}.clickbank.net`;
    const link = `${baseUrl}/order/${productId}`;
    
    setPaymentLink(link);
    setError('');
  };

  const copyToClipboard = async () => {
    if (paymentLink) {
      try {
        await navigator.clipboard.writeText(paymentLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

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
              <Link href="/clickbank" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Back to Affiliate Page
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
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Get Your ClickBank Payment Link</h1>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">💰 Commission Details</h2>
            <ul className="space-y-2 text-gray-700">
              <li>• <strong>75% Commission</strong> on every sale</li>
              <li>• <strong>$119/month</strong> subscription price</li>
              <li>• <strong>$89.25</strong> you earn per sale</li>
              <li>• Payments processed through ClickBank</li>
            </ul>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-2">
                ClickBank Nickname *
              </label>
              <input
                type="text"
                id="nickname"
                value={clickbankNickname}
                onChange={(e) => setClickbankNickname(e.target.value.trim())}
                placeholder="your-nickname"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Your ClickBank nickname (found in your ClickBank account settings)
              </p>
            </div>

            {affiliateId && (
              <div>
                <label htmlFor="affiliate" className="block text-sm font-medium text-gray-700 mb-2">
                  Affiliate ID (Optional)
                </label>
                <input
                  type="text"
                  id="affiliate"
                  value={affiliateId}
                  onChange={(e) => setAffiliateId(e.target.value.trim())}
                  placeholder="affiliate-id"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Optional: Your affiliate tracking ID
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            <button
              onClick={generatePaymentLink}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-blue-700 transition-colors"
            >
              Generate Payment Link
            </button>

            {paymentLink && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Payment Link:</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={paymentLink}
                    readOnly
                    className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-2 bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300 transition-colors font-medium"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <p className="text-sm text-gray-700 mb-2">
                    <strong>How to use this link:</strong>
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>Copy the link above</li>
                    <li>Use it in your marketing materials, emails, websites, etc.</li>
                    <li>When customers click and purchase, you earn 75% commission</li>
                    <li>Track your sales in your ClickBank account</li>
                  </ol>
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">📋 Next Steps</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li>Get approved for the Tavari affiliate program (if not already approved)</li>
                <li>Enter your ClickBank nickname above</li>
                <li>Generate your unique payment link</li>
                <li>Promote the link to your audience</li>
                <li>Track sales and earnings in your ClickBank account</li>
                <li>Get paid monthly via ClickBank</li>
              </ol>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Need Help?</h3>
              <p className="text-gray-700 mb-4">
                If you need assistance with your ClickBank affiliate account or payment links, 
                contact us at:
              </p>
              <a
                href="mailto:info@tanggo.ca?subject=ClickBank Affiliate Support"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                info@tanggo.ca
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ClickBankPaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <PaymentForm />
    </Suspense>
  );
}

