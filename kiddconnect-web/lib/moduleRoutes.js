/**
 * Where to send the user right after activating a module (when API does not return redirect_to).
 * Orbix uses its setup wizard; the other studio modules go straight to their dashboard.
 */
export function getModulePostActivatePath(moduleKey) {
  if (!moduleKey) return '/dashboard/v2/modules';
  if (moduleKey === 'orbix-network') return '/modules/orbix-network/setup';
  return `/dashboard/v2/modules/${moduleKey}/dashboard`;
}
