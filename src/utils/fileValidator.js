const path = require('path');

/**
 * File Validation Utilities for File Upload API
 * Provides security-first validation with streaming support
 */

// Configuration constants
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES ||
  'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,video/mp4,audio/mpeg')
  .split(',');

// Magic number mappings for security validation
const MAGIC_NUMBERS = {
  // Images
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
  // Documents
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'text/plain': null, // Text files don't have reliable magic numbers
  'text/csv': null,
  // Media
  'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp
  'audio/mpeg': [0xFF, 0xFB], // MP3 frame header
};

// Dangerous file extensions to reject
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.app', '.deb', '.pkg', '.dmg', '.run', '.msi', '.dll', '.so',
  '.php', '.asp', '.jsp', '.py', '.rb', '.pl', '.sh', '.bash'
];

/**
 * Validates file metadata (name, size, type)
 */
const validateFileMetadata = (file) => {
  const errors = [];

  // Check if file exists
  if (!file) {
    errors.push('No file provided');
    return { isValid: false, errors };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size ${formatBytes(file.size)} exceeds limit of ${formatBytes(MAX_FILE_SIZE)}`);
  }

  if (file.size === 0) {
    errors.push('File is empty');
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    errors.push(`MIME type '${file.mimetype}' not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  // Validate file extension
  const extension = path.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    errors.push(`File extension '${extension}' is not allowed for security reasons`);
  }

  // Validate filename
  if (!file.originalname || file.originalname.trim() === '') {
    errors.push('Filename cannot be empty');
  }

  // Check for suspicious filename patterns
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    errors.push('Filename contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    metadata: {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      extension
    }
  };
};

/**
 * Validates file content using magic numbers (first few bytes)
 * Uses crypto.timingSafeEqual for secure comparison (Context7 best practice)
 */
const validateFileContent = async (buffer, expectedMimeType) => {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: 'No file content to validate' };
  }

  const magicNumbers = MAGIC_NUMBERS[expectedMimeType];

  // Skip validation for text files (no reliable magic numbers)
  if (magicNumbers === null) {
    return { isValid: true };
  }

  // Check if we have enough bytes
  if (!magicNumbers || buffer.length < magicNumbers.length) {
    return { isValid: false, error: 'Insufficient file content for validation' };
  }

  // Use secure comparison to prevent timing attacks (Context7 Node.js best practice)
  const crypto = require('crypto');
  const expectedBuffer = Buffer.from(magicNumbers);
  const actualBuffer = buffer.subarray(0, magicNumbers.length);

  try {
    // crypto.timingSafeEqual prevents timing attacks
    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);

    if (!isValid) {
      return {
        isValid: false,
        error: `File content does not match expected MIME type '${expectedMimeType}'`
      };
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Magic number validation failed'
    };
  }

  return { isValid: true };
};

/**
 * Comprehensive file validation for uploaded files
 */
const validateUploadedFile = async (file) => {
  // Step 1: Validate metadata
  const metadataValidation = validateFileMetadata(file);
  if (!metadataValidation.isValid) {
    return {
      isValid: false,
      errors: metadataValidation.errors,
      step: 'metadata'
    };
  }

  // Step 2: Validate content if buffer is available
  if (file.buffer) {
    const contentValidation = await validateFileContent(file.buffer, file.mimetype);
    if (!contentValidation.isValid) {
      return {
        isValid: false,
        errors: [contentValidation.error],
        step: 'content'
      };
    }
  }

  return {
    isValid: true,
    metadata: metadataValidation.metadata,
    step: 'complete'
  };
};

/**
 * Stream validator for real-time validation during upload
 */
const createStreamValidator = (expectedMimeType, maxSize = MAX_FILE_SIZE) => {
  let bytesProcessed = 0;
  let headerValidated = false;
  const magicNumbers = MAGIC_NUMBERS[expectedMimeType];

  return {
    validateChunk: (chunk) => {
      bytesProcessed += chunk.length;

      // Check size limit
      if (bytesProcessed > maxSize) {
        return {
          isValid: false,
          error: `File size exceeds limit of ${formatBytes(maxSize)}`,
          shouldAbort: true
        };
      }

      // Validate magic numbers on first chunk
      if (!headerValidated && magicNumbers && chunk.length >= magicNumbers.length) {
        for (let i = 0; i < magicNumbers.length; i++) {
          if (chunk[i] !== magicNumbers[i]) {
            return {
              isValid: false,
              error: `File content does not match expected type '${expectedMimeType}'`,
              shouldAbort: true
            };
          }
        }
        headerValidated = true;
      }

      return {
        isValid: true,
        bytesProcessed,
        progress: Math.min((bytesProcessed / maxSize) * 100, 100)
      };
    },

    getStats: () => ({
      bytesProcessed,
      headerValidated,
      expectedMimeType
    })
  };
};

/**
 * Generate secure filename with timestamp and UUID
 */
const generateSecureFilename = (originalFilename) => {
  const { v4: uuidv4 } = require('uuid');
  const extension = path.extname(originalFilename).toLowerCase();
  const baseName = path.basename(originalFilename, extension);

  // Sanitize base name
  const sanitizedBaseName = baseName
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50); // Limit length

  const timestamp = Date.now();
  const uuid = uuidv4().split('-')[0]; // First 8 chars

  return `${sanitizedBaseName}-${timestamp}-${uuid}${extension}`;
};

/**
 * Format bytes to human readable string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Check if file type is allowed
 */
const isFileTypeAllowed = (mimeType) => {
  return ALLOWED_MIME_TYPES.includes(mimeType);
};

/**
 * Get file validation configuration
 */
const getValidationConfig = () => ({
  maxFileSize: MAX_FILE_SIZE,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
  dangerousExtensions: DANGEROUS_EXTENSIONS,
  supportedMagicNumbers: Object.keys(MAGIC_NUMBERS)
});

module.exports = {
  validateFileMetadata,
  validateFileContent,
  validateUploadedFile,
  createStreamValidator,
  generateSecureFilename,
  formatBytes,
  isFileTypeAllowed,
  getValidationConfig,
  // Constants for external use
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  DANGEROUS_EXTENSIONS
};
