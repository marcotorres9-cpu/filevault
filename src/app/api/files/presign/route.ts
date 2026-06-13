import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPresignedUploadUrl } from '@/lib/r2';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
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
      return NextResponse.json({ error: 'El archivo excede el límite de 5GB.' }, { status: 400 });
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