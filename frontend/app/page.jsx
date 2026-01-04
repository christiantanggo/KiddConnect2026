'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DemoModal from '@/components/DemoModal';
import PricingModal from '@/components/PricingModal';
import { trackButtonClick, trackLinkClick, trackPageView } from '@/lib/analytics';

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  // Track page view on mount
  useEffect(() => {
    trackPageView('homepage');
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    trackButtonClick('demo_modal_open', 'hero_section');
  };

  const handlePricingClick = () => {
    setIsPricingModalOpen(true);
    trackButtonClick('pricing_button', 'navigation');
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
              <button
                onClick={handlePricingClick}
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
              >
                Pricing
              </button>
              <span className="text-gray-300">|</span>
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
                onClick={() => trackButtonClick('get_started', 'navigation')}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4">
        {/* SECTION 1 — HERO */}
        <section className="py-20 md:py-32 max-w-4xl mx-auto">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Who's answering your phone right now?
            </h1>
            <p className="text-xl md:text-2xl text-gray-700 mb-4 leading-relaxed">
              Hear our AI answer your phone — as your business — in 10 seconds.
            </p>
            <p className="text-sm text-gray-500 mb-10">
              No setup calls. No scripts. No credit card.
            </p>
            <button
              onClick={handleOpenModal}
              className="bg-blue-600 text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Hear Tavari Answer Your Phone
            </button>
          </div>
        </section>

        {/* SECTION 2 — CORE VALUE */}
        <section className="py-20 bg-gray-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center">
              Never miss another call — even after hours
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Every call answered, 24/7</h3>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Know what every caller wanted — instantly</h3>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Urgent calls flagged, nothing falls through</h3>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 — SETUP DIFFERENTIATOR */}
        <section className="py-20 bg-white mb-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
              Live in 10 Minutes. No Setup Calls.
            </h2>
            <p className="text-center text-gray-600 mb-8">
              Answer a few questions once. Your phone is covered forever.
            </p>
            <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {[
                'Business info',
                'Hours',
                'Holidays',
                'Services',
                'FAQs',
                'Escalation rules',
                'Notifications',
                'Voice',
                'Go live',
              ].map((step, index) => (
                <div key={index} className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <span className="text-gray-700 font-medium">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4 — SOCIAL PROOF */}
        <section className="py-16 bg-gray-100 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
              Trusted by real businesses
            </h2>
            <p className="text-gray-600 mb-8">
              Tavari AI is already answering real customer calls for operating businesses.
            </p>
            
            {/* Logos */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 mb-6">
              <div className="bg-white p-6 rounded-lg shadow-sm flex items-center justify-center" style={{ width: '200px', height: '140px' }}>
                <Image
                  src="/off-the-wall-kids.png"
                  alt="Off The Wall Kids"
                  width={300}
                  height={120}
                  className="w-auto object-contain max-h-full"
                  style={{ height: '6rem', width: 'auto' }}
                />
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm flex items-center justify-center" style={{ width: '200px', height: '140px' }}>
                <Image
                  src="/fort-fun-center.png"
                  alt="The Fort Fun Center"
                  width={300}
                  height={120}
                  className="w-auto object-contain max-h-full"
                  style={{ height: '6rem', width: 'auto' }}
                />
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm flex items-center justify-center" style={{ width: '200px', height: '140px' }}>
                <Image
                  src="/mci-logo.jpg"
                  alt="MCI"
                  width={200}
                  height={80}
                  className="w-auto object-contain max-h-full"
                  style={{ height: '4rem', width: 'auto' }}
                />
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm flex items-center justify-center" style={{ width: '200px', height: '140px' }}>
                <Image
                  src="/cfc-logo.png"
                  alt="CFC"
                  width={200}
                  height={80}
                  className="w-auto object-contain max-h-full"
                  style={{ height: '4rem', width: 'auto' }}
                />
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm flex items-center justify-center" style={{ width: '200px', height: '140px' }}>
                <Image
                  src="/tci-logo.png"
                  alt="TCI"
                  width={200}
                  height={80}
                  className="w-auto object-contain max-h-full"
                  style={{ height: '4rem', width: 'auto' }}
                />
              </div>
            </div>

            <p className="text-gray-700 font-medium mb-2">
              Used daily to answer calls, handle FAQs, and capture messages — even after hours.
            </p>
            <p className="text-sm text-gray-500">
              Built by operators. Used in live production environments.
            </p>
          </div>
        </section>

        {/* SECTION 5 — SAFETY / TRUST */}
        <section className="py-20 bg-blue-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              If the assistant isn't sure, it never guesses
            </h2>
            <p className="text-lg text-gray-700">
              When it doesn't know the answer, it takes a message and alerts your staff instantly.
            </p>
          </div>
        </section>

        {/* SECTION 6 — FINAL CTA */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-8">
              Stop missing calls today
            </h2>
            <button
              onClick={() => {
                handleOpenModal();
                trackButtonClick('demo_cta', 'final_cta_section');
              }}
              className="bg-white text-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Hear Tavari Answer Your Phone
            </button>
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
                href="/legal/privacy" 
                className="hover:text-blue-600 transition-colors"
                onClick={() => trackLinkClick('privacy_policy', '/legal/privacy', 'footer')}
              >
                Privacy Policy
              </Link>
              <Link 
                href="/legal/terms" 
                className="hover:text-blue-600 transition-colors"
                onClick={() => trackLinkClick('terms_of_service', '/legal/terms', 'footer')}
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

      {/* Demo Modal */}
      <DemoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      
      {/* Pricing Modal */}
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
    </div>
  );
}
