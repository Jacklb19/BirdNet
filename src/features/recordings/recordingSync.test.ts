// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUEUE_BYTES } from '../offline/offline.constants';
import { getSettings, listHistory } from '../offline/queueStore';
import type { HistoryEntry, OfflineSettings } from '../offline/types';
import { listRecordings, markRecording } from './recordingStore';
import { isSettled, uploadRecordings } from './recordingSync';
import { SONG_MAX_MS } from './recordings.config';
import type { StoredRecording } from './types';

/** Hoisted: the configuration mock below is created before the module's own constants. */
const { storageOrigin } = vi.hoisted(() => ({ storageOrigin: 'https://example.supabase.co' }));
vi.mock('../offline/queueStore');
vi.mock('./recordingStore');
vi.mock(import('../../config/env'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, config: actual.readConfig({ VITE_SUPABASE_URL: storageOrigin, VITE_SUPABASE_ANON_KEY: 'test-anon-key' }) };
});

const userId = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-000000000002';
const second = '00000000-0000-4000-8000-000000000003';
const clip = (id: string, changes: Partial<StoredRecording> = {}): StoredRecording => ({
  id, species: 'Turdus fuscater', recordedAt: '2026-10-11T12:00:00.000Z', blob: new Blob([new Uint8Array(12_000)]), bytes: 12_000, upload: 'pending', ...changes,
});
const synced = (id: string): HistoryEntry => ({ id, species: 'Turdus fuscater', confidence: 0.9, status: 'confirmed', recorded_at: '2026-10-11T12:00:00.000Z', siteId: null, syncedAt: '2026-10-11T12:01:00.000Z' });
const signedFor = (id: string, origin = storageOrigin): Response => Response.json({ upload_url: `${origin}/storage/v1/object/upload/sign/recordings/${userId}/${id}.webm?token=up`, recording_path: `${userId}/${id}.webm` });
const usage = (): Response => Response.json({ recordings: 1, bytes: 12_000, limit_bytes: 52_428_800 });

let settings: OfflineSettings;
beforeEach(() => {
  vi.clearAllMocks();
  settings = { maxBytes: DEFAULT_QUEUE_BYTES, locationEnabled: true, saveRecordings: true, session: { userId, accessToken: 'test-token', expiresAt: Date.now() / 1000 + 3600 } };
  vi.mocked(getSettings).mockImplementation(() => Promise.resolve(structuredClone(settings)));
  vi.mocked(listHistory).mockResolvedValue([synced(first), synced(second)]);
  vi.mocked(listRecordings).mockResolvedValue([clip(first)]);
  vi.mocked(markRecording).mockResolvedValue(undefined);
  vi.stubGlobal('self', { location: { origin: 'https://birdnet.example' } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('uploadRecordings', () => {
  it('uploads a clip straight to Storage and marks it only once the server has linked it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(signedFor(first)).mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(usage());
    await uploadRecordings(userId);
    const [declared, sent, linked] = vi.mocked(fetch).mock.calls;
    expect(JSON.parse(declared?.[1]?.body as string)).toEqual({ content_type: 'audio/webm', size_bytes: 12_000 });
    // The API token never travels to Storage: the signed URL is the only credential there.
    expect((sent?.[0] as URL).href).toContain(`${storageOrigin}/storage/v1/object/upload/sign/recordings/${userId}/${first}.webm`);
    expect(new Headers(sent?.[1]?.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(linked?.[1]?.body as string)).toEqual({ recording_path: `${userId}/${first}.webm` });
    expect(markRecording).toHaveBeenCalledWith(first, 'uploaded');
  });

  it.each(['unanswered', 'refused', 'signed-out', 'expired', 'other-account'])('uploads nothing without the permission and a live session: %s', async (reason) => {
    if (reason === 'unanswered') delete settings.saveRecordings;
    if (reason === 'refused') settings.saveRecordings = false;
    if (reason === 'signed-out') settings.session = null;
    if (reason === 'expired' && settings.session) settings.session.expiresAt = 0;
    await uploadRecordings(reason === 'other-account' ? second : userId);
    expect(fetch).not.toHaveBeenCalled();
    expect(markRecording).not.toHaveBeenCalled();
  });

  it('leaves alone the clips already sent and those whose detection the server does not have yet', async () => {
    vi.mocked(listHistory).mockResolvedValue([synced(second)]);
    vi.mocked(listRecordings).mockResolvedValue([clip(first), clip(second, { upload: 'uploaded' })]);
    await uploadRecordings(userId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits until the song is over, so a clip a clearer one replaces never reaches the account', async () => {
    // Regression: a clip uploaded while its song still lasted stayed in the account next to its replacement.
    const heardJustNow = new Date(Date.now() - 10_000).toISOString();
    vi.mocked(listRecordings).mockResolvedValue([clip(first, { recordedAt: heardJustNow })]);
    await uploadRecordings(userId);
    expect(fetch).not.toHaveBeenCalled();
    expect(markRecording).not.toHaveBeenCalled();
    expect(isSettled({ recordedAt: heardJustNow }, Date.now())).toBe(false);
    expect(isSettled({ recordedAt: heardJustNow }, Date.now() + SONG_MAX_MS)).toBe(true);
  });

  it('stops as soon as the permission is withdrawn', async () => {
    vi.mocked(listRecordings).mockResolvedValue([clip(first), clip(second)]);
    vi.mocked(fetch).mockResolvedValueOnce(signedFor(first)).mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockImplementationOnce(() => { settings.saveRecordings = false; return Promise.resolve(usage()); });
    await uploadRecordings(userId);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(markRecording).toHaveBeenCalledTimes(1);
  });

  it('never sends a clip to an origin other than the project Storage', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(signedFor(first, 'https://evil.example'));
    await expect(uploadRecordings(userId)).rejects.toThrow('Untrusted upload origin.');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(markRecording).not.toHaveBeenCalled();
  });

  it('keeps every clip waiting when the account is full', async () => {
    vi.mocked(listRecordings).mockResolvedValue([clip(first), clip(second)]);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 507 }));
    await uploadRecordings(userId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(markRecording).not.toHaveBeenCalled();
  });

  it('gives up on a clip the server will never take and goes on with the next', async () => {
    vi.mocked(listRecordings).mockResolvedValue([clip(first), clip(second, { bytes: 100_001 })]);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await uploadRecordings(userId);
    expect(markRecording).toHaveBeenNthCalledWith(1, first, 'rejected');
    expect(markRecording).toHaveBeenNthCalledWith(2, second, 'rejected');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a clip pending when the upload itself fails, to retry later', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(signedFor(first)).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(uploadRecordings(userId)).rejects.toThrow('Recording upload failed.');
    expect(markRecording).not.toHaveBeenCalled();
  });
});
