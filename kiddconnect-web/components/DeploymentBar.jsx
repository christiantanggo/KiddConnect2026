'use client';

import { usePathname } from 'next/navigation';

/**
 * Deployment stamp (black bar) for signed-in pages. Update DEPLOYMENT_LABEL when you ship.
 */
export const DEPLOYMENT_LABEL = 'Oct 5 2026 V2 — Le Fournier';

const PUBLIC_PATHS = ['/', '/privacy', '/terms', '/legal/privacy', '/legal/terms'];

export default function DeploymentBar() {
  const pathname = usePathname();
  if (PUBLIC_PATHS.includes(pathname)) return null;

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
