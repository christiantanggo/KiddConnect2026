'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';

function PackageDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { error: showError } = useToast();
  const packageId = params.id;
  const [pkg, setPkg] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (packageId) {
      loadPackage();
    }
  }, [packageId]);

  const getAdminToken = () => {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  };

  const loadPackage = async () => {
    try {
      setLoading(true);
      const token = getAdminToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca';
      const response = await fetch(`${API_URL}/api/admin/packages/${packageId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load package');
      const data = await response.json();
      setPkg(data.package);
      setBusinesses(data.package.businesses || []);
    } catch (error) {
      console.error('Failed to load package:', error);
      showError('Failed to load package');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading package...</div>
        </div>
      </AdminGuard>
    );
  }

  if (!pkg) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Package not found</h2>
            <Link href="/admin/packages" className="text-blue-600 hover:text-blue-800">
              Back to Packages
            </Link>
          </div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Package Details</h1>
            <div className="flex gap-4">
              <Link href="/admin/packages" className="text-gray-700 hover:text-blue-600">
                Packages
              </Link>
              <Link href="/admin-dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
              <button
                onClick={() => {
                  document.cookie = 'admin_token=; path=/; max-age=0';
                  router.push('/admin/login');
                }}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-6">
            <Link 
              href={
                pkg.module_key === 'reviews' 
                  ? '/review-reply-ai/package'
                  : pkg.module_key === 'phone-agent'
                  ? '/tavari-ai-phone/package'
                  : '/admin/packages'
              } 
              className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
            >
              ← Back to Packages
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{pkg.name}</h2>
                {pkg.description && (
                  <p className="text-gray-600">{pkg.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                {pkg.is_active ? (
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
                    Active
                  </span>
                ) : (
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-800">
                    Inactive
                  </span>
                )}
                {pkg.is_public ? (
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                    Public
                  </span>
                ) : (
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-yellow-100 text-yellow-800">
                    Private
                  </span>
                )}
              </div>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 ${pkg.module_key === 'reviews' ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-4 mb-6`}>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Monthly Price</div>
                <div className="text-2xl font-bold text-gray-900">${parseFloat(pkg.monthly_price).toFixed(2)}</div>
              </div>
              {pkg.module_key === 'reviews' ? (
                // Review Reply AI fields
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Prompts Included</div>
                  <div className="text-2xl font-bold text-gray-900">{pkg.prompts_included || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">prompts/month</div>
                </div>
              ) : (
                // Phone Agent fields
                <>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Minutes Included</div>
                    <div className="text-2xl font-bold text-gray-900">{pkg.minutes_included}</div>
                    {pkg.overage_price_per_minute > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        ${parseFloat(pkg.overage_price_per_minute).toFixed(4)}/min overage
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">SMS Included</div>
                    <div className="text-2xl font-bold text-gray-900">{pkg.sms_included || 0}</div>
                    {pkg.sms_overage_price > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        ${parseFloat(pkg.sms_overage_price).toFixed(4)} overage
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">Emails Included</div>
                    <div className="text-2xl font-bold text-gray-900">{pkg.emails_included || 0}</div>
                    {pkg.emails_overage_price > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        ${parseFloat(pkg.emails_overage_price).toFixed(4)} overage
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="border-t pt-4">
              <div className={`grid grid-cols-2 ${pkg.module_key === 'reviews' ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 text-sm`}>
                {pkg.module_key === 'phone-agent' && (
                  <div>
                    <div className="text-gray-600">Max FAQs</div>
                    <div className="font-medium text-gray-900">{pkg.max_faqs}</div>
                  </div>
                )}
                {pkg.stripe_product_id && (
                  <div>
                    <div className="text-gray-600">Stripe Product ID</div>
                    <div className="font-medium text-gray-900 font-mono text-xs">{pkg.stripe_product_id}</div>
                  </div>
                )}
                {pkg.stripe_price_id && (
                  <div>
                    <div className="text-gray-600">Stripe Price ID</div>
                    <div className="font-medium text-gray-900 font-mono text-xs">{pkg.stripe_price_id}</div>
                  </div>
                )}
                <div>
                  <div className="text-gray-600">Created</div>
                  <div className="font-medium text-gray-900">
                    {new Date(pkg.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                Assigned Businesses ({pkg.business_count || 0})
              </h3>
              {pkg.business_count === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No businesses are currently assigned to this package. This package can be safely discontinued.
                </p>
              )}
            </div>

            {businesses.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>No businesses assigned to this package.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {businesses.map((business) => (
                      <tr key={business.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {business.name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {business.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {business.ai_enabled ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(business.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link
                            href={`/admin/accounts/${business.id}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default PackageDetailPage;

