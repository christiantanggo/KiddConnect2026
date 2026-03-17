'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

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

function useWebsitePageContent(pageKey) {
  const [content, setContent] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v2/emergency-network/public/website-page/${pageKey}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const raw = d && typeof d === 'object' ? d : null;
        const contentObj = raw && raw.content !== undefined ? raw.content : raw;
        setContent(contentObj && typeof contentObj === 'object' ? contentObj : null);
      })
      .catch(() => setContent(null));
  }, [pageKey]);
  return content;
}

const URGENCY_OPTIONS = [
  { value: 'Immediate Emergency', label: 'Immediate Emergency' },
  { value: 'Same Day', label: 'Same Day' },
  { value: 'Schedule Service', label: 'Schedule Service' },
];

export default function EmergencyPlumbingPage() {
  const { phone, telLink, smsLink } = useEmergencyPhone();
  const pageContent = useWebsitePageContent('plumbing-main');
  const formRef = useRef(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [heroImageError, setHeroImageError] = useState(false);
  const heroImage = (pageContent?.hero_image_url && String(pageContent.hero_image_url).trim()) || null;
  const heroHeader = pageContent?.hero_header ?? '24/7 Emergency Plumbing';
  const heroSubtext = pageContent?.hero_subtext ?? 'Leaks, clogs, no hot water, burst pipes—we connect you with licensed local plumbers. Call or submit the form below.';
  const buttons = Array.isArray(pageContent?.buttons) && pageContent.buttons.length > 0 ? pageContent.buttons : [
    { label: 'Call now — 24/7', url: 'tel' },
    { label: 'Text us', url: 'sms' },
    { label: 'Request help online', url: '#form' },
  ];
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address_or_postal_code: '',
    issue_description: '',
    urgency_level: 'Same Day',
  });

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/emergency-network/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || null,
          phone: form.phone.trim(),
          service_type: 'Plumbing',
          address_or_postal_code: form.address_or_postal_code.trim() || null,
          issue_description: form.issue_description.trim() || null,
          urgency_level: form.urgency_level,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again or call us.');
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError('Network error. Please try again or call us.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] antialiased">
      <header className="bg-[#2c2c2c] text-white">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/emergencydispatch" className="text-white/70 hover:text-white text-sm">Emergency Dispatch</Link>
            <span className="text-white/50">/</span>
            <span className="font-semibold text-[15px]">Plumbing</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/termsofservice" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Home</Link>
          </div>
        </div>
      </header>

      {/* Hero: image from Website pages (plumbing-main) or solid background — matches admin Settings → Website pages */}
      <section className="relative min-h-[280px] w-full flex items-center justify-center">
        <div className="absolute inset-0 z-0 bg-[#1a3a2a]">
          {heroImage && (
            <img
              src={heroImage}
              alt=""
              className="w-full h-full object-cover object-center"
              onError={() => setHeroImageError(true)}
            />
          )}
          {heroImageError && heroImage && (
            <div className="absolute inset-0 bg-[#1a3a2a]" />
          )}
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
        <div className="relative z-20 w-full max-w-[900px] mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-sm mb-3">{heroHeader}</h1>
          <p className="text-lg text-white/90 max-w-xl mx-auto mb-8">{heroSubtext}</p>
          {phone && buttons.length > 0 && (
            <div className="flex flex-wrap gap-3 justify-center">
              {buttons.map((btn, i) => {
                const url = (btn.url || '').trim().toLowerCase();
                if (url === '#form') {
                  return (
                    <button key={i} type="button" onClick={scrollToForm} className="inline-flex justify-center py-4 px-8 rounded border-2 border-white/80 text-white font-semibold hover:bg-white/15 transition-colors">
                      {btn.label || 'Request help online'}
                    </button>
                  );
                }
                const href = url === 'tel' ? telLink : url === 'sms' ? smsLink : (btn.url || '#');
                return (
                  <a key={i} href={href} className={`inline-flex justify-center py-4 px-8 rounded text-white font-bold text-lg transition-colors ${i === 0 ? 'bg-[#c41e3a] hover:bg-[#a01830] uppercase tracking-wide' : 'border-2 border-white/80 font-semibold hover:bg-white/15'}`}>
                    {btn.label || 'Link'}
                  </a>
                );
              })}
            </div>
          )}
          {phone && <p className="mt-3 text-white/90 font-medium">{phone}</p>}
        </div>
      </section>

      <section className="bg-white py-6 px-4 border-t border-slate-200">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Common plumbing emergencies</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px] text-slate-700">
            <li>• Burst pipes & major leaks</li>
            <li>• Basement flooding / water backup</li>
            <li>• No hot water</li>
            <li>• Clogged drains & toilets</li>
            <li>• Sewer line issues</li>
            <li>• Water heater problems</li>
            <li>• Frozen pipes</li>
            <li>• Scheduled plumbing (non-emergency)</li>
          </ul>
        </div>
      </section>

      <section ref={formRef} className="bg-[#f5f5f5] py-8 px-4 border-t border-slate-200">
        <div className="max-w-[560px] mx-auto">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">Request help online</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            {submitted ? (
              <p className="text-[#1a1a1a] font-medium text-[15px]">
                Thanks — we&apos;re contacting available plumbers now. You may receive a call or text shortly.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 text-sm">{error}</div>
                )}
                <div>
                  <label className="block text-[14px] font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-[15px] bg-white"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-slate-700 mb-1">Phone number <span className="text-red-600">*</span></label>
                  <input
                    type="tel"
                    required
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-[15px] bg-white"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-slate-700 mb-1">Address or postal code</label>
                  <input
                    type="text"
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-[15px] bg-white"
                    value={form.address_or_postal_code}
                    onChange={(e) => setForm((f) => ({ ...f, address_or_postal_code: e.target.value }))}
                    placeholder="Street, city, or postal code"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-slate-700 mb-1">Describe the issue</label>
                  <textarea
                    rows={3}
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-[15px] bg-white resize-none"
                    value={form.issue_description}
                    onChange={(e) => setForm((f) => ({ ...f, issue_description: e.target.value }))}
                    placeholder="e.g. Burst pipe in basement, no hot water, clogged drain"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-slate-700 mb-1">Urgency</label>
                  <select
                    className="block w-full border border-slate-300 rounded-lg px-3 py-2 text-[15px] bg-white"
                    value={form.urgency_level}
                    onChange={(e) => setForm((f) => ({ ...f, urgency_level: e.target.value }))}
                  >
                    {URGENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-[#1a3a2a] hover:bg-[#0f2a1d] disabled:opacity-60 text-white font-bold text-[15px] uppercase transition-colors"
                >
                  {loading ? 'Submitting…' : 'Connect me with a plumber'}
                </button>
              </form>
            )}
          </div>
          <p className="mt-3 text-[13px] text-slate-500">
            By submitting you agree to our <Link href="/termsofservice" className="text-emerald-700 hover:underline">Terms of Service</Link>. We are a dispatch service and connect you with independent providers.
          </p>
        </div>
      </section>

      <footer className="bg-[#2c2c2c] text-white py-6 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[13px] text-white/80">
            We are a dispatch service only. We connect you with independent licensed plumbers. Work is performed by third-party providers.
          </p>
          <p className="mt-3">
            <Link href="/termsofservice" className="text-white/90 hover:text-white underline text-sm">Terms of Service</Link>
            <span className="mx-2 text-white/50">|</span>
            <Link href="/emergencydispatch" className="text-white/70 hover:text-white text-sm">All services</Link>
            <span className="mx-2 text-white/50">|</span>
            <Link href="/" className="text-white/70 hover:text-white text-sm">Tavari</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
