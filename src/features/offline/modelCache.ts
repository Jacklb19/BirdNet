import { API_ROUTES, apiUrl } from '../../config/api';
import { MODEL_LABELS_LINE_SEPARATOR } from '../inference/inference.constants';
import type { ModelManifest } from '../inference/inference.types';
import { resolveManifestResource, STATIC_MANIFEST_URL, validateManifest } from '../inference/modelManifest';
import {
  ACTIVE_MODEL_URL, JSON_MIME_TYPE, MODEL_CACHE_NAME, MODEL_CACHE_PATH_PREFIX, MODEL_RESOURCE_EXTENSIONS, type ModelResourceKind,
} from './offline.constants';
import { isTrustedStorageUrl } from './trustedStorage';

/** Manifest of the model currently published by the API; the packaged `STATIC_MANIFEST_URL` is its fallback. */
export const API_MANIFEST_URL = apiUrl(API_ROUTES.modelLatest);
const NOT_FOUND = 404;

/** Same-origin URL of a verified resource in `MODEL_CACHE_NAME`, named by the content hash of the model. */
export function modelResource(hash: string, kind: ModelResourceKind): string {
  return `${MODEL_CACHE_PATH_PREFIX}${hash}.${MODEL_RESOURCE_EXTENSIONS[kind]}`;
}

function safeResource(path: string, manifestUrl: string): string {
  const url = new URL(resolveManifestResource(path, manifestUrl, self.location.origin));
  if (!isTrustedStorageUrl(url)) throw new Error('Untrusted model origin.');
  return url.href;
}
async function hash(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
/** One class per non-blank line of the labels file. */
function countLabels(labels: string): number {
  return labels.split(MODEL_LABELS_LINE_SEPARATOR).filter((label) => label.trim()).length;
}

/**
 * Discover size and compatibility without downloading model weights. The API manifest falls back to the
 * packaged one when the API is unreachable, missing, or answers with the app shell (static previews).
 */
export async function availableManifest(manifestUrl = API_MANIFEST_URL): Promise<{ manifest: ModelManifest; base: string }> {
  let manifestResponse: Response;
  try { manifestResponse = await fetch(manifestUrl, { cache: 'no-store' }); }
  catch (error) {
    if (manifestUrl !== API_MANIFEST_URL) throw error;
    manifestUrl = STATIC_MANIFEST_URL;
    // Default cache mode on purpose: offline, the HTTP cache may still hold the packaged manifest.
    manifestResponse = await fetch(manifestUrl);
  }
  if (manifestUrl === API_MANIFEST_URL && (manifestResponse.status === NOT_FOUND || manifestResponse.ok && !manifestResponse.headers.get('Content-Type')?.includes(JSON_MIME_TYPE))) {
    manifestUrl = STATIC_MANIFEST_URL;
    manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
  }
  if (!manifestResponse.ok) throw new Error('Model manifest unavailable.');
  const manifest = validateManifest(await manifestResponse.json());
  const base = new URL(manifestUrl, self.location.origin).href;
  return { manifest, base };
}

/**
 * Manifest a page asked the installer to use: the published one by default, otherwise a same-origin path or
 * one of the configured manifests. Anything else is rejected before a request is made.
 */
export function requestedManifestUrl(value: string | undefined): string {
  if (value === undefined) return API_MANIFEST_URL;
  const configured = value === API_MANIFEST_URL || value === STATIC_MANIFEST_URL;
  if (!configured && !isSameOriginPath(value)) throw new Error('Invalid manifest URL.');
  return value;
}
/** Resolved rather than prefix-checked: "//host" and "/\host" both start with "/" yet point at another origin. */
function isSameOriginPath(value: string): boolean {
  if (!value.startsWith('/')) return false;
  try { return new URL(value, self.location.origin).origin === self.location.origin; } catch { return false; }
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
  if (countLabels(labels) !== manifest.num_classes) throw new Error('Model labels mismatch.');
  const cache = await caches.open(MODEL_CACHE_NAME);
  const previous = await cache.match(ACTIVE_MODEL_URL);
  let previousHash: string | undefined;
  if (previous) {
    try { previousHash = validateManifest(await previous.json()).sha256; } catch { /* Ignore an invalid old pointer when installing a verified replacement. */ }
  }
  const active = { ...manifest, model_file: modelResource(manifest.sha256, 'model'), labels_file: modelResource(manifest.sha256, 'labels') };
  await cache.put(active.model_file, new Response(buffer));
  await cache.put(active.labels_file, new Response(labels));
  await cache.put(ACTIVE_MODEL_URL, Response.json(active));
  for (const key of await cache.keys()) {
    const url = new URL(key.url);
    if (url.pathname !== ACTIVE_MODEL_URL && !url.pathname.includes(manifest.sha256) && !(previousHash && url.pathname.includes(previousHash))) {
      // Cleanup is optional; a failed cleanup must not report a verified installation as failed.
      try { await cache.delete(key); } catch { break; }
    }
  }
  return active;
}

/** Cache presence alone is insufficient: verify bytes again before offline inference. */
export async function activeModel(): Promise<ModelManifest | null> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const pointer = await cache.match(ACTIVE_MODEL_URL);
  if (!pointer) return null;
  try {
    const manifest = validateManifest(await pointer.json());
    const model = await cache.match(modelResource(manifest.sha256, 'model'));
    const labels = await cache.match(modelResource(manifest.sha256, 'labels'));
    if (!model || !labels) return null;
    const buffer = await model.arrayBuffer();
    if (buffer.byteLength !== manifest.size_bytes || await hash(buffer) !== manifest.sha256 || countLabels(await labels.text()) !== manifest.num_classes) return null;
    return manifest;
  } catch { return null; }
}
