import { API_ROUTES, apiFetch } from '../../config/api';
import { AUDIO_UPLOAD_MIME_TYPE, audioObjectPath, SYNC_BATCH_SIZE } from '../../config/contract';
import { config } from '../../config/env';
import { acknowledgedIds, sharesMap } from './queuePolicy';
import { acknowledge, getAudio, getSettings, listDetections } from './queueStore';
import { JSON_HEADERS, SYNC_LOCK_NAME } from './offline.constants';
import { isTrustedStorageUrl } from './trustedStorage';
import type { StoredDetection, SyncSession } from './types';

/** Signed Storage uploads overwrite the same object, so a retry after a lost acknowledgement cannot fail. */
const UPSERT_HEADERS = { 'x-upsert': 'true' } as const;
const MILLISECONDS_PER_SECOND = 1000;

function payload(row: StoredDetection, shared: boolean, audioPath?: string): object {
  return { id: row.id, species: row.species, confidence: row.confidence, status: row.status, recorded_at: row.recorded_at, location: row.location, model_version: row.model_version, ...(audioPath ? { audio_path: audioPath } : {}), ...(row.siteId ? { site_id: row.siteId } : {}), shared };
}
async function send(rows: StoredDetection[], session: SyncSession, audioPath?: string): Promise<string[]> {
  // Read at the moment of sending: the person's current answer applies to everything still on the phone.
  const shared = sharesMap(await getSettings());
  const response = await apiFetch(API_ROUTES.detectionsBatch, {
    method: 'POST', token: session.accessToken, headers: JSON_HEADERS,
    body: JSON.stringify({ detections: rows.map((row) => payload(row, shared, audioPath)) }),
  });
  return acknowledgedIds(await response.json(), rows.map((row) => row.id));
}
function isExpired(session: SyncSession): boolean {
  return session.expiresAt * MILLISECONDS_PER_SECOND <= Date.now();
}
async function sessionFor(userId: string, requireConsent = false): Promise<SyncSession | null> {
  const settings = await getSettings();
  const session = settings.session;
  if (!session || session.userId !== userId || isExpired(session) || (requireConsent && !settings.audioConsent)) return null;
  return session;
}
function uploadAuthorization(result: unknown, expectedPath: string): { uploadUrl: URL; audioPath: string } {
  if (!result || typeof result !== 'object' || !('upload_url' in result) || typeof result.upload_url !== 'string' || !('audio_path' in result) || result.audio_path !== expectedPath) throw new Error('Invalid upload authorization.');
  const uploadUrl = new URL(result.upload_url, self.location.origin);
  if (!isTrustedStorageUrl(uploadUrl)) throw new Error('Untrusted upload origin.');
  return { uploadUrl, audioPath: expectedPath };
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
      const batch = records.slice(offset, offset + SYNC_BATCH_SIZE).filter((row) => !row.metadataSynced);
      if (batch.length) await acknowledge(await send(batch, current));
    }
    const audioRecords = (await listDetections()).filter((row) => row.owner === session.userId && row.location && row.audioId && row.metadataSynced);
    for (const row of audioRecords) {
      const current = await sessionFor(session.userId, true);
      if (!current || !row.audioId) return;
      const audio = await getAudio(row.audioId);
      if (!audio) throw new Error('Queued audio is missing.');
      const signed = await apiFetch(API_ROUTES.detectionAudioUrl(row.id), {
        method: 'POST', token: current.accessToken, headers: JSON_HEADERS,
        body: JSON.stringify({ content_type: AUDIO_UPLOAD_MIME_TYPE, size_bytes: audio.bytes }),
      });
      const { uploadUrl, audioPath } = uploadAuthorization(await signed.json(), audioObjectPath(current.userId, row.id));
      if (!await sessionFor(session.userId, true)) return;
      // The signed URL is the credential; the API token must not travel to Storage.
      const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': AUDIO_UPLOAD_MIME_TYPE, ...UPSERT_HEADERS }, body: audio.blob, signal: AbortSignal.timeout(config.apiTimeoutMs) });
      if (!upload.ok) throw new Error('Audio upload failed.');
      const finalSession = await sessionFor(session.userId, true);
      if (!finalSession) return;
      await acknowledge(await send([row], finalSession, audioPath), true);
    }
  };
  if ('locks' in navigator) await navigator.locks.request(SYNC_LOCK_NAME, run);
  else await run();
}
