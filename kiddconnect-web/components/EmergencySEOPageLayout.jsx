import Link from 'next/link';

const DEFAULT_PHONE = '519-900-9119';
const PHONE_TEL = '+15199009119';

const SERVICE_AREA_LINE = 'Serving London Ontario and nearby communities including St Thomas, Strathroy, Woodstock, Ingersoll and Dorchester.';

/**
 * Shared layout for Emergency Dispatch SEO landing pages.
 * Renders: header, hero (title + CTA), service area line, then children (main content).
 */
export default function EmergencySEOPageLayout({ title, subtitle = '24/7 emergency plumbing dispatch service.', phone = DEFAULT_PHONE, phoneTel = PHONE_TEL, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#2c2c2c] text-white py-4 px-4">
        <div className="max-w-[900px] mx-auto flex justify-between items-center">
          <Link href="/emergencydispatch" className="text-white/90 hover:text-white text-sm">← Emergency Dispatch</Link>
          <span className="font-semibold">Tavari Emergency Dispatch</span>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#2c2c2c] text-white py-12 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{title}</h1>
          <p className="text-white/90 text-lg mb-4">{subtitle}</p>
          <a href={`tel:${phoneTel}`} className="inline-block py-4 px-8 rounded bg-[#c41e3a] text-white font-bold text-lg hover:bg-[#a01830] uppercase tracking-wide">
            Call Now – {phone}
          </a>
          <p className="mt-3 text-white/80 text-sm">Available 24 hours a day.</p>
          <p className="mt-4 text-slate-400 text-sm">Or <Link href="/emergencydispatch" className="text-emerald-400 hover:text-emerald-300 underline">request help online</Link></p>
        </div>
      </section>

      {/* Service area – SEO boost for nearby cities */}
      <div className="max-w-[900px] mx-auto px-4 py-3 border-b border-slate-200 bg-white">
        <p className="text-slate-600 text-sm text-center">{SERVICE_AREA_LINE}</p>
      </div>

      {/* Main content */}
      <main className="max-w-[900px] mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
