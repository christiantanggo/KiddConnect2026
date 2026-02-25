'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

export default function KidQuizSettings() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState({ timer_seconds: 6, enable_auto_correct: true, enable_auto_metadata: true });
  const [ytStatus, setYtStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
    // Handle OAuth callback params
    if (searchParams.get('youtube_connected') === 'true') {
      setSuccess('YouTube connected successfully! 🎉');
      setTimeout(() => setSuccess(null), 5000);
    }
    if (searchParams.get('error')) {
      setError(`YouTube connection failed: ${searchParams.get('error')}`);
    }
  }, []);

  async function loadData() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const [settingsRes, ytRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/kidquiz/settings`, { headers }),
        fetch(`${API_URL}/api/v2/kidquiz/youtube/status`, { headers }),
      ]);
      const settingsData = await settingsRes.json();
      const ytData = await ytRes.json();
      if (settingsData.settings) setSettings(settingsData.settings);
      setYtStatus(ytData);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSettings() {
    setSaving(true); setError(null);
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      await fetch(`${API_URL}/api/v2/kidquiz/settings`, {
        method: 'PUT', headers, body: JSON.stringify(settings)
      });
      setSuccess('Settings saved!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function connectYouTube() {
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      const res = await fetch(`${API_URL}/api/v2/kidquiz/youtube/auth-url`, { headers });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Could not get auth URL');
    } catch (err) {
      setError(err.message);
    }
  }

  async function disconnectYouTube() {
    if (!confirm('Disconnect YouTube? You will need to reconnect to upload videos.')) return;
    try {
      const headers = { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
      await fetch(`${API_URL}/api/v2/kidquiz/youtube/disconnect`, { method: 'POST', headers });
      setYtStatus({ connected: false });
      setSuccess('YouTube disconnected.');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/dashboard/v2/modules/kidquiz/dashboard" className="text-sm mb-4 inline-block" style={{ color: 'var(--color-text-muted)' }}>
            ← Back to Quizzes
          </Link>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>⚙️ Parent Settings</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Control defaults for Kid Quiz Studio</p>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}
          {success && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#f0fdf4', color: '#16a34a' }}>{success}</div>}

          <div className="space-y-5">
            {/* YouTube */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text-main)' }}>📺 YouTube Connection</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Connect the YouTube channel where quiz videos will be uploaded. This is completely separate from your Orbix Network channels.
              </p>

              {ytStatus?.connected ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">✅</span>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--color-text-main)' }}>{ytStatus.channel_title}</p>
                      <p className="text-xs" style={{ color: '#10b981' }}>Connected</p>
                    </div>
                  </div>
                  <button onClick={disconnectYouTube} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#fee2e2', color: '#dc2626' }}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <button onClick={connectYouTube} className="w-full py-3 rounded-xl font-bold text-white" style={{ background: '#ef4444' }}>
                  🔴 Connect YouTube Channel
                </button>
              )}
            </div>

            {/* Quiz settings */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-5" style={{ color: 'var(--color-text-main)' }}>🎮 Quiz Defaults</h2>

              <div className="mb-5">
                <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Default Countdown Timer: {settings.timer_seconds}s
                </label>
                <input
                  type="range" min={3} max={10}
                  value={settings.timer_seconds}
                  onChange={e => setSettings(s => ({ ...s, timer_seconds: Number(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  <span>3s (hard)</span><span>10s (easy)</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>Auto-fix spelling</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fix spelling automatically when saving questions</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, enable_auto_correct: !s.enable_auto_correct }))}
                  className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors"
                  style={{ background: settings.enable_auto_correct ? '#6366f1' : '#d1d5db' }}
                >
                  <span className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform"
                    style={{ transform: settings.enable_auto_correct ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>

              <div className="flex items-center justify-between py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>Auto-generate YouTube metadata</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>AI creates title, description, and hook automatically</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, enable_auto_metadata: !s.enable_auto_metadata }))}
                  className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors"
                  style={{ background: settings.enable_auto_metadata ? '#6366f1' : '#d1d5db' }}
                >
                  <span className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform"
                    style={{ transform: settings.enable_auto_metadata ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>

              <button
                onClick={saveSettings}
                disabled={saving}
                className="w-full mt-4 py-3 rounded-xl font-bold text-white"
                style={{ background: saving ? '#9ca3af' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>

            {/* Info box */}
            <div className="rounded-2xl p-5" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: '#92400e' }}>ℹ️ About Kid Quiz Studio</h3>
              <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
                Kid Quiz Studio is completely separate from Orbix Network. It has its own YouTube channel connection, its own projects, and its own render queue. Nothing in here affects your Orbix channels.
              </p>
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
