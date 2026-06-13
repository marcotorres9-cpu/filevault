import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFromR2 } from '@/lib/r2';

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

    // Increment download counter
    await db.file.update({
      where: { id },
      data: { downloads: { increment: 1 } },
    });

    // Get file from R2 as buffer
    const r2Response = await getFromR2(file.r2Key);
    const byteArray = await r2Response.Body!.transformToByteArray();
    const buffer = Buffer.from(byteArray);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.originalName)}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Error al descargar el archivo.' }, { status: 500 });
  }
}