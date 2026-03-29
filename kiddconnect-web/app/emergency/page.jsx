'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

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

const SERVICE_DROPDOWN = [
  { value: 'Plumbing', label: 'Plumbing' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'Gas', label: 'Gas' },
  { value: 'Other', label: 'Other' },
];
const URGENCY_OPTIONS = [
  { value: 'Immediate Emergency', label: 'Immediate Emergency' },
  { value: 'Same Day', label: 'Same Day' },
  { value: 'Schedule Service', label: 'Schedule Service' },
];

export default function EmergencyPage() {
  const { phone, telLink, smsLink } = useEmergencyPhone();
  const pageContent = useWebsitePageContent('emergency-main');
  const formRef = useRef(null);
  const [heroImageError, setHeroImageError] = useState(false);
  const heroImage = (pageContent?.hero_image_url && String(pageContent.hero_image_url).trim()) || null;
  const heroHeader = pageContent?.hero_header ?? 'Need Help Right Now?';
  const heroSubtext = pageContent?.hero_subtext ?? 'Call our 24/7 local emergency network.';
  const buttons = Array.isArray(pageContent?.buttons) && pageContent.buttons.length > 0 ? pageContent.buttons : [
    { label: 'CALL NOW — AVAILABLE 24/7', url: 'tel' },
    { label: 'Text Us', url: 'sms' },
    { label: 'Request Help Online', url: '#form' },
  ];
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    service_type: '',
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
          service_type: form.service_type || 'Other',
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
      {/* 1) TOP BAR */}
      <header className="bg-[#2c2c2c] text-white">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-[15px]">24/7 Emergency & Priority Service</span>
          <Link href="/" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Home</Link>
        </div>
      </header>

      {/* 2) HERO — full-bleed image with overlay content */}
      <section className="relative min-h-[85vh] w-full flex items-center justify-center sm:justify-end">
        {/* Background image (fallback bg if image missing or loading) */}
        <div className="absolute inset-0 z-0 bg-[#2c2c2c]">
          {heroImage && (
            <img
              src={heroImage}
              alt=""
              className="w-full h-full object-cover object-top"
              onError={() => setHeroImageError(true)}
            />
          )}
          {heroImageError && heroImage && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#2c2c2c] text-white/70 text-sm text-center px-4">
              <span>Hero image could not be loaded.</span>
            </div>
          )}
        </div>
        {/* Bottom gradient: fade image into white page background */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, #ffffff 0%, rgba(255,255,255,0.4) 25%, transparent 50%)',
          }}
        />
        {/* Right-side dark gradient only behind text (readability) */}
        <div
          className="absolute right-0 top-0 bottom-0 w-full sm:w-[55%] max-w-[520px] z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to left, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
          }}
        />
        {/* Overlay content — right aligned */}
        <div className="relative z-20 w-full max-w-[900px] mx-auto px-4 py-8 sm:pr-6 sm:pl-4 flex flex-col items-center sm:items-end text-center sm:text-right">
          <h1 className="text-[28px] sm:text-[36px] font-bold leading-tight text-white drop-shadow-sm mb-2">
            {heroHeader}
          </h1>
          <p className="text-[18px] sm:text-[22px] font-semibold text-white/95 mb-6 max-w-[420px]">
            {heroSubtext}
          </p>

          {/* CTAs from config */}
          {buttons.map((btn, i) => {
            const url = (btn.url || '').trim().toLowerCase();
            const isPrimary = i === 0;
            if (url === '#form') {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={scrollToForm}
                  className={isPrimary ? 'w-full sm:w-auto min-w-[280px] inline-flex justify-center py-4 px-6 rounded bg-[#c41e3a] hover:bg-[#a01830] text-white font-bold text-[17px] sm:text-[18px] uppercase tracking-wide transition-colors border-2 border-[#c41e3a]' : 'inline-block py-2.5 px-5 rounded border-2 border-white/80 text-white text-[14px] font-medium hover:bg-white/15 transition-colors'}
                >
                  {btn.label || 'Request Help Online'}
                </button>
              );
            }
            const href = url === 'tel' ? telLink : url === 'sms' ? smsLink : (btn.url || '#');
            return (
              <a
                key={i}
                href={href}
                className={isPrimary ? 'w-full sm:w-auto min-w-[280px] inline-flex justify-center py-4 px-6 rounded bg-[#c41e3a] hover:bg-[#a01830] text-white font-bold text-[17px] sm:text-[18px] uppercase tracking-wide transition-colors border-2 border-[#c41e3a]' : 'inline-block py-2.5 px-5 rounded border-2 border-white/80 text-white text-[14px] font-medium hover:bg-white/15 transition-colors'}
              >
                {btn.label || (url === 'tel' ? 'Call' : url === 'sms' ? 'Text' : 'Link')}
              </a>
            );
          })}
          {buttons.length > 0 && phone && (
            <p className="text-white/95 font-semibold text-[16px] mt-2">{phone}</p>
          )}

          {/* Secondary buttons row */}
          {buttons.length > 1 && (
            <div className="flex flex-wrap gap-3 mt-5 justify-center sm:justify-end">
              {buttons.slice(1).map((btn, i) => {
                const url = (btn.url || '').trim().toLowerCase();
                if (url === '#form') {
                  return (
                    <button key={i} type="button" onClick={scrollToForm} className="inline-block py-2.5 px-5 rounded border-2 border-white/80 text-white text-[14px] font-medium hover:bg-white/15 transition-colors">
                      {btn.label || 'Request Help Online'}
                    </button>
                  );
                }
                const href = url === 'tel' ? telLink : url === 'sms' ? smsLink : (btn.url || '#');
                return (
                  <a key={i} href={href} className="inline-block py-2.5 px-5 rounded border-2 border-white/80 text-white text-[14px] font-medium hover:bg-white/15 transition-colors">
                    {btn.label || 'Link'}
                  </a>
                );
              })}
            </div>
          )}

          {/* Trust line */}
          <p className="mt-6 text-[14px] text-white/90 font-medium sm:text-right">
            Licensed • Insured • Local Professionals
          </p>
        </div>
      </section>

      {/* 3) LOCAL TRUST BAR */}
      <section className="bg-[#1a1a1a] text-white py-3 px-4">
        <div className="max-w-[900px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-center sm:text-left text-[14px]">
          <span className="font-semibold">Serving London • Windsor • Surrounding Areas</span>
          <span className="text-white/85">Average connection time: Under 5 minutes</span>
        </div>
      </section>

      {/* 4) WHAT HAPPENS WHEN YOU CALL (no icons) */}
      <section className="bg-white border-t border-[#ddd] py-6 px-4">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-[18px] font-bold text-[#1a1a1a] mb-4">What Happens When You Call</h2>
          <ol className="list-decimal list-inside space-y-2 text-[15px] text-[#333] leading-relaxed">
            <li>We answer immediately</li>
            <li>We contact available local professionals</li>
            <li>You get connected fast</li>
          </ol>
        </div>
      </section>

      {/* 5) COMMON EMERGENCY & PRIORITY SERVICES */}
      <section className="bg-[#f5f5f5] py-6 px-4 border-t border-[#ddd]">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-[18px] font-bold text-[#1a1a1a] mb-4">Common Emergency & Priority Services</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px] text-[#333]">
            <li>• Burst pipes & major leaks</li>
            <li>• Basement flooding / water issues</li>
            <li>• No heat / furnace not working</li>
            <li>• No hot water</li>
            <li>• Gas line concerns</li>
            <li>• Urgent plumbing repairs</li>
            <li>• Urgent HVAC repairs</li>
            <li>• Scheduled service requests (non-emergency)</li>
          </ul>
        </div>
      </section>

      {/* 6) WHY HOMEOWNERS CALL US */}
      <section className="bg-white py-6 px-4 border-t border-[#ddd]">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-[18px] font-bold text-[#1a1a1a] mb-4">Why Homeowners Call Us</h2>
          <ul className="space-y-2 text-[15px] text-[#333] leading-relaxed">
            <li>• Skip calling multiple companies</li>
            <li>• No voicemail or waiting lists</li>
            <li>• We locate available professionals immediately</li>
            <li>• One call gets help started</li>
          </ul>
        </div>
      </section>

      {/* 7) REQUEST HELP FORM */}
      <section ref={formRef} className="bg-[#f5f5f5] py-6 px-4 border-t border-[#ddd]">
        <div className="max-w-[560px] mx-auto">
          <h2 className="text-[18px] font-bold text-[#1a1a1a] mb-4">Request Help Online</h2>
          <div className="bg-white border border-[#ccc] rounded p-5">
            {submitted ? (
              <p className="text-[#1a1a1a] font-medium text-[15px]">
                Thanks — we&apos;re contacting available professionals now. You may receive a call or text shortly.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800 text-sm">{error}</div>
                )}
                <div>
                  <label className="block text-[14px] font-medium text-[#333] mb-1">Name</label>
                  <input
                    type="text"
                    className="block w-full border border-[#999] rounded px-3 py-2 text-[15px] bg-white"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#333] mb-1">Phone Number <span className="text-red-600">*</span></label>
                  <input
                    type="tel"
                    required
                    className="block w-full border border-[#999] rounded px-3 py-2 text-[15px] bg-white"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#333] mb-1">Service Type</label>
                  <select
                    className="block w-full border border-[#999] rounded px-3 py-2 text-[15px] bg-white"
                    value={form.service_type}
                    onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    {SERVICE_DROPDOWN.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#333] mb-1">Address or Postal Code</label>
                  <input
                    type="text"
                    className="block w-full border border-[#999] rounded px-3 py-2 text-[15px] bg-white"
                    value={form.address_or_postal_code}
                    onChange={(e) => setForm((f) => ({ ...f, address_or_postal_code: e.target.value }))}
                    placeholder="Street, city, or postal code"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#333] mb-1">Describe the issue</label>
                  <textarea
                    rows={3}
                    className="block w-full border border-[#999] rounded px-3 py-2 text-[15px] bg-white resize-none"
                    value={form.issue_description}
                    onChange={(e) => setForm((f) => ({ ...f, issue_description: e.target.value }))}
                    placeholder="Brief description"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#333] mb-1">Urgency Level</label>
                  <select
                    className="block w-full border border-[#999] rounded px-3 py-2 text-[15px] bg-white"
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
                  className="w-full py-3 rounded bg-[#2c2c2c] hover:bg-[#1a1a1a] disabled:opacity-60 text-white font-bold text-[15px] uppercase transition-colors"
                >
                  {loading ? 'Submitting…' : 'CONNECT ME WITH HELP'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 8) TRUST + LEGAL */}
      <footer className="bg-white border-t border-[#ddd] py-5 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[13px] text-[#555] leading-relaxed">
            We connect homeowners with independent licensed and insured local professionals. Services are performed by third-party contractors.
          </p>
          <p className="mt-3 text-[12px] text-[#888]">
            <Link href="/" className="hover:text-[#555]">Powered by Tavari</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
