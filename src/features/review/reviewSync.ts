import { API_ROUTES, ApiError, apiFetch } from '../../config/api';
import { JSON_HEADERS } from '../offline/offline.constants';
import { getSettings, listHistory } from '../offline/queueStore';
import type { OfflineSettings, SyncSession } from '../offline/types';
import { reviewPayload } from './reviewPolicy';
import { listReviews, markReview } from './reviewStore';

const HTTP_NOT_FOUND = 404;
const MILLISECONDS_PER_SECOND = 1000;

function liveSession(settings: OfflineSettings, userId: string): SyncSession | null {
  const session = settings.session;
  return session && session.userId === userId && session.expiresAt * MILLISECONDS_PER_SECOND > Date.now() ? session : null;
}

/**
 * Sends the verdicts still on the phone whose detection the server already has. Runs inside the synchronization
 * lock, after the detections themselves. The request states the verdict as a whole, so repeating it after a
 * lost answer changes nothing.
 */
export async function syncReviews(userId: string): Promise<void> {
  const pending = (await listReviews()).filter((review) => review.sync === 'pending');
  if (pending.length === 0) return;
  const acknowledged = new Set((await listHistory()).map((entry) => entry.id));
  for (const review of pending.filter((candidate) => acknowledged.has(candidate.id))) {
    const session = liveSession(await getSettings(), userId);
    if (!session) return;
    try {
      await apiFetch(API_ROUTES.detection(review.id), { method: 'PATCH', token: session.accessToken, headers: JSON_HEADERS, body: JSON.stringify(reviewPayload(review)) });
      await markReview(review, 'done');
    } catch (error) {
      // Not a detection of this account: the verdict stays on the phone and is not asked again.
      if (!(error instanceof ApiError) || error.status !== HTTP_NOT_FOUND) throw error;
      await markReview(review, 'rejected');
    }
  }
}
