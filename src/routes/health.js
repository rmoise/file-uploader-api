/**
 * Health Check Routes for File Upload API
 * Following Context7 Node.js process diagnostics and Express best practices
 */

const express = require('express');
const { s3Client } = require('../config/s3Config');
const { HeadBucketCommand } = require('@aws-sdk/client-s3');
const { createLogger } = require('../utils/logger');

// Create router instance - Context7 pattern
const router = express.Router();

// Logger for health checks
const logger = createLogger();

/**
 * Basic Health Check Endpoint
 * GET /api/health
 * Following Context7 Node.js process monitoring patterns
 */
router.get('/', async (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const childLogger = logger.child({ route: 'health' });

  try {
    childLogger.info('health_check_started');

    // Context7 Node.js process diagnostics patterns
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const resourceUsage = process.resourceUsage();

    // System information following Context7 patterns
    const systemInfo = {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      pid: process.pid,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        // Context7 pattern for memory formatting
        rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        // Context7 pattern for CPU time formatting
        user_ms: Math.round(cpuUsage.user / 1000),
        system_ms: Math.round(cpuUsage.system / 1000)
      },
      resources: {
        maxRSS: resourceUsage.maxRSS,
        sharedMemorySize: resourceUsage.sharedMemorySize,
        minorPageFault: resourceUsage.minorPageFault,
        majorPageFault: resourceUsage.majorPageFault,
        voluntaryContextSwitches: resourceUsage.voluntaryContextSwitches,
        involuntaryContextSwitches: resourceUsage.involuntaryContextSwitches
      }
    };

    // Test S3 connectivity (Context7 error handling pattern)
    let s3Status = 'unknown';
    let s3Error = null;
    try {
      const bucketCheck = new HeadBucketCommand({
        Bucket: process.env.AWS_S3_BUCKET
      });
      await s3Client.send(bucketCheck);
      s3Status = 'connected';
      childLogger.info('s3_health_check_success');
    } catch (error) {
      s3Status = 'error';
      s3Error = error.message;
      childLogger.warn('s3_health_check_failed', { error: error.message });
    }

    // Performance metrics (Context7 hrtime pattern)
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1e6; // Convert to milliseconds

    // Health status determination (Context7 pattern)
    const isHealthy = s3Status === 'connected';
    const status = isHealthy ? 'healthy' : 'degraded';

    const healthData = {
      status,
      timestamp: new Date().toISOString(),
      services: {
        server: 'running',
        s3: s3Status,
        memory: memoryUsage.heapUsed / memoryUsage.heapTotal < 0.9 ? 'ok' : 'high',
        uptime: 'ok'
      },
      system: systemInfo,
      performance: {
        response_time_ms: Math.round(responseTime * 100) / 100,
        memory_usage_percent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        uptime_seconds: Math.round(process.uptime()),
        uptime_human: formatUptime(process.uptime())
      },
      environment: {
        node_env: process.env.NODE_ENV,
        max_file_size: process.env.MAX_FILE_SIZE || '10MB',
        s3_max_sockets: process.env.S3_MAX_SOCKETS || '50',
        cors_origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').length : 0
      }
    };

    // Add S3 error details if present (Context7 error context pattern)
    if (s3Error) {
      healthData.errors = {
        s3: s3Error
      };
    }

    childLogger.info('health_check_completed', {
      status,
      response_time_ms: responseTime,
      s3_status: s3Status
    });

    // Context7 response pattern with appropriate status code
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: healthData,
      meta: {
        timestamp: new Date().toISOString(),
        response_time_ms: Math.round(responseTime * 100) / 100
      }
    });

  } catch (error) {
    // Context7 error handling pattern
    error.route = 'health';
    childLogger.error('health_check_error', {
      error: error.message,
      stack: error.stack
    });

    next(error);
  }
});

/**
 * Detailed System Diagnostics Endpoint
 * GET /api/health/diagnostics
 * Following Context7 Node.js diagnostic report patterns
 */
router.get('/diagnostics', async (req, res, next) => {
  const childLogger = logger.child({ route: 'health/diagnostics' });

  try {
    childLogger.info('diagnostics_check_started');

    // Context7 Node.js diagnostic report pattern
    const diagnosticData = {
      process: {
        pid: process.pid,
        ppid: process.ppid,
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        v8_version: process.versions.v8,
        uv_version: process.versions.uv,
        argv: process.argv,
        exec_path: process.execPath,
        cwd: process.cwd()
      },
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      resources: process.resourceUsage(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        // Safely expose non-sensitive env vars
        timezone: process.env.TZ || 'UTC',
        lang: process.env.LANG || 'en_US.UTF-8'
      },
      features: {
        report_on_fatal_error: process.report?.reportOnFatalError || false,
        report_on_signal: process.report?.reportOnSignal || false,
        report_on_uncaught_exception: process.report?.reportOnUncaughtException || false
      }
    };

    childLogger.info('diagnostics_check_completed');

    res.status(200).json({
      success: true,
      data: diagnosticData,
      meta: {
        timestamp: new Date().toISOString(),
        generated_at: 'runtime'
      }
    });

  } catch (error) {
    error.route = 'health/diagnostics';
    childLogger.error('diagnostics_check_error', { error: error.message });
    next(error);
  }
});

/**
 * S3 Service Health Check Endpoint
 * GET /api/health/s3
 * Following Context7 AWS SDK error handling patterns
 */
router.get('/s3', async (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const childLogger = logger.child({ route: 'health/s3' });

  try {
    childLogger.info('s3_health_check_started');

    // Test S3 connectivity with detailed error context
    const bucketCheck = new HeadBucketCommand({
      Bucket: process.env.AWS_S3_BUCKET
    });

    const result = await s3Client.send(bucketCheck);
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1e6;

    childLogger.info('s3_health_check_success', {
      bucket: process.env.AWS_S3_BUCKET,
      response_time_ms: responseTime
    });

    res.status(200).json({
      success: true,
      data: {
        status: 'connected',
        bucket: process.env.AWS_S3_BUCKET,
        region: process.env.AWS_REGION,
        response_time_ms: Math.round(responseTime * 100) / 100,
        connection_config: {
          max_sockets: process.env.S3_MAX_SOCKETS || '50',
          request_timeout: process.env.S3_REQUEST_TIMEOUT || '30000',
          connection_timeout: process.env.S3_CONNECTION_TIMEOUT || '6000'
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        test_type: 'head_bucket'
      }
    });

  } catch (error) {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1e6;

    childLogger.error('s3_health_check_failed', {
      error: error.message,
      code: error.name,
      response_time_ms: responseTime
    });

    res.status(503).json({
      success: false,
      error: {
        code: 'S3_CONNECTION_FAILED',
        message: error.message,
        details: {
          bucket: process.env.AWS_S3_BUCKET,
          region: process.env.AWS_REGION,
          error_code: error.name,
          response_time_ms: Math.round(responseTime * 100) / 100
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        test_type: 'head_bucket'
      }
    });
  }
});

/**
 * Utility function to format uptime in human-readable format
 * Following Context7 utility function patterns
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

// Export router following Context7 module patterns
module.exports = router;
