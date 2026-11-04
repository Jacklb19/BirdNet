/** Behavior of the account screen (the account rules shared with Supabase live in account.constants.ts). */

/** Refresh of the "synced N min ago" line; a minute is the finest unit it shows, so a faster tick changes nothing. */
export const SYNC_AGE_REFRESH_MS = 60_000;

/**
 * Birds pasted on the way in (ADR-45): common in Bogotá's gardens and parks, with photos in the index that ships with
 * the app, so the screen draws them without asking anyone else.
 */
export const ENTRANCE_BIRDS = Object.freeze(['Turdus fuscater', 'Colibri coruscans', 'Thraupis episcopus'] as const);
