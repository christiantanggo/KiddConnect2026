/**
 * Studio modules shown in the dashboard. Any other module keys still in the database are hidden.
 */
export const YOUTUBE_STYLE_MODULE_KEYS = [
  'kidquiz',
  'movie-review',
  'orbix-network',
  'dad-joke-studio',
];

export function isYoutubeStyleModule(m) {
  const key = typeof m === 'string' ? m : m?.key;
  return Boolean(key && YOUTUBE_STYLE_MODULE_KEYS.includes(key));
}

/** Sidebar link: unsubscribed modules go to the module detail / upgrade page. */
export function getV2ModuleSidebarHref(module) {
  if (!module?.subscribed) {
    return `/dashboard/v2/modules/${module.key}`;
  }
  return `/dashboard/v2/modules/${module.key}/dashboard`;
}
