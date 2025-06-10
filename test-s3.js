require('dotenv').config();
const { S3 } = require('@aws-sdk/client-s3');
const { HeadBucketCommand } = require('@aws-sdk/client-s3');

console.log('Testing S3 connection...');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET);

const s3Client = new S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

(async () => {
  try {
    const command = new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET });
    const result = await s3Client.send(command);
    console.log('✅ S3 connection successful!');
    console.log('Result:', result);
  } catch (error) {
    console.log('❌ S3 Error Details:');
    console.log('Name:', error.name);
    console.log('Message:', error.message);
    console.log('Code:', error.Code);
    console.log('StatusCode:', error.$metadata?.httpStatusCode);
    console.log('RequestId:', error.$metadata?.requestId);
    if (error.name === 'NoSuchBucket') {
      console.log('🪣 The bucket does not exist. You may need to create it first.');
    }
    if (error.name === 'AccessDenied') {
      console.log('🔒 Access denied. Check your AWS credentials and permissions.');
    }
  }
})();