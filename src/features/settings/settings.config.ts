import { bytesToMib, DEFAULT_QUEUE_BYTES } from '../offline/offline.constants';

/**
 * Capacities offered for songs waiting to upload, in whole MiB (the unit the offline layer chooses limits in).
 * Doubling steps around the default: the smallest still holds dozens of doubtful audio fragments, the largest
 * covers weeks in the field without signal while staying far below what browsers grant a site.
 */
export const CAPACITY_OPTIONS_MIB: readonly number[] = Object.freeze([16, 32, bytesToMib(DEFAULT_QUEUE_BYTES), 128, 256]);

/** Queued space is shown to one decimal: a few pending songs (some KiB of metadata) would otherwise read as zero. */
export const USAGE_FRACTION_DIGITS = 1;

/** Download progress in whole percent: the byte counts next to it already give the finer detail. */
export const DOWNLOAD_PERCENT_DIGITS = 0;
