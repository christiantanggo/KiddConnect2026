'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DemoModal from '@/components/DemoModal';
import PricingModal from '@/components/PricingModal';
import { trackButtonClick, trackLinkClick, trackPageView, trackScrollDepth, trackTimeOnPage, trackSectionView, trackExitIntent } from '@/lib/analytics';

export default function RestaurantLandingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const scrollDepthTracked = useRef(new Set());
  const timeTracked = useRef(new Set());
  const sectionsTracked = useRef(new Set());
  const exitIntentTracked = useRef(false);
  const pageStartTime = useRef(Date.now());

  // Track page view on mount
  useEffect(() => {
    trackPageView('restaurant-landing');
    pageStartTime.current = Date.now();

    // Track time on page at intervals
    const timeInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - pageStartTime.current) / 1000);
      const milestones = [10, 30, 60, 120, 300];
      if (milestones.includes(seconds) && !timeTracked.current.has(seconds)) {
        trackTimeOnPage(seconds, 'restaurant-landing');
        timeTracked.current.add(seconds);
      }
    }, 1000);

    // Track scroll depth
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercentage = Math.round((scrollTop / documentHeight) * 100);
      
      const milestones = [25, 50, 75, 100];
      milestones.forEach(milestone => {
        if (scrollPercentage >= milestone && !scrollDepthTracked.current.has(milestone)) {
          trackScrollDepth(milestone, 'restaurant-landing');
          scrollDepthTracked.current.add(milestone);
        }
      });
    };

    // Track exit intent (mouse leaving viewport from top)
    const handleMouseLeave = (e) => {
      if (e.clientY <= 0 && !exitIntentTracked.current) {
        trackExitIntent('restaurant-landing');
        exitIntentTracked.current = true;
      }
    };

    // Track section visibility using Intersection Observer
    const observerOptions = { threshold: 0.5 };
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id || entry.target.getAttribute('data-section');
          if (sectionId && !sectionsTracked.current.has(sectionId)) {
            trackSectionView(sectionId, 'restaurant-landing');
            sectionsTracked.current.add(sectionId);
          }
        }
      });
    }, observerOptions);

    // Observe all sections with data-section attribute
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach(section => sectionObserver.observe(section));

    // Show sticky CTA after scrolling 200px (mobile-first)
    const handleStickyCTA = () => {
      if (window.scrollY > 200) {
        setShowStickyCTA(true);
      } else {
        setShowStickyCTA(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleStickyCTA);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      clearInterval(timeInterval);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleStickyCTA);
      document.removeEventListener('mouseleave', handleMouseLeave);
      sectionObserver.disconnect();
    };
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
        <section data-section="hero" className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              {/* Trust Signal Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700 font-medium mb-8">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Trusted by growing restaurants • Answering calls 24/7
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                AI Phone Agent for Restaurants
              </h1>
              <h2 className="text-xl md:text-2xl lg:text-3xl text-gray-700 mb-6 leading-relaxed max-w-3xl mx-auto">
                Never miss another order, reservation, or catering call — even during the dinner rush.
              </h2>
              <p className="text-base md:text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
                Answers calls, handles FAQs, captures messages, and sends SMS follow-ups automatically.
              </p>
              
              {/* Primary CTA */}
              <div className="mb-6">
                <button
                  onClick={handleOpenModal}
                  className="bg-blue-600 text-white px-10 md:px-14 py-4 md:py-5 rounded-lg text-lg md:text-xl font-bold hover:bg-blue-700 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 w-full sm:w-auto"
                >
                  Try Free Demo
                </button>
                <p className="text-sm md:text-base text-gray-600 mt-3">
                  Hear it answer your restaurant's phone in 10 seconds
                </p>
              </div>
              
              {/* Trust Microcopy */}
              <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm text-gray-600">
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  No credit card required
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  10-minute setup
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Cancel anytime
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2 — DEMO EXPLANATION STRIP */}
        <section data-section="demo_explanation" className="py-8 md:py-12 bg-gray-50 rounded-2xl mb-12 md:mb-16">
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-gray-700 font-medium mb-6">How the demo works:</p>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold">1</div>
                <p className="text-gray-700 font-medium">Tap "Try Free Demo"</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold">2</div>
                <p className="text-gray-700 font-medium">Hear the AI answer a restaurant call</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold">3</div>
                <p className="text-gray-700 font-medium">See the message sent by SMS or email</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-600 mt-4">No signup required to hear the demo.</p>
          </div>
        </section>

        {/* SECTION 3 — PAIN-FOCUSED SECTION */}
        <section data-section="pain_points" className="py-16 md:py-20 mb-16 md:mb-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-12 text-center">
              Missed calls = missed orders
            </h2>
            <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-10">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-red-50">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-800 font-medium text-lg">Phones ring during rush</p>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg bg-red-50">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-800 font-medium text-lg">Staff can't answer every call</p>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg bg-red-50">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-800 font-medium text-lg">Customers hang up and call the next restaurant</p>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg bg-red-50">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-800 font-medium text-lg">Voicemails don't convert</p>
              </div>
            </div>
            <div className="bg-blue-50 rounded-xl p-6 md:p-8 text-center border-2 border-blue-200">
              <p className="text-xl md:text-2xl text-gray-900 font-bold">
                Tavari's AI answers every call instantly — even when your team can't.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 4 — FEATURES → RESTAURANT OUTCOMES */}
        <section data-section="features" className="py-16 md:py-20 bg-gray-50 rounded-2xl mb-16 md:mb-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center">
              Everything your restaurant needs
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">Answers Every Call</h3>
                <p className="text-gray-600 text-base leading-relaxed">Never miss a takeout, reservation, or catering inquiry.</p>
              </div>
              
              <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">Handles Restaurant FAQs</h3>
                <p className="text-gray-600 text-base leading-relaxed">Hours, location, menu questions, dietary info.</p>
              </div>
              
              <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">Captures Messages Automatically</h3>
                <p className="text-gray-600 text-base leading-relaxed">Order requests, callbacks, special requests — sent instantly.</p>
              </div>
              
              <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">SMS & Email Follow-Ups</h3>
                <p className="text-gray-600 text-base leading-relaxed">Customers get a confirmation text even if staff is busy.</p>
              </div>
              
              <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">Flags Urgent Calls</h3>
                <p className="text-gray-600 text-base leading-relaxed">Large orders, complaints, VIP requests highlighted.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 — SOCIAL PROOF */}
        <section data-section="social_proof" className="py-16 md:py-20 mb-16 md:mb-20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">
              Trusted by growing restaurants
            </h2>
            <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-10 md:p-14 max-w-3xl mx-auto shadow-sm border border-gray-200">
              <svg className="w-12 h-12 text-blue-600 mx-auto mb-6 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.996 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h4v10h-10z"/>
              </svg>
              <p className="text-xl md:text-2xl text-gray-800 italic mb-6 leading-relaxed">
                "We were missing calls every night. Tavari captured orders we would've lost."
              </p>
              <p className="text-gray-700 font-semibold text-lg">— Restaurant Owner</p>
            </div>
          </div>
        </section>

        {/* SECTION 6 — UPCOMING RESTAURANT FEATURES */}
        <section data-section="upcoming_features" className="py-12 md:py-16 bg-blue-50 rounded-2xl mb-12 md:mb-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 text-center">
              Built to grow with your restaurant
            </h2>
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-700">AI order taking (coming soon)</p>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-700">Delivery driver triggering</p>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-700">Google review auto-replies</p>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-700">More AI tools inside Tavari</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-600">
              Activate additional tools anytime inside Tavari.
            </p>
          </div>
        </section>

        {/* SECTION 7 — MARKETPLACE CONTEXT */}
        <section data-section="marketplace" className="py-12 md:py-16 mb-12 md:mb-16">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              More than just a phone agent
            </h2>
            <p className="text-lg text-gray-700">
              Tavari is a modular AI platform. Start with the phone agent and activate additional AI tools when you're ready — no switching systems.
            </p>
          </div>
        </section>

        {/* SECTION 8 — FINAL CTA */}
        <section data-section="final_cta" className="py-12 md:py-16 mb-12 md:mb-16">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 md:p-12 text-white">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-8">
              See it answer a restaurant call right now
            </h2>
            <button
              onClick={() => {
                handleOpenModal();
                trackButtonClick('demo_cta', 'final_cta_section');
              }}
              className="bg-white text-blue-600 px-10 py-4 rounded-lg text-lg font-bold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mb-4"
            >
              Try Free Demo
            </button>
            <p className="text-sm md:text-base text-blue-100">
              No credit card • 10 seconds • Built for restaurants
            </p>
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

      {/* Sticky/Floating CTA Button (Mobile-first) */}
      {showStickyCTA && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 md:hidden">
          <button
            onClick={handleOpenModal}
            className="bg-blue-600 text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-blue-700 transition-all shadow-2xl hover:shadow-blue-500/50 transform hover:scale-105 flex items-center gap-2"
          >
            Try Free Demo →
          </button>
        </div>
      )}

      {/* Demo Modal */}
      <DemoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      
      {/* Pricing Modal */}
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} moduleKey="phone-agent" />
    </div>
  );
}

