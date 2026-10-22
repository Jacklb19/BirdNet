import { API_ROUTES, apiFetch } from '../../config/api';
import { SYNC_BATCH_SIZE } from '../../config/contract';
import { acknowledgedIds, sharesMap } from './queuePolicy';
import { acknowledge, getSettings, listDetections } from './queueStore';
import { JSON_HEADERS, SYNC_LOCK_NAME } from './offline.constants';
import { syncNotes } from '../notes/noteSync';
import { uploadRecordings } from '../recordings/recordingSync';
import { syncReviews } from '../review/reviewSync';
import { uploadWalks } from '../walk/walkSync';
import type { StoredDetection, SyncSession } from './types';

const MILLISECONDS_PER_SECOND = 1000;

function payload(row: StoredDetection, shared: boolean): object {
  return { id: row.id, species: row.species, confidence: row.confidence, status: row.status, recorded_at: row.recorded_at, location: row.location, model_version: row.model_version, ...(row.siteId ? { site_id: row.siteId } : {}), shared };
}
async function send(rows: StoredDetection[], session: SyncSession): Promise<string[]> {
  // Read at the moment of sending: the person's current answer applies to everything still on the phone.
  const shared = sharesMap(await getSettings());
  const response = await apiFetch(API_ROUTES.detectionsBatch, {
    method: 'POST', token: session.accessToken, headers: JSON_HEADERS,
    body: JSON.stringify({ detections: rows.map((row) => payload(row, shared)) }),
  });
  return acknowledgedIds(await response.json(), rows.map((row) => row.id));
}
function isExpired(session: SyncSession): boolean {
  return session.expiresAt * MILLISECONDS_PER_SECOND <= Date.now();
}
async function sessionFor(userId: string): Promise<SyncSession | null> {
  const { session } = await getSettings();
  if (!session || session.userId !== userId || isExpired(session)) return null;
  return session;
}

/** Web Locks serialize foreground retries with Background Sync; UUIDs also protect the server. */
export async function synchronizeQueue(): Promise<void> {
  const run = async (): Promise<void> => {
    const settings = await getSettings();
    const session = settings.session;
    if (!session || isExpired(session)) return;
    const records = (await listDetections()).filter((row) => row.owner === session.userId && row.location);
    for (let offset = 0; offset < records.length; offset += SYNC_BATCH_SIZE) {
      const current = await sessionFor(session.userId);
      if (!current) return;
      await acknowledge(await send(records.slice(offset, offset + SYNC_BATCH_SIZE), current));
    }
    // After the detections, so a verdict or a clip is sent only once the server has its detection.
    await syncReviews(session.userId);
    await syncNotes(session.userId);
    await uploadRecordings(session.userId);
    // A walk only needs its own path; its songs are counted from the detections whenever it is read.
    await uploadWalks(session.userId);
  };
  if ('locks' in navigator) await navigator.locks.request(SYNC_LOCK_NAME, run);
  else await run();
}
