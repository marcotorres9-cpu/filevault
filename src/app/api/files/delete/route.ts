import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteFromR2 } from '@/lib/r2';

// GET /api/files/delete?id=xxx — simplest possible delete, works via link/iframe
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');
    if (!fileId) {
      return new NextResponse('Missing id', { status: 400 });
    }

    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return new NextResponse('Not found', { status: 404 });
    }

    try { await deleteFromR2(file.r2Key); } catch (e) { console.error('R2:', e); }
    await db.file.delete({ where: { id: fileId } });

    // Return tiny HTML that calls parent reload
    return new NextResponse('<script>parent.location.reload()</script>', {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('GET delete error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}