'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

const DEFAULT_SECTIONS = [
  { id: '1', header: '1. We Are a Dispatch Service', content: 'Tavari Emergency Dispatch ("we," "us," or "the service") is a dispatch and referral service. We connect customers who need emergency or scheduled service with independent, third-party licensed professionals (e.g., plumbers, HVAC technicians). We do not perform any repair, installation, or trade work ourselves. We are not the service provider.' },
  { id: '2', header: '2. No Provider Relationship', content: 'Any work performed at your property is done by the independent professional we connect you with. The contract for service is between you and that provider. We are not a party to that agreement and are not responsible for the quality, timing, pricing, or outcome of the work performed.' },
  { id: '3', header: '3. Your Responsibility: Verify License, Insurance & Terms', content: "You are responsible for verifying the provider's license, insurance, and terms when they contact you or before work begins. We recommend that you confirm the provider's credentials, scope of work, and pricing directly with them. We do not guarantee the credentials or conduct of any third-party provider." },
  { id: '4', header: '4. Use of the Service', content: 'By calling our number, submitting a form, or otherwise using the Emergency Dispatch service, you agree to these Terms. You agree to provide accurate contact and location information so we can connect you with a provider. You are responsible for being available to receive calls or messages from us or from a provider we refer.' },
  { id: '5', header: '5. Limitation of Liability', content: 'To the fullest extent permitted by law, we are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the dispatch service or from the acts or omissions of any provider we refer you to. Our liability is limited to the extent permitted by applicable law.' },
  { id: '6', header: '6. Contact', content: 'For questions about these Terms or the Emergency Dispatch service, contact us through the contact information provided on the Tavari website or in the communications we send you.' },
];

export default function TermsOfServicePage() {
  const [content, setContent] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v2/emergency-network/public/website-page/terms-of-service`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const raw = d && typeof d === 'object' ? d : null;
        const contentObj = raw && raw.content !== undefined ? raw.content : raw;
        setContent(contentObj && typeof contentObj === 'object' ? contentObj : null);
      })
      .catch(() => setContent(null));
  }, []);
  const pageTitle = content?.page_title ?? 'Terms of Service';
  const pageSubtext = content?.page_subtext ?? 'Emergency Dispatch Service — Last updated: March 2025';
  const sections = Array.isArray(content?.sections) && content.sections.length > 0 ? content.sections : DEFAULT_SECTIONS;

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] antialiased">
      <header className="bg-[#2c2c2c] text-white">
        <div className="max-w-[720px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-[15px]">Tavari Emergency Dispatch</span>
          <Link href="/emergencydispatch" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Back to Emergency Dispatch</Link>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">{pageTitle}</h1>
        <p className="text-slate-600 text-sm mb-10">{pageSubtext}</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8 text-slate-700">
          {sections.map((sec, i) => (
            <section key={sec.id || i}>
              <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">{sec.header || `Section ${i + 1}`}</h2>
              <p className="leading-relaxed whitespace-pre-wrap">{sec.content || ''}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/emergencydispatch"
            className="inline-block py-3 px-6 rounded-lg bg-[#2c2c2c] hover:bg-[#1a1a1a] text-white font-medium transition-colors"
          >
            Back to Emergency Dispatch
          </Link>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12 py-4 px-4">
        <div className="max-w-[720px] mx-auto text-center text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-700">Tavari</Link>
        </div>
      </footer>
    </div>
  );
}
