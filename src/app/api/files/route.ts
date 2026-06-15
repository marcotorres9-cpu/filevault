import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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

// POST: delete with action=delete&id=xxx
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'delete') {
      const fileId = searchParams.get('id');
      if (!fileId) {
        return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });
      }

      const file = await db.file.findUnique({ where: { id: fileId } });
      if (!file) {
        return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
      }

      try { await deleteFromR2(file.r2Key); } catch (e) { console.error('R2:', e); }
      await db.file.delete({ where: { id: fileId } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Accion invalida.' }, { status: 400 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ error: 'Error.' }, { status: 500 });
  }
}

// DELETE: no auth required — delete by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');
    if (!fileId) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });
    }

    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
    }

    try { await deleteFromR2(file.r2Key); } catch (e) { console.error('R2:', e); }
    await db.file.delete({ where: { id: fileId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ error: 'Error.' }, { status: 500 });
  }
}