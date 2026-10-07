import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { FIELD_LIMITS } from '../../config/contract';
import { config } from '../../config/env';
import type { ModelManifest } from './inference.types';

/** Manifest shipped with the app; used when the API does not publish one (local development, API outage). */
export const STATIC_MANIFEST_URL = `${config.modelAssetsBaseUrl}/manifest.json`;

/** Separator of the persisted model version `model_id:variant:sha256`. */
const MODEL_VERSION_SEPARATOR = ':';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_TEXT_FIELDS = ['model_id', 'variant', 'model_file', 'labels_file', 'updated_at'] as const;

/** Identifier stored with every detection so results can be traced to the exact model file. */
export function formatModelVersion(manifest: Pick<ModelManifest, 'model_id' | 'variant' | 'sha256'>): string {
  return [manifest.model_id, manifest.variant, manifest.sha256].join(MODEL_VERSION_SEPARATOR);
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
  return manifest as ModelManifest;
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
