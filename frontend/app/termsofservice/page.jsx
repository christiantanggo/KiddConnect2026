'use client';

import Link from 'next/link';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] antialiased">
      <header className="bg-[#2c2c2c] text-white">
        <div className="max-w-[720px] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-[15px]">Tavari Emergency Dispatch</span>
          <Link href="/emergencydispatch" className="text-[#b0b0b0] text-sm hover:text-white transition-colors">Back to Emergency Dispatch</Link>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">Terms of Service</h1>
        <p className="text-slate-600 text-sm mb-10">Emergency Dispatch Service — Last updated: March 2025</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8 text-slate-700">
          <section>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">1. We Are a Dispatch Service</h2>
            <p className="leading-relaxed">
              Tavari Emergency Dispatch (&quot;we,&quot; &quot;us,&quot; or &quot;the service&quot;) is a <strong>dispatch and referral service</strong>. We connect customers who need emergency or scheduled service with independent, third-party licensed professionals (e.g., plumbers, HVAC technicians). We do <strong>not</strong> perform any repair, installation, or trade work ourselves. We are not the service provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">2. No Provider Relationship</h2>
            <p className="leading-relaxed">
              Any work performed at your property is done by the independent professional we connect you with. The contract for service is between you and that provider. We are not a party to that agreement and are not responsible for the quality, timing, pricing, or outcome of the work performed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">3. Your Responsibility: Verify License, Insurance & Terms</h2>
            <p className="leading-relaxed">
              You are responsible for <strong>verifying the provider&apos;s license, insurance, and terms</strong> when they contact you or before work begins. We recommend that you confirm the provider&apos;s credentials, scope of work, and pricing directly with them. We do not guarantee the credentials or conduct of any third-party provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">4. Use of the Service</h2>
            <p className="leading-relaxed">
              By calling our number, submitting a form, or otherwise using the Emergency Dispatch service, you agree to these Terms. You agree to provide accurate contact and location information so we can connect you with a provider. You are responsible for being available to receive calls or messages from us or from a provider we refer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">5. Limitation of Liability</h2>
            <p className="leading-relaxed">
              To the fullest extent permitted by law, we are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the dispatch service or from the acts or omissions of any provider we refer you to. Our liability is limited to the extent permitted by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1a1a1a] mb-3">6. Contact</h2>
            <p className="leading-relaxed">
              For questions about these Terms or the Emergency Dispatch service, contact us through the contact information provided on the Tavari website or in the communications we send you.
            </p>
          </section>
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
