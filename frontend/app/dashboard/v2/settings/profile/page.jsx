'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowLeft, User, Lock, CheckCircle, Building2 } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  const businessId = typeof window !== 'undefined'
    ? localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId')
    : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (businessId) headers['X-Active-Business-Id'] = businessId;
  return headers;
}

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);

  // Profile form
  const [profile, setProfile] = useState({ first_name: '', last_name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // Password form
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(null);
  const [pwError, setPwError] = useState(null);

  // Company details (business address & phone – used across the app)
  const [company, setCompany] = useState({ address: '', phone: '' });
  const [savingCompany, setSavingCompany] = useState(false);
  const [companySuccess, setCompanySuccess] = useState(null);
  const [companyError, setCompanyError] = useState(null);

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    try {
      const [profileRes, businessRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/settings/profile`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v2/settings/business`, { headers: getAuthHeaders() }),
      ]);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile({
          first_name: data.profile.first_name || '',
          last_name: data.profile.last_name || '',
          email: data.profile.email || '',
        });
      }
      if (businessRes.ok) {
        const data = await businessRes.json();
        setCompany({
          address: data.business?.address || '',
          phone: data.business?.phone || '',
        });
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/settings/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ first_name: profile.first_name, last_name: profile.last_name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setProfileSuccess('Profile updated successfully');
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCompany(e) {
    e.preventDefault();
    setSavingCompany(true);
    setCompanyError(null);
    setCompanySuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/settings/business`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ address: company.address || null, phone: company.phone || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setCompanySuccess('Company details updated. This address and phone are used across the app unless you set a different one in a specific module.');
      setTimeout(() => setCompanySuccess(null), 5000);
    } catch (err) {
      setCompanyError(err.message);
    } finally {
      setSavingCompany(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.new_password.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/settings/profile/password`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          current_password: pwForm.current_password,
          new_password: pwForm.new_password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      setPwSuccess('Password updated successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setPwSuccess(null), 5000);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSavingPw(false);
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-main)',
    borderRadius: 'var(--button-radius)',
    height: 'var(--input-height)',
  };

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="mx-auto py-8" style={{ maxWidth: 640, padding: 'var(--padding-base)' }}>

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
            <h1 className="text-3xl font-semibold mb-1" style={{ color: 'var(--color-text-main)' }}>My Profile</h1>
            <p style={{ color: 'var(--color-text-muted)' }}>Update your name and change your password</p>
          </div>

          {/* ── Profile card ─────────────────────────────────────────── */}
          <div
            className="shadow mb-6 p-6"
            style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-accent)', opacity: 0.15, position: 'relative' }}
              />
              <User
                className="w-5 h-5 absolute"
                style={{ color: 'var(--color-accent)', marginLeft: 10 }}
              />
              <div>
                <h2 className="font-semibold text-lg" style={{ color: 'var(--color-text-main)' }}>Personal Info</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{profile.email}</p>
              </div>
            </div>

            {profileSuccess && (
              <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg text-sm"
                style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--color-accent)', border: '1px solid rgba(20,184,166,0.2)' }}>
                <CheckCircle className="w-4 h-4" /> {profileSuccess}
              </div>
            )}
            {profileError && (
              <div className="px-4 py-3 mb-4 rounded-lg text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {profileError}
              </div>
            )}

            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={profile.first_name}
                    onChange={(e) => setProfile(p => ({ ...p, first_name: e.target.value }))}
                    className="w-full px-4 py-2 border focus:outline-none"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={profile.last_name}
                    onChange={(e) => setProfile(p => ({ ...p, last_name: e.target.value }))}
                    className="w-full px-4 py-2 border focus:outline-none"
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-4 py-2 border"
                  style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Email cannot be changed here. Contact support if needed.
                </p>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 text-white font-medium transition-opacity disabled:opacity-50"
                style={{ background: 'var(--color-accent)', borderRadius: 'var(--button-radius)' }}
              >
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* ── Company details (address & phone – used across app) ───── */}
          <div
            className="shadow mb-6 p-6"
            style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
              <div>
                <h2 className="font-semibold text-lg" style={{ color: 'var(--color-text-main)' }}>Company details</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Address and phone used across the app (AI phone, delivery, etc.). You can override them per module if needed.</p>
              </div>
            </div>
            {companySuccess && (
              <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg text-sm"
                style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--color-accent)', border: '1px solid rgba(20,184,166,0.2)' }}>
                <CheckCircle className="w-4 h-4" /> {companySuccess}
              </div>
            )}
            {companyError && (
              <div className="px-4 py-3 mb-4 rounded-lg text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {companyError}
              </div>
            )}
            <form onSubmit={saveCompany} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Company address
                </label>
                <input
                  type="text"
                  value={company.address}
                  onChange={(e) => setCompany(c => ({ ...c, address: e.target.value }))}
                  className="w-full px-4 py-2 border focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  placeholder="Street, city, postal code"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Company phone
                </label>
                <input
                  type="text"
                  value={company.phone}
                  onChange={(e) => setCompany(c => ({ ...c, phone: e.target.value }))}
                  className="w-full px-4 py-2 border focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <button
                type="submit"
                disabled={savingCompany}
                className="px-6 py-2.5 text-white font-medium transition-opacity disabled:opacity-50"
                style={{ background: 'var(--color-accent)', borderRadius: 'var(--button-radius)' }}
              >
                {savingCompany ? 'Saving…' : 'Save company details'}
              </button>
            </form>
          </div>

          {/* ── Change password card ──────────────────────────────────── */}
          <div
            className="shadow p-6"
            style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Lock className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
              <h2 className="font-semibold text-lg" style={{ color: 'var(--color-text-main)' }}>Change Password</h2>
            </div>

            {pwSuccess && (
              <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg text-sm"
                style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--color-accent)', border: '1px solid rgba(20,184,166,0.2)' }}>
                <CheckCircle className="w-4 h-4" /> {pwSuccess}
              </div>
            )}
            {pwError && (
              <div className="px-4 py-3 mb-4 rounded-lg text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {pwError}
              </div>
            )}

            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm(p => ({ ...p, current_password: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  placeholder="Your current password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full px-4 py-2 border focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={pwForm.confirm_password}
                  onChange={(e) => setPwForm(p => ({ ...p, confirm_password: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border focus:outline-none"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  placeholder="Repeat new password"
                />
                {pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={savingPw}
                className="px-6 py-2.5 text-white font-medium transition-opacity disabled:opacity-50"
                style={{ background: 'var(--color-accent)', borderRadius: 'var(--button-radius)' }}
              >
                {savingPw ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>

        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
