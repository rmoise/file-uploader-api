const { S3 } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const https = require('https');

// S3 Client with optimized configuration following AWS SDK v3 best practices
const createS3Client = () => {
  const config = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // Enhanced performance configuration
    cacheMiddleware: true, // Cache middleware resolution for better performance
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: parseInt(process.env.S3_MAX_SOCKETS) || 50,
      }),
      requestTimeout: parseInt(process.env.S3_REQUEST_TIMEOUT) || 30000,
      connectionTimeout: parseInt(process.env.S3_CONNECTION_TIMEOUT) || 6000,
    }),
  };

  // Alternative configuration for Digital Ocean Spaces (if configured)
  if (process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET) {
    config.credentials = {
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
    };
    config.endpoint = `https://${process.env.DO_SPACES_ENDPOINT}`;
    config.region = process.env.DO_SPACES_REGION || 'nyc3';
  }

  return new S3(config);
};

// Create and export the S3 client instance
const s3Client = createS3Client();

// S3 configuration constants
const S3_CONFIG = {
  BUCKET: process.env.AWS_S3_BUCKET || process.env.DO_SPACES_BUCKET,
  REGION: process.env.AWS_REGION || process.env.DO_SPACES_REGION || 'us-east-1',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  MULTIPART_THRESHOLD: 5 * 1024 * 1024, // 5MB - when to use multipart upload
  PART_SIZE: 5 * 1024 * 1024, // 5MB per part
  QUEUE_SIZE: 4, // Concurrent part uploads
};

// Validate S3 configuration
const validateS3Config = () => {
  const requiredVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET'
  ];

  // Check for DO Spaces alternative
  const hasDoSpaces = process.env.DO_SPACES_KEY &&
                     process.env.DO_SPACES_SECRET &&
                     process.env.DO_SPACES_BUCKET;

  if (!hasDoSpaces) {
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required S3 environment variables: ${missingVars.join(', ')}\n` +
        'Please check your .env file and ensure all AWS S3 credentials are set.'
      );
    }
  }

  if (!S3_CONFIG.BUCKET) {
    throw new Error('S3 bucket name is required. Set AWS_S3_BUCKET or DO_SPACES_BUCKET in your .env file.');
  }

  console.log('✅ S3 configuration validated successfully');
};

// Test S3 connectivity
const testS3Connection = async () => {
  try {
    await s3Client.headBucket({ Bucket: S3_CONFIG.BUCKET });
    console.log(`✅ S3 connection successful - Bucket: ${S3_CONFIG.BUCKET}`);
    return true;
  } catch (error) {
    console.error(`❌ S3 connection failed - Bucket: ${S3_CONFIG.BUCKET}`, error.message);
    return false;
  }
};

module.exports = {
  s3Client,
  S3_CONFIG,
  validateS3Config,
  testS3Connection,
  createS3Client
};
