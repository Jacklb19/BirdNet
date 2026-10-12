/**
 * What a verdict does to the records kept on the phone. The stored detection is never rewritten: it is what the
 * model said, and synchronization sends it as such. The verdict is applied when the records are read.
 */
import { FIELD_LIMITS } from '../../config/contract';
import type { ReviewAction, StoredReview } from './types';

export type Verdict = Pick<StoredReview, 'action' | 'species'>;
export type ReviewIndex = ReadonlyMap<string, Verdict>;

/** A verdict as it may be stored: a correction names a species, and nothing else does. */
export function isValidVerdict(action: ReviewAction, species: string | null): boolean {
  if (action !== 'correct') return species === null;
  return species !== null && species.trim() === species && species.length > 0 && species.length <= FIELD_LIMITS.speciesName;
}

/**
 * The verdict to store when a person corrects a detection of `modelSpecies` to `species`: naming the species the
 * model already gave is a confirmation, which is also how the server treats it.
 */
export function correctionVerdict(species: string, modelSpecies: string): Verdict {
  return species === modelSpecies ? { action: 'confirm', species: null } : { action: 'correct', species };
}

/**
 * The records that count as presence: discarded ones are left out and corrected ones carry the species the
 * person heard. For the album, the totals and the map of the person.
 */
export function applyReviews<T extends { readonly id: string; readonly species: string }>(records: readonly T[], reviews: ReviewIndex): T[] {
  return records.flatMap((record) => {
    const review = reviews.get(record.id);
    if (review?.action === 'discard') return [];
    return review?.action === 'correct' && review.species ? [{ ...record, species: review.species }] : [record];
  });
}

/** Body of the review request for a stored verdict. */
export function reviewPayload(review: Verdict): { action: ReviewAction; species?: string } {
  return review.action === 'correct' && review.species ? { action: review.action, species: review.species } : { action: review.action };
}
