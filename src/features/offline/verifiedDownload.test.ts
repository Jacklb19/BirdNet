// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { MODEL_CACHE_PATH_PREFIX } from './offline.constants';
import { dropPartials, fetchVerified } from './verifiedDownload';

// Pieces of four bytes, so a file of ten is asked for in three requests and one of eight ends exactly at a piece.
vi.mock('./offline.constants', async (original) => ({ ...await original<typeof import('./offline.constants')>(), DOWNLOAD_PIECE_BYTES: 4 }));

const origin = 'https://birdnet.example';
const file = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const second = Uint8Array.from([10, 11, 12, 13, 14, 15]);
const even = Uint8Array.from([20, 21, 22, 23, 24, 25, 26, 27]);
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const sha256 = digest(file);

let stored: Map<string, Response>;
let cache: Cache;
/** Ranges asked of the network, as `file:start-end`. */
let asked: string[];
/** The request that fails, to interrupt a download there. */
let broken: string | null;
let ranges: boolean;

/**
 * Answers like storage on another origin: ranges are honoured, and the page cannot read `Content-Range`, so the
 * header is left out.
 */
function serve(url: string, init?: RequestInit): Promise<Response> {
  const name = /(\w+)\.onnx$/.exec(url)?.[1] ?? 'first';
  const bytes = name === 'second' ? second : name === 'even' ? even : file;
  if (!ranges) return Promise.resolve(new Response(bytes));
  const range = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '');
  if (!range) return Promise.resolve(new Response(bytes));
  const start = Number(range[1]);
  if (start >= bytes.length) {
    asked.push(`${name}:past the end`);
    return Promise.resolve(new Response(null, { status: 416 }));
  }
  const end = Math.min(Number(range[2]), bytes.length - 1);
  const request = `${name}:${String(start)}-${String(end)}`;
  asked.push(request);
  if (request === broken) return Promise.reject(new TypeError('Failed to fetch'));
  return Promise.resolve(new Response(bytes.slice(start, end + 1), { status: 206 }));
}

beforeEach(() => {
  stored = new Map(); asked = []; broken = null; ranges = true;
  vi.stubGlobal('crypto', webcrypto);
  cache = {
    match: (key: string) => Promise.resolve(stored.get(key)?.clone()),
    put: (key: string, response: Response) => { stored.set(key, response.clone()); return Promise.resolve(); },
    keys: () => Promise.resolve([...stored.keys()].map((key) => new Request(new URL(key, origin)))),
    delete: (key: Request) => Promise.resolve(stored.delete(new URL(key.url).pathname)),
  } as unknown as Cache;
  vi.stubGlobal('fetch', vi.fn(serve));
});
afterEach(() => { vi.unstubAllGlobals(); });

const kept = (): string[] => [...stored.keys()].filter((key) => key.startsWith(`${MODEL_CACHE_PATH_PREFIX}partial/`));

describe('verified download that survives an interruption', () => {
  it('asks for the file in pieces and hands it over only whole and verified', async () => {
    const counted = vi.fn();
    const bytes = await fetchVerified(cache, ['first.onnx'], file.length, sha256, counted);
    expect(bytes).toEqual(file);
    expect(asked).toEqual(['first:0-3', 'first:4-7', 'first:8-9']);
    expect(counted.mock.calls.reduce((sum, [amount]) => sum + (amount as number), 0)).toBe(file.length);
  });

  it('goes on from the pieces it kept: only the missing ones are asked for again', async () => {
    broken = 'first:8-9';
    await expect(fetchVerified(cache, ['first.onnx'], file.length, sha256, () => undefined)).rejects.toThrow();
    broken = null; asked = [];
    const counted = vi.fn();
    expect(await fetchVerified(cache, ['first.onnx'], file.length, sha256, counted)).toEqual(file);
    expect(asked).toEqual(['first:8-9']);
    // The kept pieces count towards the progress the person sees.
    expect(counted.mock.calls.reduce((sum, [amount]) => sum + (amount as number), 0)).toBe(file.length);
  });

  it('resumes inside the part where a file published in parts stopped', async () => {
    const whole = Uint8Array.from([...file, ...second]);
    broken = 'second:4-5';
    await expect(fetchVerified(cache, ['first.onnx', 'second.onnx'], whole.length, digest(whole), () => undefined)).rejects.toThrow();
    broken = null; asked = [];
    expect(await fetchVerified(cache, ['first.onnx', 'second.onnx'], whole.length, digest(whole), () => undefined)).toEqual(whole);
    expect(asked).toEqual(['second:4-5']);
  });

  it('finds the end of a part that fills its last piece, and asks for nothing once the published size is reached', async () => {
    const whole = Uint8Array.from([...even, ...file]);
    expect(await fetchVerified(cache, ['even.onnx', 'first.onnx'], whole.length, digest(whole), () => undefined)).toEqual(whole);
    expect(asked).toEqual(['even:0-3', 'even:4-7', 'even:past the end', 'first:0-3', 'first:4-7', 'first:8-9']);
    asked = [];
    expect(await fetchVerified(cache, ['even.onnx'], even.length, digest(even), () => undefined)).toEqual(even);
    expect(asked).toEqual(['even:0-3', 'even:4-7']);
  });

  it('takes the whole file from a host that ignores ranges, and keeps nothing', async () => {
    ranges = false;
    expect(await fetchVerified(cache, ['first.onnx'], file.length, sha256, () => undefined)).toEqual(file);
    expect(kept()).toEqual([]);
  });

  it('forgets pieces that do not add up to the published file, so the next attempt starts clean', async () => {
    const other = digest(Uint8Array.from([1]));
    await expect(fetchVerified(cache, ['first.onnx'], file.length, other, () => undefined)).rejects.toThrow('integrity');
    expect(kept()).toEqual([]);
  });

  it('refuses a file longer than the published size', async () => {
    await expect(fetchVerified(cache, ['first.onnx'], file.length - 1, sha256, () => undefined)).rejects.toThrow('size');
    ranges = false;
    await expect(fetchVerified(cache, ['second.onnx'], second.length - 1, digest(second), () => undefined)).rejects.toThrow('size');
  });

  it('leaves the pieces of other downloads alone when one is installed', async () => {
    broken = 'first:8-9';
    await expect(fetchVerified(cache, ['first.onnx'], file.length, sha256, () => undefined)).rejects.toThrow();
    const pieces = kept().length;
    await dropPartials(cache, digest(second));
    expect(kept()).toHaveLength(pieces);
    await dropPartials(cache, sha256);
    expect(kept()).toEqual([]);
  });
});
