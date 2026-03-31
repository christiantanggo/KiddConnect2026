/**
 * KiddConnect API — deploy this folder alone (Railway). Own .env + Supabase.
 * Run: npm install && npm start
 */
const DEPLOYMENT_VERSION = 'KiddConnect-API-2-standalone';

if (typeof globalThis.File === 'undefined' && typeof Blob !== 'undefined') {
  globalThis.File = class File extends Blob {
    constructor(fileBits, fileName, options = {}) {
      super(fileBits, options);
      this.name = fileName;
      this.lastModified = options.lastModified || Date.now();
      this.webkitRelativePath = options.webkitRelativePath || '';
    }
    get [Symbol.toStringTag]() {
      return 'File';
    }
  };
}

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDevBackendPort, getDevFrontendPort } from './config/load-dev-ports.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/business.js';
import { errorHandler } from './middleware/errorHandler.js';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
process.chdir(repoRoot);
dotenv.config({ path: path.join(repoRoot, '.env') });

// Local: backend port from config/dev-ports.json (KiddConnect uses the same 5003 as the monolith).
// Production / Railway: process.env.PORT.
const isProd = process.env.NODE_ENV === 'production';
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);
const paasPort = Number(process.env.PORT);
const __SERVER_PORT__ =
  (isProd || onRailway) && Number.isFinite(paasPort) && paasPort > 0
    ? paasPort
    : getDevBackendPort();

console.log('[KiddConnect API] app root:', repoRoot);
console.log('[KiddConnect API] listening on port:', __SERVER_PORT__);

const CRASH_LOG_PATH = path.join(repoRoot, 'kiddconnect-api-crash.log');
function writeCrashLog(label, detail) {
  try {
    const line = `[${new Date().toISOString()}] ${label} ${String(detail)}\n`;
    fs.appendFileSync(CRASH_LOG_PATH, line);
  } catch (e) {
    console.error('[CrashLog] writeCrashLog failed:', e?.message || e);
  }
}
function writeCrashLogFull(label, error) {
  const msg = error?.message ?? String(error);
  writeCrashLog(label, msg);
  try {
    const stack = error?.stack || String(error);
    fs.appendFileSync(CRASH_LOG_PATH, (stack && stack !== msg ? stack + '\n' : '') + '---\n');
  } catch (e) {
    console.error('[CrashLog] writeCrashLogFull failed:', e?.message || e);
  }
}

process.on('exit', (code, signal) => {
  const line = `[${new Date().toISOString()}] PROCESS_EXIT code=${code} signal=${signal || 'none'}\n`;
  try {
    fs.appendFileSync(CRASH_LOG_PATH, line);
  } catch (_) {}
});

const _exit = process.exit;
process.exit = function (code) {
  if (code !== 0 && code !== undefined) {
    writeCrashLog('process.exit() called with code', code);
    const stack = new Error().stack;
    try {
      fs.appendFileSync(CRASH_LOG_PATH, (stack || '') + '\n---\n');
    } catch (_) {}
  }
  _exit.call(process, code);
};

process.on('uncaughtException', (err) => {
  writeCrashLogFull('uncaughtException', err);
  console.error('[CRASH] uncaughtException:', err?.message, err?.stack);
  _exit(1);
});

process.on('unhandledRejection', (reason) => {
  writeCrashLog('unhandledRejection', String(reason));
  try {
    fs.appendFileSync(
      CRASH_LOG_PATH,
      (reason && (reason.stack || reason.message) ? String(reason.stack || reason.message) : String(reason)) + '\n---\n'
    );
  } catch (_) {}
  console.error('[CRASH] unhandledRejection:', reason);
});

const app = express();
const LISTEN_PORT = __SERVER_PORT__;
app.set('trust proxy', true);

const __DEV_FE__ = getDevFrontendPort();
const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => String(o).trim())
  .filter(Boolean);
const allowedOrigins = [
  'https://www.kiddconnect.ca',
  'https://kiddconnect.ca',
  `http://localhost:${__DEV_FE__}`,
  `http://127.0.0.1:${__DEV_FE__}`,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
  ...extraOrigins,
].filter(Boolean);

function readRequestOrigin(req) {
  const raw = req.headers.origin;
  if (raw == null) return '';
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s).trim();
}

function parsedOriginOrigin(originStr) {
  try {
    return new URL(originStr).origin;
  } catch {
    return null;
  }
}

function isTavariosHost(hostname) {
  const h = String(hostname || '')
    .replace(/\.$/, '')
    .toLowerCase();
  return h === 'tavarios.com' || h.endsWith('.tavarios.com');
}

