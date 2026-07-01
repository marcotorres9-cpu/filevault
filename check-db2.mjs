import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const files = await prisma.file.findMany({ orderBy: { createdAt: 'asc' } })
console.log(`Total files in DB: ${files.length}`)
for (const f of files) {
  console.log(`  ${f.originalName.padEnd(50)} id=${f.id}`)
}
await prisma.$disconnect()
