'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import V2DashboardHeader from './V2DashboardHeader';
import V2Sidebar from './V2Sidebar';

export default function V2AppShell({ children, showSidebar = true }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

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
        className={showSidebar ? 'sidebar-offset' : ''}
        style={{ paddingTop: 'var(--topbar-height)' }}
      >
        {children}
      </main>
    </div>
  );
}
