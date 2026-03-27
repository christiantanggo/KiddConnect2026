// middleware/rateLimiter.js
// Rate limiting middleware

import rateLimit from "express-rate-limit";

// Custom key generator that works with trust proxy
// Uses the first IP from X-Forwarded-For header if available, otherwise falls back to connection IP
const keyGenerator = (req) => {
  // If behind a proxy, use the first IP from X-Forwarded-For
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0] || req.ip || req.connection.remoteAddress;
  }
  return req.ip || req.connection.remoteAddress || 'unknown';
};

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 min (dashboard polling + Orbix can be heavy)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator, // Use custom key generator
  skip: (req) => {
    // Skip rate limiting for health checks, CORS preflight requests, and kiosk routes
    if (req.path === '/health' || req.path === '/ready' || req.method === 'OPTIONS' || req.path.startsWith('/kiosk')) return true;
    // Orbix dashboard setup check is read-only and called on every load - don't burn the limit
    if (req.path.includes('orbix-network/setup/status')) return true;
    return false;
  },
  // Return JSON error instead of HTML
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  },
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator, // Use custom key generator
  skip: (req) => {
    // Skip rate limiting for CORS preflight requests
    return req.method === 'OPTIONS';
  },
});

// Contact form rate limiter (stricter to prevent spam)
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 contact form submissions per hour
  message: "Too many contact form submissions. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator, // Use custom key generator
  skip: (req) => {
    // Skip rate limiting for CORS preflight requests
    return req.method === 'OPTIONS';
  },
});

// Admin rate limiter
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 admin requests per windowMs
  message: "Too many admin requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator, // Use custom key generator
  skip: (req) => req.method === 'OPTIONS',
});

// Webhook rate limiter (more lenient)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 webhook requests per minute
  message: "Too many webhook requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator, // Use custom key generator
});

// Kiosk rate limiter (very lenient for continuous polling)
export const kioskLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // Allow 120 requests per minute (2 per second) - enough for 5-10 second polling
  message: "Kiosk rate limit exceeded. Please slow down polling.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator, // Use custom key generator
  skip: (req) => {
    // Skip rate limiting for CORS preflight requests
    return req.method === 'OPTIONS';
  },
});

// AI rate limiter for AI generation endpoints
// Per-user and per-business rate limiting to prevent prompt abuse and cost spikes
// Separate from usage limits (which track total consumption)
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: async (req) => {
    // Default: 10 requests per minute per user
    // Can be configured per module in the future
    return parseInt(process.env.AI_RATE_LIMIT_PER_USER || '10');
  },
  message: "Too many AI requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if available (more accurate than IP)
    if (req.user?.id) {
      return `ai:user:${req.user.id}`;
    }
    // Fallback to IP
    return keyGenerator(req);
  },
  skip: (req) => {
    // Skip rate limiting for CORS preflight requests
    return req.method === 'OPTIONS';
  },
  // Custom handler to log violations
  handler: (req, res) => {
    // Log rate limit violation if audit_logs available
    if (req.user && req.active_business_id) {
      // Async - don't block response
      import('../../models/v2/AuditLog.js').then(({ AuditLog }) => {
        AuditLog.create({
          business_id: req.active_business_id,
          user_id: req.user.id,
          action: 'rate_limit_exceeded',
          metadata: {
            endpoint: req.path,
            method: req.method,
            module_key: req.params.moduleKey || 'unknown'
          },
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        }).catch(err => console.error('[aiRateLimiter] Failed to log violation:', err));
      });
    }
    
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});