import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { uploadToR2 } from '@/lib/r2';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo.' }, { status: 400 });
    }

    // Limit to 5GB (R2 max)
    const MAX_SIZE = 5 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el límite de 5GB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const r2Key = `${session.userId}/${randomUUID()}-${file.name}`;
    const shareId = randomUUID();

    // Upload to R2
    await uploadToR2(r2Key, buffer, file.type || 'application/octet-stream');

    // Save metadata to database (no file data)
    const fileRecord = await db.file.create({
      data: {
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
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
      message: 'Archivo subido exitosamente.',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Error al subir el archivo.', details: String(error) }, { status: 500 });
  }
}