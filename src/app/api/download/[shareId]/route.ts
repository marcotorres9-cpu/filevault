import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFromR2 } from '@/lib/r2';

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

    // Get file from R2 as buffer
    const r2Response = await getFromR2(file.r2Key);
    const byteArray = await r2Response.Body!.transformToByteArray();
    const buffer = Buffer.from(byteArray);

    // RFC 5987 Content-Disposition (same fix as authenticated download route)
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
    console.error('Share download error:', error);
    return NextResponse.json({ error: 'Error al descargar el archivo.' }, { status: 500 });
  }
}