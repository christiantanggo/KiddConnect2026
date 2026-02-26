'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';

const TABS = [
  { label: '🎬 My Projects', href: '/dashboard/v2/modules/movie-review/dashboard' },
  { label: '⚙️ Settings',    href: '/dashboard/v2/modules/movie-review/settings' },
];

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
function apiHeaders() {
  return { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
}

function MovieReviewSettingsInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [settings, setSettings] = useState({ max_duration_seconds: 50, enable_ai: true, default_privacy: 'UNLISTED' });
  const [ytStatus, setYtStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
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
      const [sRes, ytRes] = await Promise.all([
        fetch(`${API_URL}/api/v2/movie-review/settings`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/v2/movie-review/youtube/status`, { headers: apiHeaders() }),
      ]);
      const sd = await sRes.json();
      const yd = await ytRes.json();
      if (sd.settings) setSettings(sd.settings);
      setYtStatus(yd);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSettings() {
    setSaving(true); setError(null);
    try {
      await fetch(`${API_URL}/api/v2/movie-review/settings`, {
        method: 'PUT', headers: apiHeaders(), body: JSON.stringify(settings),
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
      const res = await fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url`, { headers: apiHeaders() });
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
      await fetch(`${API_URL}/api/v2/movie-review/youtube/disconnect`, { method: 'POST', headers: apiHeaders() });
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
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px' }}>
          {/* Tabs */}
          <div className="flex items-center gap-2 mb-6" style={{ minWidth: 0 }}>
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'inline-flex' }}>
              {TABS.map(tab => {
                const active = pathname === tab.href;
                return (
                  <Link key={tab.href} href={tab.href}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap"
                    style={{
                      background: active ? 'linear-gradient(135deg,#e11d48,#9333ea)' : 'transparent',
                      color: active ? '#fff' : 'var(--color-text-muted)',
                    }}>
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>⚙️ Settings</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Configure Movie Review Studio</p>

          {error && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>{error}</div>}
          {success && <div className="p-3 mb-4 rounded-lg text-sm" style={{ background: '#f0fdf4', color: '#16a34a' }}>{success}</div>}

          <div className="space-y-5">
            {/* YouTube connection */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-3" style={{ color: 'var(--color-text-main)' }}>📺 YouTube Connection</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Connect the YouTube channel where your Shorts will be uploaded. This is separate from your other channels.
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

            {/* Video settings */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-5" style={{ color: 'var(--color-text-main)' }}>🎬 Video Defaults</h2>

              <div className="mb-5">
                <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--color-text-main)' }}>
                  Max Video Duration: {settings.max_duration_seconds}s
                </label>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>YouTube Shorts must be 60 seconds or less</p>
                <input type="range" min={15} max={59} value={settings.max_duration_seconds}
                  onChange={e => setSettings(s => ({ ...s, max_duration_seconds: Number(e.target.value) }))}
                  className="w-full" />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  <span>15s</span><span>59s max</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-main)' }}>AI Features</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Metadata generation and fact-checking chat</p>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, enable_ai: !s.enable_ai }))}
                  className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors"
                  style={{ background: settings.enable_ai ? '#e11d48' : '#d1d5db' }}>
                  <span className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform"
                    style={{ transform: settings.enable_ai ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>

              <div className="py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>Default Privacy</p>
                <div className="flex gap-2">
                  {[['PUBLIC','🌍 Public'],['UNLISTED','🔗 Unlisted'],['PRIVATE','🔒 Private']].map(([val, label]) => (
                    <button key={val} onClick={() => setSettings(s => ({ ...s, default_privacy: val }))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        border: `2px solid ${settings.default_privacy === val ? '#e11d48' : 'var(--color-border)'}`,
                        background: settings.default_privacy === val ? 'rgba(225,29,72,0.08)' : 'var(--color-background)',
                        color: 'var(--color-text-main)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={saveSettings} disabled={saving}
                className="w-full mt-4 py-3 rounded-xl font-bold text-white"
                style={{ background: saving ? '#9ca3af' : 'linear-gradient(135deg,#e11d48,#9333ea)' }}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>

            {/* TMDB info */}
            <div className="rounded-2xl p-5" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: '#92400e' }}>🎬 TMDB Movie Database</h3>
              <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
                To enable movie search (TMDB), add <code className="bg-yellow-200 px-1 rounded">TMDB_API_KEY=your_key</code> to your server environment variables.
                Get a free API key at{' '}
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="underline">
                  themoviedb.org
                </a> (takes 2 minutes).
              </p>
            </div>

            {/* Info */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: '#7c3aed' }}>ℹ️ About Movie Review Studio</h3>
              <p className="text-xs leading-relaxed" style={{ color: '#7c3aed' }}>
                Movie Review Studio is completely separate from KidQuiz and Orbix Network. It has its own YouTube channel, its own projects, and its own render queue.
                Background music is shared with your Orbix Network channels.
              </p>
            </div>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default function MovieReviewSettings() {
  return (
    <Suspense fallback={<div className="text-center py-20" style={{ color: '#9ca3af' }}>Loading…</div>}>
      <MovieReviewSettingsInner />
    </Suspense>
  );
}
