/**
 * Single place for public API / frontend base URLs (Tavari production defaults).
 * Railway/Vercel: set YOUTUBE_REDIRECT_URI, FRONTEND_URL, BACKEND_URL as needed.
 */

import { getDevBackendPort, getDevFrontendPort } from './load-dev-ports.js';

/** Production API host when no env hints (Tavari). */
export const DEFAULT_API_PUBLIC_BASE = 'https://api.tavarios.com';

/** Production marketing / app origin when not set via env. */
export const DEFAULT_FRONTEND_PUBLIC_BASE = 'https://www.tavarios.com';

/** True when this Node process is running on a typical cloud host (Railway, Fly, Render). */
function deploymentLooksHosted() {
  return Boolean(
    (process.env.RAILWAY_ENVIRONMENT || '').trim() ||
      (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim() ||
      (process.env.FLY_APP_NAME || '').trim() ||
      (process.env.RENDER || '').trim(),
  );
}

/**
 * Public base URL of this API (no trailing slash), e.g. https://api.tavarios.com
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

/** Riddle / per-channel Orbix YouTube OAuth redirect. */
export function riddleYoutubeCallbackUrl() {
  return `${getApiPublicBaseUrl()}/api/v2/riddle/youtube/callback`;
}

export function getFrontendPublicBaseUrl() {
  const f = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (f && f !== '*') {
    let resolved = f.startsWith('http') ? f : f.includes('localhost') ? `http://${f}` : `https://${f}`;
    if (deploymentLooksHosted() && /localhost|127\.0\.0\.1/i.test(resolved)) {
      console.warn(
        '[public-urls] FRONTEND_URL is localhost on a hosted deploy; using DEFAULT_FRONTEND_PUBLIC_BASE. Set FRONTEND_URL to your live site (e.g. https://www.tavarios.com).',
      );
      return DEFAULT_FRONTEND_PUBLIC_BASE;
    }
    return resolved;
  }
  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_FRONTEND_PUBLIC_BASE;
  }
  if (deploymentLooksHosted()) {
    return DEFAULT_FRONTEND_PUBLIC_BASE;
  }
  return `http://localhost:${getDevFrontendPort()}`;
}

/**
 * Base URL for SMS “schedule delivery” links only. Override with DELIVERY_PUBLIC_SCHEDULE_URL when
 * the marketing site origin differs from FRONTEND_URL.
 */
export function getDeliverySchedulePublicBaseUrl() {
  const o = (process.env.DELIVERY_PUBLIC_SCHEDULE_URL || '').trim().replace(/\/$/, '');
  if (o && o !== '*') {
    let resolved = o.startsWith('http') ? o : o.includes('localhost') ? `http://${o}` : `https://${o}`;
    if (deploymentLooksHosted() && /localhost|127\.0\.0\.1/i.test(resolved)) {
      console.warn(
        '[public-urls] DELIVERY_PUBLIC_SCHEDULE_URL is localhost on a hosted deploy; using DEFAULT_FRONTEND_PUBLIC_BASE.',
      );
      return DEFAULT_FRONTEND_PUBLIC_BASE;
    }
    return resolved;
  }
  return getFrontendPublicBaseUrl();
}
