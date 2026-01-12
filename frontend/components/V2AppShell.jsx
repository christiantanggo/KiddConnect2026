'use client';

import V2DashboardHeader from './V2DashboardHeader';
import V2Sidebar from './V2Sidebar';

/**
 * V2AppShell - Global UI Shell Component
 * 
 * Provides consistent layout wrapper for all v2 dashboard pages
 * Matches the specification's AppShell structure:
 * - TopBar (V2DashboardHeader - always the core header)
 * - Sidebar (V2Sidebar)  
 * - MainContent (children)
 */
export default function V2AppShell({ children, showSidebar = true }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <V2DashboardHeader />
      {showSidebar && <V2Sidebar />}
      
      <main 
        style={{ 
          paddingLeft: showSidebar ? 'var(--sidebar-width)' : '0',
          paddingTop: 'var(--topbar-height)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

