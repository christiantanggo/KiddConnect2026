/**
 * Where to send the user right after activating a module (when API does not return redirect_to).
 * Legacy Orbix-style modules use /modules/<key>/setup; v2 studio modules use /dashboard/v2/modules/<key>/dashboard.
 */
export function getModulePostActivatePath(moduleKey) {
  if (!moduleKey) return '/dashboard/v2/modules';
  if (moduleKey === 'orbix-network') return '/modules/orbix-network/setup';
  if (moduleKey === 'reviews') return '/modules/reviews/setup';
  if (moduleKey === 'phone-agent') return '/dashboard';
  if (moduleKey === 'delivery-dispatch' || moduleKey === 'emergency-dispatch') {
    return `/dashboard/v2/modules/${moduleKey}`;
  }
  return `/dashboard/v2/modules/${moduleKey}/dashboard`;
}
