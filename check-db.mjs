import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
console.log('=== USERS ===')
console.log(`Total: ${users.length}`)
for (const u of users) {
  console.log(`  ${u.username.padEnd(20)} created=${u.createdAt.toISOString()}`)
}
console.log()
const files = await prisma.file.findMany({ orderBy: { createdAt: 'asc' }, include: { user: true } })
console.log('=== FILES ===')
console.log(`Total: ${files.length}`)
for (const f of files) {
  console.log(`  ${f.originalName.padEnd(30)} user=${f.user.username.padEnd(15)} size=${f.size}B r2Key=${f.r2Key}`)
}
await prisma.$disconnect()