function isKiddConnectHost(hostname) {
  const h = String(hostname || '')
    .replace(/\.$/, '')
    .toLowerCase();
  return h === 'kiddconnect.ca' || h.endsWith('.kiddconnect.ca');
}

function isKiddConnectProductionOrigin(originStr) {
  try {
    const u = new URL(originStr);
    return isKiddConnectHost(u.hostname);
  } catch {
    return false;
  }
}

function isOriginAllowed(originRaw) {
  const origin = originRaw == null ? '' : String(originRaw).trim();
  if (!origin) return true;
  if (process.env.FRONTEND_URL === '*') return true;
  if (process.env.NODE_ENV !== 'production') return true;

  if (allowedOrigins.includes(origin)) return true;
  const reqOrigin = parsedOriginOrigin(origin);
  if (reqOrigin && allowedOrigins.some((a) => parsedOriginOrigin(a) === reqOrigin)) return true;

  if (isKiddConnectProductionOrigin(origin)) {
    try {
      const u = new URL(origin);
      if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') return false;
      return true;
    } catch {
      return false;
    }
  }

  if (origin.endsWith('.vercel.app') && (origin.startsWith('https://') || origin.startsWith('http://'))) return true;
  return false;
}

function applyCorsPreflightHeaders(req, res) {
  const origin = readRequestOrigin(req);
  if (!origin || !isOriginAllowed(origin)) {
    if (process.env.CORS_DEBUG_LOG === '1' && origin) {
      console.warn('[CORS] preflight denied for Origin:', JSON.stringify(origin));
    }
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  const requested = req.headers['access-control-request-headers'];
  if (requested) {
    res.setHeader('Access-Control-Allow-Headers', requested);
  } else {
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Active-Business-Id, Accept, Cookie'
    );
  }
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  return true;
}

app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next();
  if (applyCorsPreflightHeaders(req, res)) {
    return res.status(204).end();
  }
  return next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);

