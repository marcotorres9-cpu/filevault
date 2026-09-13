import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * GET /apk — atajo corto para descargar la APK directamente.
 * Pensado para la app Downloader en Android TV / Fire TV:
 * sirve el archivo en la respuesta (sin redirecciones) y con
 * Content-Disposition: attachment para forzar la descarga.
 * Acepta ?inline=1 si algun cliente quiere abrirlo en lugar de descargarlo.
 */
export async function GET(request: NextRequest) {
  try {
    const inline = request.nextUrl.searchParams.get('inline') === '1';
    const filePath = path.join(process.cwd(), 'public', 'FileVault-v5.0.apk');
    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="FileVault-v5.0.apk"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json({ error: 'APK not found' }, { status: 404 });
  }
}
