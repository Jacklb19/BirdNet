/**
 * Settings of the saved recordings (ADR-28): the clip each song keeps on the phone and, when the person chooses
 * it, in their account. The upload limits mirror `backend/birdnet_api/domain.py`.
 */

/** IndexedDB database and store of the clips; a database of its own, for the reason given in `recordingStore.ts`. */
export const RECORDINGS_DATABASE = 'trino-recordings-v1';
export const RECORDINGS_STORE = 'recordings';

/** Container and media type of a clip: Opus in WebM, which every supported browser plays. */
export const RECORDING_MIME_TYPE = 'audio/webm';
export const RECORDING_CODEC = 'opus';

/**
 * Target bitrate of a clip. At 32 kbit/s Opus keeps the whole band a song occupies and a three-second clip
 * weighs some 12 kB, against 288 kB of the same window as WAV.
 */
export const RECORDING_BITRATE = 32_000;

/** Largest clip the API accepts (`MAX_RECORDING_BYTES`); a bigger one stays on the phone. */
export const RECORDING_MAX_UPLOAD_BYTES = 100_000;

/** Limit shown before the account answers with its real one (`RECORDING_QUOTA_BYTES` of the API, 50 MiB by default). */
export const ACCOUNT_RECORDINGS_DEFAULT_LIMIT_BYTES = 50 * 1024 * 1024;

/** Clips kept on the phone; beyond it the oldest are dropped (those already in the account stay there). */
export const LOCAL_RECORDINGS_MAX_BYTES = 100 * 1024 * 1024;

/**
 * A song is one run of detections of the same species: it ends after this much silence from that species, and
 * each run keeps a single clip, the one of its most confident window.
 */
export const SONG_GAP_MS = 15_000;

/** A bird that sings without pause starts a new song after this long, so a long session still keeps several clips. */
export const SONG_MAX_MS = 60_000;

/** Storage object key the API accepts for a detection's recording. */
export function recordingObjectPath(userId: string, detectionId: string): string {
  return `${userId}/${detectionId}.webm`;
}
