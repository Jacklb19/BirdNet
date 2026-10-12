import { API_ROUTES, apiFetch } from '../../config/api';
import { isTrustedStorageUrl } from '../offline/trustedStorage';

/** What the account's recordings take of its quota. */
export interface RecordingUsage {
  readonly recordings: number;
  readonly bytes: number;
  readonly limitBytes: number;
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function parseUsage(body: unknown): RecordingUsage {
  if (!body || typeof body !== 'object' || !('recordings' in body) || !('bytes' in body) || !('limit_bytes' in body) ||
      !isCount(body.recordings) || !isCount(body.bytes) || !isCount(body.limit_bytes)) throw new Error('Invalid recording usage.');
  return { recordings: body.recordings, bytes: body.bytes, limitBytes: body.limit_bytes };
}

export async function fetchRecordingUsage(token: string, signal?: AbortSignal): Promise<RecordingUsage> {
  const response = await apiFetch(API_ROUTES.meRecordings, { token, signal });
  return parseUsage(await response.json());
}

/** Deletes every recording of the account; resolves with how many there were. */
export async function deleteAccountRecordings(token: string): Promise<number> {
  const body: unknown = await (await apiFetch(API_ROUTES.meRecordings, { token, method: 'DELETE' })).json();
  if (!body || typeof body !== 'object' || !('deleted' in body) || !isCount(body.deleted)) throw new Error('Invalid answer.');
  return body.deleted;
}

export async function deleteAccountRecording(token: string, detectionId: string): Promise<void> {
  await apiFetch(API_ROUTES.detectionRecording(detectionId), { token, method: 'DELETE' });
}

/** Short-lived address the recording kept in the account is played from; only one in the project Storage is accepted. */
export async function fetchRecordingUrl(token: string, detectionId: string, signal?: AbortSignal): Promise<string> {
  const body: unknown = await (await apiFetch(API_ROUTES.detectionRecording(detectionId), { token, signal })).json();
  if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') throw new Error('Invalid recording link.');
  const url = new URL(body.url, self.location.origin);
  if (!isTrustedStorageUrl(url)) throw new Error('Untrusted recording origin.');
  return url.href;
}
