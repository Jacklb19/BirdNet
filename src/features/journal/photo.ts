import { PHOTO_INPUT_MAX_BYTES, PHOTO_MAX_EDGE, PHOTO_QUALITY } from './journal.config';

/** Decode and recode pixels rather than keeping the source file, which may contain raw EXIF GPS. */
export async function observationPhoto(file: File): Promise<Blob> {
  if (file.size === 0 || file.size > PHOTO_INPUT_MAX_BYTES) throw new Error('Photo is too large.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('Unsupported photo content.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('Invalid photo dimensions.');
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo conversion unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => { canvas.toBlob((blob) => { if (blob?.type === 'image/jpeg') resolve(blob); else reject(new Error('Photo conversion failed.')); }, 'image/jpeg', PHOTO_QUALITY); });
  } finally { bitmap.close(); }
}
