import { API_ROUTES, ApiError, apiFetch } from '../../config/api';
import { config } from '../../config/env';
import { JSON_HEADERS } from '../offline/offline.constants';
import { getSettings, listHistory } from '../offline/queueStore';
import { isTrustedStorageUrl } from '../offline/trustedStorage';
import type { OfflineSettings, SyncSession } from '../offline/types';
import { listRecordings, markRecording } from './recordingStore';
import { RECORDING_MAX_UPLOAD_BYTES, RECORDING_MIME_TYPE, recordingObjectPath } from './recordings.config';
import type { StoredRecording } from './types';

const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const HTTP_INSUFFICIENT_STORAGE = 507;
const MILLISECONDS_PER_SECOND = 1000;
/** Signed Storage uploads overwrite the same object, so a retry after a lost answer cannot fail. */
const UPSERT_HEADERS = { 'x-upsert': 'true' } as const;

/**
 * Whether the person's recordings go to their account (ADR-28). It is a choice they make explicitly: until they
 * have said yes, every clip stays on the phone.
 */
export function savesRecordings(settings: Pick<OfflineSettings, 'saveRecordings'>): boolean {
  return settings.saveRecordings === true;
}

/** The session clips may be uploaded with right now: the same account, not expired, and with the permission still given. */
function uploadSession(settings: OfflineSettings, userId: string): SyncSession | null {
  const session = settings.session;
  if (!session || session.userId !== userId || session.expiresAt * MILLISECONDS_PER_SECOND <= Date.now() || !savesRecordings(settings)) return null;
  return session;
}

function uploadAuthorization(result: unknown, expectedPath: string): URL {
  if (!result || typeof result !== 'object' || !('upload_url' in result) || typeof result.upload_url !== 'string' || !('recording_path' in result) || result.recording_path !== expectedPath) throw new Error('Invalid upload authorization.');
  const uploadUrl = new URL(result.upload_url, self.location.origin);
  if (!isTrustedStorageUrl(uploadUrl)) throw new Error('Untrusted upload origin.');
  return uploadUrl;
}

/** `full`: the account's quota is used up, so this clip and the rest wait. */
async function upload(clip: StoredRecording, session: SyncSession): Promise<'uploaded' | 'rejected' | 'full'> {
  if (clip.bytes > RECORDING_MAX_UPLOAD_BYTES) return 'rejected';
  const path = recordingObjectPath(session.userId, clip.id);
  try {
    const signed = await apiFetch(API_ROUTES.detectionRecordingUrl(clip.id), {
      method: 'POST', token: session.accessToken, headers: JSON_HEADERS, body: JSON.stringify({ content_type: RECORDING_MIME_TYPE, size_bytes: clip.bytes }),
    });
    const uploadUrl = uploadAuthorization(await signed.json(), path);
    // The signed URL is the credential; the API token must not travel to Storage.
    const sent = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': RECORDING_MIME_TYPE, ...UPSERT_HEADERS }, body: clip.blob, signal: AbortSignal.timeout(config.apiTimeoutMs) });
    if (!sent.ok) throw new Error('Recording upload failed.');
    await apiFetch(API_ROUTES.detectionRecording(clip.id), { method: 'PUT', token: session.accessToken, headers: JSON_HEADERS, body: JSON.stringify({ recording_path: path }) });
    return 'uploaded';
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_INSUFFICIENT_STORAGE) return 'full';
    // Not this account's detection, or a clip the server will not accept: asking again would change nothing.
    if (error instanceof ApiError && (error.status === HTTP_NOT_FOUND || error.status === HTTP_UNPROCESSABLE)) return 'rejected';
    throw error;
  }
}

/**
 * Uploads the clips still on the phone whose detection the server already has. Runs inside the synchronization
 * lock, after the detections themselves. The permission is read again before every clip, so turning it off
 * stops the uploads at once.
 */
export async function uploadRecordings(userId: string): Promise<void> {
  if (!uploadSession(await getSettings(), userId)) return;
  const acknowledged = new Set((await listHistory()).map((entry) => entry.id));
  const clips = (await listRecordings()).filter((clip) => clip.upload === 'pending' && acknowledged.has(clip.id));
  for (const clip of clips) {
    const session = uploadSession(await getSettings(), userId);
    if (!session) return;
    const outcome = await upload(clip, session);
    if (outcome === 'full') return;
    await markRecording(clip.id, outcome);
  }
}
