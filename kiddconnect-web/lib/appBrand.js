/**
 * Le Fournier web — override via Vercel / .env.local if needed.
 */
export const APP_DISPLAY_NAME = (process.env.NEXT_PUBLIC_APP_DISPLAY_NAME || 'Le Fournier').trim();

export const APP_DESCRIPTION = (
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'Le Fournier — get in touch'
).trim();

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lefournier.ca').replace(/\/$/, '');

/** Sidebar / nav label for the legacy dashboard entry */
export const LEGACY_DASHBOARD_LABEL = `${APP_DISPLAY_NAME} Dashboard`;