const corsOptions = {
  origin(incoming, callback) {
    const o = incoming == null ? '' : String(incoming).trim();
    if (isOriginAllowed(o)) {
      return callback(null, true);
    }
    if (process.env.CORS_DEBUG_LOG === '1') {
      console.warn('[CORS] cors() denied Origin:', JSON.stringify(incoming));
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Active-Business-Id',
    'Accept',
    'Cookie',
    'Origin',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Site',
    'Sec-Fetch-Dest',
    'baggage',
    'sentry-trace',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  const origin = readRequestOrigin(req);
  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  next();
});

const jsonParser = express.json({ limit: '10mb', strict: false });
const urlencodedParser = express.urlencoded({ extended: true });

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path.includes('/api/billing/webhook') || req.path.includes('/api/v2/webhooks/stripe')) {
    return next();
  }
  jsonParser(req, res, next);
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path.includes('/api/billing/webhook') || req.path.includes('/api/v2/webhooks/stripe')) {
    return next();
  }
  urlencodedParser(req, res, next);
});

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/', (_req, res) => {
  const port = LISTEN_PORT;
  res.type('html').status(200).send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>KiddConnect API</title></head>
    <body style="font-family:sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;">
      <h1>KiddConnect API</h1>
      <p>Studio backend (YouTube / Orbix / Kid Quiz / Dad Joke / Movie Review). No app UI here.</p>
      <p><a href="/health">Health</a> · <a href="/ready">Ready</a> · <a href="/api/v2/health">v2 health</a></p>
      <p>Local web: <code>cd kiddconnect-web && npm run dev</code> — set <code>NEXT_PUBLIC_API_URL=http://localhost:${port}</code></p>
    </body></html>
  `);
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    version: DEPLOYMENT_VERSION,
    server: 'KiddConnect API',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (_req, res) => {
  try {
    const { supabaseClient } = await import('./config/database.js');
    const { error } = await supabaseClient.from('businesses').select('id').limit(1);

    if (error) {
      return res.status(503).json({
        status: 'not ready',
        error: 'Database connection failed',
      });
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
    });
  }
});

try {
  const { initSentry } = await import('./config/sentry.js');
  initSentry();
} catch (e) {
  console.warn('[KiddConnect API] Sentry not initialized:', e?.message || e);
}

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);

try {
  const v2OrganizationsRoutes = (await import('./routes/v2/organizations.js')).default;
  const v2ModulesRoutes = (await import('./routes/v2/modules.js')).default;
  const v2SettingsRoutes = (await import('./routes/v2/settings.js')).default;
  const v2MarketplaceRoutes = (await import('./routes/v2/marketplace.js')).default;
  const v2StripeWebhookRoutes = (await import('./routes/v2/webhooks/stripe.js')).default;
  const v2ClickBankWebhookRoutes = (await import('./routes/v2/webhooks/clickbank.js')).default;
  const v2AuthRoutes = (await import('./routes/v2/auth.js')).default;
  const v2NotificationsRoutes = (await import('./routes/v2/notifications.js')).default;

  app.use('/api/v2/organizations', v2OrganizationsRoutes);
  app.use('/api/v2/modules', v2ModulesRoutes);
  app.use('/api/v2/settings', v2SettingsRoutes);
  app.use('/api/v2/marketplace', v2MarketplaceRoutes);
  app.use('/api/v2/webhooks/stripe', v2StripeWebhookRoutes);
  app.use('/api/v2/webhooks/clickbank', v2ClickBankWebhookRoutes);
  app.use('/api/v2/auth', v2AuthRoutes);
  app.use('/api/v2/notifications', v2NotificationsRoutes);

  try {
    const longformModule = await import('./routes/v2/orbix-network-longform.js');
    const v2OrbixNetworkLongformRoutes = longformModule?.default;
    if (!v2OrbixNetworkLongformRoutes) {
      throw new Error('orbix-network-longform.js did not export a default router');
    }
    app.use('/api/v2/orbix-network/longform', v2OrbixNetworkLongformRoutes);
    console.log('✅ Orbix longform at /api/v2/orbix-network/longform');
  } catch (longformErr) {
    console.error('❌ Orbix longform failed:', longformErr.message);
  }

  try {
    const v2OrbixNetworkJobRoutes = (await import('./routes/v2/orbix-network-jobs.js')).default;
    app.use('/api/v2/orbix-network/jobs', v2OrbixNetworkJobRoutes);
    console.log('✅ Orbix job routes');
  } catch (orbixJobError) {
    console.warn('⚠️ Orbix job routes not loaded:', orbixJobError.message);
  }

  try {
    const v2OrbixNetworkYouTubeCallback = (await import('./routes/v2/orbix-network-youtube-callback.js')).default;
    app.use('/api/v2/orbix-network', v2OrbixNetworkYouTubeCallback);
    console.log('✅ Orbix YouTube OAuth callback (public)');
  } catch (youtubeCallbackError) {
    console.warn('⚠️ Orbix YouTube callback not loaded:', youtubeCallbackError.message);
  }

  try {
    const riddleYouTubeCallback = (await import('./routes/v2/riddle-youtube-callback.js')).default;
    app.use('/api/v2/riddle', riddleYouTubeCallback);
    console.log('✅ Riddle YouTube OAuth callback (public)');
  } catch (riddleCbErr) {
    console.warn('⚠️ Riddle YouTube callback not loaded:', riddleCbErr.message);
  }

  try {
    const v2OrbixNetworkSetupRoutes = (await import('./routes/v2/orbix-network-setup.js')).default;
    app.use('/api/v2/orbix-network', v2OrbixNetworkSetupRoutes);
    console.log('✅ Orbix setup routes');
  } catch (setupError) {
    console.warn('⚠️ Orbix setup not loaded:', setupError.message);
  }

  try {
    const v2OrbixNetworkRoutes = (await import('./routes/v2/orbix-network.js')).default;
    if (!v2OrbixNetworkRoutes) {
      throw new Error('Router export is undefined');
    }
    app.use('/api/v2/orbix-network', v2OrbixNetworkRoutes);
    console.log('✅ Orbix Network routes');
  } catch (orbixError) {
    console.error('❌ Orbix Network routes failed:', orbixError.message);
  }

  try {
    const kidquizYouTubeCallback = (await import('./routes/v2/kidquiz-youtube-callback.js')).default;
    app.use('/api/v2/kidquiz', kidquizYouTubeCallback);
    console.log('✅ Kid Quiz YouTube callback (public)');
  } catch (kqCallbackErr) {
    console.warn('⚠️ Kid Quiz YouTube callback not loaded:', kqCallbackErr.message);
  }

  try {
    const kidquizRoutes = (await import('./routes/v2/kidquiz.js')).default;
    app.use('/api/v2/kidquiz', kidquizRoutes);
    console.log('✅ Kid Quiz routes');
  } catch (kqErr) {
    console.warn('⚠️ Kid Quiz routes not loaded:', kqErr.message);
  }

  try {
    const djsRoutes = (await import('./routes/v2/dad-joke-studio.js')).default;
    app.use('/api/v2/dad-joke-studio', djsRoutes);
    console.log('✅ Dad Joke Studio routes (OAuth callback included before auth)');
  } catch (djsErr) {
    console.warn('⚠️ Dad Joke Studio routes not loaded:', djsErr.message);
  }

  try {
    const movieReviewRoutes = (await import('./routes/v2/movie-review.js')).default;
    app.use('/api/v2/movie-review', movieReviewRoutes);
    console.log('✅ Movie Review routes');
  } catch (mrErr) {
    console.warn('⚠️ Movie Review routes not loaded:', mrErr.message);
  }

  app.get('/api/v2/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: DEPLOYMENT_VERSION,
      profile: 'kiddconnect-studio',
      routes: {
        auth: '/api/auth',
        business: '/api/business',
        organizations: '/api/v2/organizations',
        modules: '/api/v2/modules',
        settings: '/api/v2/settings',
        marketplace: '/api/v2/marketplace',
        v2Auth: '/api/v2/auth',
        notifications: '/api/v2/notifications',
        orbixNetwork: '/api/v2/orbix-network',
        kidquiz: '/api/v2/kidquiz',
        dadJokeStudio: '/api/v2/dad-joke-studio',
        movieReview: '/api/v2/movie-review',
        webhooks: {
          stripe: '/api/v2/webhooks/stripe',
          clickbank: '/api/v2/webhooks/clickbank',
        },
      },
    });
  });

  console.log('✅ KiddConnect v2 routes loaded');
} catch (error) {
  console.error('❌ Failed to load v2 routes:', error);
  app.get('/api/v2/health', (_req, res) => {
    res.status(500).json({
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  });
}

app.use('/api', (req, res, next) => {
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not found', path: req.path });
  } else {
    next();
  }
});

app.use(errorHandler);

let orbixNetworkIntervals = {};
try {
  const {
    runScheduledPipelineCheck,
    processOnePendingRender,
    runPublishJob,
    runScheduledAnalyticsCheck,
  } = await import('./routes/v2/orbix-network-jobs.js');

  const runSafe = (fn, name) => () => {
    if (typeof fn !== 'function') return;
    fn().catch((e) => console.error(`[Orbix Jobs] ${name} unhandled:`, e?.message || e));
  };

  if (typeof runScheduledPipelineCheck === 'function') {
    const scheduledPipelineJob = async () => {
      try {
        const result = await runScheduledPipelineCheck();
        if (result?.pipelines_run > 0) {
          console.log('[Orbix Jobs] Scheduled pipeline ran for', result.pipelines_run, 'business(es)');
        }
      } catch (err) {
        console.error('[Orbix Jobs] Scheduled pipeline error:', err.message);
      }
    };
    orbixNetworkIntervals.scheduledPipeline = setInterval(runSafe(scheduledPipelineJob, 'ScheduledPipeline'), 5 * 60 * 1000);
  }

  if (process.env.RUN_ORBIX_WORKER !== 'true' && typeof processOnePendingRender === 'function') {
    orbixNetworkIntervals.processPending = setInterval(runSafe(processOnePendingRender, 'ProcessOne'), 30 * 1000);
    console.log('✅ Orbix: PENDING renders every 30s (web server)');
  }

  if (typeof runPublishJob === 'function') {
    orbixNetworkIntervals.publish = setInterval(runSafe(() => runPublishJob(), 'Publish'), 5 * 60 * 1000);
  }

  if (typeof runScheduledAnalyticsCheck === 'function') {
    const analyticsCheckJob = async () => {
      const result = await runScheduledAnalyticsCheck();
      if (result?.analytics_run > 0) {
        console.log('[Orbix Jobs] Analytics ran for', result.analytics_run, 'business(es)');
      }
    };
    orbixNetworkIntervals.analytics = setInterval(runSafe(analyticsCheckJob, 'Analytics'), 30 * 60 * 1000);
  }

  console.log('✅ Orbix scheduled jobs started');
} catch (error) {
  console.warn('⚠️ Orbix scheduled jobs not started:', error.message);
}

const server = app.listen(__SERVER_PORT__, '0.0.0.0', () => {
  const localUrl = `http://localhost:${__SERVER_PORT__}`;
  console.log('\n' + '='.repeat(60));
  writeCrashLog('KIDDCONNECT_API_STARTED', localUrl);
  console.log(`🚀 KiddConnect API — ${DEPLOYMENT_VERSION}`);
  console.log(`   ${localUrl}`);
  console.log(`   Crash log: ${CRASH_LOG_PATH}`);
  console.log('='.repeat(60) + '\n');
});

function gracefulShutdown(signal) {
  console.log(`[KiddConnect API] ${signal} received, shutting down...`);
  Object.values(orbixNetworkIntervals).forEach((id) => clearInterval(id));
  if (server && typeof server.close === 'function') {
    server.close(() => {
      console.log('[KiddConnect API] HTTP closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[KiddConnect API] forced exit');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
