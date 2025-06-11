const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

// Import routes
const uploadRoutes = require('./routes/upload');
const healthRoutes = require('./routes/health');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Express configuration - trust proxy for production deployments
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy (Railway/Render)
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'https://file-uploader-challenge.vercel.app'
    ];

    // Check exact matches first
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
      return;
    }

    // Allow Vercel preview deployments (pattern: file-uploader-challenge-*.vercel.app)
    if (origin && origin.match(/^https:\/\/file-uploader-challenge.*\.vercel\.app$/)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware
app.use(express.json({
  limit: process.env.MAX_FILE_SIZE || '10mb',
  verify: (req, res, buf) => {
    // Add request size validation
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({
  extended: true,
  limit: process.env.MAX_FILE_SIZE || '10mb'
}));

// API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/health', healthRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'File Uploader API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      upload: '/api/upload',
      health: '/api/health'
    }
  });
});

// Handle 404 errors - Express best practice for catch-all
app.use('*', (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.status = 404;
  error.code = 'NOT_FOUND';
  error.retryable = false;
  next(error);
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
