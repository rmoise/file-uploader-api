const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Generate presigned URL for direct upload
app.post('/api/upload/presigned-url', async (req, res) => {
  try {
    const { filename, contentType, fileSize } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Filename and content type are required' 
      });
    }

    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ 
        success: false, 
        error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` 
      });
    }

    // Generate unique S3 key
    const fileId = crypto.randomUUID();
    const timestamp = Date.now();
    const extension = filename.split('.').pop();
    const s3Key = `uploads/${timestamp}-${fileId}.${extension}`;

    // Create presigned URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: contentType,
      ContentLength: fileSize,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600 // URL expires in 1 hour
    });

    const fileUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    res.json({
      success: true,
      data: {
        presignedUrl,
        fileUrl,
        s3Key,
        fileId,
        expiresIn: 3600
      }
    });
  } catch (error) {
    console.error('Presigned URL generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate upload URL' 
    });
  }
});

// Confirm upload completion (optional - for tracking)
app.post('/api/upload/confirm', async (req, res) => {
  const { s3Key, fileId, fileName, fileSize } = req.body;

  // Here you could save metadata to a database if needed
  // For now, just acknowledge the upload
  res.json({
    success: true,
    data: {
      fileId,
      fileName,
      fileUrl: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
      fileSize,
      uploadedAt: new Date().toISOString()
    }
  });
});

// Delete file
app.delete('/api/upload/:s3Key(*)', async (req, res) => {
  try {
    const s3Key = req.params.s3Key;
    
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: s3Key
    }));

    res.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });
  } catch (error) {
    console.error('Delete failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete file' 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    bucket: BUCKET,
    region: process.env.AWS_REGION
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'File Uploader API',
    version: '2.0.0',
    endpoints: {
      presignedUrl: 'POST /api/upload/presigned-url',
      confirm: 'POST /api/upload/confirm',
      delete: 'DELETE /api/upload/:s3Key',
      health: 'GET /api/health'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || 'Internal server error' 
  });
});

module.exports = app;