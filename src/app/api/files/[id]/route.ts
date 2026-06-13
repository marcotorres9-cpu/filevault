import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { deleteFromR2 } from '@/lib/r2';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const { id } = await params;

    const file = await db.file.findFirst({
      where: { id, userId: session.userId },
    });

    if (!file) {
      return NextResponse.json({ error: 'Archivo no encontrado.' }, { status: 404 });
    }

    // Delete from R2
    try {
      await deleteFromR2(file.r2Key);
    } catch (r2Error) {
      console.error('R2 delete error (continuing with DB delete):', r2Error);
    }

    await db.file.delete({ where: { id } });

    return NextResponse.json({ message: 'Archivo eliminado correctamente.' });
  } catch (error) {
    console.error('Delete file error:', error);
    return NextResponse.json({ error: 'Error al eliminar el archivo.' }, { status: 500 });
  }
}