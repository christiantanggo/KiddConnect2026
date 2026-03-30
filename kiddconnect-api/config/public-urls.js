/**
 * Public API / frontend base URLs for KiddConnect.
 * Set BACKEND_URL, FRONTEND_URL, YOUTUBE_REDIRECT_* in production.
 */

import { getDevBackendPort, getDevFrontendPort } from './load-dev-ports.js';

/** Production API host when env is missing (must resolve; Railway until custom api.* DNS exists). */
export const DEFAULT_API_PUBLIC_BASE = 'https://kiddconnect2026-production.up.railway.app';

/** Production app origin when FRONTEND_URL is not set. */
export const DEFAULT_FRONTEND_PUBLIC_BASE = 'https://www.kiddconnect.ca';

/**
 * Public base URL of this API (no trailing slash), e.g. https://api.kiddconnect.ca
 */
export function getApiPublicBaseUrl() {
  const raw = (process.env.YOUTUBE_REDIRECT_URI || '').trim();
  if (raw) {
    const stripped = raw.replace(/\/api\/v2\/.+$/, '').replace(/\/$/, '');
    if (stripped.startsWith('http')) return stripped;
    if (stripped) {
      return stripped.includes('localhost') ? `http://${stripped}` : `https://${stripped}`;
    }
  }
  for (const env of [process.env.BACKEND_URL, process.env.RAILWAY_PUBLIC_DOMAIN, process.env.VERCEL_URL, process.env.SERVER_URL]) {
    const v = (env || '').trim().replace(/\/$/, '');
    if (!v) continue;
    if (v.startsWith('http')) return v;
    return v.includes('localhost') ? `http://${v}` : `https://${v}`;
  }
  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_API_PUBLIC_BASE;
  }
  return `http://localhost:${getDevBackendPort()}`;
}

/** Full Orbix-style YouTube OAuth callback URL (also used as template to derive Kid Quiz / Riddle paths). */
export function defaultOrbixYoutubeCallbackUrl() {
  return `${getApiPublicBaseUrl()}/api/v2/orbix-network/youtube/callback`;
}

/** Kid Quiz YouTube OAuth redirect (must match Google Cloud + kidquiz-youtube-callback). */
export function kidquizYoutubeCallbackUrl() {
  return `${getApiPublicBaseUrl()}/api/v2/kidquiz/youtube/callback`;
}

/** Dad Joke Studio YouTube OAuth redirect (must be listed in Google Cloud → OAuth client). */
export function dadjokeYoutubeCallbackUrl() {
  return `${getApiPublicBaseUrl()}/api/v2/dad-joke-studio/youtube/callback`;
}

/** Riddle / per-channel Orbix YouTube OAuth redirect. */
export function riddleYoutubeCallbackUrl() {
  return `${getApiPublicBaseUrl()}/api/v2/riddle/youtube/callback`;
}

export function getFrontendPublicBaseUrl() {
  const f = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (f && f !== '*') {
    if (f.startsWith('http')) return f;
    return f.includes('localhost') ? `http://${f}` : `https://${f}`;
  }
  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_FRONTEND_PUBLIC_BASE;
  }
  return `http://localhost:${getDevFrontendPort()}`;
}
