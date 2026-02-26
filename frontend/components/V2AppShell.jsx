'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import V2DashboardHeader from './V2DashboardHeader';
import V2Sidebar from './V2Sidebar';

export default function V2AppShell({ children, showSidebar = true }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <V2DashboardHeader
        onMobileMenuToggle={() => setMobileMenuOpen(v => !v)}
        mobileMenuOpen={mobileMenuOpen}
      />
      {showSidebar && (
        <V2Sidebar
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
      <main
        style={{ paddingTop: 'var(--topbar-height)' }}
        className={showSidebar ? 'md:sidebar-offset' : ''}
      >
        <style>{`
          @media (min-width: 768px) {
            .md\\:sidebar-offset { padding-left: var(--sidebar-width); }
          }
        `}</style>
        {children}
      </main>
    </div>
  );
}
