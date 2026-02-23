#!/usr/bin/env node
/**
 * Entry point for Railway (and local). Chooses web server or Orbix render worker by env.
 * - RUN_ORBIX_WORKER=true → run scripts/orbix-render-worker.js (no HTTP server)
 * - otherwise → run server.js (web app)
 * On Railway: add a second service from the same repo and set RUN_ORBIX_WORKER=true so it runs the worker.
 */
if (process.env.RUN_ORBIX_WORKER === 'true') {
  import('./scripts/orbix-render-worker.js').catch((err) => {
    console.error('[start] Worker failed:', err);
    process.exit(1);
  });
} else {
  import('./server.js');
}
