/**
 * KiddConnect web — override via Vercel / .env.local if needed.
 */
export const APP_DISPLAY_NAME = (process.env.NEXT_PUBLIC_APP_DISPLAY_NAME || 'KiddConnect').trim();

export const APP_DESCRIPTION = (
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'KiddConnect — YouTube studio tools for creators'
).trim();

/** Sidebar / nav label for the legacy dashboard entry */
export const LEGACY_DASHBOARD_LABEL = `${APP_DISPLAY_NAME} Dashboard`;
