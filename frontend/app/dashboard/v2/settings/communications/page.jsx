'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2DashboardHeader from '@/components/V2DashboardHeader';
import V2Sidebar from '@/components/V2Sidebar';
import { ArrowLeft } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

export default function CommunicationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [communications, setCommunications] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    sms_enabled: false,
    sms_notification_number: '',
    sms_business_hours_enabled: false,
    sms_timezone: 'America/New_York',
    sms_allowed_start_time: '09:00',
    sms_allowed_end_time: '17:00',
    email_ai_answered: true,
    email_missed_calls: false,
    email_display_name: '',
  });

  useEffect(() => {
    loadCommunications();
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

  const loadCommunications = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/v2/settings/communications`, {
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setCommunications(data.communications);
        setFormData({
          sms_enabled: data.communications.sms_enabled || false,
          sms_notification_number: data.communications.sms_notification_number || '',
          sms_business_hours_enabled: data.communications.sms_business_hours_enabled || false,
          sms_timezone: data.communications.sms_timezone || 'America/New_York',
          sms_allowed_start_time: data.communications.sms_allowed_start_time || '09:00',
          sms_allowed_end_time: data.communications.sms_allowed_end_time || '17:00',
          email_ai_answered: data.communications.email_ai_answered !== false,
          email_missed_calls: data.communications.email_missed_calls || false,
          email_display_name: data.communications.email_display_name || '',
        });
      } else {
        setError('Failed to load communications settings');
      }
    } catch (err) {
      console.error('[Communications Settings] Error:', err);
      setError('Failed to load communications settings');
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
      const res = await fetch(`${API_URL}/api/v2/settings/communications`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        setCommunications(data.communications);
        setSuccess('Communications settings updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to update communications settings');
      }
    } catch (err) {
      console.error('[Communications Settings] Error:', err);
      setError('Failed to update communications settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
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
              <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Communications</h1>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Configure SMS and email notification settings
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

            {/* Contact Information */}
            {communications && (communications.from_phone || communications.from_email) && (
              <div 
                className="shadow mb-6"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
              >
                <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>Contact Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {communications.from_phone && (
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Phone Number:</span>
                      <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>{communications.from_phone}</span>
                    </div>
                  )}
                  {communications.from_email && (
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Email Address:</span>
                      <span className="ml-2 font-medium" style={{ color: 'var(--color-text-main)' }}>{communications.from_email}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              {/* SMS Settings */}
              <div 
                className="shadow mb-6"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
              >
                <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--color-text-main)' }}>SMS Settings</h2>
                
                <div className="space-y-6">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="sms_enabled"
                      name="sms_enabled"
                      checked={formData.sms_enabled}
                      onChange={handleChange}
                      className="w-4 h-4 mr-3"
                      style={{
                        accentColor: 'var(--color-accent)',
                      }}
                    />
                    <label htmlFor="sms_enabled" className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                      Enable SMS Notifications
                    </label>
                  </div>

                  {formData.sms_enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                          Notification Phone Number
                        </label>
                        <input
                          type="tel"
                          name="sms_notification_number"
                          value={formData.sms_notification_number}
                          onChange={handleChange}
                          placeholder="+1 (555) 123-4567"
                          className="w-full max-w-md px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
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
                        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Phone number to receive SMS notifications
                        </p>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="sms_business_hours_enabled"
                          name="sms_business_hours_enabled"
                          checked={formData.sms_business_hours_enabled}
                          onChange={handleChange}
                          className="w-4 h-4 mr-3"
                          style={{
                            accentColor: 'var(--color-accent)',
                          }}
                        />
                        <label htmlFor="sms_business_hours_enabled" className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                          Only send SMS during business hours
                        </label>
                      </div>

                      {formData.sms_business_hours_enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-7">
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                              Timezone
                            </label>
                            <select
                              name="sms_timezone"
                              value={formData.sms_timezone}
                              onChange={handleChange}
                              className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                              style={{
                                backgroundColor: 'var(--color-surface)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-main)',
                                borderRadius: 'var(--button-radius)',
                                height: 'var(--input-height)',
                              }}
                            >
                              <option value="America/New_York">Eastern Time</option>
                              <option value="America/Chicago">Central Time</option>
                              <option value="America/Denver">Mountain Time</option>
                              <option value="America/Los_Angeles">Pacific Time</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                              Start Time
                            </label>
                            <input
                              type="time"
                              name="sms_allowed_start_time"
                              value={formData.sms_allowed_start_time}
                              onChange={handleChange}
                              className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                              style={{
                                backgroundColor: 'var(--color-surface)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-main)',
                                borderRadius: 'var(--button-radius)',
                                height: 'var(--input-height)',
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                              End Time
                            </label>
                            <input
                              type="time"
                              name="sms_allowed_end_time"
                              value={formData.sms_allowed_end_time}
                              onChange={handleChange}
                              className="w-full px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
                              style={{
                                backgroundColor: 'var(--color-surface)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-main)',
                                borderRadius: 'var(--button-radius)',
                                height: 'var(--input-height)',
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Email Settings */}
              <div 
                className="shadow mb-6"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--card-radius)',
                  padding: 'var(--padding-base)',
                }}
              >
                <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--color-text-main)' }}>Email Settings</h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                      Email Display Name
                    </label>
                    <input
                      type="text"
                      name="email_display_name"
                      value={formData.email_display_name}
                      onChange={handleChange}
                      placeholder="Name shown in email sender"
                      className="w-full max-w-md px-4 py-2 border rounded transition-colors focus:outline-none focus:ring-2"
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

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="email_ai_answered"
                      name="email_ai_answered"
                      checked={formData.email_ai_answered}
                      onChange={handleChange}
                      className="w-4 h-4 mr-3"
                      style={{
                        accentColor: 'var(--color-accent)',
                      }}
                    />
                    <label htmlFor="email_ai_answered" className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                      Send email when AI answers a call
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="email_missed_calls"
                      name="email_missed_calls"
                      checked={formData.email_missed_calls}
                      onChange={handleChange}
                      className="w-4 h-4 mr-3"
                      style={{
                        accentColor: 'var(--color-accent)',
                      }}
                    />
                    <label htmlFor="email_missed_calls" className="text-sm font-medium" style={{ color: 'var(--color-text-main)' }}>
                      Send email for missed calls
                    </label>
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
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

