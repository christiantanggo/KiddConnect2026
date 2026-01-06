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
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator, // Use custom key generator
  skip: (req) => {
    // Skip rate limiting for health checks, CORS preflight requests, and kiosk routes
    return req.path === '/health' || 
           req.path === '/ready' || 
           req.method === 'OPTIONS' ||
           req.path.startsWith('/kiosk'); // Kiosk routes have their own limiter
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

