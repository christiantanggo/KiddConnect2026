/**
 * Site-wide deployment stamp (black bar). Update DEPLOYMENT_LABEL when you ship.
 */
export const DEPLOYMENT_LABEL = 'March 27, 2026';

export default function DeploymentBar() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="deployment-bar fixed bottom-0 left-0 right-0 z-[200] flex items-center justify-center px-3 py-1.5 text-center text-[11px] font-medium leading-tight tracking-wide text-white"
      style={{ backgroundColor: '#000000' }}
    >
      Deployed {DEPLOYMENT_LABEL}
    </div>
  );
}
