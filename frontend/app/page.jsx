'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trackPageView, trackLinkClick, trackButtonClick } from '@/lib/analytics';

export default function TavariAILandingPage() {
  const [pageStartTime] = useState(Date.now());

  useEffect(() => {
    trackPageView('tavari-ai-homepage');
  }, []);

  // Get app logo path for module
  const getModuleLogo = (moduleKey) => {
    const logoMap = {
      'phone-agent': '/App-Logos/Tavari-Phone-Agent.png',
      'reviews': '/App-Logos/Tavari-Review-Reply-AI.png',
      // Add more modules as logo files are added
    };
    return logoMap[moduleKey] || null;
  };

  const modules = [
    {
      key: 'phone-agent',
      name: 'Tavari AI Phone Agent',
      slug: 'tavari-ai-phone',
      description: 'AI that answers your phone 24/7. Never miss a call, never lose a sale.',
      icon: '📞',
      color: 'blue',
      features: [
        '24/7 phone answering',
        'Answers FAQs automatically',
        'Captures messages instantly',
        'Setup in 10 minutes'
      ],
      cta: 'Try Free Demo',
      landingUrl: '/tavari-ai-phone/landing'
    },
    {
      key: 'reviews',
      name: 'Tavari AI Review Reply',
      slug: 'review-reply-ai',
      description: 'AI-powered review response generation. Respond to every review professionally and quickly.',
      icon: '⭐',
      color: 'yellow',
      features: [
        'Generate professional responses',
        'Multiple reply options',
        'Sentiment analysis',
        'Legal compliance checks'
      ],
      cta: 'Get Started',
      landingUrl: '/review-reply-ai/landing'
    }
  ];

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
                onClick={() => trackButtonClick('get_started', 'navigation')}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4">
        {/* Hero Section */}
        <section className="relative w-full max-w-7xl mx-auto mb-20 rounded-2xl overflow-hidden">
          {/* Hero Image */}
          <div className="relative w-full h-[500px] md:h-[600px]">
            <Image
              src="/Tavari-AI-Hero-Image.png"
              alt="Tavari AI"
              fill
              className="object-cover"
              priority
            />
            {/* Buttons Overlay - Positioned in bottom third */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col sm:flex-row gap-4 justify-center items-center pb-8 md:pb-12 px-4">
              <Link
                href="/signup"
                className="bg-white text-gray-900 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 w-full sm:w-auto z-10"
                onClick={() => trackButtonClick('get_started_hero', 'hero_section')}
              >
                Get Started
              </Link>
              <Link
                href="#modules"
                className="bg-white text-gray-900 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 w-full sm:w-auto z-10"
                onClick={() => trackButtonClick('explore_modules', 'hero_section')}
              >
                Explore Modules
              </Link>
            </div>
          </div>
        </section>

        {/* Modules Section */}
        <section id="modules" className="py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
              Our AI Modules
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              Choose the AI tools that fit your business needs. Each module is designed to solve specific communication challenges.
            </p>
            
            <div className="grid md:grid-cols-2 gap-8">
              {modules.map((module) => {
                const logoPath = getModuleLogo(module.key);
                return (
                  <div
                    key={module.key}
                    className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden hover:border-blue-500 transition-all hover:shadow-xl flex flex-col"
                  >
                    {/* App Logo at Top */}
                    {logoPath && (
                      <div className="w-full h-48 flex items-center justify-center bg-gray-50">
                        <Image
                          src={logoPath}
                          alt={module.name}
                          width={400}
                          height={200}
                          className="w-full h-full object-contain"
                          style={{ padding: '1rem' }}
                        />
                      </div>
                    )}
                    
                    {/* Card Content */}
                    <div className="flex flex-col flex-1 p-8">
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                          {module.name}
                        </h3>
                        <p className="text-gray-600 mb-4">
                          {module.description}
                        </p>
                      </div>
                      
                      <ul className="space-y-2 mb-6 flex-1">
                        {module.features.map((feature, index) => (
                          <li key={index} className="flex items-center text-gray-700">
                            <svg className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                      
                      <Link
                        href={module.landingUrl}
                        className={`block w-full text-center bg-${module.color}-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-${module.color}-700 transition-colors`}
                        onClick={() => trackButtonClick(`explore_${module.key}`, 'modules_section')}
                      >
                        {module.cta} →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why Tavari Section */}
        <section className="py-20 bg-gray-50 rounded-2xl mb-16">
          <div className="max-w-4xl mx-auto text-center px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Why Choose Tavari AI?
            </h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast Setup</h3>
                <p className="text-gray-600">Get started in minutes, not days. No complex integrations required.</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Reliable</h3>
                <p className="text-gray-600">Enterprise-grade security with 99.9% uptime guarantee.</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Built for Small Business</h3>
                <p className="text-gray-600">Designed specifically for small businesses, not enterprise corporations.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-8">
              Ready to Get Started?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Choose a module and start automating your customer communications today.
            </p>
            <Link
              href="/signup"
              className="inline-block bg-white text-blue-600 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              onClick={() => trackButtonClick('get_started_final', 'final_cta_section')}
            >
              Get Started Now
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 py-8 mt-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <Link href="/admin/login" className="flex items-center hover:opacity-90 transition-opacity" title="Admin">
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
          <p className="text-center text-xs text-gray-500 mt-4">Deployed February 12 2026 V2</p>
        </div>
      </footer>
    </div>
  );
}
