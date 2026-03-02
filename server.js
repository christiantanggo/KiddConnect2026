// server.js
// Tavari Voice Agent - VAPI Integration
// BULLETPROOF VERSION - Won't crash on startup

// Polyfill for File API (required by undici/fetch in Node.js 18)
// This must be done BEFORE any other imports
// File API is available in Node.js 20+ but not in Node.js 18
if (typeof globalThis.File === 'undefined' && typeof Blob !== 'undefined') {
  // Simple File polyfill using Blob (which exists in Node.js 18)
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

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";

// Load environment variables FIRST
dotenv.config();

// Crash log file - so you can see why the server died even when the terminal scrolls away
const CRASH_LOG_PATH = path.join(process.cwd(), 'server-crash.log');
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

// Log EVERY process exit (code + signal) so we know why the process stopped
process.on('exit', (code, signal) => {
  const line = `[${new Date().toISOString()}] PROCESS_EXIT code=${code} signal=${signal || 'none'}\n`;
  try {
    fs.appendFileSync(CRASH_LOG_PATH, line);
  } catch (_) {
    // exit handler must be sync; can't throw
  }
});

// Log non-zero process.exit() so we can see who called exit (server-crash.log)
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

// Catch uncaught exceptions so they are written to server-crash.log before process dies
process.on('uncaughtException', (err) => {
  writeCrashLogFull('uncaughtException', err);
  console.error('[CRASH] uncaughtException:', err?.message, err?.stack);
  _exit(1);
});

// Catch unhandled promise rejections so they are written to server-crash.log
process.on('unhandledRejection', (reason, promise) => {
  writeCrashLog('unhandledRejection', String(reason));
  try {
    fs.appendFileSync(CRASH_LOG_PATH, (reason && (reason.stack || reason.message)) ? String(reason.stack || reason.message) + '\n---\n' : '---\n');
  } catch (_) {}
  console.error('[CRASH] unhandledRejection:', reason);
});

const PORT = Number(process.env.PORT || 5001);
const app = express();

// Trust proxy for Railway/behind reverse proxy (fixes rate limiter warnings)
app.set('trust proxy', true);

// CORS configuration - allow requests from frontend
const allowedOrigins = [
  'https://tavarios.com',
  'https://www.tavarios.com',
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean); // Remove undefined values

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.FRONTEND_URL === '*') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  // Allow Vercel deployment URLs in production (deployed frontend)
  if (origin.endsWith('.vercel.app') && (origin.startsWith('https://') || origin.startsWith('http://'))) return true;
  return false;
}

// CRITICAL: Handle OPTIONS preflight requests FIRST, before any other middleware
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  const isAllowed = isOriginAllowed(origin);
  
  if (isAllowed && origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Active-Business-Id');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
  }
  
  res.status(204).end();
});

// Basic middleware - configure helmet to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));

// CORS middleware configuration - must come after OPTIONS handler
const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Active-Business-Id'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Additional CORS headers middleware - ensures headers are set on all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// Body parsing - EXCLUDE webhook endpoints that need raw body
// Stripe webhooks need raw body for signature verification
const jsonParser = express.json({ limit: "10mb" });
const urlencodedParser = express.urlencoded({ extended: true });

app.use((req, res, next) => {
  // Skip body parsing for Stripe webhooks (they need raw body for signature verification)
  // ClickBank v8 uses express.json() in the route itself, so we don't skip it here
  if (req.path.includes('/api/billing/webhook')) {
    return next();
  }
  // Apply JSON parsing for all other routes
  jsonParser(req, res, next);
});

