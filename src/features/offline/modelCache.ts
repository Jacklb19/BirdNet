import type { ModelManifest } from '../inference/inference.types';

export const MODEL_CACHE = 'birdnet-models-v1';
const ACTIVE_MODEL = '/__birdnet_models/active.json';
export const modelResource = (hash: string, kind: 'onnx' | 'txt'): string => `/__birdnet_models/${hash}.${kind}`;

/** Validate the compatibility contract before trusting a network or cache manifest. */
export function validateManifest(value: unknown): ModelManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid manifest.');
  const manifest = value as Partial<ModelManifest>;
  if (manifest.sample_rate !== 48000 || manifest.window_samples !== 144000 || manifest.window_seconds !== 3 ||
      !Number.isInteger(manifest.num_classes) || (manifest.num_classes ?? 0) <= 0 ||
      !Number.isSafeInteger(manifest.size_bytes) || (manifest.size_bytes ?? 0) <= 0 ||
      typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !['model_id', 'variant', 'model_file', 'labels_file', 'updated_at'].every((key) => typeof Reflect.get(manifest, key) === 'string' && Reflect.get(manifest, key)) ||
      (manifest.model_id?.length ?? 0) + (manifest.variant?.length ?? 0) + 66 > 200) throw new Error('Incompatible manifest.');
  return manifest as ModelManifest;
}
function safeResource(path: string, base: string): string {
  const url = new URL(path, base);
  if (url.origin !== self.location.origin && !(url.protocol === 'https:' && url.hostname.endsWith('.supabase.co'))) throw new Error('Untrusted model origin.');
  return url.href;
}
async function hash(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Discover size and compatibility without downloading model weights. */
export async function availableManifest(manifestUrl = '/api/v1/model/latest'): Promise<{ manifest: ModelManifest; base: string }> {
  let manifestResponse: Response;
  try { manifestResponse = await fetch(manifestUrl, { cache: 'no-store' }); }
  catch (error) {
    if (manifestUrl !== '/api/v1/model/latest') throw error;
    manifestUrl = '/models/manifest.json';
    manifestResponse = await fetch(manifestUrl);
  }
  if (manifestUrl === '/api/v1/model/latest' && (manifestResponse.status === 404 || manifestResponse.ok && !manifestResponse.headers.get('Content-Type')?.includes('application/json'))) {
    manifestUrl = '/models/manifest.json';
    manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
  }
  if (!manifestResponse.ok) throw new Error('Model manifest unavailable.');
  const manifest = validateManifest(await manifestResponse.json());
  const base = new URL(manifestUrl, self.location.origin).href;
  return { manifest, base };
}

/** A pointer becomes active only after both resources have been completely verified. */
export async function downloadModel(manifestUrl: string, progress: (received: number, total: number) => void): Promise<ModelManifest> {
  const { manifest, base } = await availableManifest(manifestUrl);
  const modelUrl = safeResource(manifest.model_file, base);
  const labelsUrl = safeResource(manifest.labels_file, base);
  const response = await fetch(modelUrl, { cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('Model download failed.');
  const reader = response.body.getReader();
  const buffer = new Uint8Array(manifest.size_bytes);
  let received = 0;
  progress(received, manifest.size_bytes);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > buffer.length) throw new Error('Unexpected model size.');
      buffer.set(value, received); received += value.length; progress(received, manifest.size_bytes);
    }
  } catch (error) { await reader.cancel(); throw error; }
  if (received !== manifest.size_bytes || await hash(buffer.buffer) !== manifest.sha256) throw new Error('Model integrity check failed.');
  const labelsResponse = await fetch(labelsUrl, { cache: 'no-store' });
  if (!labelsResponse.ok) throw new Error('Model labels unavailable.');
  const labels = await labelsResponse.text();
  if (labels.split('\n').map((label) => label.trim()).filter(Boolean).length !== manifest.num_classes) throw new Error('Model labels mismatch.');
  const cache = await caches.open(MODEL_CACHE);
  const previous = await cache.match(ACTIVE_MODEL);
  let previousHash: string | undefined;
  if (previous) {
    try { previousHash = validateManifest(await previous.json()).sha256; } catch { /* Ignore an invalid old pointer when installing a verified replacement. */ }
  }
  await cache.put(modelResource(manifest.sha256, 'onnx'), new Response(buffer));
  await cache.put(modelResource(manifest.sha256, 'txt'), new Response(labels));
  const active = { ...manifest, model_file: modelResource(manifest.sha256, 'onnx'), labels_file: modelResource(manifest.sha256, 'txt') };
  await cache.put(ACTIVE_MODEL, Response.json(active));
  for (const key of await cache.keys()) {
    const url = new URL(key.url);
    if (url.pathname !== ACTIVE_MODEL && !url.pathname.includes(manifest.sha256) && !(previousHash && url.pathname.includes(previousHash))) {
      // Cleanup is optional; a failed cleanup must not report a verified installation as failed.
      try { await cache.delete(key); } catch { break; }
    }
  }
  return active;
}

/** Cache presence alone is insufficient: verify bytes again before offline inference. */
export async function activeModel(): Promise<ModelManifest | null> {
  const cache = await caches.open(MODEL_CACHE);
  const pointer = await cache.match(ACTIVE_MODEL);
  if (!pointer) return null;
  try {
    const manifest = validateManifest(await pointer.json());
    const model = await cache.match(modelResource(manifest.sha256, 'onnx'));
    const labels = await cache.match(modelResource(manifest.sha256, 'txt'));
    if (!model || !labels) return null;
    const buffer = await model.arrayBuffer();
    if (buffer.byteLength !== manifest.size_bytes || await hash(buffer) !== manifest.sha256 || (await labels.text()).split('\n').filter((label) => label.trim()).length !== manifest.num_classes) return null;
    return manifest;
  } catch { return null; }
}
