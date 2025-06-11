# File Uploader API

Node.js/Express backend API with S3-compatible storage integration for file uploads with queue management.

## 🚀 Features

- **Streaming file uploads** with real-time progress tracking
- **Queue management** - limits concurrent uploads to 2-3 max
- **S3 integration** using AWS SDK v3 with connection pooling
- **Retry-friendly error handling**
- **File validation** with security measures
- **CORS configuration** for cross-origin requests

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Storage**: AWS S3 (or compatible: DO Spaces, Backblaze)
- **AWS SDK**: @aws-sdk/client-s3, @aws-sdk/lib-storage
- **File Handling**: Multer middleware

## 🔧 Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=development

# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# CORS
FRONTEND_URL=https://your-frontend-url.vercel.app
CORS_ORIGINS=http://localhost:5173,https://your-frontend-url.vercel.app

# Performance
MAX_FILE_SIZE=10485760
S3_MAX_SOCKETS=50
```

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your values

# Start development server
npm run dev

# Start production server
npm start
```

## 📡 API Endpoints

### Upload File

```http
POST /api/upload
Content-Type: multipart/form-data

Form Data:
- file: File (required, max 10MB)
- metadata: JSON string (optional)

Response Success (200):
{
  "success": true,
  "data": {
    "fileId": "uuid-v4",
    "fileName": "example.jpg",
    "fileUrl": "https://file-uploader-bucket-roderick.s3.eu-central-1.amazonaws.com/uploads/uuid-timestamp.jpg",
    "fileSize": 1024000,
    "uploadedAt": "2024-01-01T00:00:00.000Z",
    "s3Key": "uploads/uuid-timestamp.jpg"
  }
}

Response Error (400/500):
{
  "success": false,
  "error": {
    "code": "UPLOAD_FAILED",
    "message": "File upload failed",
    "retryable": true
  }
}
```

### Delete File

```http
DELETE /api/upload/delete/{s3Key}

Response Success (200):
{
  "success": true,
  "message": "File deleted successfully"
}
```

### Health Check

```http
GET /api/health

Response (200):
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "s3": "connected",
    "server": "running"
  }
}
```

## 🌐 Live Demo

- **API URL**: https://file-uploader-api-7547.onrender.com
- **Frontend**: https://file-uploader-challenge-kefnkl8x2-roderick-moises-projects.vercel.app
- **Health Check**: https://file-uploader-api-7547.onrender.com/api/health

## 📊 Performance

- Supports 10+ concurrent uploads efficiently
- Handles files up to 10MB
- Memory-efficient streaming (no full buffering)
- Connection pooling for optimal S3 performance

## 🔒 Security

- File type and content validation
- Input sanitization
- S3 bucket security with least privilege
- CORS configuration

## 🚀 Deployment Instructions

### Render FREE Deployment

1. Fork this repository
2. Connect to Render.com
3. Set environment variables in dashboard:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_S3_BUCKET`
   - `AWS_REGION`
4. Deploy automatically from GitHub

### CORS Configuration

- Supports Vercel preview deployments via regex pattern
- Configurable origins via `CORS_ORIGINS` environment variable
- Preflight request handling included

## 📝 Challenge Notes

**Time Investment**: ~2.5 hours
**Trade-offs Made**:

- Used Render free tier (30s cold start acceptable for demo)
- Focused on core functionality over advanced monitoring
- Structured for easy scaling and production enhancement

**Production Features**:

- ✅ S3 streaming uploads with connection pooling
- ✅ Queue management with 2 concurrent upload limit
- ✅ Retry logic with error classification
- ✅ Real-time progress tracking
- ✅ File validation and security measures
- ✅ Production-ready CORS configuration

