'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function useEmergencyPhone() {
  const [phone, setPhone] = useState(process.env.NEXT_PUBLIC_EMERGENCY_PHONE || '');
  useEffect(() => {
    fetch(`${API_URL}/api/v2/emergency-network/public/phone`)
      .then((r) => r.json())
      .then((d) => {
        const p = d?.phone && String(d.phone).trim() ? String(d.phone).trim() : '';
        if (p) setPhone(p);
      })
      .catch(() => {});
  }, []);
  const clean = phone.replace(/[^0-9+]/g, '');
  const e164 = clean.startsWith('+') ? clean : (clean ? `+${clean}` : '');
  return {
    phone: e164,
    telLink: e164 ? `tel:${e164}` : '#',
    smsLink: e164 ? `sms:${e164}` : '#',
  };
}

export default function EmergencyDispatchPage() {
  const { phone, telLink, smsLink } = useEmergencyPhone();

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] antialiased">
      <header className="bg-[#2c2c2c] text-white">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-[15px]">Tavari Emergency Dispatch</span>
          <div className="flex items-center gap-4">
            <Link href="/termsofservice" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Home</Link>
          </div>
        </div>
      </header>

      <section className="bg-[#2c2c2c] text-white py-12 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">24/7 Emergency Dispatch</h1>
          <p className="text-lg text-white/90 max-w-xl mx-auto mb-8">
            We connect you with licensed local professionals. One call or form—we find someone available and get you help fast.
          </p>
          {phone && (
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href={telLink}
                className="inline-flex justify-center py-4 px-8 rounded bg-[#c41e3a] hover:bg-[#a01830] text-white font-bold text-lg uppercase tracking-wide transition-colors"
              >
                Call now — 24/7
              </a>
              <a
                href={smsLink}
                className="inline-flex justify-center py-4 px-8 rounded border-2 border-white/80 text-white font-semibold hover:bg-white/15 transition-colors"
              >
                Text us
              </a>
            </div>
          )}
          {phone && <p className="mt-3 text-white/90 font-medium">{phone}</p>}
        </div>
      </section>

      <section className="py-10 px-4">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-6 text-center">Choose your service</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/emergency-plumbing"
              className="block p-6 rounded-xl bg-white border-2 border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all text-center"
            >
              <span className="text-2xl font-bold text-[#1a1a1a] block mb-2">Plumbing</span>
              <p className="text-sm text-slate-600">Leaks, clogs, no hot water, burst pipes, and more. 24/7.</p>
              <span className="inline-block mt-3 text-emerald-600 font-medium text-sm">Get help →</span>
            </Link>
            <div className="block p-6 rounded-xl bg-slate-100 border-2 border-slate-200 text-center opacity-80">
              <span className="text-2xl font-bold text-slate-500 block mb-2">HVAC</span>
              <p className="text-sm text-slate-500">Coming soon.</p>
            </div>
            <div className="block p-6 rounded-xl bg-slate-100 border-2 border-slate-200 text-center opacity-80">
              <span className="text-2xl font-bold text-slate-500 block mb-2">Other services</span>
              <p className="text-sm text-slate-500">More options coming soon.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border-t border-slate-200 py-8 px-4">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">What happens when you contact us</h2>
          <ol className="list-decimal list-inside space-y-2 text-[15px] text-slate-700 leading-relaxed">
            <li>We answer immediately (by phone or process your form)</li>
            <li>We contact available local professionals in your area</li>
            <li>You get connected with a provider—no calling multiple companies</li>
          </ol>
        </div>
      </section>

      <footer className="bg-[#2c2c2c] text-white py-6 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[13px] text-white/80">
            We are a dispatch service. We connect you with independent licensed professionals. Services are performed by third-party providers.
          </p>
          <p className="mt-3">
            <Link href="/termsofservice" className="text-white/90 hover:text-white underline text-sm">Terms of Service</Link>
            <span className="mx-2 text-white/50">|</span>
            <Link href="/" className="text-white/70 hover:text-white text-sm">Tavari</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
