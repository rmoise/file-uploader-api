/**
 * Upload Routes for File Upload API
 * Following Context7 Express routing best practices with async/await patterns
 */

const express = require('express');
const { uploadMiddleware } = require('../middleware/upload');
const { processFileUpload, processMultipleFileUploads } = require('../services/uploadService');
const { createLogger } = require('../utils/logger');

// Create router instance - Context7 pattern
const router = express.Router();

// Logger for routes
const logger = createLogger();

/**
 * Single File Upload Endpoint
 * POST /api/upload
 * Following Context7 Express async route handler patterns
 */
router.post('/', uploadMiddleware, async (req, res, next) => {
  // Generate request ID for tracking (Context7 pattern)
  const requestId = req.requestId || 'upload-' + Date.now();
  const childLogger = logger.child({ requestId, route: 'upload' });

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
router.post('/multiple', uploadMiddleware, async (req, res, next) => {
  const requestId = req.requestId || 'multi-upload-' + Date.now();
  const childLogger = logger.child({ requestId, route: 'upload/multiple' });

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
  const childLogger = logger.child({ uploadId, route: 'upload/progress' });

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
 * Cancel Upload Endpoint
 * DELETE /api/upload/:uploadId
 * Following Context7 Express DELETE patterns
 */
router.delete('/:uploadId', async (req, res, next) => {
  const { uploadId } = req.params;
  const childLogger = logger.child({ uploadId, route: 'upload/cancel' });

  try {
    childLogger.info('upload_cancellation_requested', { uploadId });

    // In production, this would cancel ongoing upload and cleanup
    res.status(200).json({
      success: true,
      data: {
        uploadId,
        status: 'cancelled',
        message: 'Upload cancelled successfully'
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    error.uploadId = uploadId;
    error.route = 'upload/cancel';
    next(error);
  }
});

// Export router following Context7 module patterns
module.exports = router;
