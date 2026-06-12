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

    // Stream file from R2
    const r2Response = await getFromR2(file.r2Key);
    const stream = r2Response.Body;

    if (!stream) {
      return NextResponse.json({ error: 'Archivo no encontrado en almacenamiento.' }, { status: 404 });
    }

    return new NextResponse(stream as ReadableStream, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.originalName)}"`,
        'Content-Length': file.size.toString(),
      },
    });
  } catch (error) {
    console.error('Share download error:', error);
    return NextResponse.json({ error: 'Error al descargar el archivo.' }, { status: 500 });
  }
}