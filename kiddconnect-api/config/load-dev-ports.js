/**
 * Single source of truth for local dev ports (see config/dev-ports.json).
 * Production: always use process.env.PORT (Railway, etc.) on the server — never these for listen.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FALLBACK = { project: 'Tavari', backend: 5003, frontend: 3003 };

let cached;

export function loadDevPorts() {
  if (cached) return cached;
  try {
    const p = join(__dirname, 'dev-ports.json');
    cached = JSON.parse(readFileSync(p, 'utf8'));
    if (typeof cached.backend !== 'number' || typeof cached.frontend !== 'number') {
      throw new Error('dev-ports.json must include numeric backend and frontend');
    }
  } catch (e) {
    console.warn('[dev-ports] Using fallback ports —', e?.message || e);
    cached = { ...FALLBACK };
  }
  return cached;
}

export function getDevBackendPort() {
  const n = Number(loadDevPorts().backend);
  return Number.isFinite(n) && n > 0 ? n : FALLBACK.backend;
}

export function getDevFrontendPort() {
  const n = Number(loadDevPorts().frontend);
  return Number.isFinite(n) && n > 0 ? n : FALLBACK.frontend;
}
