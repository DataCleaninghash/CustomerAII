import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const S3_BUCKET = process.env.S3_BUCKET_NAME;

export async function uploadFileToS3(buffer: Buffer, contentType: string, folder: string = 'uploads'): Promise<string> {
  if (!S3_BUCKET) throw new Error('S3_BUCKET_NAME is not set in environment variables');
  const key = `${folder}/${uuidv4()}`;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read', // or 'private' if you want restricted access
  };
  await s3.upload(params).promise();
  return `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
} 