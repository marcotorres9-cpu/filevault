import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const files = await prisma.file.findMany({ orderBy: { createdAt: 'asc' } })
console.log(`Total files in DB: ${files.length}`)
for (const f of files) {
  console.log(`  id=${f.id} name=${f.originalName} size=${f.size}B r2Key=${f.r2Key}`)
}
await prisma.$disconnect()
