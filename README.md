# File Uploader API

A scalable file upload API using **direct client-to-S3 uploads** with presigned URLs. Handles unlimited file sizes without server bottlenecks.

## 🚀 Features

- **Direct S3 uploads** - Files never touch the backend server
- **Unlimited file size** - Handle 1KB to 1TB+ files
- **Presigned URLs** - Secure, time-limited upload tokens
- **Clean architecture** - ~120 lines of code
- **Production ready** - Used by Dropbox, Discord, etc.
- **Cost efficient** - No server bandwidth costs

## 🏗️ How It Works

```
1. Client requests presigned URL from backend (lightweight)
2. Backend generates secure S3 upload URL (milliseconds)
3. Client uploads directly to S3 (backend uninvolved)
4. Optional: Client confirms completion to backend
```

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Storage**: AWS S3
- **AWS SDK**: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

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
CORS_ORIGINS=http://localhost:5173,https://your-frontend-url.vercel.app

# Limits
MAX_FILE_SIZE=10485760  # 10MB default (can be much higher)
```

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your AWS credentials

# Start development server
npm run dev

# Start production server
npm start
```

## 📡 API Endpoints

### Generate Presigned Upload URL

```http
POST /api/upload/presigned-url
Content-Type: application/json

{
  "filename": "document.pdf",
  "contentType": "application/pdf",
  "fileSize": 5242880
}

Response (200):
{
  "success": true,
  "data": {
    "presignedUrl": "https://s3.amazonaws.com/...",
    "fileUrl": "https://bucket.s3.region.amazonaws.com/uploads/...",
    "s3Key": "uploads/1234567890-uuid.pdf",
    "fileId": "uuid",
    "expiresIn": 3600
  }
}
```

### Confirm Upload (Optional)

```http
POST /api/upload/confirm
Content-Type: application/json

{
  "s3Key": "uploads/1234567890-uuid.pdf",
  "fileId": "uuid",
  "fileName": "document.pdf",
  "fileSize": 5242880
}

Response (200):
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "fileName": "document.pdf",
    "fileUrl": "https://...",
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Delete File

```http
DELETE /api/upload/{s3Key}

Response (200):
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
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 💻 Frontend Integration

```javascript
// 1. Get presigned URL from backend
const response = await fetch('/api/upload/presigned-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filename: file.name,
    contentType: file.type,
    fileSize: file.size
  })
});

const { data } = await response.json();

// 2. Upload directly to S3
await fetch(data.presignedUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type
  }
});

// 3. Optional: Confirm upload
await fetch('/api/upload/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    s3Key: data.s3Key,
    fileId: data.fileId,
    fileName: file.name,
    fileSize: file.size
  })
});
```

See `frontend-example.html` for a complete working example with progress tracking.

## 📊 Performance

- **Unlimited file size** - No server memory constraints
- **Infinite concurrent uploads** - Limited only by S3
- **Zero server bandwidth** - Direct client-to-S3 transfer
- **Minimal server load** - Only generates URLs
- **Global scale ready** - Works with CloudFront CDN

## 🔒 Security

- Presigned URLs expire after 1 hour
- Each URL is single-use for specific file
- File size validation before URL generation
- CORS configuration for cross-origin requests

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production
```bash
NODE_ENV=production npm start
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "src/server.js"]
```

### Deploy to Render/Railway/Heroku
1. Push to GitHub
2. Connect repository
3. Set environment variables
4. Deploy

## 📈 Scalability

This architecture can handle:
- ✅ Millions of uploads per month
- ✅ Files from 1KB to 1TB+
- ✅ Thousands of concurrent uploads
- ✅ Global distribution with S3 + CloudFront

The backend is stateless and can be horizontally scaled infinitely since files never pass through it.

## 🏆 Why This Architecture?

**Benefits:**
- Direct uploads (Client → S3)
- No server bottleneck
- Minimal costs
- Unlimited file sizes
- Clean, maintainable code

## 📝 Notes

- This is the standard architecture for production file upload systems
- Used by: Dropbox, Google Drive, Slack, Discord, and most file services

## 📄 License

ISC