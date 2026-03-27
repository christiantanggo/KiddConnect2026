'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';

const MAIN_NAV = [
  { href: '/admin-dashboard', label: 'Dashboard' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/website-analytics', label: 'Website Analytics' },
  { href: '/admin/support', label: 'Support Tickets' },
];

// Module links (href same as admin-dashboard module cards)
const MODULE_NAV = [
  { href: '/tavari-ai-phone/admin-dashboard', label: 'Tavari AI Phone', key: 'phone-agent' },
  { href: '/review-reply-ai/admin-dashboard', label: 'Review Reply AI', key: 'reviews' },
  { href: '/admin/delivery-operator', label: 'Last-Mile Delivery', key: 'delivery-dispatch' },
  { href: '/dashboard/v2/modules/emergency-dispatch', label: 'Emergency Dispatch', key: 'emergency-dispatch' },
  { href: '/dashboard/v2/modules/orbix-network', label: 'Orbix Network', key: 'orbix-network' },
];

function NavLink({ href, label, active }) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-blue-100 text-blue-800' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout({ children }) {
  const pathname = usePathname();

  const handleLogout = () => {
    document.cookie = 'admin_token=; path=/; max-age=0';
    window.location.href = '/admin/login';
  };

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 flex">
        <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <Link href="/admin-dashboard" className="text-lg font-bold text-blue-600 hover:text-blue-700">
              Tavari Admin
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {MAIN_NAV.map(({ href, label }) => (
              <NavLink key={href} href={href} label={label} active={pathname === href} />
            ))}
            <div className="pt-4 mt-4 border-t border-gray-200">
              <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Modules</p>
              <div className="mt-1 space-y-0.5">
                {MODULE_NAV.map(({ href, label, key }) => (
                  <NavLink
                    key={key}
                    href={href}
                    label={label}
                    active={pathname === href || pathname?.startsWith(href + '/')}
                  />
                ))}
              </div>
            </div>
          </nav>
          <div className="p-3 border-t border-gray-200 space-y-2">
            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Logout
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}
