#!/usr/bin/env node
/**
 * Entry point for Railway and local. Runs the web server (server.js), which also runs
 * all Orbix jobs in-process (scrape, render, upload). One deployment, one process.
 */
import('./server.js').catch((err) => {
  console.error('[start] Server failed to load:', err?.message || err);
  console.error(err?.stack || err);
  process.exit(1);
});
