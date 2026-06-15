import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';

async function getAuth(request: NextRequest): Promise<{ userId: string; username: string } | null> {
  // 1) Authorization: Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const payload = await verifyToken(authHeader.slice(7));
    if (payload) return payload;
  }

  // 2) Query param token
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token');
  if (queryToken) {
    const payload = await verifyToken(queryToken);
    if (payload) return payload;
  }

  // 3) Cookies
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('token')?.value || cookieStore.get('fv_token')?.value;
  if (cookieToken) {
    const payload = await verifyToken(cookieToken);
    if (payload) return payload;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuth(request);
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