import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Try a simple query to check if tables exist
    await db.user.count();
    return NextResponse.json({ status: 'ok', message: 'Base de datos ya inicializada.' });
  } catch {
    // Tables don't exist yet - create them with raw SQL
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "username" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

        CREATE TABLE IF NOT EXISTS "File" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "originalName" TEXT NOT NULL,
          "mimeType" TEXT NOT NULL,
          "size" INTEGER NOT NULL,
          "data" BYTEA NOT NULL,
          "shareId" TEXT NOT NULL,
          "downloads" INTEGER NOT NULL DEFAULT 0,
          "userId" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "File_shareId_key" ON "File"("shareId");
        CREATE INDEX IF NOT EXISTS "File_userId_idx" ON "File"("userId");
      `);
      return NextResponse.json({ status: 'created', message: 'Tablas creadas exitosamente.' });
    } catch (error) {
      console.error('Setup error:', error);
      return NextResponse.json({ error: 'Error al crear tablas.' }, { status: 500 });
    }
  }
}