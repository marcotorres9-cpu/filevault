/**
 * Capa de almacenamiento de FileVault — ahora sobre VERCEL BLOB.
 *
 * Antes usaba Cloudflare R2 (S3 API), cuyas credenciales nunca existieron y el
 * deployment original fue eliminado. Se reemplaza por Vercel Blob:
 *  - getPresignedUploadUrl(key, contentType) → URL firmada para PUT directo
 *    desde el cliente (sin limite de 4.5MB del body de Vercel, hasta 10GB).
 *  - getFromR2(key) → Response streaming del blob publico.
 *  - deleteFromR2(key) → elimina el blob.
 *
 * La interfaz se mantiene igual para no tocar las rutas API que ya la usan.
 */
import { issueSignedToken, presignUrl, del } from '@vercel/blob';

const RW_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';

/** Store id: env explicita o inferido del token (vercel_blob_rw_<storeId>_<secreto>). */
function storeIdFromToken(): string {
  if (process.env.BLOB_STORE_ID) return process.env.BLOB_STORE_ID.replace(/^store_/, '');
  const rest = RW_TOKEN.replace(/^vercel_blob_rw_/, '');
  // El store id son los primeros 16 caracteres alfanumericos tras el prefijo
  const m = rest.match(/^([a-zA-Z0-9]{16})_/);
  if (m) return m[1];
  throw new Error('BLOB_READ_WRITE_TOKEN invalido: no se pudo inferir el store id');
}

/** URL publica de un blob (los stores publicos sirven GET sin auth). */
function publicUrl(key: string): string {
  const storeId = storeIdFromToken().toLowerCase();
  const cleanKey = key.replace(/^\/+/, '');
  return `https://${storeId}.public.blob.vercel-storage.com/${cleanKey}`;
}

/**
 * Genera una URL firmada para que el cliente suba el archivo DIRECTO al blob
 * store (el PUT no pasa por la funcion serverless, sin limite de 4.5MB).
 */
export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const signed = await issueSignedToken({
    token: RW_TOKEN,
    pathname: key,
    operations: ['put'],
  });

  const res = await presignUrl(signed, {
    operation: 'put',
    pathname: key,
    access: 'public',
    allowedContentTypes: [contentType, 'application/octet-stream'],
    maximumSizeInBytes: 10 * 1024 * 1024 * 1024, // 10GB
    addRandomSuffix: false,
  });

  return res.presignedUrl;
}

/** Response streaming del blob publico (para pasar el body tal cual al cliente). */
export async function getFromR2(key: string): Promise<Response> {
  const res = await fetch(publicUrl(key));
  if (!res.ok) {
    throw new Error(`Blob no encontrado (${res.status}): ${key}`);
  }
  return res;
}

/** Elimina el blob del store. */
export async function deleteFromR2(key: string): Promise<void> {
  await del(key, { token: RW_TOKEN });
}

/** Compatibilidad: subida server-side (solo para archivos pequenos). */
export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  const { put } = await import('@vercel/blob');
  await put(key, body, { token: RW_TOKEN, access: 'public', contentType, addRandomSuffix: false });
}
