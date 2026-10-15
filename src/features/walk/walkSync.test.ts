// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUEUE_BYTES } from '../offline/offline.constants';
import { getSettings, listDetections, listHistory } from '../offline/queueStore';
import type { OfflineSettings, StoredWalk } from '../offline/types';
import { listWalks, updateWalk } from './walkStore';
import { uploadWalks } from './walkSync';

vi.mock('../offline/queueStore');
vi.mock('./walkStore');

const userId = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-0000000000a1';
const second = '00000000-0000-4000-8000-0000000000a2';
const walk = (id: string): StoredWalk => ({
  id, startedAt: '2026-10-15T12:00:00.000Z', endedAt: '2026-10-15T13:00:00.000Z', track: [[4.6789, -74.1234, 0]], owner: userId,
});
const saved = (id: string): Response => Response.json({
  id, name: null, started_at: '2026-10-15T12:00:00Z', ended_at: '2026-10-15T13:00:00Z', distance_m: 0, points: 1, detections: 0, species: [],
});

let settings: OfflineSettings;
beforeEach(() => {
  vi.clearAllMocks();
  settings = { maxBytes: DEFAULT_QUEUE_BYTES, locationEnabled: true, saveWalks: true, session: { userId, accessToken: 'test-token', expiresAt: Date.now() / 1000 + 3600 } };
  vi.mocked(getSettings).mockImplementation(() => Promise.resolve(structuredClone(settings)));
  vi.mocked(listDetections).mockResolvedValue([]);
  vi.mocked(listHistory).mockResolvedValue([]);
  vi.mocked(listWalks).mockResolvedValue([walk(first), walk(second)]);
  vi.mocked(updateWalk).mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('uploadWalks', () => {
  it('marks a walk as saved only with the answer of the server, and only the version that was sent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(saved(first)).mockRejectedValueOnce(new TypeError('Network down.'));
    await expect(uploadWalks(userId)).rejects.toThrow('Network down.');
    const [request] = vi.mocked(fetch).mock.calls;
    expect(request?.[0]).toContain(`/v1/walks/${first}`);
    expect(request?.[1]?.method).toBe('PUT');
    expect(updateWalk).toHaveBeenCalledTimes(1);
    expect(updateWalk).toHaveBeenCalledWith(first, { account: 'saved', owner: userId, inAccount: true }, walk(first));
  });

  it.each(['unanswered', 'refused', 'signed-out', 'expired'])('sends nothing without the permission and a live session: %s', async (reason) => {
    if (reason === 'unanswered') delete settings.saveWalks;
    if (reason === 'refused') settings.saveWalks = false;
    if (reason === 'signed-out') settings.session = null;
    if (reason === 'expired' && settings.session) settings.session.expiresAt = 0;
    await uploadWalks(userId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops at a full account and keeps on the phone a walk the server will never take', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 422 })).mockResolvedValueOnce(new Response(null, { status: 507 }));
    await uploadWalks(userId);
    expect(updateWalk).toHaveBeenCalledTimes(1);
    expect(updateWalk).toHaveBeenCalledWith(first, { account: 'phoneOnly', owner: userId }, walk(first));
  });
});
