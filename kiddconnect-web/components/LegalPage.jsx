import Link from 'next/link';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';

export const LEGAL_LAST_UPDATED = 'October 5, 2026';

export function LegalSection({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

export function ContactLine() {
  return (
    <p>
      Questions? Send us a message using the{' '}
      <Link href="/?contact=1" className="text-blue-600 hover:underline">
        Contact Us form
      </Link>{' '}
      on our home page.
    </p>
  );
}

export default function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          &larr; {APP_DISPLAY_NAME}
        </Link>
        <div className="bg-white rounded-lg shadow p-8 mt-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: {LEGAL_LAST_UPDATED}</p>
          {children}
        </div>
        <div className="flex gap-6 text-sm text-gray-600 mt-6">
          <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-blue-600">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
