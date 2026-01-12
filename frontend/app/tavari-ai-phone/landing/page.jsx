'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DemoModal from '@/components/DemoModal';
import PricingModal from '@/components/PricingModal';
import { trackButtonClick, trackLinkClick, trackPageView, trackScrollDepth, trackTimeOnPage, trackSectionView, trackExitIntent } from '@/lib/analytics';

export default function PhoneAgentLandingPage() {
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
    trackPageView('phone-agent-landing');
    pageStartTime.current = Date.now();

    // Track time on page at intervals
    const timeInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - pageStartTime.current) / 1000);
      const milestones = [10, 30, 60, 120, 300];
      if (milestones.includes(seconds) && !timeTracked.current.has(seconds)) {
        trackTimeOnPage(seconds, 'phone-agent-landing');
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
          trackScrollDepth(milestone, 'phone-agent-landing');
          scrollDepthTracked.current.add(milestone);
        }
      });
    };

    // Track exit intent (mouse leaving viewport from top)
    const handleMouseLeave = (e) => {
      if (e.clientY <= 0 && !exitIntentTracked.current) {
        trackExitIntent('phone-agent-landing');
        exitIntentTracked.current = true;
      }
    };

    // Track section visibility using Intersection Observer
    const observerOptions = { threshold: 0.5 }; // Trigger when 50% visible
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id || entry.target.getAttribute('data-section');
          if (sectionId && !sectionsTracked.current.has(sectionId)) {
            trackSectionView(sectionId, 'phone-agent-landing');
            sectionsTracked.current.add(sectionId);
          }
        }
      });
    }, observerOptions);

    // Observe all sections with data-section attribute
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach(section => sectionObserver.observe(section));

    // Show sticky CTA after scrolling 200px
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
        <section data-section="hero" className="py-20 md:py-32 max-w-4xl mx-auto">
          <div className="text-center">
            {/* Real ROI Testimonial with Photo */}
            <div className="max-w-6xl mx-auto mb-8">
              <div className="relative rounded-lg overflow-hidden">
                <Image
                  src="/SMB-owner-photo.jpg"
                  alt="Small Business Owner"
                  width={1200}
                  height={600}
                  className="w-full h-[500px] md:h-[600px] object-cover"
                  priority
                />
                
                {/* Gradient Overlay for Text Readability - Stronger at bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                
                {/* Quote Overlay - Bottom Left */}
                <div className="absolute bottom-32 md:bottom-40 left-6 md:left-12 max-w-xl md:max-w-2xl text-left">
                  <p className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-3 italic leading-tight drop-shadow-lg text-left">
                    "My AI Phone Agent saved $1,300 in bookings this week"
                  </p>
                  <p className="text-base md:text-lg text-white font-medium drop-shadow-md text-left">
                    — Owner of The Fort Fun Center
                  </p>
                </div>
                
                {/* CTA Button on Photo - Bottom Right */}
                <div className="absolute bottom-32 md:bottom-40 right-6 md:right-12 z-10">
                  <button
                    onClick={handleOpenModal}
                    className="bg-blue-600 text-white px-6 md:px-10 py-3 md:py-4 rounded-lg text-base md:text-lg font-bold hover:bg-blue-700 transition-all shadow-2xl hover:shadow-blue-500/50 transform hover:scale-105"
                  >
                    Try Free Demo →
                  </button>
                </div>
                
                {/* Stats Cards Overlay - Very Bottom of Photo */}
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
            <p className="text-xl md:text-2xl text-gray-700 mb-4 leading-relaxed">
              AI that answers your phone — as your business — 24/7. Get started in 10 minutes.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              No setup calls. No scripts. No credit card required.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
              <button
                onClick={handleOpenModal}
                className="bg-blue-600 text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 w-full sm:w-auto"
              >
                Try Free Demo
              </button>
              <button
                onClick={handlePricingClick}
                className="bg-white text-blue-600 border-2 border-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-all w-full sm:w-auto"
              >
                See Pricing
              </button>
            </div>
            
            {/* Additional Trust Signal */}
            <p className="text-xs text-gray-500">
              ✓ No credit card required • ✓ Set up in 10 minutes • ✓ Cancel anytime
            </p>
          </div>
        </section>

        {/* SECTION 2 — CORE VALUE */}
        <section data-section="core_value" className="py-20 bg-gray-50 rounded-2xl mb-16">
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
        <section data-section="setup" className="py-20 bg-white mb-16">
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
        <section data-section="social_proof" className="py-16 bg-gray-100 rounded-2xl mb-16">
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
        <section data-section="safety_trust" className="py-20 bg-blue-50 rounded-2xl mb-16">
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
        <section data-section="final_cta" className="py-20">
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

      {/* Sticky/Floating CTA Button */}
      {showStickyCTA && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
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
      <PricingModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
    </div>
  );
}

