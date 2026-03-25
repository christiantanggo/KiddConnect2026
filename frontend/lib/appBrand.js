/**
 * Product branding — set per deployment (Vercel env / .env.local).
 * KiddConnect project: NEXT_PUBLIC_APP_DISPLAY_NAME=KiddConnect
 * Tavari: omit or leave default.
 */
export const APP_DISPLAY_NAME = (process.env.NEXT_PUBLIC_APP_DISPLAY_NAME || 'Tavari Ai').trim();

export const APP_DESCRIPTION = (
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'Tavari Ai — AI communications, phone agents, and business tools'
).trim();

/** Sidebar / nav label for the legacy dashboard entry */
export const LEGACY_DASHBOARD_LABEL = `${APP_DISPLAY_NAME} Dashboard`;
