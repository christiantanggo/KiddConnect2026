'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { adminInvoiceSettingsAPI } from '@/lib/api';

function InvoiceSettingsPage() {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_email: '',
    hst_number: '',
    tax_rate: 0.13, // Default 13% HST
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await adminInvoiceSettingsAPI.get();
      const settings = response.data.settings || {};
      setFormData({
        company_name: settings.company_name || '',
        company_address: settings.company_address || '',
        company_email: settings.company_email || '',
        hst_number: settings.hst_number || '',
        tax_rate: settings.tax_rate || 0.13,
      });
    } catch (error) {
      console.error('Failed to load invoice settings:', error);
      showError('Failed to load invoice settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const settingsData = {
        company_name: formData.company_name,
        company_address: formData.company_address,
        company_email: formData.company_email,
        hst_number: formData.hst_number,
        tax_rate: parseFloat(formData.tax_rate),
      };
      
      await adminInvoiceSettingsAPI.update(settingsData);
      success('Invoice settings saved successfully!');
    } catch (error) {
      console.error('Failed to save invoice settings:', error);
      showError(error.response?.data?.error || error.message || 'Failed to save invoice settings');
    } finally {
      setSaving(false);
    }
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
            <h1 className="text-xl font-bold text-blue-600">Invoice Settings</h1>
            <div className="flex gap-4 items-center">
              <Link href="/admin-dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/pricing" className="text-blue-600 font-medium">
                Pricing
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/settings" className="text-gray-700 hover:text-blue-600">
                Settings
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/website-analytics" className="text-gray-700 hover:text-blue-600">
                Website Analytics
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                Support Tickets
              </Link>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => {
                  document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                  window.location.href = '/admin/login';
                }}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Company Invoice Information</h2>
            <p className="text-gray-600 mb-6">
              Configure the company information that appears on all invoices. This includes your company name, address, HST number, and default tax rate.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Tavari"
                />
              </div>

              {/* Company Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Address
                </label>
                <textarea
                  value={formData.company_address}
                  onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="123 Main Street&#10;Toronto, ON M5H 2N2&#10;Canada"
                />
                <p className="text-xs text-gray-500 mt-1">Enter address on separate lines</p>
              </div>

              {/* Company Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.company_email}
                  onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="info@tanggo.ca"
                />
                <p className="text-xs text-gray-500 mt-1">Used for invoice contact information</p>
              </div>

              {/* HST Number */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  HST Number
                </label>
                <input
                  type="text"
                  value={formData.hst_number}
                  onChange={(e) => setFormData({ ...formData, hst_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123456789 RT0001"
                />
                <p className="text-xs text-gray-500 mt-1">Canadian HST registration number</p>
              </div>

              {/* Tax Rate */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Default Tax Rate (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="1"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="0.13"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default tax rate as a decimal (e.g., 0.13 for 13% HST). This can be overridden per invoice if needed.
                  <br />
                  <span className="font-semibold">Note:</span> Taxes are calculated and controlled from Tavari, not Stripe.
                  Make sure Stripe checkout sessions do not include automatic tax calculation.
                </p>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-4 border-t">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>

          {/* Information Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <h3 className="font-semibold text-blue-900 mb-2">About Invoice Settings</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Company information appears on all invoice PDFs</li>
              <li>Tax rate is applied to all invoices unless overridden per invoice</li>
              <li>Make sure to disable automatic tax calculation in Stripe to use Tavari tax rates</li>
              <li>Invoice numbers are generated automatically in the format: {`{account_number}-{MMDDYYYY}-{sequential}`}</li>
            </ul>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default InvoiceSettingsPage;

