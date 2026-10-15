/**
 * Verified installation of the second acoustic model (ADR-31), next to the first in the model cache. It is
 * downloaded only when a person asks for it, and it follows the same rule: nothing is used until every byte has
 * been checked, and it is checked again each time before listening.
 *
 * It can arrive in two ways. This worker downloads it piece by piece while the app is open (`downloadAlternate`),
 * or, where the browser has Background Fetch, the browser itself downloads the files with the app closed and
 * hands them over when they are complete (`prepareAlternateFetch`, then `installFetchedAlternate`).
 */
import type { AlternateModel } from '../inference/inference.types';
import { alternateBytes, validateAlternate } from '../inference/modelManifest';
import { availableManifest, countLabels, modelResource, safeResource } from './modelCache';
import { ALTERNATE_MODEL_URL, ALTERNATE_PENDING_URL, MODEL_CACHE_NAME, type AlternateFetchPlan } from './offline.constants';
import { dropPartials, fetchVerified, hash } from './verifiedDownload';

/** The second model as published and where each of its files comes from. */
interface Published {
  readonly model: AlternateModel;
  readonly parts: readonly string[];
  readonly geo: string;
  readonly labels: string;
}

/**
 * What a background download was started for. The labels are a small text, read before the download is handed
 * over and kept here: the browser then downloads exactly the bytes whose size was published, which is the size
 * it is told to expect.
 */
interface PendingFetch {
  readonly model: AlternateModel;
  readonly parts: readonly string[];
  readonly geo: string;
  readonly labels: string;
}

/** A downloaded file as Background Fetch hands it over. */
export interface FetchedRecord {
  readonly request: { readonly url: string };
  readonly responseReady: Promise<Response>;
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

/** The published second model and the address of each of its files, refused unless they are on trusted storage. */
async function published(): Promise<Published> {
  const { manifest, base } = await availableManifest();
  const model = manifest.alternate;
  if (!model) throw new Error('No second model is published.');
  return {
    model, parts: model.model_files.map((file) => safeResource(file, base)),
    geo: safeResource(model.geo_model_file, base), labels: safeResource(model.labels_file, base),
  };
}

async function readLabels(url: string, model: AlternateModel): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Model labels unavailable.');
  const labels = await response.text();
  if (countLabels(labels) !== model.num_classes) throw new Error('Model labels mismatch.');
  return labels;
}

/** Stores verified files as the installation in use; the pointer is written last, and what it replaces is removed. */
async function install(cache: Cache, model: AlternateModel, weights: Uint8Array<ArrayBuffer>, geo: Uint8Array<ArrayBuffer>, labels: string): Promise<AlternateModel> {
  if (countLabels(labels) !== model.num_classes) throw new Error('Model labels mismatch.');
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
  // Cleanup is optional; a failed cleanup must not report a verified installation as failed.
  try {
    await dropPartials(cache, model.sha256);
    await dropPartials(cache, model.geo_sha256);
    if (previous && previous.sha256 !== model.sha256) await removeFiles(cache, previous.sha256);
  } catch { /* What is left stays until the next installation. */ }
  return active;
}

/**
 * Downloads the second model the published manifest describes, resuming what an earlier attempt left; the pointer
 * is written only once all is verified.
 */
export async function downloadAlternate(progress: (received: number, total: number) => void): Promise<AlternateModel> {
  const { model, parts, geo: geoUrl, labels: labelsUrl } = await published();
  const total = alternateBytes(model);
  let received = 0;
  const onBytes = (bytes: number): void => { received += bytes; progress(received, total); };
  progress(received, total);
  const cache = await caches.open(MODEL_CACHE_NAME);
  const weights = await fetchVerified(cache, parts, model.size_bytes, model.sha256, onBytes);
  const geo = await fetchVerified(cache, [geoUrl], model.geo_size_bytes, model.geo_sha256, onBytes);
  return install(cache, model, weights, geo, await readLabels(labelsUrl, model));
}

/**
 * What the browser has to download in the background for the second model. It is written down here, so the files
 * it later hands over are checked against what was asked for and not against whatever is published by then.
 */
export async function prepareAlternateFetch(): Promise<AlternateFetchPlan> {
  const { model, parts, geo, labels } = await published();
  const pending: PendingFetch = { model, parts, geo, labels: await readLabels(labels, model) };
  const cache = await caches.open(MODEL_CACHE_NAME);
  await cache.put(ALTERNATE_PENDING_URL, Response.json(pending));
  return { urls: [...parts, geo], total: alternateBytes(model) };
}

/** Whether a background download is still waiting for its files to be installed or discarded. */
export async function alternateFetchPending(): Promise<boolean> {
  return Boolean(await (await caches.open(MODEL_CACHE_NAME)).match(ALTERNATE_PENDING_URL));
}

/** Forgets a background download that will not be installed: it failed, was cancelled or was replaced. */
export async function forgetAlternateFetch(): Promise<void> {
  await (await caches.open(MODEL_CACHE_NAME)).delete(ALTERNATE_PENDING_URL);
}

function parsePending(value: unknown): PendingFetch {
  if (!value || typeof value !== 'object') throw new Error('No background download was asked for.');
  const pending = value as Partial<PendingFetch>;
  const parts: unknown = pending.parts;
  if (!Array.isArray(parts) || !parts.every((part) => typeof part === 'string') || typeof pending.geo !== 'string' || typeof pending.labels !== 'string') {
    throw new Error('No background download was asked for.');
  }
  return { model: validateAlternate(pending.model), parts, geo: pending.geo, labels: pending.labels };
}

/**
 * Installs the files a background download finished with. They are checked exactly like those this worker
 * downloads itself; anything else is discarded, and the person can ask for the model again.
 */
export async function installFetchedAlternate(records: readonly FetchedRecord[]): Promise<AlternateModel> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  try {
    const stored = await cache.match(ALTERNATE_PENDING_URL);
    const pending = parsePending(stored ? await stored.json() : null);
    const body = async (url: string): Promise<Uint8Array<ArrayBuffer>> => {
      const record = records.find((candidate) => candidate.request.url === url);
      if (!record) throw new Error('A file of the model was not downloaded.');
      const response = await record.responseReady;
      if (!response.ok) throw new Error('Model download failed.');
      return new Uint8Array(await response.arrayBuffer());
    };
    const { model } = pending;
    const weights = new Uint8Array(model.size_bytes);
    let offset = 0;
    for (const url of pending.parts) {
      const part = await body(url);
      if (offset + part.length > weights.length) throw new Error('Unexpected model size.');
      weights.set(part, offset);
      offset += part.length;
    }
    if (offset !== model.size_bytes || await hash(weights.buffer) !== model.sha256) throw new Error('Model integrity check failed.');
    const geo = await body(pending.geo);
    if (geo.length !== model.geo_size_bytes || await hash(geo.buffer) !== model.geo_sha256) throw new Error('Model integrity check failed.');
    return await install(cache, model, weights, geo, pending.labels);
  } finally {
    await cache.delete(ALTERNATE_PENDING_URL);
  }
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
