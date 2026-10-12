import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { FIELD_LIMITS } from '../../config/contract';
import { config } from '../../config/env';
import type { AlternateModel, ModelManifest } from './inference.types';

/** Manifest shipped with the app; used when the API does not publish one (local development, API outage). */
export const STATIC_MANIFEST_URL = `${config.modelAssetsBaseUrl}/manifest.json`;

/** Separator of the persisted model version `model_id:variant:sha256`. */
const MODEL_VERSION_SEPARATOR = ':';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_TEXT_FIELDS = ['model_id', 'variant', 'model_file', 'labels_file', 'updated_at'] as const;

/** Hash characters of each model kept in the version of two that decided together, so it fits the API field. */
const COMBINED_HASH_LENGTH = 16;
/** Joins the two models in each part of a combined version. */
const COMBINED_SEPARATOR = '+';
/** Parts of the model file a manifest may list; a file is split only to fit a storage limit. */
const MAX_MODEL_PARTS = 8;

type ModelIdentity = Pick<ModelManifest, 'model_id' | 'variant' | 'sha256'>;

/** Identifier stored with every detection so results can be traced to the exact model file. */
export function formatModelVersion(manifest: ModelIdentity): string {
  return [manifest.model_id, manifest.variant, manifest.sha256].join(MODEL_VERSION_SEPARATOR);
}

/** Version of a detection two models decided together: both identifiers and the start of both hashes. */
export function formatCombinedVersion(first: ModelIdentity, second: ModelIdentity): string {
  return [
    [first.model_id, second.model_id].join(COMBINED_SEPARATOR),
    [first.sha256, second.sha256].map((hash) => hash.slice(0, COMBINED_HASH_LENGTH)).join(COMBINED_SEPARATOR),
  ].join(MODEL_VERSION_SEPARATOR);
}

/** Bytes the one-time download transfers: the acoustic model plus, when published, the geographic one. */
export function downloadBytes(manifest: Pick<ModelManifest, 'size_bytes' | 'geo_size_bytes'>): number {
  return manifest.size_bytes + (manifest.geo_size_bytes ?? 0);
}

/** Different content hashes of either model mean a different installation, whatever the names say. */
export function sameInstallation(a: Pick<ModelManifest, 'sha256' | 'geo_sha256'>, b: Pick<ModelManifest, 'sha256' | 'geo_sha256'>): boolean {
  return a.sha256 === b.sha256 && a.geo_sha256 === b.geo_sha256;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates the description of a second model (ADR-31). It may take a lower sample rate than the capture
 * pipeline, which resamples the window for it, but it must analyse the same seconds.
 */
export function validateAlternate(value: unknown): AlternateModel {
  if (!value || typeof value !== 'object') throw new Error('Invalid alternate model.');
  const model = value as Partial<AlternateModel>;
  const files: unknown = model.model_files;
  const valid = isText(model.model_id) && isText(model.variant) && isText(model.labels_file) && isText(model.geo_model_file) &&
    Array.isArray(files) && files.length > 0 && files.length <= MAX_MODEL_PARTS && files.every(isText) &&
    typeof model.sha256 === 'string' && SHA256_PATTERN.test(model.sha256) &&
    typeof model.geo_sha256 === 'string' && SHA256_PATTERN.test(model.geo_sha256) &&
    Number.isSafeInteger(model.sample_rate) && (model.sample_rate ?? 0) > 0 && (model.sample_rate ?? 0) <= AUDIO_CONSTANTS.TARGET_SAMPLE_RATE &&
    model.window_seconds === AUDIO_CONSTANTS.WINDOW_DURATION_SEC &&
    model.window_samples === (model.sample_rate ?? 0) * AUDIO_CONSTANTS.WINDOW_DURATION_SEC &&
    Number.isInteger(model.num_classes) && (model.num_classes ?? 0) > 0 &&
    Number.isSafeInteger(model.size_bytes) && (model.size_bytes ?? 0) > 0 &&
    Number.isSafeInteger(model.geo_size_bytes) && (model.geo_size_bytes ?? 0) > 0 &&
    formatModelVersion(model as AlternateModel).length <= FIELD_LIMITS.modelVersion;
  if (!valid) throw new Error('Incompatible alternate model.');
  return model as AlternateModel;
}

/**
 * Validates a manifest from the network or the cache before anything trusts it: the audio contract must
 * match what the capture pipeline produces, and the resulting model version must fit the API field.
 */
export function validateManifest(value: unknown): ModelManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid manifest.');
  const manifest = value as Partial<ModelManifest>;
  const textFieldsPresent = REQUIRED_TEXT_FIELDS.every((key) => {
    const field: unknown = manifest[key];
    return typeof field === 'string' && field.length > 0;
  });
  if (!textFieldsPresent || typeof manifest.sha256 !== 'string' || !SHA256_PATTERN.test(manifest.sha256)) throw new Error('Incompatible manifest.');
  const compatible = manifest.sample_rate === AUDIO_CONSTANTS.TARGET_SAMPLE_RATE &&
    manifest.window_samples === AUDIO_CONSTANTS.WINDOW_SAMPLES &&
    manifest.window_seconds === AUDIO_CONSTANTS.WINDOW_DURATION_SEC &&
    Number.isInteger(manifest.num_classes) && (manifest.num_classes ?? 0) > 0 &&
    Number.isSafeInteger(manifest.size_bytes) && (manifest.size_bytes ?? 0) > 0 &&
    formatModelVersion(manifest as ModelManifest).length <= FIELD_LIMITS.modelVersion;
  if (!compatible) throw new Error('Incompatible manifest.');
  // The geographic model is all or nothing: a partial description would install a file nobody can verify.
  const geoFields = [manifest.geo_model_file, manifest.geo_sha256, manifest.geo_size_bytes];
  if (geoFields.some((field) => field !== undefined)) {
    const validGeo = typeof manifest.geo_model_file === 'string' && manifest.geo_model_file.length > 0 &&
      typeof manifest.geo_sha256 === 'string' && SHA256_PATTERN.test(manifest.geo_sha256) &&
      Number.isSafeInteger(manifest.geo_size_bytes) && (manifest.geo_size_bytes ?? 0) > 0;
    if (!validGeo) throw new Error('Incompatible manifest.');
  }
  if (manifest.alternate === undefined) return manifest as ModelManifest;
  // The second model is an extra: a description this version cannot use is left out, not a reason to refuse the first.
  const { alternate, ...main } = manifest;
  try { return { ...(main as ModelManifest), alternate: validateAlternate(alternate) }; }
  catch { return main as ModelManifest; }
}

/** Schemes a model resource may be fetched over; http only serves local development. */
const RESOURCE_PROTOCOLS: readonly string[] = ['https:', 'http:'];

/**
 * Resolves a manifest-relative resource path (model or labels) against the manifest location. A path that
 * resolves to another scheme (data:, blob:, javascript:) is refused, since the manifest is external input.
 */
export function resolveManifestResource(path: string, manifestUrl: string, origin: string): string {
  const url = new URL(path, new URL(manifestUrl, origin));
  if (!RESOURCE_PROTOCOLS.includes(url.protocol)) throw new Error('Invalid manifest resource.');
  return url.href;
}
