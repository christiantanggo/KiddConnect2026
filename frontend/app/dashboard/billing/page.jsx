'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, billingAPI, usageAPI, invoicesAPI } from '@/lib/api';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
// Removed Helcim.js form - using hosted payment pages instead

function BillingPage() {
  const { success, error: showError } = useToast();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [billing, setBilling] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [settings, setSettings] = useState({
    minutes_exhausted_behavior: 'disable_ai',
    overage_billing_enabled: false,
    overage_cap_minutes: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userRes, usageRes, billingRes, invoicesRes, packagesRes] = await Promise.all([
        authAPI.getMe(),
        usageAPI.getStatus().catch(() => ({ data: null })),
        billingAPI.getStatus().catch(() => ({ data: null })),
        invoicesAPI.list().catch(() => ({ data: { invoices: [] } })),
        billingAPI.getPackages().catch(() => ({ data: { packages: [] } })),
      ]);
      setUser(userRes.data);
      setUsage(usageRes.data);
      setBilling(billingRes.data);
      setInvoices(invoicesRes.data.invoices || []);
      setPackages(packagesRes.data.packages || []);
      
      // Debug logging for subscription price
      console.log('[Billing Page] Billing data:', billingRes.data);
      console.log('[Billing Page] Subscription:', billingRes.data?.subscription);
      console.log('[Billing Page] Subscription price:', billingRes.data?.subscription?.price);
      console.log('[Billing Page] Subscription_price:', billingRes.data?.subscription_price);
      console.log('[Billing Page] Plan tier:', billingRes.data?.plan_tier);
      
      if (userRes.data?.business) {
        setSettings({
          minutes_exhausted_behavior: userRes.data.business.minutes_exhausted_behavior || 'disable_ai',
          overage_billing_enabled: userRes.data.business.overage_billing_enabled || false,
          overage_cap_minutes: userRes.data.business.overage_cap_minutes || null,
        });
      }
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update billing settings
      const { businessAPI } = await import('@/lib/api');
      await businessAPI.updateSettings(settings);
      success('Settings saved successfully!');
      await loadData();
    } catch (error) {
      console.error('Save error:', error);
      showError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = async (packageId) => {
    // Handle plan upgrade - packageId should be passed from the plan selection
    try {
      const res = await billingAPI.createCheckout(packageId);
      
      // If payment was processed successfully (has transactionId)
      if (res.data.success && res.data.transactionId) {
        success('Payment processed successfully!');
        await loadData(); // Reload to show updated subscription
        // Redirect to success page if URL provided
        if (res.data.url) {
          window.location.href = res.data.url;
        }
        return;
      }
      
      // If redirect URL is provided (for hosted payment page)
      if (res.data.url) {
        window.location.href = res.data.url;
        return;
      }
      
      // Fallback success message
      success('Subscription created successfully!');
      await loadData();
    } catch (error) {
      console.error('Upgrade error:', error);
      
      // Handle 402 Payment Required - user needs to add payment method first
      if (error.response?.status === 402) {
        const errorData = error.response?.data || {};
        showError(errorData.message || 'Please add a payment method first, then try again.');
        
        // Automatically redirect to add payment method after a short delay
        setTimeout(() => {
          handleManageBilling(); // This will redirect to hosted payment page
        }, 2000);
        return;
      }
      
      // Handle other errors
      showError(error.response?.data?.error || error.response?.data?.message || 'Failed to start upgrade process');
    }
  };

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      console.log('[Billing] Getting Stripe Customer Portal URL...');
      const res = await billingAPI.getPortal();
      console.log('[Billing] Portal response:', res.data);
      
      if (res.data.url) {
        // Redirect to Stripe Customer Portal
        // This allows users to manage payment methods, update billing info, and view invoices
        window.location.href = res.data.url;
      } else {
        showError('Payment portal not available. Please contact support.');
      }
    } catch (error) {
      console.error('[Billing] Failed to get portal URL:', error);
      const errorData = error.response?.data || {};
      
      if (error.response?.status === 400) {
        // No Stripe customer - need to complete checkout first
        showError(errorData.message || 'Please complete checkout first before managing payment methods.');
      } else if (error.response?.status === 503) {
        showError(errorData.message || 'Payment portal is not configured. Please contact support.');
      } else {
        showError(errorData.message || 'Failed to load payment portal. Please try again or contact support.');
      }
    } finally {
      setLoadingPortal(false);
    }
  };


  const formatCardNumber = (last4) => {
    return `•••• •••• •••• ${last4}`;
  };

  const formatExpiry = (month, year) => {
    return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
  };

  const getPlanDetails = (tier) => {
    const plans = {
      starter: { price: 79, minutes: 250, faqs: 5, name: 'Starter' },
      core: { price: 129, minutes: 500, faqs: 10, name: 'Core' },
      pro: { price: 179, minutes: 750, faqs: 20, name: 'Pro' },
    };
    return plans[tier] || plans.starter;
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Billing & Usage</h1>
            <div className="flex gap-4 items-center">
              <Link href="/dashboard/invoices" className="text-gray-700 hover:text-blue-600">
                Invoices
              </Link>
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Current Plan */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Current Plan</h2>
                  <button
                    onClick={handleManageBilling}
                    disabled={loadingPortal}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPortal ? 'Loading...' : 'Manage Billing'}
                  </button>
                </div>
                
                {billing?.subscription ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                      <div>
                        <p className="text-lg font-semibold text-gray-900 capitalize">
                          {getPlanDetails(billing.plan_tier).name} Plan
                        </p>
                        <p className="text-sm text-gray-600">
                          ${(() => {
                            const price = billing.subscription?.price || billing.subscription_price || getPlanDetails(billing.plan_tier).price;
                            console.log('[Billing Page] Display price calculation:', {
                              'subscription.price': billing.subscription?.price,
                              'subscription_price': billing.subscription_price,
                              'plan_tier price': getPlanDetails(billing.plan_tier).price,
                              'final price': price
                            });
                            return typeof price === 'number' ? price.toFixed(2) : parseFloat(price || 0).toFixed(2);
                          })()}/month
                        </p>
                      </div>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        billing.subscription.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : billing.subscription.status === 'canceled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {billing.subscription.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Included Minutes</p>
                        <p className="text-lg font-semibold text-gray-900">{billing.usage_limit_minutes || 250}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">FAQs</p>
                        <p className="text-lg font-semibold text-gray-900">{getPlanDetails(billing.plan_tier).faqs}</p>
                      </div>
                    </div>
                    
                    {billing.subscription.current_period_end && (
                      <div className="pt-4 border-t">
                        <p className="text-sm text-gray-600">
                          {(() => {
                            const timestamp = billing.subscription.current_period_end * 1000;
                            const date = new Date(timestamp);
                            const formatted = date.toLocaleDateString('en-US');
                            return billing.subscription.cancel_at_period_end 
                              ? `Subscription will cancel on ${formatted}`
                              : `Next billing date: ${formatted}`;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-600 mb-4">No active subscription</p>
                    <p className="text-sm text-gray-500">Select a plan below to get started</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Payment Method</h2>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  title="Refresh payment method status"
                >
                  🔄 Refresh
                </button>
              </div>
              {billing?.payment_method ? (
                <div className="space-y-4">
                  {billing.payment_method.card ? (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Card</span>
                        <span className="text-xs text-gray-500 uppercase">
                          {billing.payment_method.card.brand}
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {formatCardNumber(billing.payment_method.card.last4)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Expires {formatExpiry(billing.payment_method.card.exp_month, billing.payment_method.card.exp_year)}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">Payment method on file</p>
                    </div>
                  )}
                  <button
                    onClick={handleManageBilling}
                    disabled={loadingPortal}
                    className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPortal ? 'Loading...' : 'Update Payment Method'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-600 mb-4">No payment method on file</p>
                  <button
                    onClick={handleManageBilling}
                    disabled={loadingPortal}
                    className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPortal ? 'Loading...' : 'Add Payment Method'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Usage */}
          {usage && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold mb-4 text-gray-900">Usage This Month</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Minutes Used</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {usage.minutes_used?.toFixed(0) || 0} / {usage.minutes_total || 0}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full ${
                      usage.usage_percent >= 100
                        ? 'bg-red-500'
                        : usage.usage_percent >= 80
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(usage.usage_percent || 0, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{usage.minutes_remaining || 0} minutes remaining</span>
                  <span>{usage.usage_percent || 0}% used</span>
                </div>
                {usage.billing_cycle_end && (
                  <p className="text-sm text-gray-500">
                    Minutes reset on {(() => {
                      const dateStr = usage.billing_cycle_end;
                      if (!dateStr) return 'N/A';
                      let date;
                      if (dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)) {
                        date = new Date(dateStr);
                      } else {
                        date = new Date(dateStr + 'Z');
                      }
                      return date.toLocaleDateString('en-US');
                    })()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Minutes Exhaustion Settings */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">When Minutes Are Exhausted</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Behavior
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="behavior"
                      value="disable_ai"
                      checked={settings.minutes_exhausted_behavior === 'disable_ai'}
                      onChange={(e) => setSettings({ ...settings, minutes_exhausted_behavior: e.target.value, overage_billing_enabled: false })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium">Disable AI (Default)</span>
                      <p className="text-xs text-gray-500">AI turns off, calls forward to your restaurant. AI resumes on next billing date.</p>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="behavior"
                      value="allow_overage"
                      checked={settings.minutes_exhausted_behavior === 'allow_overage'}
                      onChange={(e) => setSettings({ ...settings, minutes_exhausted_behavior: e.target.value, overage_billing_enabled: true })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium">Allow Overage Billing</span>
                      <p className="text-xs text-gray-500">AI continues, you're charged at your plan's overage rate until monthly cap is reached.</p>
                    </div>
                  </label>
                </div>
              </div>

              {settings.minutes_exhausted_behavior === 'allow_overage' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Monthly Overage Cap (required)
                  </label>
                  <input
                    type="number"
                    value={settings.overage_cap_minutes || ''}
                    onChange={(e) => setSettings({ ...settings, overage_cap_minutes: parseInt(e.target.value) || null })}
                    placeholder="e.g., 200"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum overage minutes per month. AI stops when cap is reached.</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          {invoices.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Recent Invoices</h2>
                <Link href="/dashboard/invoices" className="text-sm text-blue-600 hover:text-blue-800">
                  View All →
                </Link>
              </div>
              <div className="space-y-3">
                {invoices.slice(0, 3).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                      <p className="text-sm text-gray-600">
                        {(() => {
                          const dateStr = invoice.created_at;
                          if (!dateStr) return 'N/A';
                          let date;
                          if (dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('-', 10)) {
                            date = new Date(dateStr);
                          } else {
                            date = new Date(dateStr + 'Z');
                          }
                          return date.toLocaleDateString('en-US');
                        })()} • {invoice.invoice_type.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">${invoice.amount?.toFixed(2) || '0.00'}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Plans */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Available Plans</h2>
            {packages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No packages available at this time.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {packages.map((pkg) => {
                  const isCurrent = user?.business?.package_id === pkg.id;
                  const currentPackage = packages.find(p => p.id === user?.business?.package_id);
                  const currentPackagePrice = currentPackage?.monthly_price || 0;
                  const isOnSale = pkg.isOnSale && pkg.saleAvailable && pkg.sale_price;
                  const displayPrice = isOnSale ? pkg.sale_price : pkg.monthly_price;
                  // Compare using display price (sale price if on sale, otherwise regular price)
                  const isUpgrade = parseFloat(displayPrice) > currentPackagePrice;
                  
                  return (
                    <div 
                      key={pkg.id}
                      className={`border rounded-lg p-6 ${
                        isCurrent 
                          ? 'border-blue-500 bg-blue-50' 
                          : isUpgrade
                          ? 'border-green-500'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
                        <div className="flex gap-2 items-center">
                          {isOnSale && (
                            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full font-medium">
                              Sale
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                              Current
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mb-1">
                        <p className="text-3xl font-bold text-gray-900">
                          ${(parseFloat(displayPrice) || 0).toFixed(2)}
                          <span className="text-sm font-normal text-gray-600">/month</span>
                        </p>
                        {isOnSale && pkg.monthly_price && (
                          <p className="text-sm text-gray-500 line-through mt-1">
                            ${(parseFloat(pkg.monthly_price) || 0).toFixed(2)}/month
                          </p>
                        )}
                        {isOnSale && pkg.sale_name && (
                          <p className="text-xs text-red-600 font-medium mt-1">{pkg.sale_name}</p>
                        )}
                        {isOnSale && pkg.sale_duration_months && (
                          <p className="text-xs text-gray-500 mt-1">
                            Valid for {pkg.sale_duration_months} {pkg.sale_duration_months === 1 ? 'month' : 'months'}
                          </p>
                        )}
                        {isOnSale && pkg.sale_max_quantity && (
                          <p className="text-xs text-orange-600 font-medium mt-1">
                            Limited availability
                          </p>
                        )}
                      </div>
                      {pkg.description && (
                        <p className="text-sm text-gray-600 mb-4">{pkg.description}</p>
                      )}
                      <div className="space-y-2 mb-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          {pkg.minutes_included} minutes/month
                        </div>
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          {pkg.max_faqs} FAQs
                        </div>
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Email & SMS notifications
                        </div>
                      </div>
                      <button
                        onClick={() => handleUpgrade(pkg.id)}
                        disabled={isCurrent}
                        className={`w-full px-4 py-2 rounded-md font-medium ${
                          isCurrent
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : isUpgrade
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {isCurrent ? 'Current Plan' : isUpgrade ? 'Upgrade' : 'Select'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </main>
      </div>
      
      {/* Payment form removed - using Helcim hosted payment pages instead */}
    </AuthGuard>
  );
}

export default BillingPage;

