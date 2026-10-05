'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { trackPageView, trackButtonClick } from '@/lib/analytics';
import { APP_DISPLAY_NAME, CONTACT_EMAIL } from '@/lib/appBrand';

export default function HomePage() {
  useEffect(() => {
    trackPageView('home');
  }, []);

  return (
    <div className="public-page relative min-h-screen flex flex-col overflow-hidden bg-stone-950 text-stone-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 35%, rgba(217, 168, 92, 0.16), transparent 70%), radial-gradient(ellipse 80% 60% at 50% 110%, rgba(120, 72, 32, 0.25), transparent 70%)',
        }}
      />

      <nav className="relative z-10 shrink-0">
        <div className="mx-auto max-w-6xl px-6 py-6 flex justify-end">
          <Link
            href="/login"
            className="text-xs uppercase tracking-[0.25em] text-stone-400 hover:text-amber-200 transition-colors"
            onClick={() => trackButtonClick('login', 'home_nav')}
          >
            Log in
          </Link>
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-16 text-center">
        <div className="mb-10 flex h-24 w-24 items-center justify-center rounded-full border border-amber-200/40 bg-stone-900/60 shadow-[0_0_60px_-15px_rgba(217,168,92,0.5)]">
          <span className="font-serif text-3xl font-bold tracking-wide text-amber-100">LF</span>
        </div>

        <h1 className="font-serif text-5xl sm:text-7xl md:text-8xl font-bold tracking-tight text-stone-50">
          {APP_DISPLAY_NAME}
        </h1>

        <div className="my-8 flex items-center gap-4" aria-hidden="true">
          <span className="h-px w-12 bg-amber-200/40" />
          <span className="h-1.5 w-1.5 rotate-45 bg-amber-200/70" />
          <span className="h-px w-12 bg-amber-200/40" />
        </div>

        <p className="text-sm uppercase tracking-[0.35em] text-stone-400">Made together</p>

        {CONTACT_EMAIL && (
          <section className="mt-20 max-w-lg">
            <h2 className="font-serif text-2xl text-stone-100 mb-3">Get in touch</h2>
            <p className="text-stone-400 mb-8">
              Questions, ideas, or just saying hello &mdash; we&apos;d love to hear from you.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-3 rounded-full border border-amber-200/50 px-8 py-3.5 text-amber-100 hover:bg-amber-200 hover:text-stone-950 transition-colors"
              onClick={() => trackButtonClick('contact_email', 'home_contact')}
            >
              <Mail className="h-4 w-4" />
              {CONTACT_EMAIL}
            </a>
          </section>
        )}
      </main>

      <footer className="relative z-10 shrink-0 border-t border-stone-800/80">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-stone-500">
          <span>&copy; {new Date().getFullYear()} {APP_DISPLAY_NAME}</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-amber-200 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-amber-200 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
