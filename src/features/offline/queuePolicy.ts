import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { AUDIO_UPLOAD_MIME_TYPE, LOCATION_GRID_DECIMALS } from '../../config/contract';
import { distanceMeters } from '../walk/walkGeometry';
import { MIN_QUEUE_BYTES, PLACE_RADIUS_METERS } from './offline.constants';
import type { ApproximateLocation, CachedSite, OfflineSettings, StoredDetection } from './types';

const MAX_ABS_LATITUDE = 90;
const MAX_ABS_LONGITUDE = 180;
const GRID_FACTOR = 10 ** LOCATION_GRID_DECIMALS;

/** Round before persistence; raw device coordinates must never enter the queue. */
export function approximateLocation(latitude: number, longitude: number): ApproximateLocation {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > MAX_ABS_LATITUDE || Math.abs(longitude) > MAX_ABS_LONGITUDE) {
    throw new Error('Invalid location.');
  }
  return { latitude: Math.round(latitude * GRID_FACTOR) / GRID_FACTOR, longitude: Math.round(longitude * GRID_FACTOR) / GRID_FACTOR };
}

/**
 * Cell a new detection is filed under (ADR-16, revised by ADR-22). The device position comes first, so songs are
 * pinned along the walk; without a position the active place gives its own cell, so a session indoors or without
 * GPS still has a location; with neither the record waits for a place to be assigned.
 */
export function recordingLocation(settings: Pick<OfflineSettings, 'activeSiteId' | 'sites'>, device: ApproximateLocation | null): ApproximateLocation | null {
  if (device) return approximateLocation(device.latitude, device.longitude);
  const site = settings.activeSiteId ? settings.sites?.find((candidate) => candidate.id === settings.activeSiteId) : undefined;
  return site ? approximateLocation(site.latitude, site.longitude) : null;
}

/**
 * Place a new detection counts for (ADR-25). The one chosen by hand comes first. Without one, the nearest saved
 * place within `PLACE_RADIUS_METERS` of where the song was heard, so places gather the walks through them
 * without the person choosing anything; a song heard far from every place belongs to none.
 */
export function recordingSite(settings: Pick<OfflineSettings, 'activeSiteId' | 'sites'>, location: ApproximateLocation | null): string | null {
  if (settings.activeSiteId) return settings.activeSiteId;
  if (!location) return null;
  let nearest: { readonly id: string; readonly meters: number } | null = null;
  for (const site of settings.sites ?? []) {
    const meters = distanceMeters([location.latitude, location.longitude], [site.latitude, site.longitude]);
    if (meters <= PLACE_RADIUS_METERS && (nearest === null || meters < nearest.meters)) nearest = { id: site.id, meters };
  }
  return nearest?.id ?? null;
}

/**
 * Whether the person's songs go to everyone's map (ADR-22). Sharing is a choice they make explicitly: until they
 * have answered, nothing is shared. It is read when a record is sent, so the current answer also covers what was
 * recorded before it.
 */
export function sharesMap(settings: Pick<OfflineSettings, 'shareMap'>): boolean {
  return settings.shareMap === true;
}

/**
 * Records that `assignSiteToUnlocated` may file under `site`: those still without a location that belong to
 * `accountId` or to nobody yet (they are claimed when the person signs in). A record with a device location keeps
 * it, and another account's records are never touched, because the site belongs to `accountId`.
 */
export function unlocatedAssignment<T extends Pick<StoredDetection, 'location' | 'owner' | 'siteId'>>(
  records: readonly T[], site: CachedSite, accountId: string,
): (T & { location: ApproximateLocation; siteId: string })[] {
  const location = approximateLocation(site.latitude, site.longitude);
  return records
    .filter((record) => record.location === null && (record.owner === null || record.owner === accountId))
    .map((record) => ({ ...record, location, siteId: site.id }));
}

/** Preserve every pending record by rejecting overflow before the transaction commits. */
export function assertQueueCapacity(current: number, addition: number, maximum: number): void {
  if (![current, addition, maximum].every(Number.isSafeInteger) || current < 0 || addition < 0 || maximum < MIN_QUEUE_BYTES || current + addition > maximum) {
    throw new Error('Queue capacity exceeded.');
  }
}

