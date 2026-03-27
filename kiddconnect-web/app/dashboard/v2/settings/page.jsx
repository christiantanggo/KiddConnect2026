'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft } from 'lucide-react';

export default function V2SettingsPage() {
  return (
    <AuthGuard>
      <V2AppShell>
        <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
            {/* Header */}
            <div className="mb-8">
              <Link
                href="/dashboard/v2"
                className="text-sm mb-4 inline-block transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => e.target.style.color = 'var(--color-text-main)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
              >
                <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to Dashboard
              </Link>
              <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Settings</h1>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Configure your modules and preferences
              </p>
            </div>

            {/* Settings Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link
                href="/dashboard/v2/settings/profile"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>My Profile</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Update your name and change your password
                </p>
              </Link>
              {/* Organizations link removed - feature disabled for now */}
              {/* <Link
                href="/dashboard/v2/settings/organizations"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Organizations</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Manage your organizations and memberships
                </p>
              </Link> */}

              <Link
                href="/dashboard/v2/settings/modules"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Module Settings</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Configure your active modules
                </p>
              </Link>

              <Link
                href="/dashboard/v2/settings/billing"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Billing</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Manage subscriptions and billing
                </p>
              </Link>

              <Link
                href="/dashboard/v2/settings/business"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Business Profile</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Manage business information and profile
                </p>
              </Link>

              <Link
                href="/dashboard/v2/settings/communications"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Communications</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Configure SMS and email settings
                </p>
              </Link>

              <Link
                href="/dashboard/v2/settings/users"
                className="shadow transition-shadow"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Users & Roles</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Manage organization members
                </p>
              </Link>
            </div>
          </div>
        </V2AppShell>
    </AuthGuard>
  );
}
