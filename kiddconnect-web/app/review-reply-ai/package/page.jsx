'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { adminPackagesAPI } from '@/lib/api';

function ReviewReplyAIPackagesPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const MODULE_KEY = 'reviews'; // Fixed module key for Review Reply AI
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    monthly_price: '',
    prompts_included: 0,
    stripe_product_id: '',
    stripe_price_id: '',
    is_active: true,
    is_public: true,
    sale_name: '',
    sale_start_date: '',
    sale_end_date: '',
    sale_max_quantity: '',
    sale_sold_count: 0,
    sale_price: '',
    sale_duration_months: '',
    is_clickbank_package: false,
    clickbank_commission_rate: '',
  });

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const response = await adminPackagesAPI.getPackages(true, MODULE_KEY);
      setPackages(response.data.packages || []);
    } catch (error) {
      console.error('Failed to load packages:', error);
      showError('Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const packageData = {
        ...formData,
        monthly_price: parseFloat(formData.monthly_price),
        module_key: MODULE_KEY,
        prompts_included: parseInt(formData.prompts_included) || 0,
        // Sale fields
        sale_name: formData.sale_name || null,
        sale_start_date: formData.sale_start_date || null,
        sale_end_date: formData.sale_end_date || null,
        sale_max_quantity: formData.sale_max_quantity ? parseInt(formData.sale_max_quantity) : null,
        sale_sold_count: parseInt(formData.sale_sold_count) || 0,
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : null,
        sale_duration_months: formData.sale_duration_months ? parseInt(formData.sale_duration_months) : null,
        // ClickBank fields
        is_clickbank_package: formData.is_clickbank_package || false,
        clickbank_commission_rate: formData.is_clickbank_package && formData.clickbank_commission_rate ? parseFloat(formData.clickbank_commission_rate) : null,
      };

      if (editingPackage) {
        await adminPackagesAPI.updatePackage(editingPackage.id, packageData);
      } else {
        await adminPackagesAPI.createPackage(packageData);
      }

      success(editingPackage ? 'Package updated successfully!' : 'Package created successfully!');
      setShowForm(false);
      setEditingPackage(null);
      resetForm();
      await loadPackages();
    } catch (error) {
      console.error('Failed to save package:', error);
      showError(error.response?.data?.error || error.message || 'Failed to save package');
    }
  };

  const handleEdit = (pkg) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name || '',
      description: pkg.description || '',
      monthly_price: pkg.monthly_price || '',
      prompts_included: pkg.prompts_included || 0,
      stripe_product_id: pkg.stripe_product_id || '',
      stripe_price_id: pkg.stripe_price_id || '',
      is_active: pkg.is_active ?? true,
      is_public: pkg.is_public ?? true,
      sale_name: pkg.sale_name || '',
      sale_start_date: pkg.sale_start_date || '',
      sale_end_date: pkg.sale_end_date || '',
      sale_max_quantity: pkg.sale_max_quantity || '',
      sale_sold_count: pkg.sale_sold_count || 0,
      sale_price: pkg.sale_price || '',
      sale_duration_months: pkg.sale_duration_months || '',
      is_clickbank_package: pkg.is_clickbank_package || false,
      clickbank_commission_rate: pkg.clickbank_commission_rate || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (pkg) => {
    if (!confirm(`Are you sure you want to delete "${pkg.name}"?`)) {
      return;
    }

    try {
      await adminPackagesAPI.deletePackage(pkg.id);
      success('Package deleted successfully!');
      await loadPackages();
    } catch (error) {
      console.error('Failed to delete package:', error);
      showError(error.response?.data?.error || error.message || 'Failed to delete package');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      monthly_price: '',
      prompts_included: 0,
      stripe_product_id: '',
      stripe_price_id: '',
      is_active: true,
      is_public: true,
      sale_name: '',
      sale_start_date: '',
      sale_end_date: '',
      sale_max_quantity: '',
      sale_sold_count: 0,
      sale_price: '',
      sale_duration_months: '',
      is_clickbank_package: false,
      clickbank_commission_rate: '',
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPackage(null);
    resetForm();
  };

  const handleLogout = () => {
    document.cookie = 'admin_token=; path=/; max-age=0';
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/review-reply-ai/admin-dashboard" className="text-blue-600 hover:text-blue-700">
                ← Back to Dashboard
              </Link>
              <h1 className="text-xl font-bold text-blue-600">Tavari AI Review Reply - Pricing Packages</h1>
            </div>
            <div className="flex gap-4 items-center">
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                Support Tickets
              </Link>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Pricing Packages (Tavari AI Review Reply)</h2>
            <button
              onClick={() => {
                resetForm();
                setEditingPackage(null);
                setShowForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              + Create Package
            </button>
          </div>

          {showForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">
                {editingPackage ? 'Edit Package' : 'Create New Package'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Package Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Monthly Price ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.monthly_price}
                      onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Prompts Included *</label>
                    <input
                      type="number"
                      value={formData.prompts_included || 0}
                      onChange={(e) => setFormData({ ...formData, prompts_included: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      required
                      placeholder="e.g., 100, 500, 1000"
                    />
                    <p className="text-xs text-gray-500 mt-1">Number of review reply prompts included per month</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Stripe Product ID</label>
                    <input
                      type="text"
                      value={formData.stripe_product_id}
                      onChange={(e) => setFormData({ ...formData, stripe_product_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Stripe Price ID</label>
                    <input
                      type="text"
                      value={formData.stripe_price_id}
                      onChange={(e) => setFormData({ ...formData, stripe_price_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                  />
                </div>
                <div className="flex gap-4 flex-wrap">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_public}
                      onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Public (Available for new signups)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_clickbank_package}
                      onChange={(e) => setFormData({ ...formData, is_clickbank_package: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Mark as ClickBank Package</span>
                  </label>
                </div>
                
                {formData.is_clickbank_package && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">ClickBank Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.clickbank_commission_rate}
                      onChange={(e) => setFormData({ ...formData, clickbank_commission_rate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="e.g., 75.00 for 75%"
                    />
                    <p className="text-xs text-gray-500 mt-1">Commission rate percentage for ClickBank affiliates (0-100)</p>
                  </div>
                )}
                
                {/* Sale/Promotion Section */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Sale/Promotion Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Sale Name</label>
                      <input
                        type="text"
                        value={formData.sale_name}
                        onChange={(e) => setFormData({ ...formData, sale_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        placeholder="e.g., Black Friday Sale"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave empty to disable sale</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date (Optional)</label>
                      <input
                        type="date"
                        value={formData.sale_start_date}
                        onChange={(e) => setFormData({ ...formData, sale_start_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">Sale starts immediately if not set</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">End Date (Optional)</label>
                      <input
                        type="date"
                        value={formData.sale_end_date}
                        onChange={(e) => setFormData({ ...formData, sale_end_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave empty for quantity-only sales</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Max Quantity (Optional)</label>
                      <input
                        type="number"
                        value={formData.sale_max_quantity}
                        onChange={(e) => setFormData({ ...formData, sale_max_quantity: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        placeholder="Leave empty for unlimited"
                      />
                      <p className="text-xs text-gray-500 mt-1">Maximum number of plans to sell during this sale</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Sale Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.sale_price}
                        onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Sale Duration (Months)</label>
                      <input
                        type="number"
                        value={formData.sale_duration_months}
                        onChange={(e) => setFormData({ ...formData, sale_duration_months: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    {editingPackage ? 'Update Package' : 'Create Package'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prompts</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Businesses</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {packages.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        No packages found. Create your first package above.
                      </td>
                    </tr>
                  ) : (
                    packages.map((pkg) => (
                      <tr key={pkg.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{pkg.name}</div>
                          {pkg.description && (
                            <div className="text-xs text-gray-500">{pkg.description}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${parseFloat(pkg.monthly_price).toFixed(2)}/mo
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {pkg.prompts_included || 0} prompts/month
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            href={`/admin/packages/${pkg.id}`}
                            className={`text-sm font-medium ${
                              pkg.business_count > 0
                                ? 'text-blue-600 hover:text-blue-800'
                                : 'text-gray-500'
                            }`}
                          >
                            {pkg.business_count || 0} business{pkg.business_count !== 1 ? 'es' : ''}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {pkg.is_active ? (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                Inactive
                              </span>
                            )}
                            {pkg.is_public ? (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                Public
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                Private
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(pkg)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <Link
                              href={`/admin/packages/${pkg.id}`}
                              className="text-green-600 hover:text-green-800"
                            >
                              View
                            </Link>
                            {pkg.business_count === 0 && (
                              <button
                                onClick={() => handleDelete(pkg)}
                                className="text-red-600 hover:text-red-800"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default ReviewReplyAIPackagesPage;

