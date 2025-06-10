/**
 * Upload Routes for File Upload API
 * Following Context7 Express routing best practices with async/await patterns
 */

const express = require('express');
const { createUploadMiddleware } = require('../middleware/upload');
const { processFileUpload, processMultipleFileUploads } = require('../services/uploadService');
const { createLogger } = require('../utils/logger');

// Create router instance - Context7 pattern
const router = express.Router();

// Create upload middleware instance
const uploadMiddleware = createUploadMiddleware('file');

// Logger for routes
const logger = createLogger();

/**
 * Single File Upload Endpoint
 * POST /api/upload
 * Following Context7 Express async route handler patterns
 */
router.post('/', ...uploadMiddleware, async (req, res, next) => {
  // Generate request ID for tracking (Context7 pattern)
  const requestId = req.requestId || 'upload-' + Date.now();
  const childLogger = createLogger();

  try {
    childLogger.info('upload_started', {
      fileCount: req.files ? req.files.length : 0,
      hasFile: !!req.file,
      userId: req.user?.id || 'anonymous'
    });

    // Validate file presence (Context7 validation pattern)
    if (!req.file) {
      const error = new Error('No file provided');
      error.status = 400;
      error.code = 'NO_FILE';
      error.retryable = false;
      return next(error);
    }

    // Extract metadata from request (Context7 pattern)
    const metadata = req.body.metadata ?
      JSON.parse(req.body.metadata) : {};

    // Process upload with comprehensive error handling
    const result = await processFileUpload(req.file, {
      metadata,
      requestId,
      userId: req.user?.id || 'anonymous'
    });

    // Success response following Context7 patterns
    childLogger.info('upload_completed', {
      fileId: result.fileId,
      fileName: result.fileName,
      fileSize: result.fileSize,
      uploadDuration: Date.now() - parseInt(requestId.split('-')[1])
    });

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - parseInt(requestId.split('-')[1])
      }
    });

  } catch (error) {
    // Context7 error handling pattern - pass to error middleware
    error.requestId = requestId;
    error.route = 'upload';

    childLogger.error('upload_failed', {
      error: error.message,
      code: error.code,
      retryable: error.retryable
    });

    next(error);
  }
});

/**
 * Multiple File Upload Endpoint (Future Enhancement)
 * POST /api/upload/multiple
 * Following Context7 Express patterns for array handling
 */
router.post('/multiple', ...uploadMiddleware, async (req, res, next) => {
  const requestId = req.requestId || 'multi-upload-' + Date.now();
  const childLogger = createLogger();

  try {
    childLogger.info('multiple_upload_started', {
      fileCount: req.files ? req.files.length : 0
    });

    // Validate files presence
    if (!req.files || req.files.length === 0) {
      const error = new Error('No files provided');
      error.status = 400;
      error.code = 'NO_FILES';
      error.retryable = false;
      return next(error);
    }

    // Process multiple uploads with queue management
    const results = await processMultipleFileUploads(req.files, {
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
      requestId,
      userId: req.user?.id || 'anonymous'
    });

    childLogger.info('multiple_upload_completed', {
      successCount: results.successful.length,
      failureCount: results.failed.length,
      totalFiles: req.files.length
    });

    res.status(200).json({
      success: true,
      data: {
        successful: results.successful,
        failed: results.failed,
        summary: {
          total: req.files.length,
          successful: results.successful.length,
          failed: results.failed.length
        }
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - parseInt(requestId.split('-')[1])
      }
    });

  } catch (error) {
    error.requestId = requestId;
    error.route = 'upload/multiple';

    childLogger.error('multiple_upload_failed', {
      error: error.message,
      code: error.code
    });

    next(error);
  }
});

/**
 * Upload Progress Endpoint (WebSocket alternative)
 * GET /api/upload/progress/:uploadId
 * Following Context7 Express parameter handling patterns
 */
router.get('/progress/:uploadId', async (req, res, next) => {
  const { uploadId } = req.params;
  const childLogger = createLogger();

  try {
    // In production, this would query a progress tracking system
    // For now, return a mock response following Context7 patterns
    childLogger.info('progress_requested', { uploadId });

    res.status(200).json({
      success: true,
      data: {
        uploadId,
        status: 'uploading', // uploading, completed, failed
        progress: 75, // percentage
        uploaded: 7500000, // bytes
        total: 10000000, // bytes
        speed: 1024000, // bytes per second
        estimatedTime: 2.5 // seconds remaining
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    error.uploadId = uploadId;
    error.route = 'upload/progress';
    next(error);
  }
});

/**
 * Delete File Endpoint
 * DELETE /api/upload/delete/:s3Key
 * Deletes file from S3 bucket and any local metadata
 */
router.delete('/delete/*', async (req, res, next) => {
  const s3Key = req.params[0]; // Get the full path after /delete/
  const childLogger = createLogger();
  const requestId = 'delete-' + Date.now();

  try {
    childLogger.info('file_deletion_requested', { s3Key, requestId });

    // Validate s3Key parameter
    if (!s3Key || s3Key.trim() === '') {
      const error = new Error('S3 key parameter is required');
      error.status = 400;
      error.code = 'MISSING_S3_KEY';
      return next(error);
    }

    // Delete file from S3 using the upload service
    const { deleteUploadedFile } = require('../services/uploadService');
    const deleteResult = await deleteUploadedFile(s3Key, requestId);

    if (deleteResult.success) {
      childLogger.info('file_deletion_completed', {
        s3Key,
        requestId,
        message: deleteResult.message || 'File deleted successfully'
      });

      res.status(200).json({
        success: true,
        data: {
          s3Key,
          status: 'deleted',
          message: deleteResult.message || 'File deleted from S3 successfully'
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      childLogger.error('file_deletion_failed', {
        s3Key,
        requestId,
        error: deleteResult.error
      });

      res.status(400).json({
        success: false,
        error: {
          code: deleteResult.error.code,
          message: deleteResult.error.message,
          s3Key
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    error.s3Key = s3Key;
    error.requestId = requestId;
    error.route = 'upload/delete';

    childLogger.error('file_deletion_error', {
      s3Key,
      requestId,
      error: error.message
    });

    next(error);
  }
});

// Export router following Context7 module patterns
module.exports = router;
