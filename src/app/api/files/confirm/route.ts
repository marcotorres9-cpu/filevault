import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const { r2Key, originalName, mimeType, size } = await request.json();

    if (!r2Key || !originalName || !size) {
      return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 });
    }

    const shareId = randomUUID();

    const fileRecord = await db.file.create({
      data: {
        originalName,
        mimeType: mimeType || 'application/octet-stream',
        size,
        r2Key,
        shareId,
        userId: session.userId,
      },
    });

    return NextResponse.json({
      file: {
        id: fileRecord.id,
        originalName: fileRecord.originalName,
        mimeType: fileRecord.mimeType,
        size: fileRecord.size,
        shareId: fileRecord.shareId,
        downloads: fileRecord.downloads,
        createdAt: fileRecord.createdAt,
      },
      message: 'Archivo guardado exitosamente.',
    });
  } catch (error) {
    console.error('Confirm error:', error);
    return NextResponse.json({ error: 'Error al guardar archivo.' }, { status: 500 });
  }
}