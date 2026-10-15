/**
 * Downloads a model resource so that it can be trusted and so that an interruption does not start it over. A
 * phone suspends the app, and with it this worker, when the person leaves it: a file of tens of megabytes held
 * only in memory would be lost every time. So it is asked for in pieces (HTTP ranges), every finished piece is
 * kept in the model cache, and the next attempt asks only for the pieces that are missing. Nothing is handed
 * over until the whole file has the published size and SHA-256.
 *
 * The length of a file is never read from the answer: storage on another origin does not let a page see the
 * `Content-Range` header. A file ends at the piece that comes shorter than asked for, or where the server says
 * there is nothing further.
 */
import { DOWNLOAD_PIECE_BYTES, MODEL_CACHE_PATH_PREFIX } from './offline.constants';

const HTTP_PARTIAL_CONTENT = 206;
const HTTP_RANGE_NOT_SATISFIABLE = 416;

/** Where the pieces of an unfinished download are kept, by the hash of the resource they belong to. */
const PARTIAL_PREFIX = `${MODEL_CACHE_PATH_PREFIX}partial/`;
const pieceKey = (sha256: string, file: number, piece: number): string => `${PARTIAL_PREFIX}${sha256}/${String(file)}/${String(piece)}`;

export async function hash(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Forgets the pieces kept for a resource: once it is installed, or when they turned out not to add up to it. */
export async function dropPartials(cache: Cache, sha256: string): Promise<void> {
  for (const key of await cache.keys()) {
    if (new URL(key.url).pathname.startsWith(`${PARTIAL_PREFIX}${sha256}/`)) await cache.delete(key);
  }
}

/** Reads a response body, reporting every network chunk; it may not be longer than `limit`. */
async function read(response: Response, limit: number, onBytes: (bytes: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new Error('Model download failed.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > limit) throw new Error('Unexpected model size.');
      chunks.push(value); received += value.length; onBytes(value.length);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/**
 * One file of the resource, in order: the pieces already kept, then the missing ones from the network. `room` is
 * what is left of the published size, which no file may exceed.
 */
async function fetchFile(cache: Cache, url: string, sha256: string, file: number, room: number, onBytes: (bytes: number) => void): Promise<Uint8Array<ArrayBuffer>[]> {
  const pieces: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  for (let piece = 0; length < room; piece++) {
    const stored = await cache.match(pieceKey(sha256, file, piece));
    let bytes: Uint8Array<ArrayBuffer>;
    if (stored) {
      bytes = new Uint8Array(await stored.arrayBuffer());
      if (length + bytes.length > room) throw new Error('Unexpected model size.');
      onBytes(bytes.length);
    } else {
      const start = piece * DOWNLOAD_PIECE_BYTES;
      const response = await fetch(url, { cache: 'no-store', headers: { Range: `bytes=${String(start)}-${String(start + DOWNLOAD_PIECE_BYTES - 1)}` } });
      // The file ended exactly at the previous piece.
      if (response.status === HTTP_RANGE_NOT_SATISFIABLE && piece > 0) break;
      if (!response.ok) throw new Error('Model download failed.');
      if (response.status !== HTTP_PARTIAL_CONTENT) {
        // A host that ignores ranges sends the whole file: it is taken as it comes, and nothing can be resumed.
        if (piece > 0) throw new Error('Model download failed.');
        return [await read(response, room, onBytes)];
      }
      bytes = await read(response, Math.min(DOWNLOAD_PIECE_BYTES, room - length), onBytes);
      await cache.put(pieceKey(sha256, file, piece), new Response(bytes));
    }
    pieces.push(bytes);
    length += bytes.length;
    if (bytes.length < DOWNLOAD_PIECE_BYTES) break;
  }
  return pieces;
}

/**
 * The resource at `urls` (a file, or the parts of one a host limits in size, in order), checked against its exact
 * size and content hash. `onBytes` reports every byte that counts towards it, kept pieces included. The pieces
 * stay in `cache` until the caller has stored the result and calls `dropPartials`.
 */
export async function fetchVerified(cache: Cache, urls: readonly string[], size: number, sha256: string, onBytes: (bytes: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const [file, url] of urls.entries()) {
    for (const piece of await fetchFile(cache, url, sha256, file, size - offset, onBytes)) {
      buffer.set(piece, offset);
      offset += piece.length;
    }
  }
  if (offset !== size || await hash(buffer.buffer) !== sha256) {
    // Pieces that do not add up to the published file would fail every later attempt too.
    await dropPartials(cache, sha256);
    throw new Error('Model integrity check failed.');
  }
  return buffer;
}
