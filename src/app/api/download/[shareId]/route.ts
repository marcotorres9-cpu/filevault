import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFromR2 } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params;

    const file = await db.file.findUnique({ where: { shareId } });

    if (!file) {
      return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 });
    }

    // Increment download counter
    await db.file.update({
      where: { id: file.id },
      data: { downloads: { increment: 1 } },
    });

    // Stream del blob publico
    const r2Response = await getFromR2(file.r2Key);
    if (!r2Response.ok) {
      return NextResponse.json({ error: 'Archivo no encontrado en el storage.' }, { status: 404 });
    }

    // RFC 5987 Content-Disposition (same fix as authenticated download route)
    const asciiName = file.originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, "'");
    const utf8Name = encodeURIComponent(file.originalName);

    return new NextResponse(r2Response.body, {
      headers: {
        'Content-Type': file.mimeType || r2Response.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        'Content-Length': String(file.size),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Share download error:', error);
    return NextResponse.json({ error: 'Error al descargar el archivo.' }, { status: 500 });
  }
}