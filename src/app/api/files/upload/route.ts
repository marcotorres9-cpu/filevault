import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
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

    // Limit to 500MB
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el límite de 500MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const shareId = randomUUID();
    const ext = path.extname(file.name) || '';
    const storedName = `${shareId}${ext}`;

    const uploadDir = path.join(process.cwd(), 'uploads', session.userId);
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, storedName);
    await writeFile(filePath, buffer);

    const fileRecord = await db.file.create({
      data: {
        name: storedName,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        path: filePath,
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
    return NextResponse.json({ error: 'Error al subir el archivo.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const files = await db.file.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        shareId: true,
        downloads: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json({ error: 'Error al obtener archivos.' }, { status: 500 });
  }
}