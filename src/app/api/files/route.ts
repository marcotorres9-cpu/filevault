import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteFromR2 } from '@/lib/r2';
import { verifyToken } from '@/lib/auth';

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

// POST: delete with action=delete&id=xxx&token=xxx (WebView-safe, no cookies needed)
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'delete') {
      const fileId = searchParams.get('id');
      const token = searchParams.get('token');

      if (!fileId) {
        return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });
      }

      // Verify auth: token from query param (most reliable) or from cookie
      let isAuthenticated = false;
      if (token) {
        const payload = await verifyToken(token);
        if (payload) isAuthenticated = true;
      }
      if (!isAuthenticated) {
        // Fallback: check cookie
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const cookieToken = cookieStore.get('token')?.value || cookieStore.get('fv_token')?.value;
        if (cookieToken) {
          const payload = await verifyToken(cookieToken);
          if (payload) isAuthenticated = true;
        }
      }

      if (!isAuthenticated) {
        return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
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

// DELETE: fallback for any client that uses DELETE method
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    let idToDelete: string | null = fileId;

    // If no id in query, try reading from body as fallback
    if (!idToDelete) {
      try {
        const body = await request.json();
        if (body && typeof body.id === 'string') {
          idToDelete = body.id;
        }
      } catch {}
    }

    if (!idToDelete) {
      return NextResponse.json({ error: 'ID requerido.' }, { status: 400 });
    }

    // Verify auth (cookie or token query param)
    let isAuthenticated = false;
    const queryToken = searchParams.get('token');
    if (queryToken) {
      const payload = await verifyToken(queryToken);
      if (payload) isAuthenticated = true;
    }
    if (!isAuthenticated) {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const cookieToken = cookieStore.get('token')?.value || cookieStore.get('fv_token')?.value;
      if (cookieToken) {
        const payload = await verifyToken(cookieToken);
        if (payload) isAuthenticated = true;
      }
    }
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const file = await db.file.findUnique({ where: { id: idToDelete } });
    if (!file) {
      return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
    }

    try { await deleteFromR2(file.r2Key); } catch (e) { console.error('R2:', e); }
    await db.file.delete({ where: { id: idToDelete } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ error: 'Error.' }, { status: 500 });
  }
}