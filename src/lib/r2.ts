import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'filevault';

export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  await r2Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

export async function getFromR2(key: string) {
  const response = await r2Client.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
  return response;
}

export async function deleteFromR2(key: string) {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}