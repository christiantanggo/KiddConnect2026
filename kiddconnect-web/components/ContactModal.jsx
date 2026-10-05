'use client';

import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { contactAPI } from '@/lib/api';

const EMPTY_FORM = { name: '', email: '', message: '', website: '' };

const inputClass =
  'w-full rounded-lg border border-stone-700 bg-stone-950/60 px-4 py-3 text-stone-100 placeholder-stone-500 focus:border-amber-200/60 focus:outline-none focus:ring-1 focus:ring-amber-200/40';

export default function ContactModal({ open, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setStatus('idle');
    setError('');
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await contactAPI.send(form);
      setStatus('sent');
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus('idle');
      setError(
        err?.response?.status === 429
          ? 'Too many messages from your connection. Please try again later.'
          : err?.response?.data?.error || 'Sorry, your message could not be sent. Please try again later.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        className="relative w-full max-w-lg rounded-2xl border border-stone-800 bg-stone-900 p-8 text-left text-stone-100 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {status === 'sent' ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-amber-200" />
            <h2 id="contact-modal-title" className="font-serif text-2xl mb-2">
              Message sent
            </h2>
            <p className="text-stone-400 mb-8">Thanks for reaching out &mdash; we&apos;ll get back to you soon.</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-amber-200/50 px-8 py-3 text-amber-100 hover:bg-amber-200 hover:text-stone-950 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 id="contact-modal-title" className="font-serif text-2xl mb-1">
              Contact Us
            </h2>
            <p className="text-sm text-stone-400 mb-6">Send us a message and we&apos;ll reply by email.</p>

            <div className="space-y-4">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-sm text-stone-300">
                  Name
                </label>
                <input
                  ref={nameRef}
                  id="contact-name"
                  type="text"
                  required
                  maxLength={100}
                  autoComplete="name"
                  value={form.name}
                  onChange={update('name')}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="mb-1.5 block text-sm text-stone-300">
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={form.email}
                  onChange={update('email')}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-sm text-stone-300">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  required
                  rows={5}
                  maxLength={5000}
                  value={form.message}
                  onChange={update('message')}
                  className={`${inputClass} resize-y`}
                />
              </div>
              <div className="hidden" aria-hidden="true">
                <label htmlFor="contact-website">Website</label>
                <input
                  id="contact-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={update('website')}
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="mt-6 w-full rounded-full bg-amber-200 px-8 py-3.5 font-medium text-stone-950 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-wait transition-colors"
            >
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
