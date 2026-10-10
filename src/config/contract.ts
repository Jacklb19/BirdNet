/**
 * Domain rules shared with the API. Each value mirrors `backend/birdnet_api/domain.py`; changing one side
 * without the other makes the server reject valid records, so keep them in step.
 */

/** Table 7 of the specification: below `discardBelow` nothing is kept; from `confirmedFrom` it is confirmed locally. */
export const CONFIDENCE_THRESHOLDS = Object.freeze({ discardBelow: 0.45, confirmedFrom: 0.8 });

/**
 * Coordinates are rounded to this many decimals before they are stored or sent (ADR-22: fine enough to pin a song on
 * the path of a walk, while the raw device coordinate still never leaves the phone).
 */
export const LOCATION_GRID_DECIMALS = 4;

/** Approximate size of the resulting cell (10^-4 degrees of latitude ≈ 11 m), as explained to people. */
export const APPROX_CELL_METERS = 10;

export const FIELD_LIMITS = Object.freeze({ speciesName: 200, modelVersion: 200, siteName: 80, alias: 40 });

/** Maximum detections per synchronization request. */
export const SYNC_BATCH_SIZE = 50;

export const AUDIO_UPLOAD_MIME_TYPE = 'audio/wav';

/** Storage object key the API issues for a detection's audio fragment. */
export function audioObjectPath(userId: string, detectionId: string): string {
  return `${userId}/${detectionId}.wav`;
}

/** Profile photo: a square WebP the client resizes before upload, kept under the API's size limit. */
export const AVATAR_UPLOAD = Object.freeze({ mimeType: 'image/webp', sidePx: 256, quality: 0.85, maxBytes: 200_000 });

/** Storage object key the API accepts for the caller's profile photo. */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.webp`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Statistic and map periods. `days: null` is the whole record. Order is the order shown to people. */
export const PERIODS = Object.freeze([
  { value: 'week', days: 7 },
  { value: 'month', days: 30 },
  { value: 'year', days: 365 },
  { value: 'all', days: null },
] as const);

export type Period = (typeof PERIODS)[number]['value'];
export const DEFAULT_PERIOD: Period = 'month';

export function isPeriod(value: unknown): value is Period {
  return PERIODS.some((period) => period.value === value);
}

export function periodDays(period: Period): number | null {
  return PERIODS.find((entry) => entry.value === period)?.days ?? null;
}

/** Verification states the API reports for a cloud detection. */
export const DETECTION_STATUSES = Object.freeze(['confirmed', 'provisional', 'verified', 'corrected'] as const);
export type DetectionStatus = (typeof DETECTION_STATUSES)[number];

export function isDetectionStatus(value: unknown): value is DetectionStatus {
  return DETECTION_STATUSES.includes(value as DetectionStatus);
}

/** Hours in the per-hour activity series returned by the statistics endpoint. */
export const HOURS_PER_DAY = 24;
