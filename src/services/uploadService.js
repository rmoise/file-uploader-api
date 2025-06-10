/**
 * Upload Business Logic Service
 * Following Context7 Node.js best practices for async error handling and service patterns
 */

const { uploadFileToS3, uploadStreamToS3, deleteFileFromS3, checkFileExists } = require('./s3Service');
const { validateFile, validateFileContent, validateFileExtension } = require('../utils/fileValidator');
const { createLogger } = require('../utils/logger');
const crypto = require('crypto');

// Logger for this service
const logger = createLogger();

/**
 * Process and upload a single file with comprehensive validation and error handling
 * Following Context7 async/await error handling patterns
 */
const processFileUpload = async (file, requestId = null, onProgress = null) => {
  const requestLogger = createLogger(requestId);
  const startTime = Date.now();

  try {
    // Input validation - early return pattern (Context7)
    if (!file || !file.buffer || !file.originalname) {
      return {
        success: false,
        error: {
          code: 'INVALID_FILE_INPUT',
          message: 'File object missing required properties (buffer, originalname)',
          retryable: false
        }
      };
    }

    const fileBuffer = file.buffer;
    const originalFilename = file.originalname;
    const contentType = file.mimetype;

    requestLogger.fileProcessingStart(originalFilename, fileBuffer.length, {
      contentType,
      uploadType: 'buffer'
    });

    // Step 1: Basic file validation (Context7 try/catch pattern)
    const basicValidation = validateFile(originalFilename, fileBuffer.length, contentType);
    if (!basicValidation.isValid) {
      requestLogger.validationError(originalFilename, 'basic', basicValidation.error);
      return {
        success: false,
        error: {
          code: 'FILE_VALIDATION_FAILED',
          message: basicValidation.error,
          retryable: false,
          validationType: 'basic'
        }
      };
    }

    // Step 2: File extension validation
    const extensionValidation = validateFileExtension(originalFilename);
    if (!extensionValidation.isValid) {
      requestLogger.validationError(originalFilename, 'extension', extensionValidation.error);
      return {
        success: false,
        error: {
          code: 'INVALID_FILE_EXTENSION',
          message: extensionValidation.error,
          retryable: false,
          validationType: 'extension'
        }
      };
    }

    // Step 3: Content validation (magic numbers) - Context7 Buffer handling
    const contentValidation = await validateFileContent(fileBuffer, contentType);
    if (!contentValidation.isValid) {
      requestLogger.validationError(originalFilename, 'content', contentValidation.error);
      return {
        success: false,
        error: {
          code: 'INVALID_FILE_CONTENT',
          message: contentValidation.error,
          retryable: false,
          validationType: 'content'
        }
      };
    }

    requestLogger.validationComplete(originalFilename, 'all_passed');

    // Step 4: Generate file metadata
    const metadata = generateFileMetadata(originalFilename, fileBuffer, contentType, requestId);

    // Step 5: Upload to S3 with progress tracking
    const uploadResult = await uploadFileToS3(
      fileBuffer,
      originalFilename,
      {
        contentType,
        ...metadata
      },
      onProgress
    );

    const duration = Date.now() - startTime;

    // Handle upload result (Context7 error classification pattern)
    if (!uploadResult.success) {
      requestLogger.fileProcessingError(originalFilename, uploadResult.error, { duration });

      // Return with retry information for frontend
      return {
        success: false,
        error: {
          ...uploadResult.error,
          stage: 'upload',
          filename: originalFilename
        }
      };
    }

    // Success case
    requestLogger.fileProcessingComplete(originalFilename, uploadResult.data.fileUrl, duration, {
      fileId: uploadResult.data.fileId,
      s3Key: uploadResult.data.s3Key,
      fileSize: uploadResult.data.fileSize
    });

    return {
      success: true,
      data: {
        ...uploadResult.data,
        processingTime: duration,
        validations: {
          basic: true,
          extension: true,
          content: true
        },
        metadata
      }
    };

  } catch (error) {
    // Context7 error handling pattern - catch all unexpected errors
    const duration = Date.now() - startTime;

    requestLogger.fileProcessingError(file?.originalname || 'unknown', error, {
      duration,
      stage: 'processing',
      unexpected: true
    });

    return {
      success: false,
      error: {
        code: error.name || 'FILE_PROCESSING_FAILED',
        message: error.message || 'Unexpected error during file processing',
        retryable: true, // Unexpected errors are usually retryable
        stage: 'processing',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
};

/**
 * Process stream upload for large files
 * Following Context7 stream handling patterns
 */
const processStreamUpload = async (stream, filename, fileSize, contentType, requestId = null, onProgress = null) => {
  const requestLogger = createLogger(requestId);
  const startTime = Date.now();

  try {
    // Early validation - Context7 early return pattern
    if (!stream || !filename || !fileSize) {
      return {
        success: false,
        error: {
          code: 'INVALID_STREAM_INPUT',
          message: 'Stream, filename, and fileSize are required',
          retryable: false
        }
      };
    }

    requestLogger.fileProcessingStart(filename, fileSize, {
      contentType,
      uploadType: 'stream'
    });

    // Basic validation for stream uploads
    const basicValidation = validateFile(filename, fileSize, contentType);
    if (!basicValidation.isValid) {
      requestLogger.validationError(filename, 'basic', basicValidation.error);

      // Clean up stream (Context7 resource cleanup pattern)
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }

      return {
        success: false,
        error: {
          code: 'STREAM_VALIDATION_FAILED',
          message: basicValidation.error,
          retryable: false,
          validationType: 'basic'
        }
      };
    }

    // Generate metadata
    const metadata = generateFileMetadata(filename, null, contentType, requestId, fileSize);

    // Stream upload to S3
    const uploadResult = await uploadStreamToS3(
      stream,
      filename,
      fileSize,
      {
        contentType,
        ...metadata
      },
      onProgress
    );

    const duration = Date.now() - startTime;

    if (!uploadResult.success) {
      requestLogger.fileProcessingError(filename, uploadResult.error, {
        duration,
        uploadType: 'stream'
      });

      return {
        success: false,
        error: {
          ...uploadResult.error,
          stage: 'stream_upload',
          filename
        }
      };
    }

    requestLogger.fileProcessingComplete(filename, uploadResult.data.fileUrl, duration, {
      fileId: uploadResult.data.fileId,
      s3Key: uploadResult.data.s3Key,
      uploadType: 'stream'
    });

    return {
      success: true,
      data: {
        ...uploadResult.data,
        processingTime: duration,
        uploadType: 'stream',
        metadata
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    // Context7 stream cleanup on error
    if (stream && typeof stream.destroy === 'function') {
      try {
        stream.destroy();
      } catch (cleanupError) {
        requestLogger.error('Stream cleanup failed', {
          originalError: error.message,
          cleanupError: cleanupError.message
        });
      }
    }

    requestLogger.fileProcessingError(filename, error, {
      duration,
      stage: 'stream_processing',
      unexpected: true
    });

    return {
      success: false,
      error: {
        code: error.name || 'STREAM_PROCESSING_FAILED',
        message: error.message || 'Unexpected error during stream processing',
        retryable: true,
        stage: 'stream_processing',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
};

/**
 * Retry logic with exponential backoff for failed uploads
 * Following Context7 async patterns and error classification
 */
const retryUpload = async (uploadFunction, maxRetries = 3, baseDelay = 1000) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await uploadFunction();

      // Success case
      if (result.success) {
        if (attempt > 1) {
          logger.info('Upload succeeded after retry', {
            attempt,
            totalAttempts: maxRetries
          });
        }
        return result;
      }

      // Failed but not retryable
      if (!result.error?.retryable) {
        logger.warn('Upload failed with non-retryable error', {
          attempt,
          error: result.error
        });
        return result;
      }

      lastError = result.error;

      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;

        logger.warn('Upload attempt failed, retrying', {
          attempt,
          nextRetryIn: `${Math.round(delay)}ms`,
          error: result.error.message
        });

        // Context7 async delay pattern
        await new Promise(resolve => setTimeout(resolve, delay));
      }

    } catch (error) {
      // Unexpected error during retry
      lastError = {
        code: error.name || 'RETRY_FAILED',
        message: error.message,
        retryable: false
      };

      logger.error('Unexpected error during retry attempt', {
        attempt,
        error: error.message
      });

      break; // Don't retry unexpected errors
    }
  }

  // All retries failed
  logger.error('Upload failed after all retry attempts', {
    maxRetries,
    finalError: lastError
  });

  return {
    success: false,
    error: {
      ...lastError,
      retriedAttempts: maxRetries,
      finalAttempt: true
    }
  };
};

/**
 * Delete uploaded file (cleanup function)
 * Following Context7 async error handling
 */
const deleteUploadedFile = async (s3Key, requestId = null) => {
  const requestLogger = createLogger(requestId);

  try {
    // Check if file exists first
    const existsCheck = await checkFileExists(s3Key);
    if (!existsCheck.exists) {
      requestLogger.warn('Attempted to delete non-existent file', { s3Key });
      return {
        success: true,
        message: 'File does not exist (already deleted or never existed)',
        s3Key
      };
    }

    // Delete the file
    const deleteResult = await deleteFileFromS3(s3Key);

    if (deleteResult.success) {
      requestLogger.info('File deleted successfully', { s3Key });
    } else {
      requestLogger.error('File deletion failed', {
        s3Key,
        error: deleteResult.error
      });
    }

    return deleteResult;

  } catch (error) {
    requestLogger.error('Unexpected error during file deletion', {
      s3Key,
      error: error.message
    });

    return {
      success: false,
      error: {
        code: error.name || 'DELETE_FAILED',
        message: error.message,
        s3Key
      }
    };
  }
};

/**
 * Generate comprehensive file metadata
 * Following Context7 object creation patterns
 */
const generateFileMetadata = (filename, buffer = null, contentType = null, requestId = null, fileSize = null) => {
  const metadata = {
    uploadRequestId: requestId || crypto.randomUUID(),
    originalFilename: filename,
    contentType: contentType || 'application/octet-stream',
    fileSize: fileSize || (buffer ? buffer.length : 0),
    uploadedAt: new Date().toISOString(),
    processingVersion: '1.0',
    environment: process.env.NODE_ENV || 'development'
  };

  // Add file hash if buffer is available
  if (buffer) {
    metadata.fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    metadata.fileMd5 = crypto.createHash('md5').update(buffer).digest('hex');
  }

  return metadata;
};

/**
 * Validate upload queue limits (frontend integration)
 */
const validateUploadQueue = (currentUploads, maxConcurrent = 3) => {
  if (currentUploads >= maxConcurrent) {
    return {
      allowed: false,
      error: {
        code: 'UPLOAD_QUEUE_FULL',
        message: `Maximum ${maxConcurrent} concurrent uploads allowed`,
        retryable: true,
        retryAfter: 2000 // Suggest retry after 2 seconds
      }
    };
  }

  return { allowed: true };
};

/**
 * Get upload statistics and health info
 */
const getUploadStats = () => {
  return {
    service: 'upload',
    healthy: true,
    features: {
      fileValidation: true,
      contentValidation: true,
      streamUploads: true,
      retryLogic: true,
      progressTracking: true
    },
    limits: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
      maxConcurrentUploads: 3,
      supportedFormats: ['image/*', 'application/pdf', 'text/*', 'video/mp4', 'audio/mpeg']
    },
    environment: process.env.NODE_ENV || 'development'
  };
};

module.exports = {
  processFileUpload,
  processStreamUpload,
  retryUpload,
  deleteUploadedFile,
  generateFileMetadata,
  validateUploadQueue,
  getUploadStats
};
