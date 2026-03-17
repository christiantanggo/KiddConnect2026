'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
const CHAT_REPLY_DELAY_MS = 1100;
const CHAT_SESSION_STORAGE_KEY = 'emergency_dispatch_chat_session_id';

function getStoredChatSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredChatSessionId(id) {
  if (typeof window === 'undefined' || !id) return;
  try {
    window.localStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
  } catch (_) {}
}

async function chatIntake(sessionId, message) {
  const res = await fetch(`${API_URL}/api/v2/emergency-network/public/intake/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      message === undefined || message === ''
        ? (sessionId ? { session_id: sessionId } : {})
        : { session_id: sessionId, message }
    ),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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

export default function EmergencyDispatchPage() {
  const { phone, telLink, smsLink } = useEmergencyPhone();
  const pageContent = useWebsitePageContent('emergency-main');
  const [heroImageError, setHeroImageError] = useState(false);
  const contentRef = useRef(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => getStoredChatSessionId());
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatDelayTimerRef = useRef(null);
  const chatOverlayRef = useRef(null);
  const heroImage = (pageContent?.hero_image_url && String(pageContent.hero_image_url).trim()) || null;
  const apiHeader = (pageContent?.hero_header && String(pageContent.hero_header).trim()) || '';
  const apiSubtext = (pageContent?.hero_subtext && String(pageContent.hero_subtext).trim()) || '';
  const OLD_HEADERS = ['24/7 Emergency Dispatch', 'Need Help Right Now?'];
  const OLD_SUBTEXT = 'We connect you with licensed local professionals. One call or form—we find someone available and get you help fast.';
  const heroHeader = apiHeader && !OLD_HEADERS.includes(apiHeader) ? apiHeader : '24/7 Emergency Plumbing Dispatch – London Ontario';
  const heroSubtext = apiSubtext && apiSubtext !== OLD_SUBTEXT ? apiSubtext : 'Call our 24/7 London Ontario emergency plumbing network. One call or form—we connect you with an available plumber fast.';
  const defaultButtons = [
    { label: 'Call a London Emergency Plumber – Available 24/7', url: 'tel' },
    { label: 'Text us', url: 'sms' },
    { label: 'Request help online', url: '#form' },
  ];
  const buttons = Array.isArray(pageContent?.buttons) && pageContent.buttons.length > 0 ? pageContent.buttons : defaultButtons;
  const scrollToContent = () => contentRef.current?.scrollIntoView({ behavior: 'smooth' });

  const applyReplyAfterDelay = (reply, sessionId) => {
    if (chatDelayTimerRef.current) clearTimeout(chatDelayTimerRef.current);
    chatDelayTimerRef.current = setTimeout(() => {
      chatDelayTimerRef.current = null;
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply || '' }]);
      if (sessionId != null) {
        setChatSessionId(sessionId);
        setStoredChatSessionId(sessionId);
      }
      setChatLoading(false);
    }, CHAT_REPLY_DELAY_MS);
  };

  const openChat = () => {
    setChatOpen(true);
    if (chatMessages.length === 0) {
      setChatLoading(true);
      const sessionId = chatSessionId || getStoredChatSessionId() || null;
      chatIntake(sessionId)
        .then((data) => {
          applyReplyAfterDelay(data.reply || '', data.session_id ?? sessionId);
        })
        .catch(() => {
          applyReplyAfterDelay('Sorry, we couldn\'t load the form. Please try again or call us.', null);
        });
    }
  };

  const closeChat = (e) => {
    if (e && e.target !== chatOverlayRef.current) return;
    setChatOpen(false);
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    const text = (chatInput || '').trim();
    if (!text || chatLoading || !chatSessionId) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);
    chatIntake(chatSessionId, text)
      .then((data) => {
        applyReplyAfterDelay(data.reply || '', data.session_id ?? chatSessionId);
      })
      .catch(() => {
        applyReplyAfterDelay('Something went wrong. Please try again or call us.', chatSessionId);
      });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (!chatOpen && chatDelayTimerRef.current) {
      clearTimeout(chatDelayTimerRef.current);
      chatDelayTimerRef.current = null;
    }
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen && !chatLoading) {
      const t = setTimeout(() => chatInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [chatOpen, chatLoading, chatMessages]);

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

      {/* Hero: image from Website pages (emergency-main) or solid dark background */}
      <section className="relative min-h-[280px] w-full flex items-center justify-center">
        <div className="absolute inset-0 z-0 bg-[#2c2c2c]">
          {heroImage && (
            <img
              src={heroImage}
              alt="Emergency plumber in London Ontario fixing burst pipe"
              className="w-full h-full object-cover object-center"
              loading="eager"
              fetchPriority="high"
              onError={() => setHeroImageError(true)}
            />
          )}
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
        <div className="relative z-20 w-full max-w-[900px] mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-sm mb-3">{heroHeader}</h1>
          <p className="text-lg text-white/90 max-w-xl mx-auto mb-8">{heroSubtext}</p>
          {(phone || buttons.length > 0) && (
            <div className="flex flex-col items-center gap-3">
              {buttons.length > 0 ? (
                <>
                  {buttons.some((b) => (b.url || '').trim().toLowerCase() === 'tel') && (
                    <div className="w-full flex justify-center">
                      <a
                        href={telLink}
                        className="inline-flex justify-center py-4 px-8 rounded bg-[#c41e3a] hover:bg-[#a01830] text-white font-bold text-lg uppercase tracking-wide"
                      >
                        Call a London Emergency Plumber – Available 24/7
                      </a>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 justify-center">
                    {buttons.map((btn, i) => {
                      const url = (btn.url || '').trim().toLowerCase();
                      if (url === 'tel') return null;
                      const label = (btn.label || '').trim();
                      const isChatByUrl = url === '#form' || url.endsWith('#form');
                      const isChatByLabel = /request\s+help\s+online|help\s+online|chat|request\s+help/i.test(label);
                      const isChatButton = isChatByUrl || isChatByLabel;
                      if (isChatButton) {
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChatOpen(true); if (chatMessages.length === 0) { setChatLoading(true); chatIntake(chatSessionId || null).then((data) => { applyReplyAfterDelay(data.reply || '', data.session_id ?? chatSessionId); }).catch(() => { applyReplyAfterDelay('Sorry, we couldn\'t load the form. Please try again or call us.', null); }); } }}
                            className="inline-flex justify-center py-4 px-8 rounded border-2 border-white/80 font-semibold hover:bg-white/15 text-white text-lg transition-colors min-w-[220px]"
                          >
                            {label || 'Request help online'}
                          </button>
                        );
                      }
                      return (
                        <a
                          key={i}
                          href={url === 'sms' ? smsLink : (btn.url || '#')}
                          className="inline-flex justify-center py-4 px-8 rounded border-2 border-white/80 font-semibold hover:bg-white/15 text-white text-lg transition-colors min-w-[220px]"
                        >
                          {label || 'Link'}
                        </a>
                      );
                    })}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChatOpen(true); if (chatMessages.length === 0) { setChatLoading(true); chatIntake(null).then((data) => { applyReplyAfterDelay(data.reply || '', data.session_id ?? null); }).catch(() => { applyReplyAfterDelay('Sorry, we couldn\'t load the form. Please try again or call us.', null); }); } }}
                  className="inline-flex justify-center py-4 px-8 rounded border-2 border-white/80 text-white font-semibold text-lg hover:bg-white/15 transition-colors"
                >
                  Request help online
                </button>
              )}
            </div>
          )}
          {phone && <p className="mt-3 text-white/90 font-medium">{phone}</p>}
        </div>
      </section>

      <section ref={contentRef} className="py-10 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => { setChatOpen(true); if (chatMessages.length === 0) { setChatLoading(true); chatIntake(null).then((d) => applyReplyAfterDelay(d.reply || '', d.session_id ?? null)).catch(() => applyReplyAfterDelay('Sorry, we couldn\'t load the form. Please try again or call us.', null)); } }}
              className="inline-flex items-center justify-center py-3 px-6 rounded-lg bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-700 transition-colors"
            >
              Request help online
            </button>
          </div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-6 text-center">Choose your service</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
          </div>
        </div>
      </section>

      <section className="bg-white border-t border-slate-200 py-8 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-lg font-bold text-[#1a1a1a] mb-4">How Our Emergency Dispatch Works</h2>
          <ol className="list-decimal list-inside space-y-2 text-[15px] text-slate-700 leading-relaxed inline-block text-left">
            <li>We answer immediately (by phone or process your form)</li>
            <li>We contact available local professionals in your area</li>
            <li>You get connected with a provider—no calling multiple companies</li>
          </ol>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-slate-50">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-4">Emergency Plumbing Services in London Ontario</h2>
          <p className="text-[15px] text-slate-700 leading-relaxed mb-4">
            If you are dealing with a burst pipe, clogged drain, water heater failure, or another plumbing emergency, our London emergency dispatch network can connect you with available licensed plumbers quickly.
          </p>
          <p className="text-[15px] text-slate-700 leading-relaxed mb-4">
            Our system contacts available plumbers in your area and dispatches the first professional who can take the job. Plumbers in London Ontario are standing by 24/7.
          </p>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-3 mt-6">Common Plumbing Emergencies We Handle</h2>
          <ul className="list-disc list-inside space-y-1 text-[15px] text-slate-700 mb-4 inline-block text-left">
            <li>Burst pipes</li>
            <li>Basement flooding</li>
            <li>Drain blockages</li>
            <li>No hot water</li>
            <li>Water heater leaks</li>
          </ul>
          <p className="text-[15px] text-slate-700 leading-relaxed">
            Available 24 hours a day, 7 days a week in London ON. Call our London Ontario dispatch line for fast connection to a local plumber.
          </p>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-white">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-4">Emergency Plumbing Help in London Ontario</h2>
          <p className="text-[15px] text-slate-700 leading-relaxed mb-4">
            People searching for emergency plumbing services in London Ontario often need help with problems like:
          </p>
          <ul className="list-disc list-inside space-y-1 text-[15px] text-slate-700 mb-4 inline-block text-left">
            <li>Burst pipe repair</li>
            <li>Basement flooding</li>
            <li>Clogged drains</li>
            <li>Sewer backups</li>
            <li>Hot water tank failure</li>
            <li>Leaking pipes</li>
          </ul>
          <p className="text-[15px] text-slate-700 leading-relaxed mb-4">
            Our dispatch service connects you with available plumbers in London Ontario who can respond quickly.
          </p>
          <p className="text-[15px] text-slate-700 leading-relaxed mb-2">
            Need help with a burst pipe? <Link href="/burst-pipe-repair-london" className="text-emerald-600 hover:underline font-medium">Burst Pipe Repair London</Link>.
            <Link href="/drain-cleaning-london" className="text-emerald-600 hover:underline font-medium ml-1">Drain Cleaning London</Link>.
            <Link href="/sewer-backup-london" className="text-emerald-600 hover:underline font-medium ml-1">Sewer Backup London</Link>.
            <Link href="/water-heater-emergency-london" className="text-emerald-600 hover:underline font-medium ml-1">Water Heater Emergency London</Link>.
          </p>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-slate-50">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-4">Areas We Serve</h2>
          <p className="text-[15px] text-slate-700 mb-4">Our London Ontario emergency plumbing dispatch covers the region:</p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[15px] text-slate-700 font-medium">
            <li>London</li>
            <li>St Thomas</li>
            <li>Strathroy</li>
            <li>Dorchester</li>
            <li>Komoka</li>
            <li>Ilderton</li>
            <li>Delaware</li>
          </ul>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-white">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-4">Find us – London Ontario</h2>
          <p className="text-[15px] text-slate-700 mb-6">Our service locations in London ON:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-left">
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <div className="aspect-video">
                <iframe
                  title="51 Adswood Road London Ontario"
                  src="https://www.google.com/maps?q=51+Adswood+Road+London+Ontario&output=embed"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: 180 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="p-3">
                <a href="https://www.google.com/maps/search/?api=1&query=51+Adswood+Road+London+Ontario" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-medium text-sm">51 Adswood Road, London Ontario</a>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <div className="aspect-video">
                <iframe
                  title="15 Shepherd Ave London Ontario"
                  src="https://www.google.com/maps?q=15+Shepherd+Ave+London+Ontario&output=embed"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: 180 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="p-3">
                <a href="https://www.google.com/maps/search/?api=1&query=15+Shepherd+Ave+London+Ontario" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-medium text-sm">15 Shepherd Ave, London Ontario</a>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <div className="aspect-video">
                <iframe
                  title="539 First Street London Ontario"
                  src="https://www.google.com/maps?q=539+First+Street+London+Ontario&output=embed"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: 180 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="p-3">
                <a href="https://www.google.com/maps/search/?api=1&query=539+First+Street+London+Ontario" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-medium text-sm">539 First Street, London Ontario</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-slate-50">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-6">Customer Reviews</h2>
          <div className="space-y-4 inline-block text-left">
            <blockquote className="border-l-4 border-emerald-600 pl-4 py-2 text-slate-700">
              <span className="text-amber-500 font-medium" aria-hidden="true">★★★★★</span>
              <p className="italic mt-1">&ldquo;Fast service and they connected us with a plumber immediately.&rdquo; – Sarah L.</p>
            </blockquote>
            <blockquote className="border-l-4 border-emerald-600 pl-4 py-2 text-slate-700">
              <span className="text-amber-500 font-medium" aria-hidden="true">★★★★★</span>
              <p className="italic mt-1">&ldquo;Connected us with a plumber within minutes.&rdquo; – Mark D.</p>
            </blockquote>
            <blockquote className="border-l-4 border-emerald-600 pl-4 py-2 text-slate-700">
              <span className="text-amber-500 font-medium" aria-hidden="true">★★★★★</span>
              <p className="italic mt-1">&ldquo;Fast response during a basement flood.&rdquo; – Jennifer K.</p>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-white">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-6">Frequently Asked Questions</h2>
          <dl className="space-y-6 inline-block text-left">
            <div>
              <dt className="font-semibold text-[#1a1a1a] mb-1">How quickly can a plumber arrive?</dt>
              <dd className="text-slate-700 text-[15px]">Our dispatch system connects you with the first available plumber in London Ontario.</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#1a1a1a] mb-1">Is this a 24 hour service?</dt>
              <dd className="text-slate-700 text-[15px]">Yes. Our emergency dispatch network operates 24/7.</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#1a1a1a] mb-1">Do you charge for dispatch?</dt>
              <dd className="text-slate-700 text-[15px]">No. Customers are connected directly with local service providers.</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="bg-[#2c2c2c] text-white py-6 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[13px] text-white/80">
            We are a dispatch service for London Ontario. We connect you with independent licensed professionals. Services are performed by third-party providers.
          </p>
          <p className="mt-3">
            <Link href="/termsofservice" className="text-white/90 hover:text-white underline text-sm">Terms of Service</Link>
            <span className="mx-2 text-white/50">|</span>
            <Link href="/" className="text-white/70 hover:text-white text-sm">Tavari</Link>
          </p>
        </div>
      </footer>

      {/* Chat panel: same flow as SMS intake — no SMS sent; dispatch only */}
      {chatOpen && (
        <div
          ref={chatOverlayRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
          onClick={closeChat}
          role="dialog"
          aria-modal="true"
          aria-label="Request help chat"
        >
          <div className="w-full max-h-[90vh] sm:max-w-md sm:rounded-xl bg-white shadow-xl flex flex-col border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <span className="font-semibold text-[#1a1a1a]">Request help online</span>
              <button type="button" onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-slate-200 text-slate-600" aria-label="Close">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[50vh]">
              {chatMessages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-3 py-2.5 bg-slate-100 text-slate-800 text-sm" aria-label="Typing">
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400" style={{ animation: 'typing 1.4s ease-in-out infinite', animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-slate-400" style={{ animation: 'typing 1.4s ease-in-out infinite', animationDelay: '200ms' }} />
                      <span className="w-2 h-2 rounded-full bg-slate-400" style={{ animation: 'typing 1.4s ease-in-out infinite', animationDelay: '400ms' }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-4 border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message…"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={chatLoading || !chatSessionId}
                  autoFocus
                  aria-label="Chat message"
                />
                <button type="submit" disabled={chatLoading || !chatSessionId || !chatInput?.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none">
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
