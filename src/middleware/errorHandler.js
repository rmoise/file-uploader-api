/**
 * Error Handling Middleware for File Upload API
 * Following Context7 Express and Node.js async error handling best practices
 */

const { createLogger } = require('../utils/logger');

// Logger for error handling
const logger = createLogger();

/**
 * Error classification for retry logic
 * Following Context7 patterns for error categorization
 */
const classifyError = (error) => {
  // Non-retryable error types (client-side issues)
  const nonRetryableErrors = [
    'ValidationError',
    'ValidationException',
    'AccessDenied',
    'InvalidBucketName',
    'InvalidArgument',
    'INVALID_FILE',
    'INVALID_FILE_TYPE',
    'INVALID_FILE_EXTENSION',
    'FILE_TOO_LARGE',
    'TOO_MANY_FILES',
    'NO_FILE',
    'ENOENT', // File not found
    'EISDIR', // Is a directory
    'EACCES', // Permission denied
    'EMFILE', // Too many open files
    'ENFILE', // File table overflow
  ];

  // Network/Infrastructure errors (typically retryable)
  const retryableErrors = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'UPLOAD_ERROR',
    'S3_ERROR',
    'NETWORK_ERROR'
  ];

  const errorCode = error.code || error.name || 'UNKNOWN_ERROR';

  // Explicit retryable check
  if (retryableErrors.includes(errorCode)) {
    return {
      retryable: true,
      code: errorCode,
      category: 'network'
    };
  }

  // Explicit non-retryable check
  if (nonRetryableErrors.includes(errorCode)) {
    return {
      retryable: false,
      code: errorCode,
      category: 'validation'
    };
  }

  // HTTP status code based classification
  const statusCode = error.status || error.statusCode;
  if (statusCode) {
    if (statusCode >= 400 && statusCode < 500) {
      // Client errors - typically not retryable
      return {
        retryable: false,
        code: errorCode,
        category: 'client_error',
        statusCode
      };
    } else if (statusCode >= 500) {
      // Server errors - typically retryable
      return {
        retryable: true,
        code: errorCode,
        category: 'server_error',
        statusCode
      };
    }
  }

  // Default to retryable for unknown errors (conservative approach)
  return {
    retryable: true,
    code: errorCode,
    category: 'unknown'
  };
};

/**
 * Generate appropriate HTTP status code based on error type
 * Following Context7 HTTP status patterns
 */
const getErrorStatusCode = (error, classification) => {
  // Explicit status code on error object
  if (error.status || error.statusCode) {
    return error.status || error.statusCode;
  }

  // Error code based status mapping
  const errorCode = classification.code;

  switch (errorCode) {
    // 400 Bad Request
    case 'INVALID_FILE':
    case 'INVALID_FILE_TYPE':
    case 'INVALID_FILE_EXTENSION':
    case 'FILE_TOO_LARGE':
    case 'TOO_MANY_FILES':
    case 'NO_FILE':
    case 'ValidationError':
    case 'ValidationException':
      return 400;

    // 401 Unauthorized
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
      return 401;

    // 403 Forbidden
    case 'AccessDenied':
    case 'FORBIDDEN':
      return 403;

    // 404 Not Found
    case 'NOT_FOUND':
    case 'ENOENT':
      return 404;

    // 413 Payload Too Large
    case 'PAYLOAD_TOO_LARGE':
      return 413;

    // 422 Unprocessable Entity
    case 'UNPROCESSABLE_ENTITY':
      return 422;

    // 429 Too Many Requests
    case 'TOO_MANY_REQUESTS':
    case 'RATE_LIMITED':
      return 429;

    // 502 Bad Gateway
    case 'BAD_GATEWAY':
    case 'S3_ERROR':
      return 502;

    // 503 Service Unavailable
    case 'SERVICE_UNAVAILABLE':
    case 'ECONNREFUSED':
    case 'EHOSTUNREACH':
      return 503;

    // 504 Gateway Timeout
    case 'GATEWAY_TIMEOUT':
    case 'ETIMEDOUT':
      return 504;

    // Default to 500 Internal Server Error
    default:
      return 500;
  }
};

