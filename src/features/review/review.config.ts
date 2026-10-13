/**
 * Settings of the review of detections by a person (RF-11): confirming, correcting or discarding what the model
 * said, after listening to the recording.
 */

/** IndexedDB database and store of the verdicts; a database of its own, for the reason given in `reviewStore.ts`. */
export const REVIEWS_DATABASE = 'trino-reviews-v1';
export const REVIEWS_STORE = 'reviews';

/** Species offered while the person types the name of the bird they actually heard. */
export const SPECIES_SEARCH_LIMIT = 8;

/** Likely birds of the place asked for to order the search: more than any place has, so none is left out. */
export const SPECIES_SEARCH_LIKELY_LIMIT = 2000;

/** Typing fewer characters than this would match most of the catalogue. */
export const SPECIES_SEARCH_MIN_CHARS = 2;
