/**
 * Google OAuth URL helpers for YouTube connect flows.
 * @see https://developers.google.com/identity/protocols/oauth2/web-server
 */

/** Account picker + consent so refresh_token is issued when appropriate. */
export const YOUTUBE_OAUTH_PROMPT = 'consent select_account';

/**
 * Optional email from query string — Google shows that account first (user can still pick another).
 * @param {Record<string, unknown>} [query] - req.query
 * @returns {string|undefined}
 */
export function loginHintFromRequestQuery(query) {
  const hint = String(query?.login_hint || query?.email || '').trim().slice(0, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)) return undefined;
  return hint;
}

/**
 * @param {object} opts - base options for OAuth2Client.generateAuthUrl
 * @param {Record<string, unknown>} [query] - req.query
 * @returns {object}
 */
export function withYouTubeLoginHint(opts, query) {
  const hint = loginHintFromRequestQuery(query);
  if (!hint) return opts;
  return { ...opts, login_hint: hint };
}
