import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFromR2 } from '@/lib/r2';
import { verifyToken } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const file = await db.file.findUnique({ where: { id } });

    if (!file) {
      return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 });
    }

    // Auth: token query param OR cookie. WebView doesn't always send cookies on download.
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    let isAuthenticated = false;
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

    // Increment download counter
    await db.file.update({
      where: { id },
      data: { downloads: { increment: 1 } },
    });

    // Get file from R2 as buffer
    const r2Response = await getFromR2(file.r2Key);
    const byteArray = await r2Response.Body!.transformToByteArray();
    const buffer = Buffer.from(byteArray);

    // RFC 5987 Content-Disposition — both ASCII fallback and UTF-8 encoded filename
    // Fix for "archivos se descargan con nombre genérico":
    // Before: encodeURIComponent turned spaces into %20 literally in filename.
    // Now: ASCII fallback replaces non-ASCII with _, and filename* uses proper UTF-8 encoding.
    const asciiName = file.originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, "'");
    const utf8Name = encodeURIComponent(file.originalName);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Error al descargar el archivo.' }, { status: 500 });
  }
}