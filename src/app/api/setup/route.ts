import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.user.count();
    
    // Migrate: drop NOT NULL from old 'data' column and add 'r2Key' column
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "File" ALTER COLUMN "data" DROP NOT NULL`);
    } catch {
      // Column might already be nullable or removed
    }
    
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "r2Key" TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column might already exist
    }

    return NextResponse.json({ status: 'ok', message: 'Base de datos actualizada.' });
  } catch {
    try {
      const statements = [
        `CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "username" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
        `CREATE TABLE IF NOT EXISTS "File" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "originalName" TEXT NOT NULL,
          "mimeType" TEXT NOT NULL,
          "size" INTEGER NOT NULL,
          "r2Key" TEXT NOT NULL DEFAULT '',
          "shareId" TEXT NOT NULL,
          "downloads" INTEGER NOT NULL DEFAULT 0,
          "userId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "File_shareId_key" ON "File"("shareId")`,
        `CREATE INDEX IF NOT EXISTS "File_userId_idx" ON "File"("userId")`,
      ];
      for (const sql of statements) {
        await db.$executeRawUnsafe(sql);
      }
      return NextResponse.json({ status: 'created', message: 'Tablas creadas exitosamente.' });
    } catch (error) {
      console.error('Setup error:', error);
      return NextResponse.json({ error: 'Error al crear tablas.', details: String(error) }, { status: 500 });
    }
  }
}