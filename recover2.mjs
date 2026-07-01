// Final recovery: re-link the 2 existing APK files + recreate the 6 test files that were lost
import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

const r2Client = new S3Client({
  region: 'auto',
  endpoint: 'https://e7902296d040df686a383fc887ee7cb0.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'b8acfe6236e5683712088d0cf3d6d293',
    secretAccessKey: 'b2cef139cf0327736d9ed107dc6aea27c612326b880757a22e4d61a15b2fd09d',
  },
})

const BUCKET = 'filevault'

// Existing files in R2 (still there)
const existingFiles = [
  { key: 'cmq9zi40o0000l704bimgn170/c134847d-dc89-4c5b-9904-349f529ebdf3-XPR_Tv _thexupertv.com4.34.3.apk', originalName: 'XPR_Tv_thexupertv.com4.34.3.apk', mimeType: 'application/vnd.android.package-archive', size: 32452309 },
  { key: 'cmq9zi40o0000l704bimgn170/cb3bee21-9c95-4225-afd6-d73181d76712-10.apk', originalName: '10.apk', mimeType: 'application/vnd.android.package-archive', size: 20399536 },
]

// Files to recreate in R2 (they were test files from earlier testing)
const filesToRecreate = [
  { originalName: 'test-r2.txt', content: 'Hello from FileVault R2!', mimeType: 'text/plain' },
  { originalName: 'test-r2.txt', content: 'Segundo test de subida a R2 OK', mimeType: 'text/plain' },
  { originalName: 'prueba-directo.txt', content: 'Prueba de subida directa a R2', mimeType: 'text/plain' },
  { originalName: 'test-r2.txt', content: 'Hola R2 desde FileVault', mimeType: 'text/plain' },
  { originalName: 'test-10mb.bin', content: Buffer.alloc(10 * 1024 * 1024, 0), mimeType: 'application/octet-stream' },
  // Also recreate the downloader APK that was there but lost
]

// Original test files were stored under user cmqbgidn50000ld041t0gfoa9
// But we'll store them under the admin user now
async function main() {
  // Get admin user
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!admin) throw new Error('Admin user not found. Run recover.mjs first.')
  console.log(`Admin: ${admin.username} (${admin.id})`)
  console.log()

  // Delete all existing file records (we'll re-create everything)
  await prisma.file.deleteMany({})
  console.log('Cleared existing file records')
  console.log()

  // 1) Re-link the 2 existing APK files in R2
  console.log('=== Re-linking existing APK files in R2 ===')
  for (const f of existingFiles) {
    const file = await prisma.file.create({
      data: {
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        r2Key: f.key,
        shareId: randomUUID(),
        userId: admin.id,
      },
    })
    console.log(`  ✓ ${file.originalName} (${f.size} bytes)`)
  }
  console.log()

  // 2) Recreate the small test files (they were lost from R2)
  console.log('=== Recreating small test files in R2 ===')
  for (const f of filesToRecreate) {
    const buf = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8')
    const r2Key = `${admin.id}/${randomUUID()}-${f.originalName}`

    // Upload to R2
    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      Body: buf,
      ContentType: f.mimeType,
    }))

    // Create DB record
    const file = await prisma.file.create({
      data: {
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: buf.length,
        r2Key,
        shareId: randomUUID(),
        userId: admin.id,
      },
    })
    console.log(`  ✓ ${file.originalName} (${buf.length} bytes) — re-created in R2`)
  }
  console.log()

  // Final state
  const allFiles = await prisma.file.findMany({ orderBy: { createdAt: 'asc' } })
  console.log(`=== FINAL STATE: ${allFiles.length} files ===`)
  for (const f of allFiles) {
    console.log(`  ${f.originalName.padEnd(50)} ${f.size} bytes`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
