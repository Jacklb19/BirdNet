// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { STATIC_MANIFEST_URL } from '../inference/modelManifest';
import { activeModel, API_MANIFEST_URL, availableManifest, downloadModel, modelResource, requestedManifestUrl } from './modelCache';
import { ACTIVE_MODEL_URL, MODEL_CACHE_PATH_PREFIX } from './offline.constants';
import productionManifest from '../../../public/models/manifest.json';

const origin = 'https://birdnet.example';
const bytes = new Uint8Array([0, 1, 2, 3]);
const obsoleteModel = `${MODEL_CACHE_PATH_PREFIX}obsolete.onnx`;
const sha256 = createHash('sha256').update(bytes).digest('hex');
// The acoustic model alone, as before S7 (undefined fields are dropped from the JSON); the geographic model is
// added by the test that covers it.
const manifest = { ...productionManifest, num_classes: 2, size_bytes: 4, sha256, geo_model_file: undefined, geo_sha256: undefined, geo_size_bytes: undefined };
let stored: Map<string, Response>;
let failPut: boolean;
let failDelete: boolean;

beforeEach(() => {
  stored = new Map(); failPut = false; failDelete = false;
  vi.stubGlobal('self', { location: { origin } });
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('caches', { open: vi.fn(() => Promise.resolve({
    match: (key: string) => Promise.resolve(stored.get(new URL(key, origin).pathname)?.clone()),
    put: (key: string, response: Response) => { if (failPut) throw new Error('Quota'); stored.set(new URL(key, origin).pathname, response.clone()); return Promise.resolve(); },
    keys: () => Promise.resolve([...stored.keys()].map((key) => new Request(new URL(key, origin)))),
    delete: (key: Request) => { if (failDelete) throw new Error('Quota'); return Promise.resolve(stored.delete(new URL(key.url).pathname)); },
  })) });
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.endsWith('.onnx')) return Promise.resolve(new Response(bytes));
    if (url.endsWith('labels.txt')) return Promise.resolve(new Response('Turdus fuscater_Great Thrush\nZonotrichia capensis_Sparrow'));
    return Promise.resolve(Response.json(manifest));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('verified model download and recovery', () => {
  it('reports byte progress and exposes verified resources only after a complete download', async () => {
    const progress = vi.fn();
    expect(await activeModel()).toBeNull();
    const installed = await downloadModel(STATIC_MANIFEST_URL, progress);
    expect(progress).toHaveBeenLastCalledWith(4, 4);
    expect(installed.model_file).toBe(modelResource(manifest.sha256, 'model'));
    expect(await activeModel()).toEqual(installed);
    stored.delete(installed.labels_file);
    expect(await activeModel()).toBeNull();
  });
  it('downloads the geographic model in the same verified installation and progress (ADR-18)', async () => {
    const withGeo = { ...manifest, geo_model_file: 'birdnet_geo_model.onnx', geo_sha256: sha256, geo_size_bytes: bytes.length };
    vi.mocked(fetch).mockImplementation((url) => {
      const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (path.endsWith('.onnx')) return Promise.resolve(new Response(bytes));
      if (path.endsWith('labels.txt')) return Promise.resolve(new Response('Turdus fuscater_Great Thrush\nZonotrichia capensis_Sparrow'));
      return Promise.resolve(Response.json(withGeo));
    });
    const progress = vi.fn();
    const installed = await downloadModel(STATIC_MANIFEST_URL, progress);
    expect(progress).toHaveBeenLastCalledWith(bytes.length * 2, bytes.length * 2);
    expect(installed.geo_model_file).toBe(modelResource(sha256, 'geo'));
    expect(await activeModel()).toEqual(installed);
    // A missing or altered geographic file invalidates the installation, like the acoustic one.
    stored.set(modelResource(sha256, 'geo'), new Response(new Uint8Array([9, 9, 9, 9])));
    expect(await activeModel()).toBeNull();
  });
  it.each(['oversize', 'truncated', 'hash', 'labels', 'missing-labels', 'http', 'quota'])('retains the active version after a failed update: %s', async (failure) => {
    const installed = await downloadModel(STATIC_MANIFEST_URL, () => undefined);
    if (failure === 'oversize') vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(Response.json({ ...manifest, size_bytes: 1 })));
    if (failure === 'truncated') vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(Response.json({ ...manifest, size_bytes: 5 })));
    if (failure === 'hash') vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(Response.json({ ...manifest, sha256: '0'.repeat(64) })));
    if (failure === 'labels') vi.mocked(fetch).mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(new Response(bytes)).mockResolvedValueOnce(new Response('wrong-count'));
    if (failure === 'missing-labels') vi.mocked(fetch).mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(new Response(bytes)).mockResolvedValueOnce(new Response(null, { status: 404 }));
    if (failure === 'http') vi.mocked(fetch).mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (failure === 'quota') failPut = true;
    await expect(downloadModel(STATIC_MANIFEST_URL, () => undefined)).rejects.toThrow();
    expect(await activeModel()).toEqual(installed);
  });
  it('rejects corrupt manifests, changed bytes and label count corruption', async () => {
    await downloadModel(STATIC_MANIFEST_URL, () => undefined);
    stored.set(modelResource(manifest.sha256, 'model'), new Response(new Uint8Array([4, 3, 2, 1])));
    expect(await activeModel()).toBeNull();
    stored.set(ACTIVE_MODEL_URL, new Response('not json'));
    expect(await activeModel()).toBeNull();
  });
  it('falls back to the packaged metadata for static previews and offline metadata access', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>', { headers: { 'Content-Type': 'text/html' } }));
    expect((await availableManifest()).base).toBe(new URL(STATIC_MANIFEST_URL, origin).href);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
    expect((await availableManifest()).manifest).toEqual(manifest);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
    await expect(availableManifest('/custom.json')).rejects.toThrow();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(availableManifest('/custom.json')).rejects.toThrow();
  });
  it('rejects untrusted resource origins before downloading weights', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...manifest, model_file: 'https://foreign.example/model.onnx' }));
    await expect(downloadModel('/manifest.json', () => undefined)).rejects.toThrow('Untrusted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('lets a page choose only the configured manifests or a same-origin path', () => {
    expect(requestedManifestUrl(undefined)).toBe(API_MANIFEST_URL);
    expect(requestedManifestUrl(STATIC_MANIFEST_URL)).toBe(STATIC_MANIFEST_URL);
    expect(() => requestedManifestUrl('//foreign.example/manifest.json')).toThrow();
    expect(() => requestedManifestUrl(String.raw`/\foreign.example/manifest.json`)).toThrow();
    expect(() => requestedManifestUrl('https://foreign.example/manifest.json')).toThrow();
  });
  it('cleans older versions but does not turn a cleanup error into download failure', async () => {
    stored.set(obsoleteModel, new Response('old'));
    await downloadModel(STATIC_MANIFEST_URL, () => undefined);
    expect(stored.has(obsoleteModel)).toBe(false);
    stored.set(obsoleteModel, new Response('old'));
    failDelete = true;
    await expect(downloadModel(STATIC_MANIFEST_URL, () => undefined)).resolves.toBeDefined();
  });
});
