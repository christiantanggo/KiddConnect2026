'use client';

/**
 * Public last-mile delivery landing: delivery config (branding + CMS), form → POST /delivery-network/request, chat → delivery web intake.
 */
import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
const CHAT_REPLY_DELAY_MS = 1100;
const CHAT_SESSION_STORAGE_KEY = 'delivery_dispatch_chat_session_id';

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
  const res = await fetch(`${API_URL}/api/v2/delivery-network/public/intake/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      message === undefined || message === ''
        ? sessionId
          ? { session_id: sessionId }
          : {}
        : { session_id: sessionId, message },
    ),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function useDeliveryPhone() {
  const [phone, setPhone] = useState('');
  useEffect(() => {
    fetch(`${API_URL}/api/v2/delivery-network/public/phone`)
      .then((r) => r.json())
      .then((d) => {
        const p = d?.phone && String(d.phone).trim() ? String(d.phone).trim() : '';
        if (p) setPhone(p);
      })
      .catch(() => {});
  }, []);
  const clean = phone.replace(/[^0-9+]/g, '');
  const e164 = clean.startsWith('+') ? clean : clean ? `+${clean}` : '';
  return {
    phone: e164,
    telLink: e164 ? `tel:${e164}` : '#',
    smsLink: e164 ? `sms:${e164}` : '#',
  };
}

function useDeliveryBranding() {
  const [name, setName] = useState('Last-Mile Delivery');
  useEffect(() => {
    fetch(`${API_URL}/api/v2/delivery-network/public/branding`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const n = d?.service_line_name && String(d.service_line_name).trim();
        if (n) setName(n);
      })
      .catch(() => {});
  }, []);
  return name;
}

function useWebsitePageContent(pageKey) {
  const [content, setContent] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v2/delivery-network/public/website-page/${pageKey}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = d && typeof d === 'object' ? d : null;
        const contentObj = raw && raw.content !== undefined ? raw.content : raw;
        setContent(contentObj && typeof contentObj === 'object' ? contentObj : null);
      })
      .catch(() => setContent(null));
  }, [pageKey]);
  return content;
}

const FALLBACK_HEADER = 'Package pickup & delivery';
const FALLBACK_SUB =
  'Schedule a pickup and delivery online or by phone. You will receive a reference number and updates as your shipment moves.';

function DeliveryDispatchContent() {
  const searchParams = useSearchParams();
  const businessIdParam = searchParams.get('business_id')?.trim() || '';

  const { phone, telLink, smsLink } = useDeliveryPhone();
  const serviceLineName = useDeliveryBranding();
  const pageContent = useWebsitePageContent('delivery-main');

  const [heroImageError, setHeroImageError] = useState(false);
  const contentRef = useRef(null);
  const formRef = useRef(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => getStoredChatSessionId());
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatDelayTimerRef = useRef(null);
  const chatOverlayRef = useRef(null);

  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPickup, setFormPickup] = useState('');
  const [formDelivery, setFormDelivery] = useState('');
  const [formRecipient, setFormRecipient] = useState('');
  const [formRecipientPhone, setFormRecipientPhone] = useState('');
  const [formPackage, setFormPackage] = useState('');
  const [formPriority, setFormPriority] = useState('Schedule');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState(null);
  const [formError, setFormError] = useState(null);

  const paidRef = searchParams.get('ref');
  const paidOk = searchParams.get('paid') === '1';
  const cancelled = searchParams.get('cancel') === '1';

  const heroImage = (pageContent?.hero_image_url && String(pageContent.hero_image_url).trim()) || null;
  const apiHeader = (pageContent?.hero_header && String(pageContent.hero_header).trim()) || '';
  const apiSubtext = (pageContent?.hero_subtext && String(pageContent.hero_subtext).trim()) || '';
  const heroHeader = apiHeader || FALLBACK_HEADER;
  const heroSubtext = apiSubtext || FALLBACK_SUB;
  const defaultButtons = [
    { label: 'Call us', url: 'tel' },
    { label: 'Text us', url: 'sms' },
    { label: 'Request delivery online', url: '#form' },
  ];
  const buttons = Array.isArray(pageContent?.buttons) && pageContent.buttons.length > 0 ? pageContent.buttons : defaultButtons;

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

  const startChatSession = () => {
    setChatLoading(true);
    const sid = chatSessionId || getStoredChatSessionId() || null;
    chatIntake(sid)
      .then((data) => {
        applyReplyAfterDelay(data.reply || '', data.session_id ?? sid);
      })
      .catch(() => {
        applyReplyAfterDelay("Sorry, we couldn't start chat. Try the form below or call us.", null);
      });
  };

  const openChat = () => {
    setChatOpen(true);
    if (chatMessages.length === 0) startChatSession();
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
        applyReplyAfterDelay('Something went wrong. Please try again or use the form.', chatSessionId);
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

  const submitForm = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormMessage(null);
    setFormSubmitting(true);
    try {
      const body = {
        phone: formPhone.trim(),
        callback_phone: formPhone.trim(),
        pickup_address: formPickup.trim() || null,
        delivery_address: formDelivery.trim(),
        recipient_name: formRecipient.trim() || null,
        recipient_phone: formRecipientPhone.trim() || null,
        package_description: formPackage.trim() || null,
        special_instructions: formNotes.trim() || null,
        priority: formPriority,
        scheduled_date: formDate.trim() || null,
        scheduled_time: formTime.trim() || null,
        email: formEmail.trim() || null,
      };
      if (businessIdParam) body.business_id = businessIdParam;

      const res = await fetch(`${API_URL}/api/v2/delivery-network/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || res.statusText || 'Request failed');
      }
      if (data.payment_required && data.payment_link_url) {
        setFormMessage({
          type: 'pay',
          text: data.message || 'Complete payment to confirm your delivery.',
          ref: data.reference_number,
          url: data.payment_link_url,
        });
      } else {
        setFormMessage({
          type: 'ok',
          text: data.message || 'Thanks — we are scheduling your delivery.',
          ref: data.reference_number,
        });
        setFormDelivery('');
        setFormPackage('');
        setFormNotes('');
      }
    } catch (err) {
      setFormError(err?.message || 'Could not submit. Please try again or call us.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const isChatButton = (btn) => {
    const url = (btn.url || '').trim().toLowerCase();
    const label = (btn.label || '').trim();
    if (url === '#form' || url.endsWith('#form')) return true;
    if (/request\s+delivery|delivery\s+online|chat|request\s+online|help\s+online/i.test(label)) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <header className="bg-slate-900 text-white">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-[15px]">{serviceLineName}</span>
          <div className="flex items-center gap-4">
            <Link href="/termsofservice" className="text-slate-400 text-sm hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/" className="text-slate-400 text-sm hover:text-white transition-colors">
              Home
            </Link>
          </div>
        </div>
      </header>

      {paidOk && paidRef && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-center text-sm py-3 px-4">
          Payment received. Your reference: <strong className="font-mono">{paidRef}</strong>. We will schedule your delivery shortly.
        </div>
      )}
      {cancelled && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-center text-sm py-3 px-4">
          Payment was cancelled. You can submit again when ready.
        </div>
      )}

      <section className="relative min-h-[260px] w-full flex items-center justify-center">
        <div className="absolute inset-0 z-0 bg-slate-900">
          {heroImage && !heroImageError && (
            <img
              src={heroImage}
              alt=""
              className="w-full h-full object-cover object-center"
              loading="eager"
              fetchPriority="high"
              onError={() => setHeroImageError(true)}
            />
          )}
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/55 to-black/25 pointer-events-none" />
        <div className="relative z-20 w-full max-w-[900px] mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-sm mb-3">{heroHeader}</h1>
          <p className="text-lg text-white/95 max-w-xl mx-auto mb-8">{heroSubtext}</p>
          {(phone || buttons.length > 0) && (
            <div className="flex flex-col items-center gap-3">
              {buttons.some((b) => (b.url || '').trim().toLowerCase() === 'tel') && phone && (
                <a
                  href={telLink}
                  className="inline-flex justify-center py-4 px-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-lg"
                >
                  Call us
                </a>
              )}
              <div className="flex flex-wrap gap-3 justify-center">
                {buttons.map((btn, i) => {
                  const url = (btn.url || '').trim().toLowerCase();
                  if (url === 'tel') return null;
                  const label = (btn.label || '').trim();
                  if (isChatButton(btn)) {
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openChat();
                        }}
                        className="inline-flex justify-center py-3 px-6 rounded-lg border-2 border-white/90 font-semibold text-white text-base hover:bg-white/10 transition-colors min-w-[200px]"
                      >
                        {label || 'Request delivery online'}
                      </button>
                    );
                  }
                  return (
                    <a
                      key={i}
                      href={url === 'sms' ? smsLink : btn.url || '#'}
                      className="inline-flex justify-center py-3 px-6 rounded-lg border-2 border-white/90 font-semibold text-white text-base hover:bg-white/10 transition-colors min-w-[200px]"
                    >
                      {label || 'Link'}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {phone && <p className="mt-4 text-white/90 font-medium">{phone}</p>}
        </div>
      </section>

      <section ref={contentRef} className="py-10 px-4">
        <div className="max-w-[720px] mx-auto">
          <div className="text-center mb-8">
            <button
              type="button"
              onClick={() => {
                openChat();
              }}
              className="inline-flex items-center justify-center py-3 px-6 rounded-lg bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-700 transition-colors"
            >
              Chat to schedule
            </button>
            <p className="text-sm text-slate-500 mt-2">Or use the form below — include your phone and full delivery address.</p>
          </div>

          <div id="form" ref={formRef} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Request a delivery</h2>
            <p className="text-sm text-slate-600 mb-6">
              {businessIdParam
                ? 'Submitting for your business account.'
                : 'Individuals: you will complete payment online before we dispatch. Businesses: dispatch starts after submit.'}
            </p>
            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label htmlFor="dd-phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Your phone <span className="text-red-600">*</span>
                </label>
                <input
                  id="dd-phone"
                  type="tel"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="+1…"
                  autoComplete="tel"
                />
              </div>
              {!businessIdParam && (
                <div>
                  <label htmlFor="dd-email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email (for payment link)
                  </label>
                  <input
                    id="dd-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              )}
              <div>
                <label htmlFor="dd-pickup" className="block text-sm font-medium text-slate-700 mb-1">
                  Pickup address
                </label>
                <input
                  id="dd-pickup"
                  type="text"
                  value={formPickup}
                  onChange={(e) => setFormPickup(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Where we collect the package"
                />
              </div>
              <div>
                <label htmlFor="dd-delivery" className="block text-sm font-medium text-slate-700 mb-1">
                  Delivery address <span className="text-red-600">*</span>
                </label>
                <input
                  id="dd-delivery"
                  type="text"
                  required
                  value={formDelivery}
                  onChange={(e) => setFormDelivery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Full street address"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dd-recipient" className="block text-sm font-medium text-slate-700 mb-1">
                    Recipient name
                  </label>
                  <input
                    id="dd-recipient"
                    type="text"
                    value={formRecipient}
                    onChange={(e) => setFormRecipient(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="dd-recipient-phone" className="block text-sm font-medium text-slate-700 mb-1">
                    Recipient phone
                  </label>
                  <input
                    id="dd-recipient-phone"
                    type="tel"
                    value={formRecipientPhone}
                    onChange={(e) => setFormRecipientPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="dd-pkg" className="block text-sm font-medium text-slate-700 mb-1">
                  Package / contents
                </label>
                <input
                  id="dd-pkg"
                  type="text"
                  value={formPackage}
                  onChange={(e) => setFormPackage(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="What we are moving"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dd-priority" className="block text-sm font-medium text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    id="dd-priority"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="Schedule">Schedule</option>
                    <option value="Same Day">Same day</option>
                    <option value="Immediate">Immediate</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="dd-date" className="block text-sm font-medium text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      id="dd-date"
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="dd-time" className="block text-sm font-medium text-slate-700 mb-1">
                      Time
                    </label>
                    <input
                      id="dd-time"
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="dd-notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Special instructions
                </label>
                <textarea
                  id="dd-notes"
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Door codes, fragile, etc."
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {formMessage?.type === 'ok' && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-4">
                  {formMessage.text}{' '}
                  {formMessage.ref && (
                    <span>
                      Reference: <strong className="font-mono">{formMessage.ref}</strong>
                    </span>
                  )}
                </div>
              )}
              {formMessage?.type === 'pay' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-sm p-4 space-y-2">
                  <p>{formMessage.text}</p>
                  {formMessage.ref && (
                    <p>
                      Reference: <strong className="font-mono">{formMessage.ref}</strong>
                    </p>
                  )}
                  {formMessage.url && (
                    <a
                      href={formMessage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700"
                    >
                      Pay securely
                    </a>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={formSubmitting}
                className="w-full sm:w-auto py-3 px-8 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {formSubmitting ? 'Submitting…' : 'Submit request'}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="bg-white border-t border-slate-200 py-10 px-4">
        <div className="max-w-[720px] mx-auto">
          <h2 className="text-lg font-bold text-slate-900 mb-4 text-center">How it works</h2>
          <ol className="list-decimal list-inside space-y-2 text-[15px] text-slate-700 leading-relaxed">
            <li>You submit your pickup and delivery details (form, chat, or phone).</li>
            <li>We create your request and coordinate with our delivery partners.</li>
            <li>You receive updates by SMS/email when enabled, plus a tracking link when the carrier provides one.</li>
          </ol>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-slate-50">
        <div className="max-w-[720px] mx-auto text-center text-[15px] text-slate-700">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Need to cancel?</h2>
          <p className="leading-relaxed mb-2">
            Use the same phone number and delivery address you used when booking, plus the date you placed the request. Contact us if you need help locating your reference number.
          </p>
          <p className="text-slate-500 text-sm">Cancellation uses our automated matching; have your reference handy if possible.</p>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-white">
        <div className="max-w-[720px] mx-auto">
          <h2 className="text-lg font-bold text-slate-900 mb-4 text-center">Questions</h2>
          <dl className="space-y-4 text-[15px] text-slate-700">
            <div>
              <dt className="font-semibold text-slate-900 mb-1">Who performs the delivery?</dt>
              <dd>Licensed third-party carriers (for example via Shipday or DoorDash Drive) may fulfill your route. Tavari coordinates the request.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900 mb-1">Can I track my package?</dt>
              <dd>When your carrier provides a tracking link, we include it in your notifications and delivery status page when available.</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="bg-slate-900 text-white py-6 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[13px] text-slate-400 leading-relaxed">
            {serviceLineName} coordinates last-mile deliveries. Carriers are independent third parties. Pricing and final terms may be confirmed before dispatch.
          </p>
          <p className="mt-3">
            <Link href="/termsofservice" className="text-slate-300 hover:text-white underline text-sm">
              Terms of Service
            </Link>
            <span className="mx-2 text-slate-600">|</span>
            <Link href="/" className="text-slate-400 hover:text-white text-sm">
              Tavari
            </Link>
          </p>
        </div>
      </footer>

      {chatOpen && (
        <div
          ref={chatOverlayRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
          onClick={closeChat}
          role="dialog"
          aria-modal="true"
          aria-label="Delivery chat"
        >
          <div
            className="w-full max-h-[90vh] sm:max-w-md sm:rounded-xl bg-white shadow-xl flex flex-col border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <span className="font-semibold text-slate-900">Schedule a delivery</span>
              <button type="button" onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-slate-200 text-slate-600" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[50vh]">
              {chatMessages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-3 py-2.5 bg-slate-100 text-slate-800 text-sm" aria-label="Typing">
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '300ms' }} />
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
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={chatLoading || !chatSessionId}
                  aria-label="Chat message"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatSessionId || !chatInput?.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
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

export default function DeliveryDispatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">Loading…</div>
      }
    >
      <DeliveryDispatchContent />
    </Suspense>
  );
}
