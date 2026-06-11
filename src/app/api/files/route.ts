import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { unlink } from 'fs/promises';

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

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ error: 'ID de archivo requerido.' }, { status: 400 });
    }

    const file = await db.file.findFirst({
      where: { id: fileId, userId: session.userId },
    });

    if (!file) {
      return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 });
    }

    // Try to delete from filesystem
    try {
      await unlink(file.path);
    } catch {
      // File might not exist, continue
    }

    await db.file.delete({ where: { id: fileId } });

    return NextResponse.json({ message: 'Archivo eliminado.' });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Error al eliminar el archivo.' }, { status: 500 });
  }
}