'use client';

import { usePathname } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

export default function AdminRouteLayout({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/admin/login';

  if (isLogin) {
    return children;
  }
  return <AdminLayout>{children}</AdminLayout>;
}
