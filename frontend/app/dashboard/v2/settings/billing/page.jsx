'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2DashboardHeader from '@/components/V2DashboardHeader';
import V2Sidebar from '@/components/V2Sidebar';
import { ArrowLeft } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function BillingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBilling();
    loadSubscriptions();
  }, []);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    const businessId = typeof window !== 'undefined' 
      ? localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId')
      : null;
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    
    if (businessId) {
      headers['X-Active-Business-Id'] = businessId;
    }
    
    return headers;
  };

  const loadBilling = async () => {
    try {
      setError(null);
      // Use the same billing API endpoint as the Phone Agent billing page
      // This gives us unified billing info for all modules (payment method, etc.)
      const res = await fetch(`${API_URL}/api/billing/status`, {
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      } else {
        setError('Failed to load billing information');
      }
    } catch (err) {
      console.error('[Billing Settings] Error:', err);
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const headers = getAuthHeaders();
      
      // Load all modules to get names
      const modulesRes = await fetch(`${API_URL}/api/v2/modules`, { headers });
      if (modulesRes.ok) {
        const modulesData = await modulesRes.json();
        setModules(modulesData.modules || []);
        
        // Extract subscriptions from modules
        const subs = modulesData.modules
          .filter(m => m.subscribed && m.subscription)
          .map(m => ({
            ...m.subscription,
            module_key: m.key,
            module_name: m.name,
          }));
        
        setSubscriptions(subs);
      }
    } catch (err) {
      console.error('[Billing Settings] Failed to load subscriptions:', err);
    }
  };

  const handleManageBilling = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/billing/portal`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        setError('Failed to load billing portal');
      }
    } catch (err) {
      console.error('[Billing Settings] Error loading portal:', err);
      setError('Failed to load billing portal');
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      active: { bg: 'rgba(20, 184, 166, 0.1)', text: 'var(--color-accent)' },
      trial: { bg: 'rgba(250, 204, 21, 0.1)', text: 'var(--color-accent-2)' },
      canceled: { bg: 'rgba(0, 0, 0, 0.05)', text: 'var(--color-text-muted)' },
      past_due: { bg: 'rgba(239, 68, 68, 0.1)', text: 'var(--color-danger)' },
    };
    const color = colors[status] || colors.canceled;
    
    return (
      <span
        className="px-2 py-1 text-xs font-medium"
        style={{
          backgroundColor: color.bg,
          color: color.text,
          borderRadius: 'var(--button-radius)',
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
          <V2DashboardHeader />
          <V2Sidebar />
          <div className="sidebar-offset flex items-center justify-center min-h-[60vh]" style={{ paddingTop: 'var(--topbar-height)' }}>
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
        <V2DashboardHeader />
        <V2Sidebar />
        
        <div className="sidebar-offset" style={{ paddingTop: 'var(--topbar-height)' }}>
          <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
            {/* Header */}
            <div className="mb-8">
              <Link
                href="/dashboard/v2/settings"
                className="text-sm mb-4 inline-block transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => e.target.style.color = 'var(--color-text-main)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
              >
                <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to Settings
              </Link>
              <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Billing & Subscriptions</h1>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Manage your subscription and billing information
              </p>
            </div>

            {error && (
              <div 
                className="px-4 py-3 mb-6"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--color-danger)',
                  borderRadius: 'var(--card-radius)',
                }}
              >
                {error}
              </div>
            )}

            {/* Billing Overview */}
            {billing && (
              <>
                {/* Subscriptions (Multiple modules) */}
                <div className="space-y-4 mb-6">
                  {subscriptions.length > 0 ? (
                    subscriptions.map((subscription) => (
                      <div
                        key={subscription.id || subscription.module_key}
                        className="shadow"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderRadius: 'var(--card-radius)',
                          padding: 'var(--padding-base)',
                        }}
                      >
                        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                          {subscription.module_name || 'Unknown Module'} Subscription
                        </h2>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span style={{ color: 'var(--color-text-muted)' }}>Status:</span>
                              <span className="ml-2">
                                {getStatusBadge(subscription.status)}
                              </span>
                            </div>
                            {subscription.usage_limit && (
                              <div>
                                <span style={{ color: 'var(--color-text-muted)' }}>Usage Limit:</span>
                                <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>
                                  {subscription.usage_limit} {subscription.module_key === 'reviews' ? 'generations' : 'minutes'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : billing?.subscription ? (
                    // Legacy Phone Agent subscription (fallback)
                    <div
                      className="shadow mb-6"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 'var(--card-radius)',
                        padding: 'var(--padding-base)',
                      }}
                    >
                      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                        AI Phone Agent Subscription
                      </h2>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Plan:</span>
                            <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>
                              {billing.package?.name || billing.plan_tier?.charAt(0).toUpperCase() + billing.plan_tier?.slice(1) || 'Starter'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Status:</span>
                            <span className="ml-2">
                              {getStatusBadge(billing.subscription.status)}
                            </span>
                          </div>
                          {billing.subscription.price && (
                            <div>
                              <span style={{ color: 'var(--color-text-muted)' }}>Monthly Price:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>
                                ${(parseFloat(billing.subscription.price) || 0).toFixed(2)}/month
                              </span>
                            </div>
                          )}
                          {billing.usage_limit_minutes && (
                            <div>
                              <span style={{ color: 'var(--color-text-muted)' }}>Usage Limit:</span>
                              <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>
                                {billing.usage_limit_minutes} minutes
                              </span>
                            </div>
                          )}
                        </div>
                        {billing.subscription.current_period_end && (
                          <div className="pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                              {billing.subscription.cancel_at_period_end 
                                ? `Subscription will cancel on ${new Date(billing.subscription.current_period_end * 1000).toLocaleDateString()}`
                                : `Next billing date: ${new Date(billing.subscription.current_period_end * 1000).toLocaleDateString()}`
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="shadow mb-6"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 'var(--card-radius)',
                        padding: 'var(--padding-base)',
                      }}
                    >
                      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>Subscriptions</h2>
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        No active subscriptions. <Link href="/dashboard" style={{ color: 'var(--color-accent)' }}>Browse modules</Link> to get started.
                      </p>
                    </div>
                  )}
                </div>

                {/* Payment Method */}
                <div 
                  className="shadow mb-6"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--card-radius)',
                    padding: 'var(--padding-base)',
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-main)' }}>Payment Method</h2>
                    <button
                      onClick={handleManageBilling}
                      className="px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'white',
                        borderRadius: 'var(--button-radius)',
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                      onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                      Manage Billing
                    </button>
                  </div>
                  {billing.payment_method ? (
                    <div className="space-y-4">
                      {billing.payment_method.card ? (
                        <div className="p-4 border rounded" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--card-radius)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>Card</span>
                            <span className="text-xs uppercase" style={{ color: 'var(--color-text-muted)' }}>
                              {billing.payment_method.card.brand}
                            </span>
                          </div>
                          <p className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>
                            •••• •••• •••• {billing.payment_method.card.last4}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Expires {billing.payment_method.card.exp_month}/{billing.payment_method.card.exp_year}
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 border rounded" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--card-radius)' }}>
                          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Payment method on file</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>No payment method on file</p>
                      <button
                        onClick={handleManageBilling}
                        className="px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: 'var(--color-accent)',
                          color: 'white',
                          borderRadius: 'var(--button-radius)',
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                      >
                        Add Payment Method
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

