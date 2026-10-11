/** Settings of the species card, the album and the regional guide (ADR-17). */

/** Probable species of the region shown as empty album slots and offered in the regional guide. */
export const GUIDE_MAX_SPECIES = 150;

/** Downloads in flight while the guide is saved: enough to finish quickly, few enough not to swamp a phone link. */
export const GUIDE_CONCURRENCY = 4;

/**
 * Bytes one species adds to the guide, used only to tell the size before saving: a photo thumbnail
 * (`THUMBNAIL_WIDTH_PX`, about 60 kB as JPEG) plus a summary of a few kB.
 */
export const GUIDE_BYTES_PER_SPECIES = 70_000;

/** Stickers on one page of the album: two rows of three on a phone, three rows of three on the open book. */
export const ALBUM_PAGE_SLOTS = Object.freeze({ phone: 6, desktop: 9 });

/** Rings drawn on the spine of the album. */
export const ALBUM_BOOK_RINGS = 5;

/** Latest records listed on a species card. */
export const SPECIES_RECENT_RECORDS = 8;
