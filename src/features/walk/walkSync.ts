/**
 * Upload of walks to the account (ADR-35). Runs inside the synchronization lock, after the detections, and only
 * while the person keeps the permission on. A walk is marked as saved only with the server's answer, and only if
 * it did not change meanwhile; a repeated upload of the same walk stores nothing new (its id comes from the phone).
 */
import { ApiError } from '../../config/api';
import { getSettings, listDetections, listHistory } from '../offline/queueStore';
import type { OfflineSettings, StoredWalk, SyncSession, TrackPoint } from '../offline/types';
import { putWalk, type WalkUpload } from './walksApi';
import { toPins, type Pin } from './walkPins';
import { listWalks, updateWalk } from './walkStore';
import { walkEnd } from './walkSummary';

const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_INSUFFICIENT_STORAGE = 507;
const MILLISECONDS_PER_SECOND = 1000;

/** Whether the person chose to save walks in their account; until they say yes, every path stays on the phone. */
export function savesWalks(settings: Pick<OfflineSettings, 'saveWalks'>): boolean {
  return settings.saveWalks === true;
}

/** The session walks may be uploaded with right now: the same account, not expired, and with the permission still given. */
function uploadSession(settings: OfflineSettings, userId: string): SyncSession | null {
  const session = settings.session;
  if (!session || session.userId !== userId || session.expiresAt * MILLISECONDS_PER_SECOND <= Date.now() || !savesWalks(settings)) return null;
  return session;
}

/**
 * Walks that may go to the account of `userId`, with the moment each ended: not sent yet, finished, with a path,
 * and started with that account. Walks started without an account, or before walks recorded one, go to the account
 * that turns the permission on, as songs without an owner do when they are claimed.
 */
export function walksToUpload(walks: readonly StoredWalk[], userId: string, pins: readonly Pick<Pin, 'recordedAt'>[], now: number): { walk: StoredWalk; endedAt: number }[] {
  return walks.flatMap((walk) => {
    if ((walk.account ?? 'pending') !== 'pending' || walk.track.length === 0 || (walk.owner && walk.owner !== userId)) return [];
    const endedAt = walkEnd(walk, pins, now);
    return endedAt === null ? [] : [{ walk, endedAt }];
  });
}

/** What the API receives: the times of the path only when every point has one, and an end no earlier than the last of them. */
export function walkUpload(walk: StoredWalk, endedAt: number): WalkUpload {
  const startedAt = Date.parse(walk.startedAt);
  const timed = walk.track.every((point) => point.length === 3);
  const track: TrackPoint[] = walk.track.map((point) => (timed ? point : [point[0], point[1]]));
  const lastSecond = timed ? Math.max(0, ...walk.track.map((point) => point[2] ?? 0)) : 0;
  return { name: walk.name ?? null, startedAt, endedAt: Math.max(endedAt, startedAt + lastSecond * MILLISECONDS_PER_SECOND), track };
}

/** `full`: the account's quota is used up, so this walk and the rest wait. */
async function upload(walk: StoredWalk, endedAt: number, session: SyncSession): Promise<'saved' | 'phoneOnly' | 'full'> {
  try {
    await putWalk(session.accessToken, walk.id, walkUpload(walk, endedAt));
    return 'saved';
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_INSUFFICIENT_STORAGE) return 'full';
    // Another account's identifier, or a walk the server will never accept: asking again would change nothing.
    if (error instanceof ApiError && (error.status === HTTP_CONFLICT || error.status === HTTP_UNPROCESSABLE)) return 'phoneOnly';
    throw error;
  }
}

/** Uploads the finished walks the account does not have yet. The permission is read again before every walk. */
export async function uploadWalks(userId: string): Promise<void> {
  if (!uploadSession(await getSettings(), userId)) return;
  const pins = toPins(await listDetections(), await listHistory());
  for (const { walk, endedAt } of walksToUpload(await listWalks(), userId, pins, Date.now())) {
    const session = uploadSession(await getSettings(), userId);
    if (!session) return;
    const outcome = await upload(walk, endedAt, session);
    if (outcome === 'full') return;
    // A walk renamed while it was being sent stays pending, so its new name goes next time.
    await updateWalk(walk.id, { account: outcome, owner: userId }, walk);
  }
}
