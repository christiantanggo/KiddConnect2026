/**
 * Crash and progress logging for Orbix render pipeline.
 * All writes are sync so they survive OOM kills (as much as possible).
 *
 * After a crash, check (in project root / process cwd):
 * - server-crash.log   – main server exits/exceptions (server.js has its own handlers)
 * - worker-crash.log   – render worker exits/exceptions
 * - render-progress.log – every step/FFmpeg start/done; last line = where we were when process died
 * - current-render.txt – overwritten each step; shows "renderId=... step=..." for last active step
 */

import fs from 'fs';
import path from 'path';

const CWD = process.cwd();

export const CRASH_LOG_PATH = path.join(CWD, 'server-crash.log');
export const WORKER_CRASH_LOG_PATH = path.join(CWD, 'worker-crash.log');
export const RENDER_PROGRESS_LOG_PATH = path.join(CWD, 'render-progress.log');
export const CURRENT_RENDER_PATH = path.join(CWD, 'current-render.txt');

function appendSync(filePath, line) {
  try {
    fs.appendFileSync(filePath, line);
  } catch (e) {
    try {
      console.error('[CrashLog] append failed:', filePath, e?.message || e);
    } catch (_) {}
  }
}

function writeSync(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
  } catch (e) {
    try {
      console.error('[CrashLog] write failed:', filePath, e?.message || e);
    } catch (_) {}
  }
}

/**
 * Append a line to the crash log (use for server or worker).
 */
export function writeCrashLog(filePath, label, detail) {
  const line = `[${new Date().toISOString()}] ${label} ${String(detail)}\n`;
  appendSync(filePath || CRASH_LOG_PATH, line);
}

/**
 * Append error message + stack to crash log.
 */
export function writeCrashLogFull(filePath, label, error) {
  const p = filePath || CRASH_LOG_PATH;
  const msg = error?.message ?? String(error);
  writeCrashLog(p, label, msg);
  try {
    const stack = error?.stack || String(error);
    if (stack && stack !== msg) appendSync(p, stack + '\n');
    appendSync(p, '---\n');
  } catch (_) {}
}

/**
 * Append to render-progress.log. Use for every step start/end so we know where we were when the process died.
 * data can be { renderId, step, message, ... }.
 */
export function writeProgressLog(message, data = {}) {
  const ts = new Date().toISOString();
  const payload = typeof data === 'object' && data !== null
    ? JSON.stringify(data)
    : String(data);
  const line = `[${ts}] ${message} ${payload}\n`;
  appendSync(RENDER_PROGRESS_LOG_PATH, line);
}

/**
 * Overwrite current-render.txt with current render id and step.
 * After crash, read this file to see "last step we were in".
 */
export function setCurrentRender(renderId, step) {
  const content = `${new Date().toISOString()} renderId=${renderId ?? 'none'} step=${step ?? 'none'}\n`;
  writeSync(CURRENT_RENDER_PATH, content);
}

/**
 * Install crash handlers that write to the given crash log path, then exit (or keep running for unhandledRejection if you prefer).
 * Use in worker so worker crashes are recorded.
 */
export function installCrashHandlers(crashLogPath = WORKER_CRASH_LOG_PATH, exitOnUncaught = true) {
  writeCrashLog(crashLogPath, 'PROCESS_START', `pid=${process.pid} cwd=${CWD}`);

  process.on('exit', (code, signal) => {
    const line = `[${new Date().toISOString()}] PROCESS_EXIT code=${code} signal=${signal || 'none'}\n`;
    appendSync(crashLogPath, line);
  });

  process.on('uncaughtException', (err) => {
    writeCrashLogFull(crashLogPath, 'uncaughtException', err);
    try {
      console.error('[CRASH] uncaughtException:', err?.message, err?.stack);
    } catch (_) {}
    if (exitOnUncaught) process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    writeCrashLogFull(crashLogPath, 'unhandledRejection', err);
    try {
      console.error('[CRASH] unhandledRejection:', reason);
    } catch (_) {}
  });

  process.on('SIGTERM', () => {
    writeCrashLog(crashLogPath, 'SIGTERM', 'received');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    writeCrashLog(crashLogPath, 'SIGINT', 'received');
    process.exit(0);
  });
}
