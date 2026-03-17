'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

export default function BusinessSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    timezone: 'America/New_York',
    website: '',
    public_phone_number: '',
    legal_name: '',
    display_name: '',
  });

  useEffect(() => {
    loadBusiness();
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

  const loadBusiness = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/v2/settings/business`, {
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setBusiness(data.business);
        setFormData({
          name: data.business.name || '',
          email: data.business.email || '',
          phone: data.business.phone || '',
          address: data.business.address || '',
          timezone: data.business.timezone || 'America/New_York',
          website: data.business.website || '',
          public_phone_number: data.business.public_phone_number || '',
          legal_name: data.business.legal_name || data.business.name || '',
          display_name: data.business.display_name || data.business.name || '',
        });
      } else {
        setError('Failed to load business settings');
      }
    } catch (err) {
      console.error('[Business Settings] Error:', err);
      setError('Failed to load business settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_URL}/api/v2/settings/business`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        setBusiness(data.business);
        setSuccess('Business settings updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to update business settings');
      }
    } catch (err) {
      console.error('[Business Settings] Error:', err);
      setError('Failed to update business settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
  ];

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
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
            <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Business Profile</h1>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Update your business information and profile details
            </p>
          </div>

          {/* Messages */}
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

          {success && (
            <div 
              className="px-4 py-3 mb-6"
              style={{
                backgroundColor: 'rgba(20, 184, 166, 0.1)',
                border: '1px solid rgba(20, 184, 166, 0.2)',
                color: 'var(--color-accent)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div 
              className="shadow mb-6"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--card-radius)',
                padding: 'var(--padding-base)',
              }}
            >
              <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--color-text-main)' }}>Basic Information</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Business Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    name="display_name"
                    value={formData.display_name}
                    onChange={handleChange}
                    placeholder="Name shown to customers"
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Legal Name
                  </label>
                  <input
                    type="text"
                    name="legal_name"
                    value={formData.legal_name}
                    onChange={handleChange}
                    placeholder="Legal business name"
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Public Phone Number
                  </label>
                  <input
                    type="tel"
                    name="public_phone_number"
                    value={formData.public_phone_number}
                    onChange={handleChange}
                    placeholder="Customer-facing phone number"
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Website
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder="https://example.com"
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Timezone *
                  </label>
                  <select
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  >
                    {timezones.map(tz => (
                      <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Street address, City, State, ZIP"
                    className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2 resize-none"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-main)',
                      borderRadius: 'var(--button-radius)',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 text-white font-medium transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderRadius: 'var(--button-radius)',
                  height: 'var(--input-height)',
                }}
                onMouseEnter={(e) => !saving && (e.target.style.opacity = '0.9')}
                onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <Link
                href="/dashboard/v2/settings"
                className="px-6 py-3 font-medium transition-colors inline-flex items-center"
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
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
