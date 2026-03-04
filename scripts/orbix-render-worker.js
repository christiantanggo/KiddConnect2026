#!/usr/bin/env node
/**
 * Orbix Render Worker – dedicated process for video rendering.
 * Run this as a separate Railway (or other) service so FFmpeg never runs in the web process.
 *
 * Usage: node scripts/orbix-render-worker.js
 * Railway: add a second service with Start Command: node scripts/orbix-render-worker.js
 * Give the worker more memory than the web service (e.g. 1GB+).
 *
 * Logging: worker-crash.log, render-progress.log, current-render.txt (see utils/crash-and-progress-log.js)
 */

import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ensure we run from project root so log paths are consistent
process.chdir(path.resolve(__dirname, '..'));

import {
  installCrashHandlers,
  writeCrashLog,
  writeCrashLogFull,
  writeProgressLog,
  setCurrentRender,
  WORKER_CRASH_LOG_PATH
} from '../utils/crash-and-progress-log.js';

installCrashHandlers(WORKER_CRASH_LOG_PATH, true);

import { processOnePendingRender } from '../routes/v2/orbix-network-jobs.js';

const POLL_MS = Number(process.env.ORBIX_WORKER_POLL_MS) || 15_000; // 15s between polls when idle
const POLL_AFTER_JOB_MS = 5_000; // 5s before next poll after processing one

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  writeProgressLog('WORKER_START', { pollMs: POLL_MS, cwd: process.cwd(), pid: process.pid });
  console.log('[Orbix Worker] Started. Poll interval:', POLL_MS, 'ms');
  let pollCount = 0;
  while (true) {
    try {
      pollCount++;
      writeProgressLog('WORKER_POLL', { pollCount, at: new Date().toISOString() });
      const result = await processOnePendingRender();
      if (result.processed) {
        writeProgressLog('WORKER_JOB_DONE', {
          renderId: result.renderId,
          status: result.status,
          pollCount
        });
        setCurrentRender(result.renderId ?? null, `DONE_${result.status}`);
        console.log('[Orbix Worker] Job done', result.renderId, result.status);
        // Uploads only at post times via publish job (and manual Force Upload). Worker does not upload.
        await sleep(POLL_AFTER_JOB_MS);
      } else {
        await sleep(POLL_MS);
      }
    } catch (err) {
      writeCrashLog(WORKER_CRASH_LOG_PATH, 'WORKER_LOOP_ERROR', err?.message || String(err));
      writeCrashLogFull(WORKER_CRASH_LOG_PATH, 'WORKER_LOOP_ERROR_FULL', err);
      writeProgressLog('WORKER_JOB_ERROR', {
        message: err?.message,
        renderId: err?.renderId,
        stack: err?.stack?.split('\n').slice(0, 5)
      });
      console.error('[Orbix Worker] Error:', err.message);
      setCurrentRender(null, `ERROR_${err?.message?.slice(0, 50) || 'unknown'}`);
      await sleep(POLL_MS);
    }
  }
}

run().catch((err) => {
  writeCrashLogFull(WORKER_CRASH_LOG_PATH, 'WORKER_FATAL', err);
  writeProgressLog('WORKER_FATAL', { message: err?.message, stack: err?.stack });
  console.error('[Orbix Worker] Fatal:', err);
  process.exit(1);
});
