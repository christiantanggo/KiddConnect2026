'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');
const MODULE_KEY = 'dad-joke-studio';

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find((c) => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

/**
 * "Learn more" and module cards link here (/modules/dad-joke-studio). A static folder
 * shadows [moduleKey], so this page must exist. Route subscribed users to the studio;
 * others to module settings to activate.
 */
export default function DadJokeStudioModuleRootPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Loading…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() || '' };
        const res = await fetch(`${API}/api/v2/modules`, { headers });
        const data = await res.json();
        if (cancelled) return;
        const mod = (data.modules || []).find((m) => m.key === MODULE_KEY);
        if (mod?.subscribed) {
          router.replace(`/dashboard/v2/modules/${MODULE_KEY}/dashboard`);
          return;
        }
        setMessage('Redirecting to module settings…');
        router.replace('/dashboard/v2/settings/modules');
      } catch {
        if (!cancelled) {
          setMessage('Something went wrong. Open Module Settings to enable this module.');
          router.replace('/dashboard/v2/settings/modules');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="text-sm" style={{ padding: 24, color: 'var(--color-text-muted)' }}>
          {message}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
