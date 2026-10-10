// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioObjectPath } from '../../config/contract';
import { DEFAULT_QUEUE_BYTES } from './offline.constants';
import { synchronizeQueue } from './syncQueue';
import { acknowledge, getAudio, getSettings, listDetections } from './queueStore';
import type { OfflineSettings, StoredDetection } from './types';

/** Hoisted: the configuration mock below is created before the module's own constants. */
const { storageOrigin } = vi.hoisted(() => ({ storageOrigin: 'https://example.supabase.co' }));
vi.mock('./queueStore');
vi.mock(import('../../config/env'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, config: actual.readConfig({ VITE_SUPABASE_URL: storageOrigin, VITE_SUPABASE_ANON_KEY: 'test-anon-key' }) };
});
const userId = '00000000-0000-4000-8000-000000000001';
const row: StoredDetection = { id: '00000000-0000-4000-8000-000000000002', species: 'Turdus fuscater', confidence: 0.6, status: 'provisional', recorded_at: '2026-10-06T12:00:00Z', location: { latitude: 4.679, longitude: -74.123 }, model_version: 'birdnet-v2.4:arm', owner: userId, audioId: null, metadataSynced: false, bytes: 300 };
let settings: OfflineSettings;
beforeEach(() => {
  vi.clearAllMocks();
  settings = { maxBytes: DEFAULT_QUEUE_BYTES, audioConsent: true, locationEnabled: true, session: { userId, accessToken: 'test-token', expiresAt: Date.now() / 1000 + 3600 } };
  vi.mocked(getSettings).mockImplementation(() => Promise.resolve(structuredClone(settings)));
  vi.mocked(listDetections).mockResolvedValue([row]);
  vi.mocked(acknowledge).mockResolvedValue(undefined);
  vi.mocked(getAudio).mockResolvedValue({ id: 'audio', blob: new Blob([new Uint8Array(288044)]), bytes: 288044 });
  vi.stubGlobal('self', { location: { origin: 'https://birdnet.example' } });
  vi.stubGlobal('navigator', { locks: { request: (_name: string, action: () => Promise<void>) => action() } });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ accepted_ids: [row.id], existing_ids: [] }))));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('synchronization trust and retry boundaries', () => {
  it('acknowledges only server-confirmed records', async () => {
    vi.mocked(listDetections).mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    await synchronizeQueue();
    expect(acknowledge).toHaveBeenCalledWith([row.id]);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string) as { detections: Record<string, unknown>[] };
    expect(body.detections[0]).not.toHaveProperty('owner');
    expect(body.detections[0]).not.toHaveProperty('audioId');
    // Nothing goes to everyone's map until the person has chosen to share (ADR-22).
    expect(body.detections[0]).toMatchObject({ shared: false });
  });
  it.each(['http', 'network', 'unexpected'])('preserves records when delivery cannot be confirmed: %s', async (failure) => {
    if (failure === 'http') vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (failure === 'network') vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
    if (failure === 'unexpected') vi.mocked(fetch).mockResolvedValueOnce(Response.json({ accepted_ids: ['foreign'], existing_ids: [] }));
    await expect(synchronizeQueue()).rejects.toThrow();
    expect(acknowledge).not.toHaveBeenCalled();
  });
  it.each(['missing', 'expired', 'other-owner', 'missing-location'])('never sends ineligible records: %s', async (reason) => {
    if (reason === 'missing') settings.session = null;
    if (reason === 'expired' && settings.session) settings.session.expiresAt = 0;
    if (reason === 'other-owner') vi.mocked(listDetections).mockResolvedValue([{ ...row, owner: 'other' }]);
    if (reason === 'missing-location') vi.mocked(listDetections).mockResolvedValue([{ ...row, location: null }]);
    await synchronizeQueue();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('can retry safely when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    await synchronizeQueue();
    expect(acknowledge).toHaveBeenCalledWith([row.id]);
  });
  it('retains audio while consent is revoked', async () => {
    settings.audioConsent = false;
    vi.mocked(listDetections).mockResolvedValue([{ ...row, audioId: 'audio', metadataSynced: true }]);
    await synchronizeQueue();
    expect(fetch).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
  });
  it('confirms an audio link only after successful direct upload and a second acknowledgement', async () => {
    vi.mocked(listDetections).mockResolvedValue([{ ...row, audioId: 'audio', metadataSynced: true }]);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ upload_url: `${storageOrigin}/storage/upload`, audio_path: audioObjectPath(userId, row.id) })).mockResolvedValueOnce(new Response()).mockResolvedValueOnce(Response.json({ accepted_ids: [], existing_ids: [row.id] }));
    await synchronizeQueue();
    expect(acknowledge).toHaveBeenCalledWith([row.id], true);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).not.toHaveProperty('Authorization');
  });
  it.each(['missing-audio', 'sign-failure', 'invalid-json', 'foreign-path', 'foreign-origin', 'other-project', 'upload-failure', 'revoked-before-upload', 'revoked-before-link'])('preserves audio on failure: %s', async (failure) => {
    vi.mocked(listDetections).mockResolvedValue([{ ...row, audioId: 'audio', metadataSynced: true }]);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ upload_url: `${storageOrigin}/upload`, audio_path: audioObjectPath(userId, row.id) })).mockResolvedValueOnce(new Response());
    if (failure === 'missing-audio') vi.mocked(getAudio).mockResolvedValueOnce(undefined);
    if (failure === 'sign-failure') vi.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (failure === 'invalid-json') vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({}));
    if (failure === 'foreign-path') vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({ upload_url: '/upload', audio_path: 'foreign.wav' }));
    if (failure === 'foreign-origin') vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({ upload_url: 'https://foreign.example/upload', audio_path: audioObjectPath(userId, row.id) }));
    if (failure === 'other-project') vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({ upload_url: 'https://other.supabase.co/upload', audio_path: audioObjectPath(userId, row.id) }));
    if (failure === 'upload-failure') vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({ upload_url: '/upload', audio_path: audioObjectPath(userId, row.id) })).mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (failure.startsWith('revoked')) {
      vi.mocked(fetch).mockReset().mockImplementation(() => {
        settings.audioConsent = false;
        return Promise.resolve(failure === 'revoked-before-upload' ? Response.json({ upload_url: '/upload', audio_path: audioObjectPath(userId, row.id) }) : new Response());
      });
      if (failure === 'revoked-before-link') vi.mocked(fetch).mockResolvedValueOnce(Response.json({ upload_url: '/upload', audio_path: audioObjectPath(userId, row.id) }));
      await synchronizeQueue();
    } else await expect(synchronizeQueue()).rejects.toThrow();
    expect(acknowledge).not.toHaveBeenCalled();
  });
});
