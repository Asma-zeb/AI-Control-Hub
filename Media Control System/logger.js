// Winston Logger Configuration
// Centralized logging infrastructure

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log format configuration
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
    const moduleTag = module ? `[${module}] ` : '';
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${moduleTag}${message} ${metaStr}`;
  })
);

// Create logger instances cache
const loggers = new Map();

/**
 * Creates or retrieves a logger instance
 * @param {string} module - Module name for the logger
 * @returns {winston.Logger}
 */
function createLogger(module = 'app') {
  if (loggers.has(module)) {
    return loggers.get(module);
  }

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { module },
    transports: [
      // Console transport for all environments
      new winston.transports.Console({
        format: consoleFormat
      }),
      
      // File transport for errors
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: parseInt(process.env.LOG_MAX_FILE_SIZE) || 10485760, // 10MB
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
      }),
      
      // File transport for all logs
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: logFormat,
        maxsize: parseInt(process.env.LOG_MAX_FILE_SIZE) || 10485760,
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
      })
    ],
    
    // Don't exit on handled exceptions
    exitOnError: false
  });

  // Stream for Morgan HTTP logging
  logger.stream = {
    write: (message) => {
      logger.http(message.trim());
    }
  };

  loggers.set(module, logger);
  return logger;
}

/**
 * Security audit logger
 */
const securityLogger = createLogger('security');

/**
 * Logs security events
 * @param {string} event - Security event type
 * @param {object} details - Event details
 */
function logSecurityEvent(event, details) {
  securityLogger.warn('Security Event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
}

/**
 * Performance logger
 */
const performanceLogger = createLogger('performance');

/**
 * Logs performance metrics
 * @param {string} operation - Operation name
 * @param {number} durationMs - Duration in milliseconds
 * @param {object} meta - Additional metadata
 */
function logPerformance(operation, durationMs, meta = {}) {
  performanceLogger.info('Performance Metric', {
    operation,
    durationMs,
    ...meta
  });
}

/**
 * Creates a performance timer wrapper
 * @param {string} operation - Operation name
 * @param {Function} fn - Function to time
 * @returns {Promise<any>}
 */
async function timedOperation(operation, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logPerformance(operation, duration, { success: true });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logPerformance(operation, duration, { success: false, error: error.message });
    throw error;
  }
}

/**
 * Audit logger for compliance
 */
const auditLogger = createLogger('audit');

/**
 * Logs audit trail events
 * @param {string} action - Action performed
 * @param {string} userId - User who performed the action
 * @param {object} details - Action details
 */
function logAudit(action, userId, details = {}) {
  auditLogger.info('Audit Event', {
    action,
    userId,
    ...details,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  createLogger,
  logSecurityEvent,
  logPerformance,
  timedOperation,
  logAudit,
  securityLogger,
  auditLogger
};
