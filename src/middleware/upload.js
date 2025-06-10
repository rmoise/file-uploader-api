/**
 * Enhanced Upload Middleware for File Upload API
 * Following Context7 Express best practices for middleware and error handling
 */

const multer = require('multer');
const { validateUploadedFile, validateFileMetadata } = require('../utils/fileValidator');
const { createLogger } = require('../utils/logger');

// Logger for this middleware
const logger = createLogger();

// Configuration constants
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
const MAX_FILES = parseInt(process.env.MAX_FILES) || 1; // Single file upload
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES ||
  'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,video/mp4,audio/mpeg')
  .split(',')
  .map(type => type.trim());

/**
 * Memory storage configuration for streaming to S3
 * Following Context7 Express patterns for middleware configuration
 */
const storage = multer.memoryStorage();

/**
 * File filter function with comprehensive validation
 * Following Context7 security patterns
 */
const fileFilter = (req, file, cb) => {
  const requestLogger = createLogger();

  requestLogger.info('file_filter_start', `Starting file filter for: ${file.originalname}`, {
    originalName: file.originalname,
    mimeType: file.mimetype,
    encoding: file.encoding
  });

  try {
    // Basic file validation using our utility
    const validation = validateFileMetadata(file);

    if (!validation.isValid) {
      const errorMessage = validation.errors.join(', ');
      requestLogger.warn('file_filter_failed', `File validation failed: ${errorMessage}`, {
        errors: validation.errors,
        fileName: file.originalname
      });

      // Context7 pattern: Create descriptive error for multer
      const error = new Error(errorMessage);
      error.code = 'INVALID_FILE';
      error.field = file.fieldname;
      return cb(error, false);
    }

    // MIME type validation
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      requestLogger.warn('file_filter_mime_rejected', `MIME type rejected: ${file.mimetype}`, {
        mimeType: file.mimetype,
        allowedTypes: ALLOWED_MIME_TYPES,
        fileName: file.originalname
      });

      const error = new Error(`File type '${file.mimetype}' not allowed`);
      error.code = 'INVALID_FILE_TYPE';
      error.field = file.fieldname;
      return cb(error, false);
    }

    // Extension validation is handled in validateFileMetadata above

    requestLogger.info('file_filter_accepted', `File accepted: ${file.originalname}`, {
      fileName: file.originalname,
      mimeType: file.mimetype
    });

    // File accepted
    cb(null, true);

  } catch (error) {
    requestLogger.error('file_filter_error', `File filter error: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      fileName: file.originalname
    });

    error.code = 'FILTER_ERROR';
    cb(error, false);
  }
};

/**
 * Multer configuration following Context7 Express patterns
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fields: 10, // Allow some metadata fields
    fieldNameSize: 100, // Limit field name length
    fieldSize: 1024 * 100, // 100KB for text fields
    headerPairs: 2000 // Reasonable limit for headers
  }
});

/**
 * Enhanced error handler for Multer errors
 * Following Context7 error handling patterns with proper error classification
 */
const handleMulterError = (error, req, res, next) => {
  const requestLogger = createLogger();

  // Multer-specific error handling
  if (error instanceof multer.MulterError) {
    let statusCode = 400;
    let errorCode = 'UPLOAD_ERROR';
    let retryable = false;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        errorCode = 'FILE_TOO_LARGE';
        error.message = `File size exceeds limit of ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`;
        break;

      case 'LIMIT_FILE_COUNT':
        errorCode = 'TOO_MANY_FILES';
        error.message = `Maximum ${MAX_FILES} file(s) allowed`;
        break;

      case 'LIMIT_FIELD_COUNT':
        errorCode = 'TOO_MANY_FIELDS';
        error.message = 'Too many form fields';
        break;

      case 'LIMIT_UNEXPECTED_FILE':
        errorCode = 'UNEXPECTED_FIELD';
        error.message = `Unexpected file field: ${error.field}`;
        break;

      case 'LIMIT_PART_COUNT':
        errorCode = 'TOO_MANY_PARTS';
        error.message = 'Too many multipart sections';
        break;

      case 'LIMIT_FIELD_KEY':
        errorCode = 'FIELD_NAME_TOO_LONG';
        error.message = 'Field name too long';
        break;

      case 'LIMIT_FIELD_VALUE':
        errorCode = 'FIELD_VALUE_TOO_LONG';
        error.message = 'Field value too long';
        break;

      default:
        retryable = true; // Unknown multer errors might be retryable
        break;
    }

    requestLogger.warn('multer_error', `Multer error: ${error.message}`, {
      multerCode: error.code,
      errorCode,
      field: error.field,
      retryable
    });

    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message: error.message,
        retryable,
        field: error.field
      }
    });
  }

  // Custom file validation errors
  if (error.code && ['INVALID_FILE', 'INVALID_FILE_TYPE', 'INVALID_FILE_EXTENSION'].includes(error.code)) {
    requestLogger.warn('file_validation_error', `File validation error: ${error.message}`, {
      errorCode: error.code,
      field: error.field
    });

    return res.status(400).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: false,
        field: error.field
      }
    });
  }

  // Other errors - pass to general error handler
  requestLogger.error('upload_middleware_error', `Unexpected upload error: ${error.message}`, {
    error: error.message,
    stack: error.stack,
    code: error.code
  });

  next(error);
};

/**
 * Create upload middleware with error handling
 * Following Context7 Express middleware patterns
 */
const createUploadMiddleware = (fieldName = 'file') => {
  return [
    // Add request timing for performance monitoring
    (req, res, next) => {
      req.uploadStartTime = Date.now();
      next();
    },

    // Multer upload middleware
    upload.single(fieldName),

    // Multer error handler
    handleMulterError,

    // Success handler - add file info to request
    (req, res, next) => {
      const requestLogger = createLogger();

      if (!req.file) {
        requestLogger.warn('no_file_uploaded', `No file provided in field '${fieldName}'`, {
          fieldName
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE',
            message: `No file provided in field '${fieldName}'`,
            retryable: false
          }
        });
      }

      // Add upload timing information
      req.uploadProcessTime = Date.now() - req.uploadStartTime;

      requestLogger.info('file_uploaded_to_memory', `File uploaded to memory: ${req.file.originalname}`, {
        fileName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        processTime: req.uploadProcessTime
      });

      next();
    }
  ];
};

module.exports = {
  createUploadMiddleware,
  handleMulterError,
  upload,
  MAX_FILE_SIZE,
  MAX_FILES,
  ALLOWED_MIME_TYPES
};