/**
 * Verified installation of the second acoustic model (ADR-31), next to the first in the model cache. It is
 * downloaded only when a person asks for it, and it follows the same rule: nothing is used until every byte has
 * been checked, and it is checked again each time before listening.
 */
import type { AlternateModel } from '../inference/inference.types';
import { validateAlternate } from '../inference/modelManifest';
import { availableManifest, countLabels, fetchVerified, hash, modelResource, safeResource } from './modelCache';
import { ALTERNATE_MODEL_URL, MODEL_CACHE_NAME } from './offline.constants';

/** Bytes the download of the second model transfers: the acoustic model and its geographic model. */
export function alternateBytes(model: Pick<AlternateModel, 'size_bytes' | 'geo_size_bytes'>): number {
  return model.size_bytes + model.geo_size_bytes;
}

async function installed(cache: Cache): Promise<AlternateModel | null> {
  const pointer = await cache.match(ALTERNATE_MODEL_URL);
  if (!pointer) return null;
  try { return validateAlternate(await pointer.json()); } catch { return null; }
}

async function removeFiles(cache: Cache, sha256: string): Promise<void> {
  for (const key of await cache.keys()) {
    if (new URL(key.url).pathname.includes(sha256)) await cache.delete(key);
  }
}

/** Downloads the second model the published manifest describes; the pointer is written only once all is verified. */
export async function downloadAlternate(progress: (received: number, total: number) => void): Promise<AlternateModel> {
  const { manifest, base } = await availableManifest();
  const model = manifest.alternate;
  if (!model) throw new Error('No second model is published.');
  const total = alternateBytes(model);
  let received = 0;
  const onBytes = (bytes: number): void => { received += bytes; progress(received, total); };
  progress(received, total);
  const weights = await fetchVerified(model.model_files.map((file) => safeResource(file, base)), model.size_bytes, model.sha256, onBytes);
  const geo = await fetchVerified([safeResource(model.geo_model_file, base)], model.geo_size_bytes, model.geo_sha256, onBytes);
  const labelsResponse = await fetch(safeResource(model.labels_file, base), { cache: 'no-store' });
  if (!labelsResponse.ok) throw new Error('Model labels unavailable.');
  const labels = await labelsResponse.text();
  if (countLabels(labels) !== model.num_classes) throw new Error('Model labels mismatch.');
  const cache = await caches.open(MODEL_CACHE_NAME);
  const previous = await installed(cache);
  // The joined file is stored as one resource, so what listens reads it like any other model.
  const active: AlternateModel = {
    ...model, model_files: [modelResource(model.sha256, 'model')], labels_file: modelResource(model.sha256, 'labels'),
    geo_model_file: modelResource(model.sha256, 'geo'),
  };
  await cache.put(modelResource(model.sha256, 'model'), new Response(weights));
  await cache.put(active.labels_file, new Response(labels));
  await cache.put(active.geo_model_file, new Response(geo));
  await cache.put(ALTERNATE_MODEL_URL, Response.json(active));
  if (previous && previous.sha256 !== model.sha256) {
    // Cleanup is optional; a failed cleanup must not report a verified installation as failed.
    try { await removeFiles(cache, previous.sha256); } catch { /* The old files stay until the next installation. */ }
  }
  return active;
}

/** Cache presence alone is insufficient: verify bytes again before offline inference. */
export async function activeAlternate(): Promise<AlternateModel | null> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const model = await installed(cache);
  if (!model) return null;
  try {
    const weights = await cache.match(modelResource(model.sha256, 'model'));
    const labels = await cache.match(modelResource(model.sha256, 'labels'));
    const geo = await cache.match(modelResource(model.sha256, 'geo'));
    if (!weights || !labels || !geo) return null;
    const buffer = await weights.arrayBuffer();
    if (buffer.byteLength !== model.size_bytes || await hash(buffer) !== model.sha256 || countLabels(await labels.text()) !== model.num_classes) return null;
    const geoBuffer = await geo.arrayBuffer();
    if (geoBuffer.byteLength !== model.geo_size_bytes || await hash(geoBuffer) !== model.geo_sha256) return null;
    return model;
  } catch { return null; }
}

/** Frees the space of the second model; the pointer goes first so a half-removed installation is never used. */
export async function removeAlternate(): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const model = await installed(cache);
  await cache.delete(ALTERNATE_MODEL_URL);
  if (model) await removeFiles(cache, model.sha256);
}
