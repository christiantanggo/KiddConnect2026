/**
 * Le Fournier web — override via Vercel / .env.local if needed.
 */
export const APP_DISPLAY_NAME = (process.env.NEXT_PUBLIC_APP_DISPLAY_NAME || 'Le Fournier').trim();

export const APP_DESCRIPTION = (
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'Le Fournier — family projects and YouTube studio'
).trim();

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lefournier.ca').replace(/\/$/, '');

/** Shown on the privacy policy and terms; leave unset to hide the contact line. */
export const CONTACT_EMAIL = (process.env.NEXT_PUBLIC_CONTACT_EMAIL || '').trim();

/** Sidebar / nav label for the legacy dashboard entry */
export const LEGACY_DASHBOARD_LABEL = `${APP_DISPLAY_NAME} Dashboard`;
