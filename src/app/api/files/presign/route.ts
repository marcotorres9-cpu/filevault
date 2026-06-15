import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPresignedUploadUrl } from '@/lib/r2';
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

    const { fileName, fileSize, mimeType } = await request.json();

    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json({ error: 'Faltan datos del archivo.' }, { status: 400 });
    }

    // Limit to 5GB (R2 max)
    const MAX_SIZE = 5 * 1024 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el limite de 5GB.' }, { status: 400 });
    }

    const r2Key = `${session.userId}/${randomUUID()}-${fileName}`;
    const uploadUrl = await getPresignedUploadUrl(r2Key, mimeType);

    return NextResponse.json({
      uploadUrl,
      r2Key,
    });
  } catch (error) {
    console.error('Presign error:', error);
    return NextResponse.json({ error: 'Error al generar URL de subida.' }, { status: 500 });
  }
}