'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DemoModal from '@/components/DemoModal';
import PricingModal from '@/components/PricingModal';

export default function SalesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handlePricingClick = () => {
    setIsPricingModalOpen(true);
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

      <main className="container mx-auto px-4">
        {/* HERO SECTION - Main Sales Pitch */}
        <section className="py-20 md:py-32 max-w-6xl mx-auto">
          <div className="text-center mb-12">
            {/* Trust Signal Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700 font-medium mb-6">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Trusted by real businesses • Answering calls 24/7
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Never Miss a Call. Never Lose a Sale.
            </h1>
            <p className="text-xl md:text-2xl text-gray-700 mb-4 leading-relaxed max-w-3xl mx-auto">
              AI that answers your phone — as your business — 24/7. Get started in 10 minutes.
            </p>
            <p className="text-lg text-gray-600 mb-8">
              No setup calls. No scripts. No credit card required to try.
            </p>

            {/* Pricing Highlight */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white max-w-2xl mx-auto mb-8">
              <p className="text-sm uppercase tracking-wide mb-2 opacity-90">Founder's Price</p>
              <p className="text-5xl font-bold mb-2">$119<span className="text-2xl">/month</span></p>
              <p className="text-lg opacity-90 mb-4">Special launch pricing for the first 12 months</p>
              <p className="text-sm opacity-75">Includes everything: unlimited calls, phone number, AI agent, and all features</p>
            </div>

            {/* Primary CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
              <Link
                href="/signup"
                className="bg-blue-600 text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 w-full sm:w-auto text-center"
              >
                Get Started Now - $119/month →
              </Link>
              <button
                onClick={handleOpenModal}
                className="bg-white text-blue-600 border-2 border-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-all w-full sm:w-auto"
              >
                Try Free Demo
              </button>
            </div>

            {/* Trust Signals */}
            <p className="text-sm text-gray-500 mb-4">
              ✓ No credit card required to try • ✓ Set up in 10 minutes • ✓ Cancel anytime
            </p>
          </div>

          {/* Real ROI Testimonial */}
          <div className="max-w-6xl mx-auto mb-12">
            <div className="relative rounded-lg overflow-hidden">
              <Image
                src="/SMB-owner-photo.jpg"
                alt="Small Business Owner"
                width={1200}
                height={600}
                className="w-full h-[400px] md:h-[500px] object-cover"
                priority
              />
              
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
              
              {/* Quote Overlay */}
              <div className="absolute bottom-24 md:bottom-32 left-6 md:left-12 max-w-xl md:max-w-2xl text-left">
                <p className="text-2xl md:text-4xl font-bold text-white mb-3 italic leading-tight drop-shadow-lg">
                  "My AI Phone Agent saved $1,300 in bookings this week"
                </p>
                <p className="text-base md:text-lg text-white font-medium drop-shadow-md">
                  — Owner of The Fort Fun Center
                </p>
              </div>
              
              {/* Stats Cards */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
                <div className="grid grid-cols-3 gap-2 md:gap-4 max-w-4xl mx-auto">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 md:p-4 text-center border border-white/20">
                    <p className="text-2xl md:text-3xl font-bold text-white mb-1">85%</p>
                    <p className="text-xs md:text-sm text-white/90 font-medium leading-tight">don't call back</p>
                  </div>
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 md:p-4 text-center border border-white/20">
                    <p className="text-2xl md:text-3xl font-bold text-white mb-1">78%</p>
                    <p className="text-xs md:text-sm text-white/90 font-medium leading-tight">call competitors</p>
                  </div>
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 md:p-4 text-center border border-white/20">
                    <p className="text-2xl md:text-3xl font-bold text-white mb-1">62%</p>
                    <p className="text-xs md:text-sm text-white/90 font-medium leading-tight">go unanswered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEM SECTION */}
        <section className="py-20 bg-red-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Every Missed Call Costs You Money
            </h2>
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="text-4xl font-bold text-red-600 mb-2">85%</div>
                <p className="text-gray-700 font-medium">of customers don't call back if you miss their call</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="text-4xl font-bold text-red-600 mb-2">78%</div>
                <p className="text-gray-700 font-medium">will call a competitor instead</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="text-4xl font-bold text-red-600 mb-2">62%</div>
                <p className="text-gray-700 font-medium">of business calls go unanswered</p>
              </div>
            </div>
            <p className="text-lg text-gray-700 mt-8 font-semibold">
              You can't afford to miss calls. But you also can't afford a full-time receptionist.
            </p>
          </div>
        </section>

        {/* SOLUTION SECTION */}
        <section className="py-20 bg-white mb-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
              Tavari AI: AI Receptionist Software for Your Business
            </h2>
            <p className="text-center text-gray-600 mb-12 text-lg">
              AI receptionist software that answers every call using your business information
            </p>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Key Features */}
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">What Tavari Does</h3>
                <div className="space-y-4">
                  {[
                    { icon: '📞', title: 'Answers Every Call 24/7', desc: 'Never miss a call, even after hours or during busy periods' },
                    { icon: '💬', title: 'Uses Your Business Info', desc: 'Answers FAQs using your actual business information' },
                    { icon: '📝', title: 'Takes Messages', desc: 'Captures caller information and requests for callbacks' },
                    { icon: '⏰', title: 'Respects Business Hours', desc: 'Knows your hours and holidays automatically' },
                    { icon: '📧', title: 'Instant Email Summaries', desc: 'Get notified immediately when calls come in' },
                    { icon: '🎯', title: 'Flags Urgent Calls', desc: 'Important calls are escalated to you right away' },
                  ].map((feature, idx) => (
                    <div key={idx} className="flex items-start space-x-4">
                      <div className="text-3xl flex-shrink-0">{feature.icon}</div>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">{feature.title}</h4>
                        <p className="text-gray-600 text-sm">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Benefits */}
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">Why Businesses Love Tavari</h3>
                <div className="space-y-4">
                  {[
                    'Setup in 10 minutes - no coding required',
                    'Works with any phone number you already have',
                    'Professional, natural-sounding voice',
                    'Handles multiple calls simultaneously',
                    'No per-call charges - unlimited calls',
                    'Cancel anytime - no long-term contracts',
                  ].map((benefit, idx) => (
                    <div key={idx} className="flex items-center space-x-3">
                      <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-gray-700">{benefit}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SETUP SECTION */}
        <section className="py-20 bg-gray-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Live in 10 Minutes. No Setup Calls.
            </h2>
            <p className="text-gray-600 mb-8 text-lg">
              Answer a few questions once. Your phone is covered forever.
            </p>
            <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
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
                <div key={index} className="flex items-center space-x-2 p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <span className="text-gray-700 font-medium text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="py-16 bg-white mb-16">
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
          </div>
        </section>

        {/* PRICING SECTION */}
        <section className="py-20 bg-blue-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <div className="bg-white rounded-2xl p-8 shadow-lg max-w-2xl mx-auto">
              <div className="mb-6">
                <span className="inline-block bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1 rounded-full mb-4">
                  Founder's Price
                </span>
                <p className="text-5xl font-bold text-gray-900 mb-2">
                  $119<span className="text-2xl text-gray-600">/month</span>
                </p>
                <p className="text-gray-600 mb-6">Special launch pricing for the first 12 months</p>
              </div>

              <div className="text-left space-y-3 mb-8">
                {[
                  'Unlimited calls - no per-call charges',
                  'Dedicated phone number included',
                  'AI phone agent with your business info',
                  '24/7 call answering',
                  'Email summaries for every call',
                  'Message capture and callback requests',
                  'Business hours and holiday handling',
                  'Urgent call escalation',
                  'Professional, natural voice',
                  'Setup in 10 minutes',
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/signup"
                  className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-center"
                >
                  Get Started Now - $119/month →
                </Link>
                <button
                  onClick={handleOpenModal}
                  className="bg-white text-blue-600 border-2 border-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-all"
                >
                  Try Free Demo
                </button>
              </div>

              <p className="text-sm text-gray-500 mt-6">
                No credit card required to try • Cancel anytime
              </p>
            </div>
          </div>
        </section>

        {/* SAFETY/TRUST SECTION */}
        <section className="py-20 bg-white mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              If the assistant isn't sure, it never guesses
            </h2>
            <p className="text-lg text-gray-700 mb-8">
              When it doesn't know the answer, it takes a message and alerts your staff instantly.
            </p>
            <div className="bg-gray-50 rounded-lg p-6 text-left max-w-2xl mx-auto">
              <p className="text-gray-700 mb-4">
                <strong>Your business stays in control.</strong> Tavari AI is designed to be helpful, not pushy. 
                If it can't answer a question with confidence using your business information, it will:
              </p>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Take a detailed message from the caller</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Send you an instant email notification</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">✓</span>
                  <span>Flag the call as requiring your attention</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-20 mb-16">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Stop Missing Calls Today
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join businesses that never miss a call. Get started in 10 minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="bg-white text-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-center"
              >
                Get Started Now - $119/month →
              </Link>
              <button
                onClick={handleOpenModal}
                className="bg-transparent text-white border-2 border-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-white/10 transition-all"
              >
                Try Free Demo
              </button>
            </div>
            <p className="text-sm mt-6 opacity-75">
              No credit card required • Setup in 10 minutes • Cancel anytime
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="container mx-auto px-4 py-8">
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
              <Link href="/legal/privacy" className="hover:text-blue-600 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/legal/terms" className="hover:text-blue-600 transition-colors">
                Terms of Service
              </Link>
              <Link href="/support" className="hover:text-blue-600 transition-colors">
                Support
              </Link>
            </div>
          </div>
          <div className="text-center text-gray-500 text-sm mt-4">
            <p>&copy; {new Date().getFullYear()} Tavari. All rights reserved.</p>
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

