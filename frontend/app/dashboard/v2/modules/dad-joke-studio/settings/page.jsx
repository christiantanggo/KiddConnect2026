'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
const MODULE = 'dad-joke-studio';

const YOUTUBE_ERROR_MESSAGES = {
  youtube_oauth_denied: 'Google sign-in was cancelled.',
  youtube_oauth_failed: 'Google did not return an authorization code. Try again.',
  invalid_state: 'OAuth session was invalid. Try connecting again.',
  youtube_not_configured: 'YouTube OAuth is not configured (missing client ID/secret).',
  invalid_grant: 'Google rejected the authorization (often expired or reused). Click Connect YouTube again.',
  no_channel_found: 'No YouTube channel found for that Google account.',
  youtube_oauth_error: 'Something went wrong connecting YouTube. Try again or contact support.',
};

function getAuthHeaders() {
  if (typeof document === 'undefined') return {};
  const token = document.cookie.split(';').find((c) => c.trim().startsWith('token='))?.split('=')[1];
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function getBusinessId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
}

function buildHeaders() {
  return { ...getAuthHeaders(), 'X-Active-Business-Id': getBusinessId() };
}

function DadJokeStudioSettingsInner() {
  const searchParams = useSearchParams();
  const [loadingModule, setLoadingModule] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [moduleSettings, setModuleSettings] = useState({});
  const [ytStatus, setYtStatus] = useState(null);
  const [ytGoogleEmail, setYtGoogleEmail] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const h = buildHeaders();
      const fetchJson = async (url) => {
        const r = await fetch(url, { headers: h });
        const data = await r.json().catch(() => ({}));
        return { ok: r.ok, data };
      };
      const [msR, ytR] = await Promise.all([
        fetchJson(`${API}/api/v2/settings/modules/${MODULE}`),
        fetchJson(`${API}/api/v2/dad-joke-studio/youtube/status`),
      ]);
      setModuleSettings(msR.ok && msR.data?.settings != null ? msR.data.settings : {});
      setYtStatus(ytR.ok ? ytR.data : { connected: false, connected_manual: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingModule(true);
      try {
        const res = await fetch(`${API}/api/v2/modules/${MODULE}`, { headers: buildHeaders() });
        if (!res.ok) {
          if (!cancelled) {
            setSubscribed(false);
            setLoadingModule(false);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setSubscribed(!!data.module?.subscribed);
      } catch {
        if (!cancelled) setSubscribed(false);
      } finally {
        if (!cancelled) setLoadingModule(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!subscribed) return;
    loadData();
  }, [subscribed, loadData]);

  const youtubeConnected = searchParams.get('youtube_connected');
  const youtubeError = searchParams.get('error');

  useEffect(() => {
    if (youtubeConnected === 'true') {
      setNotice('YouTube connected successfully.');
      loadData();
      const t = setTimeout(() => setNotice(null), 8000);
      return () => clearTimeout(t);
    }
  }, [youtubeConnected, loadData]);

  useEffect(() => {
    if (!youtubeError) return;
    setError(YOUTUBE_ERROR_MESSAGES[youtubeError] || `YouTube: ${youtubeError}`);
  }, [youtubeError]);

  async function saveOauthSettings() {
    setError(null);
    try {
      const res = await fetch(`${API}/api/v2/settings/modules/${MODULE}`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({ settings: { ...moduleSettings, youtube: moduleSettings.youtube || {} } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.settings != null) setModuleSettings(data.settings);
      setNotice('OAuth app settings saved.');
      setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loadingModule) {
    return <div className="text-sm p-8 text-slate-600 dark:text-slate-300">Loading…</div>;
  }

  if (!subscribed) {
    return (
      <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
          Dad Joke Studio — Settings
        </h1>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          This module is not active for your organization yet. Open the module page to subscribe or activate — you will not be bounced in a loop from here.
        </p>
        <Link
          href={`/dashboard/v2/modules/${MODULE}`}
          className="inline-block px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: 'var(--color-accent)' }}
        >
          Go to Dad Joke Studio module
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <Link href={`/dashboard/v2/modules/${MODULE}`} className="underline" style={{ color: 'var(--color-text-muted)' }}>
          ← Module overview
        </Link>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <Link href={`/dashboard/v2/modules/${MODULE}/dashboard`} className="underline" style={{ color: 'var(--color-text-muted)' }}>
          Open studio
        </Link>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <Link href="/dashboard/v2/settings/modules" className="underline" style={{ color: 'var(--color-text-muted)' }}>
          All modules
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        Dad Joke Studio — Settings
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Connect the YouTube channel used for uploads. Optional: use your own Google OAuth client below.
      </p>

      {notice && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#d1fae5', color: '#065f46' }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {loadingData ? (
        <p className="text-sm text-slate-500">Loading settings…</p>
      ) : (
        <>
          <div className="rounded-lg border p-4 space-y-3 mb-6" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>
              YouTube
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Add this redirect URI in Google Cloud Console for your OAuth client:{' '}
              <code className="text-xs break-all">…/api/v2/dad-joke-studio/youtube/callback</code>
            </p>
            <p className="text-sm rounded-md p-3" style={{ background: 'var(--color-bg)', color: 'var(--color-text-main)' }}>
              <strong>Wrong account?</strong> Enter the Google account email that owns the YouTube channel, then connect. We send it to Google as{' '}
              <code className="text-xs">login_hint</code> and force the account picker. If Chrome still picks the wrong profile, use a private/incognito window
              or sign out at google.com, then try again.
            </p>
            <p className="text-sm">
              Status:{' '}
              <strong>
                {ytStatus?.connected ? `Connected (${ytStatus.channel_title || 'channel'})` : 'Not connected'}
              </strong>
            </p>
            <label className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Google account email (strongly recommended)
              <input
                type="email"
                className="mt-1 w-full max-w-md border p-2 text-sm rounded block"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-main)',
                }}
                autoComplete="email"
                value={ytGoogleEmail}
                onChange={(e) => setYtGoogleEmail(e.target.value)}
                placeholder="you@gmail.com"
              />
            </label>
            <button
              type="button"
              className="px-3 py-2 rounded text-white text-sm"
              style={{ background: '#c00' }}
              onClick={async () => {
                setError(null);
                const raw = ytGoogleEmail.trim();
                const hasHint = raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
                const res = await fetch(`${API}/api/v2/dad-joke-studio/youtube/auth-url`, {
                  method: 'POST',
                  headers: buildHeaders(),
                  body: JSON.stringify(hasHint ? { login_hint: raw, email: raw } : {}),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.url) window.location.href = data.url;
                else setError(data.error || 'Could not start YouTube sign-in');
              }}
            >
              Connect YouTube
            </button>
          </div>

          <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--color-text-main)' }}>OAuth client (optional)</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Per-organization override. Leave blank to use the platform default from the server.
            </p>
            <input
              className="w-full border p-2 text-sm rounded"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)' }}
              placeholder="Client ID"
              value={moduleSettings?.youtube?.client_id || ''}
              onChange={(e) =>
                setModuleSettings((s) => ({ ...s, youtube: { ...(s.youtube || {}), client_id: e.target.value } }))
              }
            />
            <input
              className="w-full border p-2 text-sm rounded"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)' }}
              placeholder="Client Secret"
              type="password"
              value={moduleSettings?.youtube?.client_secret || ''}
              onChange={(e) =>
                setModuleSettings((s) => ({ ...s, youtube: { ...(s.youtube || {}), client_secret: e.target.value } }))
              }
            />
            <button
              type="button"
              className="px-4 py-2 rounded text-sm font-medium text-white"
              style={{ background: 'var(--color-accent)' }}
              onClick={() => saveOauthSettings()}
            >
              Save OAuth app
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DadJokeStudioSettingsPage() {
  return (
    <AuthGuard>
      <V2AppShell>
        <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
          <DadJokeStudioSettingsInner />
        </Suspense>
      </V2AppShell>
    </AuthGuard>
  );
}
