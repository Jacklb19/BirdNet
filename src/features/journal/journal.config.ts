export const JOURNAL_DATABASE = 'trino-field-journal-v1';
export const JOURNAL_CHANGED = 'trino-field-journal-changed';
export const JOURNAL_SYNC_LOCK = 'trino-field-journal-sync';
export const JOURNAL_PAGE_SIZE = 20;
export const JOURNAL_NAME_LIMIT = 80;
export const JOURNAL_NOTE_LIMIT = 500;
export const PHOTO_INPUT_MAX_BYTES = 10 * 1024 * 1024;
/** Images an observation photo may start from; it is always recoded to JPEG on the phone. */
export const OBSERVATION_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.85;
const ROOT = '/v1';
export const JOURNAL_ROUTES = {
  outing: `${ROOT}/outings`, observation: `${ROOT}/observations`, collection: `${ROOT}/collections`,
  wishlist: `${ROOT}/wishlist`, deletions: `${ROOT}/deletions`,
} as const;
