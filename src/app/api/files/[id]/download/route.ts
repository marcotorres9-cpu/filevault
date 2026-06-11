import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile, stat } from 'fs/promises';

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

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(file.path);
    } catch {
      return NextResponse.json({ error: 'El archivo ya no existe en el servidor.' }, { status: 410 });
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.originalName)}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Error al descargar el archivo.' }, { status: 500 });
  }
}