import winston from 'winston';

// Determine log level - use 'warn' in production to reduce noise, 'info' in development
const isProduction = process.env.NODE_ENV === 'production';
const defaultLevel = isProduction ? 'warn' : 'info';
const logLevel = process.env.LOG_LEVEL || defaultLevel;

// Determine if verbose/debug logging is enabled
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || !isProduction;
const DEBUG_LOGGING = process.env.DEBUG_LOGGING === 'true';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tavari-ai-phone-agent' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Add console transport - always add it but respect log level
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    level: logLevel,
    })
  );

// Helper functions for conditional logging
export const logVerbose = (...args) => {
  if (VERBOSE_LOGGING) {
    logger.info(...args);
  }
};

export const logDebug = (...args) => {
  if (DEBUG_LOGGING) {
    logger.debug(...args);
  }
};

// Rate-limited logging helper to prevent log spam
let lastLogTime = {};
const MIN_LOG_INTERVAL = 1000; // Minimum 1 second between same log message

export const logRateLimited = (key, level, ...args) => {
  const now = Date.now();
  const lastTime = lastLogTime[key] || 0;
  
  if (now - lastTime > MIN_LOG_INTERVAL) {
    lastLogTime[key] = now;
    logger[level](...args);
  }
};

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 60000; // Keep entries for 1 minute
  Object.keys(lastLogTime).forEach(key => {
    if (lastLogTime[key] < cutoff) {
      delete lastLogTime[key];
    }
  });
}, 30000); // Clean every 30 seconds

export default logger;



