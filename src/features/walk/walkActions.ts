/**
 * What a person can do with one walk: rename it, delete it, and take it away as GPX or CSV. A walk on this phone
 * is handled here first, so renaming and exporting work offline; one that is only in the account needs a connection.
 */
import { saveFile } from '../../shared/download';
import { scheduleSynchronization } from '../offline/offlineClient';
import { getSettings, listDetections, listHistory } from '../offline/queueStore';
import { listReviews } from '../review/reviewStore';
import { CSV_MIME_TYPE, recordsCsv, walkRecords } from './walkCsv';
import { GPX_MIME_TYPE, walkGpx, type GpxWaypoint } from './walkGpx';
import { deleteAccountWalk, exportAccountCsv, renameAccountWalk } from './walksApi';
import { deleteWalk, updateWalk } from './walkStore';
import type { WalkDetailView } from './useWalks';
import { walkFileName } from './walkText';

/** Application named in exported files. */
const GPX_CREATOR = 'Trino';

/**
 * Renames a walk. On the phone the name is stored at once; if the account holds the walk too, it is renamed there
 * now when possible, or the walk waits to be sent again with its new name.
 */
export async function renameWalk(walk: WalkDetailView, name: string | null, token: string | null, online: boolean): Promise<void> {
  if (!walk.local) {
    if (!token) throw new Error('No session.');
    await renameAccountWalk(token, walk.id, name);
    return;
  }
  if (walk.local.inAccount || walk.local.account === 'saved') {
    if (token && online) {
      try {
        await renameAccountWalk(token, walk.id, name);
        await updateWalk(walk.id, { name });
        return;
      } catch {
        // Falls back to sending the walk again with its new name, which also renames it.
      }
    }
    await updateWalk(walk.id, { name, account: 'pending' });
    void scheduleSynchronization().catch(() => undefined);
    return;
  }
  await updateWalk(walk.id, { name });
  if ((walk.local.account ?? 'pending') === 'pending') void scheduleSynchronization().catch(() => undefined);
}

/** Deletes a walk everywhere it is. If the account cannot delete it now, the phone keeps it too (and this throws). */
export async function removeWalk(walk: WalkDetailView, token: string | null): Promise<void> {
  if (walk.where === 'both' || walk.where === 'account') {
    if (!token) throw new Error('No session.');
    await deleteAccountWalk(token, walk.id);
  }
  if (walk.local) await deleteWalk(walk.id);
}

/** Saves the GPX of a walk; `describe` names each waypoint in the person's language. */
export function downloadGpx(walk: WalkDetailView, title: string, describe: (place: WalkDetailView['places'][number]) => Pick<GpxWaypoint, 'name' | 'description'>): string {
  const waypoints = walk.places.map((place) => ({ latitude: place.latitude, longitude: place.longitude, time: place.firstAt, ...describe(place) }));
  const fileName = walkFileName(title, walk.startedAt, 'gpx');
  saveFile(new Blob([walkGpx({ name: title, startedAt: walk.startedAt, track: walk.track, waypoints, creator: GPX_CREATOR })], { type: GPX_MIME_TYPE }), fileName);
  return fileName;
}

/**
 * Saves the CSV of a walk's records: built on the phone when the walk is here, otherwise asked of the account.
 * Resolves with the file name and whether the account cut the file at its row limit.
 */
export async function downloadCsv(walk: WalkDetailView, title: string, token: string | null, now: number): Promise<{ fileName: string; truncated: boolean }> {
  const fileName = walkFileName(title, walk.startedAt, 'csv');
  if (walk.local) {
    const [pending, history, reviews, settings] = await Promise.all([listDetections(), listHistory(), listReviews(), getSettings()]);
    const verdicts = new Map(reviews.map((review) => [review.id, review]));
    const records = walkRecords(pending, history, verdicts, settings.sites ?? [], walk.startedAt, walk.endedAt ?? now);
    saveFile(new Blob([recordsCsv(records)], { type: CSV_MIME_TYPE }), fileName);
    return { fileName, truncated: false };
  }
  if (!token) throw new Error('No session.');
  const { blob, truncated } = await exportAccountCsv(token, walk.id);
  saveFile(blob, fileName);
  return { fileName, truncated };
}
