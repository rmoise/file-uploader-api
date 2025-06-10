/**
 * S3 Service with Streaming Uploads and Progress Tracking
 * Following Context7 AWS SDK v3 best practices for production
 */

const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { s3Client, S3_CONFIG } = require('../config/s3Config');
const { createLogger } = require('../utils/logger');
const crypto = require('crypto');
const path = require('path');

// Logger for this service
const logger = createLogger();

/**
 * Generate unique S3 key for uploaded file
 */
const generateS3Key = (originalFilename, prefix = 'uploads') => {
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(8).toString('hex');
  const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = path.extname(sanitizedFilename);
  const nameWithoutExt = path.basename(sanitizedFilename, extension);

  return `${prefix}/${timestamp}-${randomId}-${nameWithoutExt}${extension}`;
};

/**
 * Upload file to S3 using streaming with progress tracking
 * Following Context7 @aws-sdk/lib-storage best practices
 */
const uploadFileToS3 = async (fileBuffer, originalFilename, metadata = {}, onProgress = null) => {
  const requestLogger = createLogger();
  const startTime = Date.now();

  try {
    // Generate unique S3 key
    const s3Key = generateS3Key(originalFilename);

    requestLogger.uploadStart(originalFilename, fileBuffer.length, {
      s3Key,
      bucket: S3_CONFIG.bucket,
      ...metadata
    });

    // Create Upload instance with Context7 optimized settings
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: metadata.contentType || 'application/octet-stream',
        Metadata: {
          originalName: originalFilename,
          uploadTime: new Date().toISOString(),
          fileSize: fileBuffer.length.toString(),
          ...metadata
        }
      },

      // Context7 optimized settings for performance
      queueSize: 4, // Concurrent part uploads
      partSize: 1024 * 1024 * 5, // 5MB parts (minimum for multipart)
      leavePartsOnError: false // Auto-cleanup on failure
    });

    // Track upload progress (Context7 pattern)
    if (onProgress) {
      upload.on('httpUploadProgress', (progress) => {
        const percentage = Math.round((progress.loaded / progress.total) * 100);

        requestLogger.uploadProgress(originalFilename, progress.loaded, progress.total, {
          s3Key,
          percentage
        });

        // Call external progress handler
        onProgress({
          loaded: progress.loaded,
          total: progress.total,
          percentage,
          filename: originalFilename,
          s3Key
        });
      });
    }

    // Execute upload
    const result = await upload.done();
    const duration = Date.now() - startTime;

    // Generate public URL
    const fileUrl = `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${s3Key}`;

    requestLogger.uploadComplete(originalFilename, fileUrl, duration, {
      s3Key,
      etag: result.ETag,
      bucket: S3_CONFIG.bucket
    });

    requestLogger.s3Operation('upload', true, duration, {
      bucket: S3_CONFIG.bucket,
      key: s3Key,
      fileSize: fileBuffer.length
    });

    return {
      success: true,
      data: {
        fileId: crypto.randomUUID(),
        fileName: originalFilename,
        fileUrl,
        s3Key,
        fileSize: fileBuffer.length,
        bucket: S3_CONFIG.bucket,
        etag: result.ETag,
        uploadedAt: new Date().toISOString(),
        contentType: metadata.contentType
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    requestLogger.uploadError(originalFilename, error, {
      duration,
      bucket: S3_CONFIG.bucket
    });

    requestLogger.s3Operation('upload', false, duration, {
      error: error.message,
      errorCode: error.name
    });

    // Classify error for retry logic (Context7 pattern)
    const isRetryable = !['ValidationException', 'AccessDenied', 'InvalidBucketName', 'InvalidArgument'].includes(error.name);

    return {
      success: false,
      error: {
        code: error.name || 'UPLOAD_FAILED',
        message: error.message,
        retryable: isRetryable,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
};

/**
 * Stream upload for large files with memory efficiency
 * Uses Node.js streams for better memory management
 */
const uploadStreamToS3 = async (stream, originalFilename, fileSize, metadata = {}, onProgress = null) => {
  const requestLogger = createLogger();
  const startTime = Date.now();

  try {
    const s3Key = generateS3Key(originalFilename);

    requestLogger.uploadStart(originalFilename, fileSize, {
      s3Key,
      bucket: S3_CONFIG.bucket,
      uploadType: 'stream',
      ...metadata
    });

    // Create Upload with stream (Context7 streaming pattern)
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
        Body: stream,
        ContentType: metadata.contentType || 'application/octet-stream',
        ContentLength: fileSize,
        Metadata: {
          originalName: originalFilename,
          uploadTime: new Date().toISOString(),
          fileSize: fileSize.toString(),
          ...metadata
        }
      },

      // Optimized for streaming
      queueSize: 4,
      partSize: Math.max(1024 * 1024 * 5, Math.ceil(fileSize / 1000)), // Dynamic part size
      leavePartsOnError: false
    });

    // Progress tracking for streams
    if (onProgress) {
      upload.on('httpUploadProgress', (progress) => {
        const percentage = Math.round((progress.loaded / progress.total) * 100);

        requestLogger.uploadProgress(originalFilename, progress.loaded, progress.total, {
          s3Key,
          percentage,
          uploadType: 'stream'
        });

        onProgress({
          loaded: progress.loaded,
          total: progress.total,
          percentage,
          filename: originalFilename,
          s3Key
        });
      });
    }

    const result = await upload.done();
    const duration = Date.now() - startTime;
    const fileUrl = `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${s3Key}`;

    requestLogger.uploadComplete(originalFilename, fileUrl, duration, {
      s3Key,
      etag: result.ETag,
      uploadType: 'stream'
    });

    return {
      success: true,
      data: {
        fileId: crypto.randomUUID(),
        fileName: originalFilename,
        fileUrl,
        s3Key,
        fileSize,
        bucket: S3_CONFIG.bucket,
        etag: result.ETag,
        uploadedAt: new Date().toISOString(),
        contentType: metadata.contentType
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    requestLogger.uploadError(originalFilename, error, {
      duration,
      uploadType: 'stream'
    });

    // Clean up stream on error
    if (stream && typeof stream.destroy === 'function') {
      stream.destroy();
    }

    const isRetryable = !['ValidationException', 'AccessDenied', 'InvalidBucketName'].includes(error.name);

    return {
      success: false,
      error: {
        code: error.name || 'STREAM_UPLOAD_FAILED',
        message: error.message,
        retryable: isRetryable,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
};

/**
 * Check if file exists in S3
 */
const checkFileExists = async (s3Key) => {
  const requestLogger = createLogger();
  const startTime = Date.now();

  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: s3Key
    }));

    const duration = Date.now() - startTime;
    requestLogger.s3Operation('head', true, duration, {
      bucket: S3_CONFIG.bucket,
      key: s3Key
    });

    return { exists: true };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error.name === 'NotFound') {
      requestLogger.s3Operation('head', true, duration, {
        bucket: S3_CONFIG.bucket,
        key: s3Key,
        result: 'not_found'
      });
      return { exists: false };
    }

    requestLogger.s3Operation('head', false, duration, {
      bucket: S3_CONFIG.bucket,
      key: s3Key,
      error: error.message
    });

    throw error;
  }
};

