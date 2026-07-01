// List all objects in the R2 bucket to recover file inventory
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: 'https://e7902296d040df686a383fc887ee7cb0.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'b8acfe6236e5683712088d0cf3d6d293',
    secretAccessKey: 'b2cef139cf0327736d9ed107dc6aea27c612326b880757a22e4d61a15b2fd09d',
  },
});

const BUCKET = 'filevault';

async function listAll() {
  let continuationToken;
  const allKeys = [];
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });
    const res = await r2Client.send(cmd);
    for (const obj of res.Contents || []) {
      allKeys.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return allKeys;
}

const objects = await listAll();
console.log(`Total objects in R2: ${objects.length}`);
console.log();
for (const obj of objects) {
  console.log(`  Key: ${obj.key}`);
  console.log(`    Size: ${obj.size} bytes | LastModified: ${obj.lastModified?.toISOString()}`);
  console.log();
}
