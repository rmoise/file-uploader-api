/**
 * Winston-based Structured Logging System for File Upload API
 * Following Context7 best practices for production logging
 */

const winston = require('winston');
const crypto = require('crypto');

// Winston log levels (Context7 best practice)
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Custom format for development (Context7 pattern)
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, requestId, event, ...meta }) => {
    const reqId = requestId ? `[${requestId}]` : '';
    const eventStr = event ? `${event}: ` : '';
    let output = `${timestamp} ${level.toUpperCase()} ${reqId} ${eventStr}${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      output += `\n  └─ ${JSON.stringify(meta, null, 2)}`;
    }

    return output;
  })
);

// Production format (structured JSON)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create base logger with Context7 patterns
const baseLogger = winston.createLogger({
  levels: LOG_LEVELS,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'file-uploader-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport with level-specific configuration
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      handleExceptions: true,
      handleRejections: true
    })
  ],
  // Handle uncaught exceptions and rejections (Context7 best practice)
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  ]
});

// Add file transports in production (Context7 pattern)
if (process.env.NODE_ENV === 'production') {
  baseLogger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: productionFormat
  }));

  baseLogger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: productionFormat
  }));
}

/**
 * Generate unique request ID for correlation
 */
const generateRequestId = () => {
  return crypto.randomBytes(8).toString('hex');
};

/**
 * Logger class with request context (Context7 child logger pattern)
 */
class Logger {
  constructor(requestId = null) {
    this.requestId = requestId || generateRequestId();
    this.startTime = Date.now();

    // Create child logger with request context (Context7 best practice)
    this.logger = baseLogger.child({
      requestId: this.requestId
    });
  }

  // Core logging methods
  error(event, message, metadata = {}) {
    this.logger.error(message, { event, ...metadata });
  }

  warn(event, message, metadata = {}) {
    this.logger.warn(message, { event, ...metadata });
  }

  info(event, message, metadata = {}) {
    this.logger.info(message, { event, ...metadata });
  }

  http(event, message, metadata = {}) {
    this.logger.http(message, { event, ...metadata });
  }

  verbose(event, message, metadata = {}) {
    this.logger.verbose(message, { event, ...metadata });
  }

  debug(event, message, metadata = {}) {
    this.logger.debug(message, { event, ...metadata });
  }

  // Upload-specific logging methods
  uploadStart(fileName, fileSize, metadata = {}) {
    this.info('upload_start', `Starting upload: ${fileName}`, {
      fileName,
      fileSize,
      fileSizeFormatted: this.formatBytes(fileSize),
      ...metadata
    });
  }

  uploadProgress(fileName, loaded, total, metadata = {}) {
    const progress = Math.round((loaded / total) * 100);
    this.verbose('upload_progress', `Upload progress: ${fileName} - ${progress}%`, {
      fileName,
      loaded,
      total,
      progress: `${progress}%`,
      loadedFormatted: this.formatBytes(loaded),
      totalFormatted: this.formatBytes(total),
      ...metadata
    });
  }

  uploadComplete(fileName, fileUrl, duration, metadata = {}) {
    this.info('upload_complete', `Upload completed: ${fileName}`, {
      fileName,
      fileUrl,
      duration: `${duration}ms`,
      ...metadata
    });
  }

  uploadError(fileName, error, metadata = {}) {
    this.error('upload_error', `Upload failed: ${fileName}`, {
      fileName,
      error: error.message,
      errorCode: error.code,
      errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      retryable: error.retryable,
      ...metadata
    });
  }

  // S3 operation logging
  s3Operation(operation, success, duration, metadata = {}) {
    const level = success ? 'info' : 'error';
    const message = `S3 ${operation} ${success ? 'successful' : 'failed'}`;

    this[level]('s3_operation', message, {
      operation,
      success,
      duration: `${duration}ms`,
      ...metadata
    });
  }

  // Request lifecycle logging
  requestStart(method, url, metadata = {}) {
    this.http('request_start', `${method} ${url}`, {
      method,
      url,
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      ...metadata
    });
  }

  requestEnd(method, url, statusCode, duration, metadata = {}) {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';
    this[level]('request_end', `${method} ${url} - ${statusCode}`, {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ...metadata
    });
  }

  // Performance timing
  timing(operation, duration, metadata = {}) {
    this.verbose('timing', `${operation} completed`, {
      operation,
      duration: `${duration}ms`,
      ...metadata
    });
  }

  // Get elapsed time since logger creation
  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  // Memory usage logging
  withMemoryUsage(metadata = {}) {
    const usage = process.memoryUsage();
    return {
      ...metadata,
      memoryUsage: {
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(usage.external / 1024 / 1024)}MB`
      }
    };
  }

  // Utility methods
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Express middleware for request logging (Context7 pattern)
 */
const loggerMiddleware = (req, res, next) => {
  const requestId = generateRequestId();
  const logger = new Logger(requestId);

  // Attach logger to request for use in routes
  req.logger = logger;
  req.requestId = requestId;

  // Log request start
  logger.requestStart(req.method, req.originalUrl, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length')
  });

  // Track response
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.requestEnd(req.method, req.originalUrl, res.statusCode, duration, {
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

/**
 * Global error logging
 */
const logError = (error, metadata = {}) => {
  baseLogger.error(error.message, {
    event: 'error',
    error: error.message,
    errorCode: error.code,
    errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    ...metadata
  });
};

/**
 * Application startup logging
 */
const logStartup = (port, environment) => {
  baseLogger.info(`File Uploader API started`, {
    event: 'app_startup',
    port,
    environment,
    nodeVersion: process.version,
    pid: process.pid
  });
};

/**
 * Shutdown logging
 */
const logShutdown = (reason = 'unknown') => {
  baseLogger.info('File Uploader API shutting down', {
    event: 'app_shutdown',
    reason,
    uptime: process.uptime()
  });
};

/**
 * Create logger instance
 */
const createLogger = (requestId = null) => {
  return new Logger(requestId);
};

module.exports = {
  Logger,
  createLogger,
  loggerMiddleware,
  logError,
  logStartup,
  logShutdown,
  baseLogger
};
