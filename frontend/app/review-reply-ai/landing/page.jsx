'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trackButtonClick, trackLinkClick, trackPageView } from '@/lib/analytics';

export default function ReviewReplyAILandingPage() {
  const [pageStartTime] = useState(Date.now());

  useEffect(() => {
    trackPageView('review-reply-ai-landing');
  }, []);

  const handleGetStarted = () => {
    trackButtonClick('get_started', 'hero_section');
  };

  return (
    <div className="min-h-screen bg-white">
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
              <Link 
                href="/login" 
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
                onClick={() => trackLinkClick('login', '/login', 'navigation')}
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-sm hover:shadow-md"
                onClick={handleGetStarted}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4">
        {/* Hero Section */}
        <section className="py-20 md:py-32 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-full text-sm text-yellow-700 font-medium mb-6">
              <span className="text-2xl">⭐</span>
              <span>Tavari AI Review Reply</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Respond to Every Review Professionally
            </h1>
            <p className="text-xl md:text-2xl text-gray-700 mb-4 leading-relaxed">
              AI-powered review response generation. Save time while maintaining your brand voice and legal compliance.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              Generate multiple response options in seconds. Choose the best one or customize further.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
              <a
                href="https://tavarios.pay.clickbank.net/?cbitems=2"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 w-full sm:w-auto text-center"
                onClick={handleGetStarted}
              >
                Get Started
              </a>
              <Link
                href="#features"
                className="bg-white text-blue-600 border-2 border-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-all w-full sm:w-auto"
              >
                Learn More
              </Link>
            </div>
            
            {/* Trust Signal */}
            <p className="text-xs text-gray-500">
              ✓ No credit card required • ✓ Set up in minutes • ✓ Cancel anytime
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 bg-gray-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center">
              Why Tavari AI Review Reply?
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Multiple Response Options</h3>
                <p className="text-gray-600">
                  Get 3 professionally written response options for every review. Choose the tone and style that fits your brand.
                </p>
              </div>
              
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Legal Compliance</h3>
                <p className="text-gray-600">
                  Built-in guidelines help you follow best practices for professional review responses. Always review responses and consult legal counsel when needed.
                </p>
              </div>
              
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Lightning Fast</h3>
                <p className="text-gray-600">
                  Generate professional responses in seconds, not hours. Respond to reviews while they're still fresh.
                </p>
              </div>
              
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Sentiment Analysis</h3>
                <p className="text-gray-600">
                  Automatically detects review sentiment and adjusts response tone accordingly. Handle positive and negative reviews with ease.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-20 bg-white mb-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
              How It Works
            </h2>
            <p className="text-center text-gray-600 mb-12">
              Simple, fast, and effective. Get professional review responses in three easy steps.
            </p>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  1
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Paste Your Review</h3>
                <p className="text-gray-600">
                  Copy and paste the review you want to respond to. Our AI analyzes the content and sentiment.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  2
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Generate Responses</h3>
                <p className="text-gray-600">
                  Get multiple professionally written response options tailored to your business and brand voice.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  3
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Choose & Post</h3>
                <p className="text-gray-600">
                  Select your favorite response, customize if needed, and post directly to your review platform.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 bg-yellow-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Save Time, Maintain Quality
            </h2>
            <p className="text-lg text-gray-700 mb-8">
              Stop spending hours crafting individual review responses. Tavari AI Review Reply helps you maintain a professional, 
              consistent brand voice while responding to every review quickly and effectively.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg p-6">
                <p className="text-3xl font-bold text-blue-600 mb-2">90%</p>
                <p className="text-gray-700 font-medium">Time Saved</p>
                <p className="text-sm text-gray-600 mt-2">Respond in seconds, not hours</p>
              </div>
              <div className="bg-white rounded-lg p-6">
                <p className="text-3xl font-bold text-blue-600 mb-2">3</p>
                <p className="text-gray-700 font-medium">Response Options</p>
                <p className="text-sm text-gray-600 mt-2">Choose the best fit for your brand</p>
              </div>
              <div className="bg-white rounded-lg p-6">
                <p className="text-3xl font-bold text-blue-600 mb-2">24/7</p>
                <p className="text-gray-700 font-medium">Available</p>
                <p className="text-sm text-gray-600 mt-2">Respond anytime, anywhere</p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-8">
              Start Responding to Reviews Like a Pro
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join businesses that are saving time while maintaining professional review responses.
            </p>
            <a
              href="https://tavarios.pay.clickbank.net/?cbitems=2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-white text-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              onClick={handleGetStarted}
            >
              Get Started Now
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 py-8 mt-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <Link href="/" className="flex items-center">
                <Image
                  src="/tavari-logo.png"
                  alt="Tavari AI"
                  width={400}
                  height={114}
                  className="h-28 w-auto opacity-80"
                  style={{ width: 'auto', height: '7rem' }}
                />
              </Link>
            </div>
            <div className="flex space-x-6 text-sm text-gray-600">
              <Link 
                href="/legal/modules/review-reply-ai/privacy" 
                className="hover:text-blue-600 transition-colors"
                onClick={() => trackLinkClick('privacy_policy', '/legal/modules/review-reply-ai/privacy', 'footer')}
              >
                Privacy Policy
              </Link>
              <Link 
                href="/legal/modules/review-reply-ai/terms" 
                className="hover:text-blue-600 transition-colors"
                onClick={() => trackLinkClick('terms_of_service', '/legal/modules/review-reply-ai/terms', 'footer')}
              >
                Terms of Service
              </Link>
              <Link 
                href="/affiliates" 
                className="hover:text-blue-600 transition-colors"
                onClick={() => trackLinkClick('affiliates', '/affiliates', 'footer')}
              >
                Affiliates
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

