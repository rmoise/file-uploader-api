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

```
POST /api/upload
Content-Type: multipart/form-data
```

### Health Check

```
GET /api/health
```

## 🌐 Live Demo

- **API URL**: https://file-uploader-api-xxxx.onrender.com
- **Frontend**: https://file-uploader-challenge.vercel.app

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

## 📝 Challenge Notes

**Time Investment**: ~2.5 hours
**Trade-offs Made**:

- Used Render free tier (30s cold start acceptable for demo)
- Focused on core functionality over advanced monitoring
- Structured for easy scaling and production enhancement

Built for Charles's file uploader challenge - demonstrating clean Node.js architecture with AWS SDK v3 best practices.
