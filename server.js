// server.js
// Tavari Voice Agent - VAPI Integration
// BULLETPROOF VERSION - Won't crash on startup

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

// Load environment variables FIRST
dotenv.config();

const PORT = Number(process.env.PORT || 5001);
const app = express();

// Trust proxy for Railway/behind reverse proxy (fixes rate limiter warnings)
app.set('trust proxy', true);

// Basic middleware - configure helmet to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration - allow requests from frontend
const allowedOrigins = [
  'https://tavarios.com',
  'https://www.tavarios.com',
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log(`[CORS] Request with no origin, allowing`);
      return callback(null, true);
    }
    
    console.log(`[CORS] Checking origin: ${origin}`);
    console.log(`[CORS] Allowed origins:`, allowedOrigins);
    console.log(`[CORS] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[CORS] FRONTEND_URL: ${process.env.FRONTEND_URL}`);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Origin ${origin} is in allowed list`);
      return callback(null, true);
    }
    
    // If FRONTEND_URL is set to "*", allow all origins
    if (process.env.FRONTEND_URL === "*") {
      console.log(`[CORS] ✅ FRONTEND_URL is "*", allowing all origins`);
      return callback(null, true);
    }
    
    // In development, allow all origins for easier testing
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[CORS] ✅ Development mode, allowing origin ${origin}`);
      return callback(null, true);
    }
    
    // In production, only allow origins from the allowed list
    console.warn(`[CORS] ❌ Blocked request from origin: ${origin}`);
    console.warn(`[CORS] Allowed origins:`, allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));

// Body parsing - EXCLUDE webhook endpoints that need raw body
// Stripe webhooks need raw body for signature verification
const jsonParser = express.json({ limit: "10mb" });
const urlencodedParser = express.urlencoded({ extended: true });

app.use((req, res, next) => {
  // Skip body parsing for Stripe webhooks (they need raw body for signature verification)
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
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    version: "VAPI_VERSION",
    server: "Tavari VAPI Server",
    timestamp: new Date().toISOString(),
    webhook: "/api/vapi/webhook",
  });
});

// Handle all OPTIONS requests for CORS preflight (must be before rate limiters)
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  let allowOrigin = '*';
  if (origin) {
    if (allowedOrigins.includes(origin) || 
        process.env.FRONTEND_URL === "*" ||
        process.env.NODE_ENV !== 'production') {
      allowOrigin = origin;
    } else if (process.env.NODE_ENV === 'production') {
      // In production, only allow from allowed list
      console.warn(`[CORS OPTIONS] Blocked preflight from origin: ${origin}`);
      return res.status(403).end();
    }
  }
  
  res.header('Access-Control-Allow-Origin', allowOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  res.status(200).end();
});

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
import { apiLimiter, authLimiter, adminLimiter, webhookLimiter, contactLimiter } from "./middleware/rateLimiter.js";
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

// Apply specific rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/admin/login", authLimiter); // Use auth limiter for admin login (must be before general admin limiter)
app.use("/api/vapi/webhook", webhookLimiter);
app.use("/api/support/contact", contactLimiter); // Stricter rate limiting for public contact form

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
  
  // Run immediately on startup (in case there are queued messages)
  processQueuedSMSJob();
  
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
  
  // Run immediately on startup (in case there are expired sales)
  updateExpiredSalePricesJob();
  
  // Schedule to run daily at 2 AM
  const scheduleNextRun = () => {
    const msUntilNext = getMsUntil2AM();
    console.log(`[Server] Next expired sale prices check scheduled in ${Math.round(msUntilNext / 1000 / 60)} minutes (at 2 AM)`);
    
    setTimeout(() => {
      updateExpiredSalePricesJob();
      // After first run, schedule to run every 24 hours
      expiredSalePricesInterval = setInterval(updateExpiredSalePricesJob, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilNext);
  };
  
  scheduleNextRun();
  
  console.log('✅ Expired sale prices checker started (runs daily at 2 AM)');
} catch (error) {
  console.warn('⚠️  Could not start expired sale prices checker:', error.message);
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TAVARI SERVER - VAPI VERSION');
  console.log('='.repeat(60));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Ready: http://localhost:${PORT}/ready`);
  console.log(`   VAPI Webhook: http://localhost:${PORT}/api/vapi/webhook`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Handle uncaught errors - log but don't crash immediately
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("Stack:", error.stack);
  // Don't exit - let the server keep running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);
  // Don't exit - let the server keep running
});

export default app;