app.use((req, res, next) => {
  // Skip URL-encoded parsing for Stripe webhooks
  if (req.path.includes('/api/billing/webhook')) {
    return next();
  }
  // Apply URL-encoded parsing for all other routes
  urlencodedParser(req, res, next);
});

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check - ALWAYS works
// Root: API has no UI here — use the frontend for the app
app.get("/", (_req, res) => {
  const port = process.env.PORT || 5001;
  res.type("html").status(200).send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Tavari API</title></head>
    <body style="font-family:sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;">
      <h1>Tavari API</h1>
      <p>This is the backend. There is no app UI at this URL.</p>
      <p><strong>To use the app locally:</strong> run the frontend, then open:</p>
      <p><a href="http://localhost:3000">http://localhost:3000</a></p>
      <p>From project root: <code>cd frontend && npm run dev</code></p>
      <p><a href="/health">Health check</a> · <a href="/ready">Ready</a></p>
    </body></html>
  `);
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    version: "VAPI_VERSION",
    server: "Tavari VAPI Server",
    timestamp: new Date().toISOString(),
    webhook: "/api/vapi/webhook",
  });
});

// Note: OPTIONS preflight requests are handled at the top of the file, before all other middleware

// Direct environment variable check - shows what server actually sees
app.get("/env-check", (_req, res) => {
  res.status(200).json({
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    environmentVariables: {
      SUPABASE_URL: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 30)}...` : "❌ NOT SET",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ SET (hidden)" : "❌ NOT SET",
      VAPI_API_KEY: process.env.VAPI_API_KEY ? "✅ SET (hidden)" : "❌ NOT SET",
      BACKEND_URL: process.env.BACKEND_URL || "❌ NOT SET",
      RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || "❌ NOT SET",
      DATABASE_URL: process.env.DATABASE_URL ? "✅ SET (hidden)" : "❌ NOT SET",
    },
    allEnvKeys: Object.keys(process.env).filter(key => 
      key.includes('SUPABASE') || 
      key.includes('VAPI') || 
      key.includes('DATABASE') ||
      key.includes('RAILWAY') ||
      key.includes('BACKEND')
    ).sort(),
    note: "Check if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in the 'allEnvKeys' list above",
  });
});

// Ready check - checks database but doesn't crash if it fails
app.get("/ready", async (_req, res) => {
  try {
    const { supabaseClient } = await import("./config/database.js");
    const { error } = await supabaseClient.from("businesses").select("id").limit(1);
    
    if (error) {
      return res.status(503).json({
        status: "not ready",
        error: "Database connection failed",
      });
    }
    
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      error: error.message,
    });
  }
});

// Telnyx webhook handler - simple, always works
app.post("/webhook", (req, res) => {
  res.status(200).json({ received: true });
});

// Initialize Sentry (optional - won't crash if missing)
import { initSentry } from "./config/sentry.js";
initSentry();

// Rate limiting - load synchronously
import { apiLimiter, authLimiter, adminLimiter, webhookLimiter, contactLimiter, kioskLimiter } from "./middleware/rateLimiter.js";
app.use("/api", apiLimiter);

// Load routes synchronously - they're all ES modules
import authRoutes from "./routes/auth.js";
import billingRoutes from "./routes/billing.js";
import setupRoutes from "./routes/setup.js";
import messagesRoutes from "./routes/messages.js";
import usageRoutes from "./routes/usage.js";
import agentsRoutes from "./routes/agents.js";
import vapiRoutes from "./routes/vapi.js";
import adminRoutes from "./routes/admin.js";
import supportRoutes from "./routes/support.js";
import invoicesRoutes from "./routes/invoices.js";
import accountRoutes from "./routes/account.js";
import businessRoutes from "./routes/business.js";
import callsRoutes from "./routes/calls.js";
import analyticsRoutes from "./routes/analytics.js";
import phoneNumbersRoutes from "./routes/phone-numbers.js";
import bulkSMSRoutes from "./routes/bulkSMS.js";
import contactsRoutes from "./routes/contacts.js";
import diagnosticsRoutes from "./routes/diagnostics.js";
import demoRoutes from "./routes/demo.js";
import demoTestEmailRoutes from "./routes/demo-test-email.js";
import clickbankRoutes from "./routes/clickbank.js";
import ordersRoutes from "./routes/orders.js";
import menuRoutes from "./routes/menu.js";
import kioskRoutes from "./routes/kiosk.js";

// Apply specific rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/admin/login", authLimiter); // Use auth limiter for admin login (must be before general admin limiter)
app.use("/api/vapi/webhook", webhookLimiter);
app.use("/api/support/contact", contactLimiter); // Stricter rate limiting for public contact form
app.use("/api/kiosk", kioskLimiter); // More lenient rate limiting for kiosk (continuous polling)

// Apply admin limiter to all admin routes EXCEPT login (which is handled above)
app.use("/api/admin", (req, res, next) => {
  // Skip rate limiting for login route
  if (req.path === '/login') {
    return next();
  }
  adminLimiter(req, res, next);
});

