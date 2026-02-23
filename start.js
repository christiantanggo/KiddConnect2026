#!/usr/bin/env node
/**
 * Entry point for Railway (and local). Chooses web server or Orbix render worker by env.
 * - RUN_ORBIX_WORKER=true → run scripts/orbix-render-worker.js (no HTTP server), if the script exists
 * - otherwise → run server.js (web app)
 * If RUN_ORBIX_WORKER=true but the worker script is missing (e.g. not in deploy), we run server.js instead so the app stays up.
 */
async function main() {
  if (process.env.RUN_ORBIX_WORKER === 'true') {
    try {
      await import('./scripts/orbix-render-worker.js');
      return;
    } catch (err) {
      const isMissing = err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND' ||
        (err?.message && err.message.includes('Cannot find module'));
      if (isMissing) {
        console.warn('[start] Orbix worker script not found (scripts/orbix-render-worker.js). Running web server instead; it will process renders in-process.');
        // Fall through to run server.js
      } else {
        console.error('[start] Worker failed:', err?.message || err);
        process.exit(1);
      }
    }
  }
  import('./server.js').catch((err) => {
    console.error('[start] Server failed to load:', err?.message || err);
    console.error(err?.stack || err);
    process.exit(1);
  });
}
main();
