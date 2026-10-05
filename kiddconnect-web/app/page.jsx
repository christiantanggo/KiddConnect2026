'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Clapperboard, Smile, HelpCircle, Film } from 'lucide-react';
import { trackPageView, trackButtonClick } from '@/lib/analytics';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';

const PROJECTS = [
  { icon: Smile, title: 'Dad Joke Studio', text: 'Turn our worst jokes into Shorts.' },
  { icon: HelpCircle, title: 'Kid Quiz', text: 'Quiz videos the kids help make.' },
  { icon: Clapperboard, title: 'Orbix Network', text: 'Riddles, trivia, and brain teasers.' },
  { icon: Film, title: 'Movie Review', text: 'Family movie nights, reviewed.' },
];

export default function HomePage() {
  useEffect(() => {
    trackPageView('home');
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <nav className="border-b border-gray-200 bg-white shrink-0">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl md:text-3xl font-bold text-blue-600 tracking-tight">
            {APP_DISPLAY_NAME}
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            onClick={() => trackButtonClick('login', 'home_nav')}
          >
            Log in
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        <section className="container mx-auto px-4 pt-20 pb-12 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Welcome to {APP_DISPLAY_NAME}</h1>
          <p className="text-lg text-gray-600 mb-10">
            Our family&apos;s home for creative projects &mdash; the videos we make together and the tools we build to
            make them.
          </p>
          <Link
            href="/login"
            className="inline-block bg-blue-600 text-white px-10 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
            onClick={() => trackButtonClick('login', 'home_hero')}
          >
            Log in
          </Link>
        </section>

        <section className="container mx-auto px-4 pb-20 max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROJECTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-4 rounded-lg border border-gray-200 p-5">
                <Icon className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-semibold text-gray-900">{title}</h2>
                  <p className="text-sm text-gray-600">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-gray-50 py-8 shrink-0">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-600">
          <span>&copy; {new Date().getFullYear()} {APP_DISPLAY_NAME}</span>
          <div className="flex space-x-6">
            <Link href="/privacy" className="hover:text-blue-600 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-blue-600 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