// Canonical RIFF/WAVE PCM layout: RIFF header, "fmt " chunk, "data" chunk. Every value below derives from the
// capture contract, so a change of sample rate cannot leave a stale header behind.
const CHUNK_HEADER_BYTES = 8;
const FOURCC_BYTES = 4;
const FMT_CHUNK_BYTES = 16;
const WAV_HEADER_BYTES = CHUNK_HEADER_BYTES + FOURCC_BYTES + CHUNK_HEADER_BYTES + FMT_CHUNK_BYTES + CHUNK_HEADER_BYTES;
const PCM_FORMAT = 1;
const WAV_CHANNELS = 1;
const BITS_PER_BYTE = 8;
const BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT;
const BITS_PER_SAMPLE = BYTES_PER_SAMPLE * BITS_PER_BYTE;
const BLOCK_ALIGN = WAV_CHANNELS * BYTES_PER_SAMPLE;
const BYTE_RATE = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE * BLOCK_ALIGN;
/** Signed PCM is asymmetric: -1 maps to the most negative value, +1 to the most positive one. */
const PCM_NEGATIVE_SCALE = 2 ** (BITS_PER_SAMPLE - 1);
const PCM_POSITIVE_SCALE = PCM_NEGATIVE_SCALE - 1;

/** WAV PCM16 is independent of the model's floating-point tensor representation. */
export function encodeAudio(samples: Float32Array): Blob {
  if (samples.length !== AUDIO_CONSTANTS.WINDOW_SAMPLES || samples.some((sample) => !Number.isFinite(sample))) throw new Error('Invalid audio.');
  const dataBytes = samples.length * BLOCK_ALIGN;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  let offset = 0;
  const fourcc = (value: string): void => { for (let index = 0; index < FOURCC_BYTES; index++) view.setUint8(offset + index, value.charCodeAt(index)); offset += FOURCC_BYTES; };
  const uint32 = (value: number): void => { view.setUint32(offset, value, true); offset += Uint32Array.BYTES_PER_ELEMENT; };
  const uint16 = (value: number): void => { view.setUint16(offset, value, true); offset += Uint16Array.BYTES_PER_ELEMENT; };
  fourcc('RIFF'); uint32(buffer.byteLength - CHUNK_HEADER_BYTES); fourcc('WAVE');
  fourcc('fmt '); uint32(FMT_CHUNK_BYTES); uint16(PCM_FORMAT); uint16(WAV_CHANNELS);
  uint32(AUDIO_CONSTANTS.TARGET_SAMPLE_RATE); uint32(BYTE_RATE); uint16(BLOCK_ALIGN); uint16(BITS_PER_SAMPLE);
  fourcc('data'); uint32(dataBytes);
  samples.forEach((sample, index) => {
    const value = Math.min(1, Math.max(-1, sample));
    view.setInt16(WAV_HEADER_BYTES + index * BYTES_PER_SAMPLE, Math.round(value * (value < 0 ? PCM_NEGATIVE_SCALE : PCM_POSITIVE_SCALE)), true);
  });
  return new Blob([buffer], { type: AUDIO_UPLOAD_MIME_TYPE });
}

/** Untrusted acknowledgements must identify only records in the submitted batch. */
export function acknowledgedIds(response: unknown, submitted: readonly string[]): string[] {
  if (!response || typeof response !== 'object' || !('accepted_ids' in response) || !('existing_ids' in response)) throw new Error('Invalid acknowledgement.');
  const accepted: unknown = response.accepted_ids;
  const existing: unknown = response.existing_ids;
  if (!Array.isArray(accepted) || !Array.isArray(existing)) throw new Error('Invalid acknowledgement.');
  const ids: unknown[] = [...accepted as unknown[], ...existing as unknown[]];
  if (ids.some((id) => typeof id !== 'string' || !submitted.includes(id))) throw new Error('Unexpected acknowledgement.');
  return [...new Set(ids as string[])];
}
