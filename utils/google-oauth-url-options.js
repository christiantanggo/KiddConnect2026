/**
 * Google OAuth URL helpers for YouTube connect flows.
 * @see https://developers.google.com/identity/protocols/oauth2/web-server
 */

/**
 * Account picker first, then consent (refresh_token). Order matters for reliably
 * showing the chooser instead of silently using the browser's default session.
 */
export const YOUTUBE_OAUTH_PROMPT = 'select_account consent';

/**
 * @param {Record<string, unknown>|null|undefined} src - req.query, req.body merge, or similar
 * @returns {string|undefined}
 */
export function loginHintFromSource(src) {
  if (!src || typeof src !== 'object') return undefined;
  const raw = src.login_hint ?? src.email ?? src.Email ?? '';
  const hint = String(raw).trim().slice(0, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)) return undefined;
  return hint;
}

/**
 * @deprecated Use loginHintFromSource — same behavior, clearer name.
 */
export function loginHintFromRequestQuery(query) {
  return loginHintFromSource(query);
}

/**
 * Merge Express query + JSON body so POST can carry login_hint reliably (some proxies strip GET query).
 * @param {import('express').Request} req
 * @returns {Record<string, unknown>}
 */
export function oauthHintMergeFromRequest(req) {
  const q = req.query && typeof req.query === 'object' ? { ...req.query } : {};
  const b = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? { ...req.body } : {};
  return { ...q, ...b };
}

/**
 * @param {object} opts - base options for OAuth2Client.generateAuthUrl
 * @param {Record<string, unknown>} src - merged query/body (or req.query alone)
 * @returns {object}
 */
export function withYouTubeLoginHint(opts, src) {
  const hint = loginHintFromSource(src);
  if (!hint) return opts;
  return { ...opts, login_hint: hint };
}
