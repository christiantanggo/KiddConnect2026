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

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.kiddconnect.ca').replace(/\/$/, '');

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
  const [customOauthClientId, setCustomOauthClientId] = useState('');
  const [customOauthClientSecret, setCustomOauthClientSecret] = useState('');
  const [savingCustomOauth, setSavingCustomOauth] = useState(false);
  const [ytRedirectUri, setYtRedirectUri] = useState(null);
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [savingManualOauth, setSavingManualOauth] = useState(false);
  const [ytRedirectUriManual, setYtRedirectUriManual] = useState(null);
  const [connectingManual, setConnectingManual] = useState(false);
  const [connectingYt, setConnectingYt] = useState(false);

  useEffect(() => {
    loadData();
    if (searchParams.get('youtube_connected') === 'true') {
      setSuccess('YouTube connected successfully! 🎉');
      setTimeout(() => setSuccess(null), 5000);
      loadData();
    }
    if (searchParams.get('error')) {
      setError(`YouTube connection failed: ${searchParams.get('error')}`);
    }
  }, [searchParams.get('youtube_connected'), searchParams.get('error')]);

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
      if (yd?.custom_oauth) {
        fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url`, { headers: apiHeaders() })
          .then(r => r.json()).then(d => d.redirect_uri && setYtRedirectUri(d.redirect_uri)).catch(() => {});
      } else setYtRedirectUri(null);
      if (yd?.manual_custom_oauth) {
        fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url?usage=manual`, { headers: apiHeaders() })
          .then(r => r.json()).then(d => d.redirect_uri && setYtRedirectUriManual(d.redirect_uri)).catch(() => {});
      } else setYtRedirectUriManual(null);
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
    setConnectingYt(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url`, { headers: apiHeaders() });
      const data = await res.json();
      if (data.configured === false) {
        setError(data.error || 'Add Client ID and Secret in the Upload OAuth app section above and click Save, then try Connect again.');
        return;
      }
      if (data.url) { window.location.href = data.url; return; }
      setError(data.error || 'Could not get auth URL');
    } catch (err) {
      setError(err.message);
    } finally {
      setConnectingYt(false);
    }
  }

  async function disconnectYouTube(usage = 'auto') {
    const msg = usage === 'manual' ? 'Disconnect Manual OAuth?' : 'Disconnect YouTube? You will need to reconnect to upload videos.';
    if (!confirm(msg)) return;
    try {
      await fetch(`${API_URL}/api/v2/movie-review/youtube/disconnect`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify({ usage }),
      });
      setYtStatus(s => ({ ...s, ...(usage === 'manual' ? { connected_manual: false, channel_manual: null } : { connected: false, channel_title: null, channel_id: null }) }));
      setSuccess(usage === 'manual' ? 'Manual OAuth disconnected.' : 'YouTube disconnected.');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCustomOauth() {
    setSavingCustomOauth(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/youtube/custom-oauth`, {
        method: 'POST', headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: customOauthClientId.trim(), client_secret: customOauthClientSecret.trim(), usage: 'auto' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSuccess(data.message || 'Upload OAuth saved.'); setTimeout(() => setSuccess(null), 3000);
      await loadData();
      if (data.custom_oauth && customOauthClientId.trim()) {
        const authRes = await fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url`, { headers: apiHeaders() });
        const authData = await authRes.json();
        if (authData.redirect_uri) setYtRedirectUri(authData.redirect_uri);
      } else setYtRedirectUri(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCustomOauth(false);
    }
  }

  async function saveManualOauth() {
    setSavingManualOauth(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/youtube/custom-oauth`, {
        method: 'POST', headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: manualClientId.trim(), client_secret: manualClientSecret.trim(), usage: 'manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSuccess(data.message || 'Manual OAuth saved.'); setTimeout(() => setSuccess(null), 3000);
      await loadData();
      if (data.manual_custom_oauth && manualClientId.trim()) {
        const authRes = await fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url?usage=manual`, { headers: apiHeaders() });
        const authData = await authRes.json();
        if (authData.redirect_uri) setYtRedirectUriManual(authData.redirect_uri);
      } else setYtRedirectUriManual(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingManualOauth(false);
    }
  }

  async function connectYouTubeManual() {
    setConnectingManual(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/movie-review/youtube/auth-url?usage=manual`, { headers: apiHeaders() });
      const data = await res.json();
      if (data.configured === false) {
        setError(data.error || 'Set Client ID and Secret above and click Save first.');
        return;
      }
      if (data.url) { window.location.href = data.url; return; }
      setError(data.error || 'Could not get auth URL');
    } catch (err) {
      setError(err.message);
    } finally {
      setConnectingManual(false);
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
            {/* Upload OAuth app — same as Kid Quiz / Orbix */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-2" style={{ color: 'var(--color-text-main)' }}>📺 Upload OAuth app</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Use a Google Cloud project for Movie Review so it gets its own quota. Create a project, enable YouTube Data API v3, add OAuth credentials, and set the redirect URI to your app&apos;s callback URL (see below).
              </p>
              {ytStatus?.custom_oauth && (
                <>
                  <p className="text-xs font-medium mb-2" style={{ color: '#15803d' }}>Custom OAuth app is set — uploads use that project&apos;s quota.</p>
                  {ytRedirectUri && (
                    <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Redirect URI — add this exact value in Google Cloud:</p>
                      <code className="block text-xs break-all select-all p-2 rounded mt-1" style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}>{ytRedirectUri}</code>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(ytRedirectUri); setSuccess('Copied'); setTimeout(() => setSuccess(null), 2000); }} className="mt-2 text-xs font-medium" style={{ color: '#6366f1' }}>Copy</button>
                    </div>
                  )}
                </>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>OAuth Client ID</label>
                  <input type="text" value={customOauthClientId} onChange={e => setCustomOauthClientId(e.target.value)} placeholder={ytStatus?.custom_oauth ? 'Leave blank to keep current' : 'From Google Cloud Console'}
                    className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-main)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>OAuth Client Secret</label>
                  <input type="password" value={customOauthClientSecret} onChange={e => setCustomOauthClientSecret(e.target.value)} placeholder={ytStatus?.custom_oauth ? 'Leave blank to keep current' : 'From Google Cloud Console'}
                    className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-main)' }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center mb-4">
                <button type="button" onClick={saveCustomOauth} disabled={savingCustomOauth} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: savingCustomOauth ? '#9ca3af' : '#4b5563' }}>
                  {savingCustomOauth ? 'Saving…' : 'Save'}
                </button>
                {ytStatus?.custom_oauth && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Clear both fields and Save to use global credentials.</span>}
              </div>
              {ytStatus?.connected ? (
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#166534' }}>Connected</p>
                    <p className="text-sm" style={{ color: '#15803d' }}>YouTube channel: {ytStatus.channel_title || ytStatus.channel_id}</p>
                    {(ytStatus.credentials_source === 'custom_oauth' || ytStatus.client_id_preview) && (
                      <p className="text-xs mt-1" style={{ color: '#166534' }}>OAuth app: {ytStatus.credentials_source === 'custom_oauth' ? `This app${ytStatus.client_id_preview ? ` (${ytStatus.client_id_preview})` : ''}` : 'Global (server env)'}</p>
                    )}
                  </div>
                  <button type="button" onClick={() => disconnectYouTube('auto')} className="px-4 py-2 rounded-lg text-sm border border-gray-300" style={{ color: '#374151' }}>Disconnect</button>
                </div>
              ) : (
                <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>No YouTube account connected. Add Client ID and Secret above and Save, then connect.</p>
                  <button onClick={connectYouTube} disabled={connectingYt} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: connectingYt ? '#9ca3af' : '#ef4444' }}>
                    {connectingYt ? 'Connecting…' : '🔴 Connect YouTube account'}
                  </button>
                </div>
              )}
            </div>

            {/* Manual-upload OAuth app */}
            <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base mb-2" style={{ color: 'var(--color-text-main)' }}>Manual-upload OAuth app</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Create a separate OAuth client in Google Cloud (or use another project). Add the redirect URI below to that client&apos;s Authorized redirect URIs. Same YouTube channel is fine — this is just a second OAuth app so uploads keep working if the first hits limits.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>OAuth Client ID</label>
                  <input type="text" value={manualClientId} onChange={e => setManualClientId(e.target.value)} placeholder={ytStatus?.manual_custom_oauth ? 'Leave blank to keep current' : 'From Google Cloud (manual-upload project)'}
                    className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-main)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>OAuth Client Secret</label>
                  <input type="password" value={manualClientSecret} onChange={e => setManualClientSecret(e.target.value)} placeholder={ytStatus?.manual_custom_oauth ? 'Leave blank to keep current' : 'From same OAuth client'}
                    className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-main)' }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center mb-4">
                <button type="button" onClick={saveManualOauth} disabled={savingManualOauth} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: savingManualOauth ? '#9ca3af' : '#4b5563' }}>
                  {savingManualOauth ? 'Saving…' : 'Save'}
                </button>
                {ytStatus?.manual_custom_oauth && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Clear both fields and Save to clear manual OAuth.</span>}
              </div>
              {ytStatus?.manual_custom_oauth && ytRedirectUriManual && (
                <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Add this in Google Cloud → Credentials → [manual OAuth client] → Authorized redirect URIs:</p>
                  <code className="block text-xs break-all select-all p-2 rounded mt-1" style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}>{ytRedirectUriManual}</code>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(ytRedirectUriManual); setSuccess('Copied'); setTimeout(() => setSuccess(null), 2000); }} className="mt-2 text-xs font-medium" style={{ color: '#6366f1' }}>Copy</button>
                </div>
              )}
              {ytStatus?.connected_manual && ytStatus?.channel_manual ? (
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#166534' }}>Connected</p>
                    <p className="text-sm" style={{ color: '#15803d' }}>{ytStatus.channel_manual.title || ytStatus.channel_manual.id}</p>
                    {ytStatus.manual_client_id_preview && <p className="text-xs mt-1" style={{ color: '#166534' }}>OAuth: {ytStatus.manual_client_id_preview}</p>}
                  </div>
                  <button type="button" onClick={() => disconnectYouTube('manual')} className="px-4 py-2 rounded-lg text-sm border border-gray-300" style={{ color: '#374151' }}>Disconnect</button>
                </div>
              ) : (
                <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>No manual OAuth connected. Set Client ID and Secret above and Save, then connect.</p>
                  <button onClick={connectYouTubeManual} disabled={connectingManual} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: connectingManual ? '#9ca3af' : '#4b5563' }}>
                    {connectingManual ? 'Connecting…' : 'Connect YouTube (manual)'}
                  </button>
                </div>
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
