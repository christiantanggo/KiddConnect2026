/**
 * KiddConnect dashboard: YouTube / studio-line modules show under Active + Available.
 * All other modules (phone, reviews, dispatch, etc.) appear under Archive.
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
  if (module.key === 'phone-agent') return '/dashboard';
  if (module.key === 'reviews') return '/review-reply-ai/dashboard';
  if (module.key === 'delivery-dispatch' || module.key === 'emergency-dispatch') {
    return `/dashboard/v2/modules/${module.key}`;
  }
  return `/dashboard/v2/modules/${module.key}/dashboard`;
}