/**
 * Enhanced error handler middleware following Context7 Express patterns
 * Signature: (err, req, res, next) => {} - Express error middleware pattern
 */
const errorHandler = (err, req, res, next) => {
  // Create child logger with request context
  const requestLogger = createLogger();

  // Classify the error for retry logic
  const classification = classifyError(err);
  const statusCode = getErrorStatusCode(err, classification);

  // Determine error severity based on status code
  const severity = statusCode >= 500 ? 'error' : 'warn';

  // Log the error with full context
  requestLogger[severity]('request_error', {
    event: 'api_error',
    error: {
      message: err.message,
      code: classification.code,
      category: classification.category,
      retryable: classification.retryable,
      stack: err.stack,
      name: err.name
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.method !== 'GET' ? req.body : undefined,
      query: req.query,
      params: req.params
    },
    response: {
      statusCode,
      processingTime: req.uploadStartTime ? Date.now() - req.uploadStartTime : undefined
    },
    file: req.file ? {
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype
    } : undefined
  });

  // Check if response was already sent (Context7 pattern)
  if (res.headersSent) {
    requestLogger.warn('response_already_sent', {
      event: 'error_after_response',
      message: 'Error occurred after response headers were sent',
      error: err.message
    });

    // Cannot send another response, delegate to Express default error handler
    return next(err);
  }

  // Prepare error response following Context7 API patterns
  const errorResponse = {
    success: false,
    error: {
      code: classification.code,
      message: err.message || 'An error occurred while processing your request',
      retryable: classification.retryable,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    }
  };

  // Add error details in development environment
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = {
      stack: err.stack,
      category: classification.category,
      statusCode: statusCode
    };
  }

  // Add field information for validation errors
  if (err.field) {
    errorResponse.error.field = err.field;
  }

  // Set appropriate headers
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Request-ID': req.requestId
  });

  // Add retry-after header for rate limiting
  if (statusCode === 429) {
    res.set('Retry-After', '60'); // 60 seconds
  }

  // Add CORS headers if needed (for preflight handling)
  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
  }

  // Send error response
  res.status(statusCode).json(errorResponse);

  // Performance monitoring
  requestLogger.info('error_response_sent', {
    event: 'error_response',
    statusCode,
    retryable: classification.retryable,
    category: classification.category,
    responseTime: req.uploadStartTime ? Date.now() - req.uploadStartTime : undefined
  });
};

/**
 * Async error wrapper for route handlers
 * Following Context7 async/await error handling patterns
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    // Ensure we handle both sync and async errors
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * Following Context7 Express patterns for route not found
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.method} ${req.originalUrl} not found`);
  error.status = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

/**
 * Request ID middleware for error correlation
 * Following Context7 patterns for request tracking
 */
const addRequestId = (req, res, next) => {
  const crypto = require('crypto');
  req.requestId = req.get('X-Request-ID') || crypto.randomBytes(8).toString('hex');
  res.set('X-Request-ID', req.requestId);
  next();
};

/**
 * Uncaught exception handler following Context7 Node.js patterns
 */
const setupUncaughtExceptionHandlers = () => {
  // Handle uncaught exceptions (last resort)
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', {
      event: 'process_uncaught_exception',
      error: err.message,
      stack: err.stack,
      pid: process.pid
    });

    // Graceful shutdown
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('unhandled_rejection', {
      event: 'process_unhandled_rejection',
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
      pid: process.pid
    });

    // Don't exit immediately for unhandled rejections in this context
    // Let the application handle it gracefully
  });
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  addRequestId,
  classifyError,
  getErrorStatusCode,
  setupUncaughtExceptionHandlers
};
