import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { deleteFromR2 } from '@/lib/r2';

// GET: Public — anyone can see all files
export async function GET() {
  try {
    const files = await db.file.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, originalName: true, mimeType: true, size: true,
        shareId: true, downloads: true, createdAt: true,
        user: { select: { username: true } },
      },
    });
    return NextResponse.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json({ error: 'Error al obtener archivos.' }, { status: 500 });
  }
}

// POST /api/files?action=delete&id=xxx — Auth required, any admin can delete
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'delete') {
      const session = await getSession(request);
      if (!session) {
        return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
      }

      const fileId = searchParams.get('id');
      if (!fileId) {
        return NextResponse.json({ error: 'ID de archivo requerido.' }, { status: 400 });
      }

      const file = await db.file.findUnique({ where: { id: fileId } });
      if (!file) {
        return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 });
      }

      try {
        await deleteFromR2(file.r2Key);
      } catch (r2Error) {
        console.error('R2 delete error (continuing with DB delete):', r2Error);
      }

      await db.file.delete({ where: { id: fileId } });
      return NextResponse.json({ message: 'Archivo eliminado.' });
    }

    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/files error:', error);
    return NextResponse.json({ error: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}