// Mount all routes
app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/setup", setupRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/vapi", vapiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/phone-numbers", phoneNumbersRoutes);
app.use("/api/bulk-sms", bulkSMSRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/diagnostics", diagnosticsRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/demo-test-email", demoTestEmailRoutes);
app.use("/api/clickbank", clickbankRoutes);
const demoFollowupRoutes = (await import("./routes/demo-followup.js")).default;
app.use("/api/demo-followup", demoFollowupRoutes);
app.use("/api/demo-followup", (await import("./routes/demo-followup.js")).default);

// Orders routes
app.use("/api/orders", (await import("./routes/orders.js")).default);

// Menu routes
app.use("/api/menu", menuRoutes);

// Kiosk routes (token-based authentication)
app.use("/api/kiosk", kioskRoutes);

// ========== TAVARI AI CORE v2 ROUTES ==========
// Mount v2 routes (built in parallel, does not touch Phone Agent)
try {
  // Multi-organization routes removed - will be added back later
  // const v2OrganizationsRoutes = (await import("./routes/v2/organizations.js")).default;
  const v2ModulesRoutes = (await import("./routes/v2/modules.js")).default;
  const v2SettingsRoutes = (await import("./routes/v2/settings.js")).default;
  const v2MarketplaceRoutes = (await import("./routes/v2/marketplace.js")).default;
  const v2StripeWebhookRoutes = (await import("./routes/v2/webhooks/stripe.js")).default;
  const v2ClickBankWebhookRoutes = (await import("./routes/v2/webhooks/clickbank.js")).default;
  const v2AuthRoutes = (await import("./routes/v2/auth.js")).default;
  const v2AdminRoutes = (await import("./routes/v2/admin.js")).default;
  const v2NotificationsRoutes = (await import("./routes/v2/notifications.js")).default;

  // Multi-organization routes removed - will be added back later
  // app.use("/api/v2/organizations", v2OrganizationsRoutes);
  app.use("/api/v2/modules", v2ModulesRoutes);
  app.use("/api/v2/settings", v2SettingsRoutes);
  app.use("/api/v2/marketplace", v2MarketplaceRoutes);
  app.use("/api/v2/webhooks/stripe", v2StripeWebhookRoutes);
  app.use("/api/v2/webhooks/clickbank", v2ClickBankWebhookRoutes);
  app.use("/api/v2/auth", v2AuthRoutes);
  app.use("/api/v2/admin", v2AdminRoutes);
  app.use("/api/v2/notifications", v2NotificationsRoutes);
  
  // Load reviews setup routes first (doesn't require openai)
  try {
    const v2ReviewsSetupRoutes = (await import("./routes/v2/reviews-setup.js")).default;
    app.use("/api/v2/reviews", v2ReviewsSetupRoutes);
    console.log('✅ Reviews setup routes loaded');
  } catch (setupError) {
    console.warn('⚠️  Reviews setup routes not loaded:', setupError.message);
  }
  
  // Load reviews main routes separately (requires openai package)
  try {
    const reviewsModule = await import("./routes/v2/reviews.js");
    const v2ReviewsRoutes = reviewsModule?.default;
    if (!v2ReviewsRoutes) {
      console.warn('⚠️  Reviews module routes file is empty or has no default export - skipping');
      console.warn('⚠️  The reviews module will not be available until reviews.js is properly implemented.');
    } else {
      app.use("/api/v2/reviews", v2ReviewsRoutes);
      console.log('✅ Reviews module routes loaded');
      console.log('✅ Reviews routes registered at /api/v2/reviews');
    }
  } catch (reviewsError) {
    // Only log as warning if it's a missing file, otherwise error
    if (reviewsError.code === 'MODULE_NOT_FOUND' || reviewsError.message.includes('Cannot find module')) {
      console.warn('⚠️  Reviews module routes file not found - skipping');
    } else {
      console.error('❌ Reviews module routes FAILED to load:', reviewsError.message);
      console.error('❌ Full error:', reviewsError);
      console.error('❌ Stack trace:', reviewsError.stack);
    }
    console.warn('⚠️  The reviews module will not be available until this is fixed.');
  }
  
  // Load Orbix Network YouTube OAuth callback (PUBLIC route - no auth required)
  // MUST be registered BEFORE authenticated routes so it's matched first
  try {
    const v2OrbixNetworkYouTubeCallback = (await import("./routes/v2/orbix-network-youtube-callback.js")).default;
    app.use("/api/v2/orbix-network", v2OrbixNetworkYouTubeCallback);
    console.log('✅ Orbix Network YouTube OAuth callback route loaded (public)');
  } catch (youtubeCallbackError) {
    console.warn('⚠️  Orbix Network YouTube OAuth callback route not loaded:', youtubeCallbackError.message);
  }

  // Load Orbix Network setup routes
  try {
    const v2OrbixNetworkSetupRoutes = (await import("./routes/v2/orbix-network-setup.js")).default;
    app.use("/api/v2/orbix-network", v2OrbixNetworkSetupRoutes);
    console.log('✅ Orbix Network setup routes loaded');
  } catch (setupError) {
    console.warn('⚠️  Orbix Network setup routes not loaded:', setupError.message);
  }
  
  // Load Orbix Network main routes
  try {
    const v2OrbixNetworkRoutes = (await import("./routes/v2/orbix-network.js")).default;
    if (!v2OrbixNetworkRoutes) {
      throw new Error('Router export is undefined');
    }
    app.use("/api/v2/orbix-network", v2OrbixNetworkRoutes);
    console.log('✅ Orbix Network module routes loaded');
    console.log('✅ Orbix Network routes registered at /api/v2/orbix-network');
  } catch (orbixError) {
    console.error('❌ Orbix Network module routes FAILED to load:', orbixError.message);
    console.warn('⚠️  The Orbix Network module will not be available until this is fixed.');
  }

  // Load Orbix Network job routes (for scheduled tasks)
  // NOTE: This import may fail on Node.js 18 due to undici/File API dependency
  // If it fails, the server will still start but Orbix Network jobs won't be available
  try {
    const v2OrbixNetworkJobRoutes = (await import("./routes/v2/orbix-network-jobs.js")).default;
    app.use("/api/v2/orbix-network/jobs", v2OrbixNetworkJobRoutes);
    console.log('✅ Orbix Network job routes loaded');
  } catch (orbixJobError) {
    console.warn('⚠️  Orbix Network job routes not loaded:', orbixJobError.message);
    console.warn('⚠️  This is likely due to Node.js 18 incompatibility. Orbix Network jobs will not be available.');
  }

  // Emergency Network (separate stream — does not touch existing agent)
  try {
    const v2EmergencyNetworkRoutes = (await import("./routes/v2/emergency-network.js")).default;
    app.use("/api/v2/emergency-network", v2EmergencyNetworkRoutes);
    console.log('✅ Emergency Network routes loaded at /api/v2/emergency-network');
  } catch (emergencyError) {
    console.warn('⚠️  Emergency Network routes not loaded:', emergencyError.message);
  }

  // Kid Quiz Studio (PUBLIC callback must be before authenticated routes)
  try {
    const kidquizYouTubeCallback = (await import("./routes/v2/kidquiz-youtube-callback.js")).default;
    app.use("/api/v2/kidquiz", kidquizYouTubeCallback);
    console.log('✅ Kid Quiz Studio YouTube OAuth callback loaded (public)');
  } catch (kqCallbackErr) {
    console.warn('⚠️  Kid Quiz Studio YouTube callback not loaded:', kqCallbackErr.message);
  }

  try {
    const kidquizRoutes = (await import("./routes/v2/kidquiz.js")).default;
    app.use("/api/v2/kidquiz", kidquizRoutes);
    console.log('✅ Kid Quiz Studio routes loaded at /api/v2/kidquiz');
  } catch (kqErr) {
    console.warn('⚠️  Kid Quiz Studio routes not loaded:', kqErr.message);
  }

  // Movie Review Studio (PUBLIC callback must be before authenticated routes)
  try {
    const movieReviewRoutes = (await import("./routes/v2/movie-review.js")).default;
    app.use("/api/v2/movie-review", movieReviewRoutes);
    console.log('✅ Movie Review Studio routes loaded at /api/v2/movie-review');
  } catch (mrErr) {
    console.warn('⚠️  Movie Review Studio routes not loaded:', mrErr.message);
  }
  
  // V2 routes health check
  app.get("/api/v2/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "v2",
      routes: {
        // organizations: "/api/v2/organizations", // Removed - will be added back later
        modules: "/api/v2/modules",
        settings: "/api/v2/settings",
        marketplace: "/api/v2/marketplace",
        auth: "/api/v2/auth",
        admin: "/api/v2/admin",
        notifications: "/api/v2/notifications",
        reviews: "/api/v2/reviews (optional - requires openai package)",
        orbixNetwork: "/api/v2/orbix-network",
        emergencyNetwork: "/api/v2/emergency-network",
        webhooks: {
          stripe: "/api/v2/webhooks/stripe",
          clickbank: "/api/v2/webhooks/clickbank"
        }
      }
    });
  });
  
  console.log('✅ Tavari AI Core v2 routes loaded');
} catch (error) {
  console.error('❌ Failed to load v2 routes:', error);
  console.error('Stack:', error.stack);
  // Add error endpoint so we can see what went wrong
  app.get("/api/v2/health", (_req, res) => {
    res.status(500).json({
      status: "error",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  });
}
// ========== END TAVARI AI CORE v2 ROUTES ==========

// Legacy Telnyx phone numbers endpoint (for backwards compatibility)
app.get("/api/telnyx-phone-numbers/search", async (req, res, next) => {
  // Import and use authenticate middleware
  const { authenticate } = await import("./middleware/auth.js");
  authenticate(req, res, next);
}, async (req, res) => {
  try {
    const { 
      countryCode = 'US', 
      phoneType = 'local', 
      limit = 20, 
      areaCode,
      locality,
      administrativeArea,
      phoneNumber 
    } = req.query;
    
    const { searchAvailablePhoneNumbers } = await import("./services/vapi.js");
    
    let searchAreaCode = areaCode;
    if (phoneNumber && /^\d{3}$/.test(phoneNumber.replace(/[\s\-\(\)\+]/g, ''))) {
      searchAreaCode = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
    }
    
    const numbers = await searchAvailablePhoneNumbers(
      countryCode,
      phoneType,
      parseInt(limit),
      searchAreaCode || null
    );
    
    let filteredNumbers = numbers;
    if (phoneNumber && phoneNumber.length > 3) {
      const cleanSearch = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
      filteredNumbers = numbers.filter(num => {
        const cleanNum = (num.phone_number || num.number || '').replace(/[\s\-\(\)\+]/g, '');
        return cleanNum.includes(cleanSearch);
      });
    }
    
    res.json({ numbers: filteredNumbers });
  } catch (error) {
    console.error("Telnyx phone numbers search error:", error);
    res.status(500).json({ error: error.message || "Failed to search phone numbers" });
  }
});

// Error handler
import { errorHandler } from "./middleware/errorHandler.js";
app.use(errorHandler);

// Start scheduled job to process queued SMS (every 5 minutes)
let queuedSMSInterval = null;
try {
  const { processQueuedSMS } = await import('./services/processQueuedSMS.js');
  
  // Process queued SMS every 5 minutes
  const processQueuedSMSJob = async () => {
    try {
      await processQueuedSMS();
    } catch (error) {
      console.error('[Server] Error in queued SMS processing job:', error.message);
    }
  };
  
  // Run immediately on startup (in case there are queued messages) - .catch() prevents unhandled rejection
  processQueuedSMSJob().catch((e) => console.error('[Server] Queued SMS job failed:', e?.message || e));

  // Then run every 5 minutes
  queuedSMSInterval = setInterval(processQueuedSMSJob, 5 * 60 * 1000); // 5 minutes
  
  console.log('✅ Queued SMS processor started (runs every 5 minutes)');
} catch (error) {
  console.warn('⚠️  Could not start queued SMS processor:', error.message);
}

// Start scheduled job to update expired sale prices (daily at 2 AM)
let expiredSalePricesInterval = null;
try {
  const { StripeService } = await import('./services/stripe.js');
  
  // Calculate milliseconds until next 2 AM
  const getMsUntil2AM = () => {
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0); // 2 AM today
    
    // If it's already past 2 AM today, set for tomorrow
    if (now >= next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    
    return next2AM.getTime() - now.getTime();
  };
  
  // Update expired sale prices job
  const updateExpiredSalePricesJob = async () => {
    try {
      console.log('[Server] Running daily expired sale prices check...');
      await StripeService.updateExpiredSalePrices();
    } catch (error) {
      console.error('[Server] Error in expired sale prices job:', error.message);
    }
  };
  
  // Run immediately on startup - .catch() prevents unhandled rejection killing the process
  updateExpiredSalePricesJob().catch((e) => console.error('[Server] Expired sale prices job failed:', e?.message || e));

  // Schedule to run daily at 2 AM
  const scheduleNextRun = () => {
    const msUntilNext = getMsUntil2AM();
    console.log(`[Server] Next expired sale prices check scheduled in ${Math.round(msUntilNext / 1000 / 60)} minutes (at 2 AM)`);

    setTimeout(() => {
      updateExpiredSalePricesJob().catch((e) => console.error('[Server] Expired sale prices job failed:', e?.message || e));
      expiredSalePricesInterval = setInterval(
        () => updateExpiredSalePricesJob().catch((e) => console.error('[Server] Expired sale prices job failed:', e?.message || e)),
        24 * 60 * 60 * 1000
      );
    }, msUntilNext);
  };
  
  scheduleNextRun();
  
  console.log('✅ Expired sale prices checker started (runs daily at 2 AM)');
} catch (error) {
  console.warn('⚠️  Could not start expired sale prices checker:', error.message);
}

// Start scheduled job to rebuild all VAPI assistants (daily at 3 AM)
let rebuildAssistantsInterval = null;
try {
  const { rebuildAllAssistants } = await import('./services/vapi.js');
  
  // Calculate milliseconds until next 3 AM
  const getMsUntil3AM = () => {
    const now = new Date();
    const next3AM = new Date();
    next3AM.setHours(3, 0, 0, 0); // 3 AM today
    
    // If it's already past 3 AM today, set for tomorrow
    if (now >= next3AM) {
      next3AM.setDate(next3AM.getDate() + 1);
    }
    
    return next3AM.getTime() - now.getTime();
  };
  
  // Rebuild all assistants job
  const rebuildAllAssistantsJob = async () => {
    try {
      console.log('[Server] Running daily assistant rebuild...');
      const result = await rebuildAllAssistants();
      console.log(`[Server] Daily rebuild completed: ${result.successful}/${result.total} successful`);
    } catch (error) {
      console.error('[Server] Error in assistant rebuild job:', error.message);
    }
  };
  
  // Schedule to run daily at 3 AM
  const scheduleNextRebuild = () => {
    const msUntilNext = getMsUntil3AM();
    console.log(`[Server] Next assistant rebuild scheduled in ${Math.round(msUntilNext / 1000 / 60)} minutes (at 3 AM)`);
    
    setTimeout(() => {
      rebuildAllAssistantsJob().catch((e) => console.error('[Server] Assistant rebuild job failed:', e?.message || e));
      rebuildAssistantsInterval = setInterval(
        () => rebuildAllAssistantsJob().catch((e) => console.error('[Server] Assistant rebuild job failed:', e?.message || e)),
        24 * 60 * 60 * 1000
      );
    }, msUntilNext);
  };

  scheduleNextRebuild();
  
  console.log('✅ Daily assistant rebuild scheduled (runs daily at 3 AM)');
} catch (error) {
  console.warn('⚠️  Could not start daily assistant rebuild:', error.message);
}

// Start scheduled jobs for Orbix Network
let orbixNetworkIntervals = {};
try {
  const {
    runScheduledPipelineCheck,
    processOnePendingRender,
    processOneYouTubeUpload,
    runOneRenderThenUpload,
    runPublishJob,
    runScheduledAnalyticsCheck
  } = await import('./routes/v2/orbix-network-jobs.js');

  if (typeof runOneRenderThenUpload !== 'function') {
    console.warn('[Orbix Jobs] runOneRenderThenUpload missing from orbix-network-jobs.js — skipping PENDING render / YouTube upload intervals');
  }

  // Wrapper so any promise rejection from the job is never unhandled (keeps process alive). Guard so we never call non-functions.
  const runSafe = (fn, name) => () => {
    if (typeof fn !== 'function') return;
    fn().catch((e) => console.error(`[Orbix Jobs] ${name} unhandled:`, e?.message || e));
  };

  // 1. Scheduled Pipeline: scrape → process → review → render at fixed times in each business's timezone.
  // Pipeline runs 1 hour before each post: 7am, 10am, 1pm, 4pm, 7pm. Posts at 8am, 11am, 2pm, 5pm, 8pm.
  // Uses posting_schedule.timezone from settings (NOT UTC). Check every 5 minutes.
  if (typeof runScheduledPipelineCheck === 'function') {
    const scheduledPipelineJob = async () => {
      try {
        const result = await runScheduledPipelineCheck();
        if (result?.pipelines_run > 0) {
          console.log('[Orbix Jobs] Scheduled pipeline ran for', result.pipelines_run, 'business(es)');
        }
      } catch (error) {
        console.error('[Orbix Jobs] Scheduled pipeline error:', error.message);
      }
    };
    orbixNetworkIntervals.scheduledPipeline = setInterval(runSafe(scheduledPipelineJob, 'ScheduledPipeline'), 5 * 60 * 1000); // Every 5 minutes
  }
  console.log('✅ Orbix Network scheduled pipeline (7am, 10am, 1pm, 4pm, 7pm in business timezone)');

  // When no separate worker is running, the web server picks up PENDING renders every 30s.
  if (process.env.RUN_ORBIX_WORKER !== 'true' && typeof processOnePendingRender === 'function') {
    orbixNetworkIntervals.processPending = setInterval(runSafe(processOnePendingRender, 'ProcessOne'), 30 * 1000);
    console.log('✅ Orbix Network: web server will process PENDING renders every 30s');
  }

  // Upload READY_FOR_UPLOAD renders to YouTube every 30s — immediately after render completes.
  if (typeof processOneYouTubeUpload === 'function') {
    orbixNetworkIntervals.youtubeUpload = setInterval(runSafe(() => processOneYouTubeUpload(), 'YouTubeUpload'), 30 * 1000);
    console.log('✅ Orbix Network: YouTube upload job runs every 30s (uploads as soon as render is ready)');
  }

  // 5. Publish Videos (every 5 minutes) — fixed post times 8am, 11am, 2pm, 5pm, 8pm in business timezone
  if (typeof runPublishJob === 'function') {
    orbixNetworkIntervals.publish = setInterval(runSafe(() => runPublishJob(), 'Publish'), 5 * 60 * 1000);
  }
  console.log('✅ Orbix Network publish job (8am, 11am, 2pm, 5pm, 8pm in business timezone)');

  // 6. Fetch Analytics (daily at 2 AM in each business's timezone — NOT UTC)
  if (typeof runScheduledAnalyticsCheck === 'function') {
    const analyticsCheckJob = async () => {
      const result = await runScheduledAnalyticsCheck();
      if (result?.analytics_run > 0) {
        console.log('[Orbix Jobs] Analytics ran for', result.analytics_run, 'business(es) at 2am local');
      }
    };
    orbixNetworkIntervals.analytics = setInterval(runSafe(analyticsCheckJob, 'Analytics'), 30 * 60 * 1000); // Every 30 min to catch 2am windows
  }
  console.log('✅ Orbix Network analytics (daily at 2am in business timezone)');
  
} catch (error) {
  console.warn('⚠️  Could not start Orbix Network scheduled jobs:', error.message);
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log('\n' + '='.repeat(60));
  writeCrashLog('SERVER_STARTED', localUrl);
  console.log('🚀 TAVARI SERVER - VAPI VERSION');
  console.log('='.repeat(60));
  console.log(`   LOCAL URL:  ${localUrl}`);
  console.log(`   Health:     ${localUrl}/health`);
  console.log(`   Ready:      ${localUrl}/ready`);
  console.log(`   VAPI Webhook: ${localUrl}/api/vapi/webhook`);
  console.log('='.repeat(60));
  console.log(`   If the server dies, check: ${CRASH_LOG_PATH}`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown (SIGTERM from process manager, or SIGINT from Ctrl+C)
function gracefulShutdown(signal) {
  console.log(`[Server] ${signal} received, shutting down gracefully...`);
  if (server && typeof server.close === 'function') {
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if close doesn't complete
    setTimeout(() => {
      console.error('[Server] Forced exit after shutdown timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Keep the process alive on uncaught errors - log to FILE first so you have a record if the process dies
process.on('uncaughtException', (error) => {
  writeCrashLogFull('UNCAUGHT_EXCEPTION', error);
  try {
    console.error('[Server] ❌ Uncaught Exception (server will keep running):', error?.message || error);
    if (error?.stack) console.error('[Server] Stack:', error.stack);
  } catch (e) {
    console.error('[Server] Uncaught Exception (log failed):', String(error));
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  writeCrashLogFull('UNHANDLED_REJECTION', err);
  try {
    console.error('[Server] ❌ Unhandled Rejection (server will keep running):', reason);
  } catch (e) {
    console.error('[Server] Unhandled Rejection (log failed)');
  }
});

export default app;
