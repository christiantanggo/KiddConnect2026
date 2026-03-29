'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2DashboardHeader from '@/components/V2DashboardHeader';
import V2Sidebar from '@/components/V2Sidebar';
import PricingModal from '@/components/PricingModal';
import ModuleActivationModal from '@/components/ModuleActivationModal';
import { ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { modulesAPI } from '@/lib/api';
import { getModulePostActivatePath } from '@/lib/moduleRoutes';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

export default function ModuleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const moduleKey = params.moduleKey;
  
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState(null);
  const [billing, setBilling] = useState(null);
  const [error, setError] = useState(null);
  const [activating, setActivating] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);

  useEffect(() => {
    if (moduleKey) {
      loadModule();
      loadBilling();
    }
  }, [moduleKey]);

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const getActiveBusinessId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
  };

  const loadModule = async () => {
    try {
      setError(null);
      const headers = getAuthHeaders();
      let businessId = getActiveBusinessId();

      // If no business ID in localStorage, get it from the user's session
      if (!businessId) {
        try {
          const meRes = await fetch(`${API_URL}/api/auth/me`, { headers });
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.business?.id) {
              businessId = meData.business.id;
              if (typeof window !== 'undefined') {
                localStorage.setItem('activeBusinessId', businessId);
              }
            }
          }
        } catch (meErr) {
          console.warn('[Module Detail] Failed to load user info:', meErr);
        }
      }

      if (!businessId) {
        setError('Unable to determine your organization. Please refresh the page or contact support.');
        setLoading(false);
        return;
      }

      headers['X-Active-Business-Id'] = businessId;
      
      const res = await fetch(`${API_URL}/api/v2/modules/${moduleKey}`, { headers });
      
      if (res.ok) {
        const data = await res.json();
        setModule(data.module);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to load module');
      }
    } catch (err) {
      console.error('[Module Detail] Error:', err);
      setError('Failed to load module. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const loadBilling = async () => {
    try {
      const headers = getAuthHeaders();
      const businessId = getActiveBusinessId();
      
      if (businessId) {
        headers['X-Active-Business-Id'] = businessId;
      }
      
      const res = await fetch(`${API_URL}/api/billing/status`, { headers });
      
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch (err) {
      console.error('[Module Detail] Failed to load billing:', err);
      // Don't show error for billing, it's optional
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <V2DashboardHeader />
          <V2Sidebar />
          <div className="pl-64 pt-16 flex items-center justify-center min-h-[60vh]">
            <div className="text-lg">Loading module...</div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error || !module) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
          <V2DashboardHeader />
          <V2Sidebar />
          <div className="sidebar-offset" style={{ paddingTop: 'var(--topbar-height)' }}>
            <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to Marketplace
            </Link>
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error || 'Module not found'}
            </div>
            </div>
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
          {/* Back Link */}
          <Link
            href="/dashboard"
            className="text-sm mb-6 inline-block transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => e.target.style.color = 'var(--color-text-main)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
          >
            ← Back to Marketplace
          </Link>

          {/* Module Header */}
          <div 
            className="shadow mb-6"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--padding-base)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>{module.name}</h1>
                {module.category && (
                  <span 
                    className="inline-block px-3 py-1 text-sm font-medium mb-3"
                    style={{
                      backgroundColor: 'rgba(20, 184, 166, 0.1)',
                      color: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                    }}
                  >
                    {module.category}
                  </span>
                )}
                <div className="flex items-center gap-3 mt-3">
                  {module.subscribed ? (
                    <span 
                      className="px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: 'rgba(20, 184, 166, 0.1)',
                        color: 'var(--color-accent)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 inline mr-1" /> Active
                    </span>
                  ) : (
                    <span 
                      className="px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.05)',
                        color: 'var(--color-text-muted)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      Available
                    </span>
                  )}
                  {module.health_status === 'healthy' && (
                    <span 
                      className="px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: 'rgba(20, 184, 166, 0.1)',
                        color: 'var(--color-accent)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      ● Healthy
                    </span>
                  )}
                  {module.health_status === 'degraded' && (
                    <span 
                      className="px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: 'rgba(250, 204, 21, 0.1)',
                        color: 'var(--color-accent-2)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      <AlertTriangle className="w-4 h-4 inline mr-1" /> Degraded
                    </span>
                  )}
                  {module.health_status === 'offline' && (
                    <span 
                      className="px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--color-danger)',
                        borderRadius: 'var(--button-radius)',
                      }}
                    >
                      ● Offline
                    </span>
                  )}
                </div>
              </div>
              {module.icon_url && (
                <img
                  src={module.icon_url}
                  alt={module.name}
                  className="w-24 h-24 object-contain"
                />
              )}
            </div>

            {module.description && (
              <p className="text-lg mb-6" style={{ color: 'var(--color-text-main)' }}>{module.description}</p>
            )}

            {/* Subscription Info */}
            {module.subscription && (
              <div className="pt-6 mt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>Subscription Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Status:</span>
                    <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>{module.subscription.status}</span>
                  </div>
                  {module.subscription.plan && (
                    <div>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Plan:</span>
                      <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>{module.subscription.plan}</span>
                    </div>
                  )}
                  {module.subscription.usage_limit && (
                    <div>
                      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Usage Limit:</span>
                      <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>{module.subscription.usage_limit}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment Method (Universal - shown for all modules) */}
            <div className="pt-6 mt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
              <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>Payment Method</h3>
              {billing?.payment_method ? (
                <div className="flex items-center gap-4">
                  {billing.payment_method.card ? (
                    <div className="flex items-center gap-3">
                      <div 
                        className="px-3 py-2 font-semibold text-sm"
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.05)',
                          borderRadius: 'var(--button-radius)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {billing.payment_method.card.brand}
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: 'var(--color-text-main)' }}>
                          •••• •••• •••• {billing.payment_method.card.last4}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          Expires {billing.payment_method.card.exp_month}/{billing.payment_method.card.exp_year}
                        </p>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Payment method on file</p>
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Payment method on file</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                    No payment method on file. Add a payment method to activate modules.
                  </p>
                  <Link
                    href="/dashboard/v2/settings/billing"
                    className="inline-block px-4 py-2 font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      color: 'white',
                      borderRadius: 'var(--button-radius)',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Add Payment Method
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            {module.subscribed ? (
              <>
                <Link
                  href={
                    moduleKey === 'orbix-network'
                      ? '/dashboard/v2/modules/orbix-network/settings'
                      : moduleKey === 'kidquiz'
                        ? '/dashboard/v2/modules/kidquiz/settings'
                        : moduleKey === 'movie-review'
                          ? '/dashboard/v2/modules/movie-review/settings'
                          : moduleKey === 'dad-joke-studio'
                            ? '/dashboard/v2/modules/dad-joke-studio/dashboard'
                            : '/dashboard/v2/settings/modules'
                  }
                  className="px-6 py-3 text-white font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  Configure Module
                </Link>
                <Link
                  href={moduleKey === 'phone-agent' ? '/tavari-ai-phone/dashboard' : moduleKey === 'reviews' ? '/review-reply-ai/dashboard' : (moduleKey === 'delivery-dispatch' || moduleKey === 'emergency-dispatch') ? `/dashboard/v2/modules/${moduleKey}` : `/dashboard/v2/modules/${moduleKey}/dashboard`}
                  className="px-6 py-3 font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-main)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--color-surface)'}
                >
                  Open Module Dashboard
                </Link>
              </>
            ) : (
              <div 
                className="shadow p-6 flex-1"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                }}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Activate This Module</h3>
                <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  Get started with {module.name} and unlock all features.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => setIsActivationModalOpen(true)}
                    className="px-6 py-3 text-white font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Activate Module
                  </button>
                  {/* Test Mode Button - Only visible in development */}
                  {(process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location.hostname === 'localhost')) && (
                    <button
                      onClick={async () => {
                        if (confirm('Activate in TEST MODE? This will skip payment and create a test subscription for development.')) {
                          setActivating(true);
                          try {
                            const headers = getAuthHeaders();
                            const businessId = getActiveBusinessId();
                            if (businessId) {
                              headers['X-Active-Business-Id'] = businessId;
                            }
                            
                            const res = await fetch(`${API_URL}/api/v2/modules/${moduleKey}/activate?test=true`, {
                              method: 'POST',
                              headers,
                            });
                            
                            if (res.ok) {
                              const data = await res.json();
                              alert(data.message || 'Test subscription activated!');
                              if (data.redirect_to) {
                                window.location.href = data.redirect_to;
                              } else {
                                window.location.reload();
                              }
                            } else {
                              const errorData = await res.json();
                              alert(errorData.error || 'Failed to activate test subscription');
                            }
                          } catch (err) {
                            console.error('[Test Activation] Error:', err);
                            alert('Failed to activate test subscription. Please try again.');
                          } finally {
                            setActivating(false);
                          }
                        }
                      }}
                      disabled={activating}
                      className="px-6 py-3 font-medium transition-colors"
                      style={{
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                        opacity: activating ? 0.6 : 1,
                        cursor: activating ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!activating) e.target.style.opacity = '0.9';
                      }}
                      onMouseLeave={(e) => {
                        if (!activating) e.target.style.opacity = '1';
                      }}
                    >
                      {activating ? 'Activating...' : '🧪 Test Mode (No Payment)'}
                    </button>
                  )}
                  <button
                    onClick={() => setIsPricingModalOpen(true)}
                    className="px-6 py-3 font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'var(--color-surface)';
                    }}
                  >
                    View Pricing
                  </button>
                  <Link
                    href="/dashboard/v2/settings/billing"
                    className="px-6 py-3 font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'var(--color-surface)';
                    }}
                  >
                    View Billing
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Module Links */}
          <div 
            className="mt-6 shadow"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--card-radius)',
              padding: 'var(--padding-base)',
            }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>Module Resources</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                href={moduleKey === 'phone-agent' ? '/tavari-ai-phone/landing' : moduleKey === 'reviews' ? '/review-reply-ai/landing' : `/${moduleKey}/landing`}
                className="p-4 transition-all"
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--card-radius)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div className="font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>Landing Page</div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>View public landing page</div>
              </Link>
              {module.subscribed && (
                <Link
                  href={moduleKey === 'phone-agent' ? '/tavari-ai-phone/clickbank' : moduleKey === 'reviews' ? '/review-reply-ai/clickbank' : `/${moduleKey}/clickbank`}
                  className="p-4 transition-all"
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--card-radius)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>ClickBank</div>
                  <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>ClickBank integration</div>
                </Link>
              )}
            </div>
          </div>
            </div>
          </div>
        </div>
        
        {/* Pricing Modal */}
        <PricingModal 
          isOpen={isPricingModalOpen} 
          onClose={() => setIsPricingModalOpen(false)}
          module={module}
        />
        
        {/* Activation Confirmation Modal */}
        <ModuleActivationModal
          isOpen={isActivationModalOpen}
          onClose={() => {
            setIsActivationModalOpen(false);
            setActivating(false);
          }}
          onConfirm={async () => {
            try {
              setActivating(true);
              const headers = getAuthHeaders();
              const termsVersion = process.env.NEXT_PUBLIC_TERMS_VERSION || '1.0.0';
              await fetch(`${API_URL}/api/v2/auth/accept-terms`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ terms_version: termsVersion }),
              });
              const response = await modulesAPI.activate(moduleKey);
              setIsActivationModalOpen(false);
              if (response.data.redirect_to) {
                router.push(response.data.redirect_to);
              } else {
                router.push(getModulePostActivatePath(moduleKey));
              }
            } catch (error) {
              console.error('Failed to activate module:', error);
              const code = error.response?.data?.code;
              const status = error.response?.status;
              if ((status === 403 && code === 'TERMS_NOT_ACCEPTED') || code === 'TERMS_NOT_ACCEPTED') {
                setIsActivationModalOpen(false);
                setActivating(false);
                const returnUrl = `/dashboard/v2/modules/${moduleKey}`;
                router.push(`/accept-terms?return=${encodeURIComponent(returnUrl)}`);
                return;
              }
              alert(error.response?.data?.message || 'Failed to activate module. Please try again.');
              setActivating(false);
              throw error; // Re-throw so modal stays open
            }
          }}
          moduleName={module?.name || 'this module'}
          moduleKey={moduleKey}
        />
      </AuthGuard>
    );
  }