/**
 * Delete file from S3
 */
const deleteFileFromS3 = async (s3Key) => {
  const requestLogger = createLogger();
  const startTime = Date.now();

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: s3Key
    }));

    const duration = Date.now() - startTime;
    requestLogger.s3Operation('delete', true, duration, {
      bucket: S3_CONFIG.bucket,
      key: s3Key
    });

    return { success: true };
  } catch (error) {
    const duration = Date.now() - startTime;
    requestLogger.s3Operation('delete', false, duration, {
      bucket: S3_CONFIG.bucket,
      key: s3Key,
      error: error.message
    });

    return {
      success: false,
      error: {
        code: error.name || 'DELETE_FAILED',
        message: error.message
      }
    };
  }
};

/**
 * Get upload configuration for frontend
 */
const getUploadConfig = () => {
  return {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
    allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/*,application/pdf,text/*').split(','),
    bucket: S3_CONFIG.bucket,
    region: S3_CONFIG.region
  };
};

/**
 * Health check for S3 connectivity
 */
const healthCheck = async () => {
  const requestLogger = createLogger();
  const startTime = Date.now();

  try {
    // Simple HEAD request to bucket to check connectivity
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_CONFIG.bucket,
      Key: 'health-check-dummy-key' // This key doesn't need to exist
    }));

    // If we get here without throwing, S3 is accessible
    // (even if the key doesn't exist, which is expected)

  } catch (error) {
    // NotFound is expected and means S3 is accessible
    if (error.name !== 'NotFound') {
      const duration = Date.now() - startTime;
      requestLogger.s3Operation('health_check', false, duration, {
        error: error.message
      });

      return {
        healthy: false,
        error: error.message,
        service: 's3'
      };
    }
  }

  const duration = Date.now() - startTime;
  requestLogger.s3Operation('health_check', true, duration);

  return {
    healthy: true,
    responseTime: `${duration}ms`,
    service: 's3',
    bucket: S3_CONFIG.bucket,
    region: S3_CONFIG.region
  };
};

module.exports = {
  uploadFileToS3,
  uploadStreamToS3,
  checkFileExists,
  deleteFileFromS3,
  getUploadConfig,
  healthCheck,
  generateS3Key
};
