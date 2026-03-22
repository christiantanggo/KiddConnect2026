'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function PhoneAgentClickBankPaymentPage() {
  const [clickbankId, setClickbankId] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Get ClickBank ID from URL params or localStorage
    const params = new URLSearchParams(window.location.search);
    const id = params.get('clickbank_id') || localStorage.getItem('clickbank_id') || '';
    setClickbankId(id);
    
    if (id) {
      generatePaymentLink(id);
    }
  }, []);

  const generatePaymentLink = (id) => {
    if (!id) return;
    
    // Format: https://www.tavarios.com/tavari-ai-phone/landing?clickbank_id=YOUR_ID
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/tavari-ai-phone/landing?clickbank_id=${id}`;
    setPaymentLink(link);
    localStorage.setItem('clickbank_id', id);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    generatePaymentLink(clickbankId);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              <Link href="/tavari-ai-phone/clickbank" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
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
          
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="mb-4">
              <label htmlFor="clickbank_id" className="block text-sm font-medium text-gray-700 mb-2">
                Your ClickBank ID (Nickname)
              </label>
              <input
                type="text"
                id="clickbank_id"
                value={clickbankId}
                onChange={(e) => setClickbankId(e.target.value)}
                placeholder="Enter your ClickBank nickname"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                This is your ClickBank nickname/ID that you use to track sales
              </p>
            </div>
            
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Generate Payment Link
            </button>
          </form>

          {paymentLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Payment Link:</h2>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={paymentLink}
                  readOnly
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={handleCopy}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
              <p className="text-sm text-gray-600">
                Share this link with your audience. All sales will be tracked to your ClickBank account.
              </p>
            </div>
          )}

          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">How It Works:</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Enter your ClickBank nickname/ID above</li>
              <li>Copy your unique payment link</li>
              <li>Share the link with your audience</li>
              <li>Earn 75% commission on every sale!</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}

