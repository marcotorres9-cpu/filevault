// Recovery script:
// 1. Create a new admin user (deletes existing test user)
// 2. Re-link all 8 existing files in R2 to the new admin account
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

// Known files in R2 (from list-r2.mjs)
const r2Files = [
  { key: 'cmq9zi40o0000l704bimgn170/c134847d-dc89-4c5b-9904-349f529ebdf3-XPR_Tv _thexupertv.com4.34.3.apk', originalName: 'XPR_Tv_thexupertv.com4.34.3.apk', mimeType: 'application/vnd.android.package-archive', size: 32452309 },
  { key: 'cmq9zi40o0000l704bimgn170/cb3bee21-9c95-4225-afd6-d73181d76712-10.apk', originalName: '10.apk', mimeType: 'application/vnd.android.package-archive', size: 20399536 },
  { key: 'cmq9zi40o0000l704bimgn170/ed535e94-8e16-4865-aabd-f70eeff4c9ca-com-esaba-downloader-52-66275629-2108599e2b1c6a7db92119b3d839a2c7.apk', originalName: 'com-esaba-downloader-52-66275629-2108599e2b1c6a7db92119b3d839a2c7.apk', mimeType: 'application/vnd.android.package-archive', size: 5422893 },
  { key: 'cmqbgidn50000ld041t0gfoa9/02421d04-db7e-4437-bcb3-4918e4719650-test-10mb.bin', originalName: 'test-10mb.bin', mimeType: 'application/octet-stream', size: 10485760 },
  { key: 'cmqbgidn50000ld041t0gfoa9/9f912ec9-ab17-4ed7-a43c-eb03f8002754-test-r2.txt', originalName: 'test-r2.txt', mimeType: 'text/plain', size: 19 },
  { key: 'cmqbgidn50000ld041t0gfoa9/c402beb3-ebaa-4187-9854-441563ee6f62-test-r2.txt', originalName: 'test-r2.txt', mimeType: 'text/plain', size: 34 },
  { key: 'cmqbgidn50000ld041t0gfoa9/d779af51-84d3-41bc-a137-23d4304205cb-prueba-directo.txt', originalName: 'prueba-directo.txt', mimeType: 'text/plain', size: 33 },
  { key: 'cmqbgidn50000ld041t0gfoa9/f0224bf6-17b9-4466-807c-a08e01af77b1-test-r2.txt', originalName: 'test-r2.txt', mimeType: 'text/plain', size: 23 },
]

const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'FileVault2026!' // Will print this so user can change later

async function main() {
  // Delete existing test user (created during my earlier testing)
  await prisma.user.deleteMany({ where: { username: 'testuser' } }).catch(() => {})

  // Create or update admin user
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { password: passwordHash },
    create: {
      username: ADMIN_USERNAME,
      password: passwordHash,
    },
  })
  console.log(`✓ Admin user created/updated:`)
  console.log(`  username: ${admin.username}`)
  console.log(`  password: ${ADMIN_PASSWORD}`)
  console.log(`  id: ${admin.id}`)
  console.log()

  // Re-link all R2 files to admin account
  console.log(`Re-linking ${r2Files.length} files from R2 to admin account...`)
  const existingFiles = await prisma.file.findMany()
  if (existingFiles.length > 0) {
    console.log(`  (Cleaning up ${existingFiles.length} leftover DB rows)`)
    await prisma.file.deleteMany({})
  }

  for (const f of r2Files) {
    const shareId = randomUUID()
    const file = await prisma.file.create({
      data: {
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        r2Key: f.key,
        shareId,
        userId: admin.id,
      },
    })
    console.log(`  ✓ ${file.originalName} (${f.size} bytes) — shareId: ${shareId}`)
  }

  console.log()
  console.log('=== FINAL STATE ===')
  const users = await prisma.user.findMany()
  console.log(`Users: ${users.length}`)
  for (const u of users) console.log(`  ${u.username}`)
  const files = await prisma.file.findMany()
  console.log(`Files: ${files.length}`)
  for (const f of files) console.log(`  ${f.originalName} → r2Key: ${f.r2Key}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
