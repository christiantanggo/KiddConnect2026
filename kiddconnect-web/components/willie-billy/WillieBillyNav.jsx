'use client';

import Link from 'next/link';
import localFont from 'next/font/local';
import { usePathname } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';

const rubik = localFont({
  src: [
    { path: '../../fonts/Rubik-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../fonts/Rubik-Bold.ttf', weight: '700', style: 'normal' },
  ],
  display: 'swap',
});

const TABS = [
  { href: '/dashboard/v2/modules/willie-billy/dashboard', label: 'Year' },
  { href: '/dashboard/v2/modules/willie-billy/bible', label: 'Bible' },
  { href: '/dashboard/v2/modules/willie-billy/settings', label: 'Production' },
];

export function WillieBillyNav() {
  const pathname = usePathname();
  return (
    <div
      className="flex gap-1 p-1 mb-5 rounded-xl w-fit"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {TABS.map((tab) => {
        const onYear = tab.href.endsWith('/dashboard') && (pathname === tab.href || pathname?.includes('/willie-billy/weeks/'));
        const isActive = tab.href.endsWith('/dashboard') ? onYear : pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{
              background: isActive ? '#1d4ed8' : 'transparent',
              color: isActive ? '#fff' : 'var(--color-text-muted)',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function WillieBillyPage({ children }) {
  return (
    <AuthGuard>
      <V2AppShell>
        <div
          className={`${rubik.className} willie-billy-type`}
          style={{ padding: '20px 20px 64px', maxWidth: 1100, margin: '0 auto' }}
        >
          <style>{`
            .willie-billy-type,
            .willie-billy-type p,
            .willie-billy-type li,
            .willie-billy-type input,
            .willie-billy-type span {
              font-weight: 500;
            }
            .willie-billy-type h1,
            .willie-billy-type h2,
            .willie-billy-type h3,
            .willie-billy-type button,
            .willie-billy-type a {
              font-weight: 700;
            }
          `}</style>
          <WillieBillyNav />
          {children}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
