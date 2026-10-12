import { useEffect, useState } from 'react';
import { useQueueVersion } from '../offline/useQueueVersion';
import { listReviews } from './reviewStore';
import type { StoredReview } from './types';

const NO_REVIEWS: ReadonlyMap<string, StoredReview> = new Map();

/**
 * The verdicts kept on this phone, by detection id; read again after every new verdict or synchronization.
 * Null while the first read is in progress, so nothing is shown as unreviewed by mistake.
 */
export function useReviews(): ReadonlyMap<string, StoredReview> | null {
  const version = useQueueVersion('reviews');
  const [reviews, setReviews] = useState<ReadonlyMap<string, StoredReview> | null>(() => (typeof indexedDB === 'undefined' ? NO_REVIEWS : null));

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    // A store that cannot be read leaves the records as the model gave them rather than hiding them.
    listReviews().then((stored) => { if (active) setReviews(new Map(stored.map((review) => [review.id, review]))); })
      .catch(() => { if (active) setReviews(NO_REVIEWS); });
    return () => { active = false; };
  }, [version]);

  return reviews;
}
