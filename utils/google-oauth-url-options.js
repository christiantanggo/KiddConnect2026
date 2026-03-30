/**
 * Google OAuth URL helpers for YouTube connect flows.
 * @see https://developers.google.com/identity/protocols/oauth2/web-server
 */

/** Same string as Kid Quiz auto path and Movie Review (Google OAuth `prompt`). */
export const YOUTUBE_OAUTH_PROMPT = 'consent select_account';

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
 * @param {object} opts - base options for OAuth2Client.generateAuthUrl
 * @param {Record<string, unknown>} src - typically req.query (Kid Quiz / Movie Review pattern)
 * @returns {object}
 */
export function withYouTubeLoginHint(opts, src) {
  const hint = loginHintFromSource(src);
  if (!hint) return opts;
  return { ...opts, login_hint: hint };
}
