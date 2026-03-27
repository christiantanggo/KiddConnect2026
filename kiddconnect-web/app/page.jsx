'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trackPageView, trackButtonClick } from '@/lib/analytics';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';

const IS_DEFAULT_TAVARI_BRAND = APP_DISPLAY_NAME === 'Tavari Ai';

export default function TavariAILandingPage() {
  useEffect(() => {
    trackPageView('tavari-ai-homepage');
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50 shrink-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center">
              {IS_DEFAULT_TAVARI_BRAND ? (
                <Image
                  src="/tavari-logo.png"
                  alt={APP_DISPLAY_NAME}
                  width={400}
                  height={114}
                  className="h-28 w-auto"
                  style={{ width: 'auto', height: '7rem' }}
                  priority
                />
              ) : (
                <span className="text-2xl md:text-3xl font-bold text-blue-600 tracking-tight">{APP_DISPLAY_NAME}</span>
              )}
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <Link
          href="/login"
          className="bg-blue-600 text-white px-12 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
          onClick={() => trackButtonClick('get_started', 'home_hero')}
        >
          Get Started
        </Link>
      </main>

      <footer className="border-t border-gray-200 bg-gray-50 py-8 mt-auto shrink-0">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <Link href="/admin/login" className="flex items-center hover:opacity-90 transition-opacity" title="Admin">
                {IS_DEFAULT_TAVARI_BRAND ? (
                  <Image
                    src="/tavari-logo.png"
                    alt={APP_DISPLAY_NAME}
                    width={400}
                    height={114}
                    className="h-28 w-auto opacity-80"
                    style={{ width: 'auto', height: '7rem' }}
                  />
                ) : (
                  <span className="text-xl font-bold text-blue-600 opacity-90">{APP_DISPLAY_NAME}</span>
                )}
              </Link>
            </div>
            <div className="flex space-x-6 text-sm text-gray-600">
              <Link href="/legal/privacy" className="hover:text-blue-600 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/legal/terms" className="hover:text-blue-600 transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
