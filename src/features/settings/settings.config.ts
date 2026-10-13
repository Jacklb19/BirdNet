import { bytesToMib, DEFAULT_QUEUE_BYTES } from '../offline/offline.constants';

/**
 * Capacities offered for songs waiting to upload, in whole MiB (the unit the offline layer chooses limits in).
 * A waiting song is a few hundred bytes of metadata, so the smallest already holds more than ten thousand of them
 * and the default covers weeks in the field without signal.
 */
export const CAPACITY_OPTIONS_MIB: readonly number[] = Object.freeze([4, 16, bytesToMib(DEFAULT_QUEUE_BYTES)]);

/** Queued space is shown to one decimal: a few pending songs (some KiB of metadata) would otherwise read as zero. */
export const USAGE_FRACTION_DIGITS = 1;

/** Download progress in whole percent: the byte counts next to it already give the finer detail. */
export const DOWNLOAD_PERCENT_DIGITS = 0;
