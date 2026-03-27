// Helper module for conditional logging to reduce log spam
import logger, { logVerbose, logDebug } from './logger.js';

const isProduction = process.env.NODE_ENV === 'production';
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || !isProduction;

// Rate-limited logging to prevent spam
const logCache = new Map();
const RATE_LIMIT_MS = 2000; // 2 seconds between same log

export const log = {
  // Always log errors
  error: (...args) => logger.error(...args),
  
  // Always log warnings
  warn: (...args) => logger.warn(...args),
  
  // Info logs - only in verbose mode or for critical events
  info: (...args) => {
    if (VERBOSE_LOGGING) {
      logger.info(...args);
    }
  },
  
  // Verbose logs - only if explicitly enabled
  verbose: logVerbose,
  
  // Debug logs - only if explicitly enabled
  debug: logDebug,
  
  // Rate-limited info - prevents spam of same message
  infoRateLimited: (key, ...args) => {
    if (!VERBOSE_LOGGING) return;
    
    const now = Date.now();
    const lastTime = logCache.get(key) || 0;
    
    if (now - lastTime > RATE_LIMIT_MS) {
      logCache.set(key, now);
      logger.info(...args);
    }
  },
  
  // Critical logs - always log these
  critical: (...args) => logger.error('[CRITICAL]', ...args),
  
  // Success logs - always log
  success: (...args) => logger.info('✅', ...args),
};

// Clean up log cache periodically
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 60000; // 1 minute
  for (const [key, time] of logCache.entries()) {
    if (time < cutoff) {
      logCache.delete(key);
    }
  }
}, 30000);

export default log;


