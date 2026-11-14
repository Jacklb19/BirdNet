// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_QUEUE_BYTES } from '../offline/offline.constants';
import { getSettings, listHistory } from '../offline/queueStore';
import type { HistoryEntry, OfflineSettings } from '../offline/types';
import { listNotes, markNote } from './noteStore';
import { syncNotes } from './noteSync';
import type { StoredNote } from './notePolicy';

vi.mock('../offline/queueStore');
vi.mock('./noteStore');
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('preserves a note while another account is signed in and sends it once its owner returns', async () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const id = '00000000-0000-4000-8000-000000000003';
  const note: StoredNote = { id, note: 'Heard at dawn', individuals: 2, writtenAt: '2026-11-14T12:00:00Z', sync: 'pending' };
  const history: HistoryEntry = { id, owner, species: 'Turdus fuscater', confidence: 0.9, status: 'confirmed', recorded_at: note.writtenAt, syncedAt: note.writtenAt, siteId: null };
  const settings: OfflineSettings = { maxBytes: DEFAULT_QUEUE_BYTES, locationEnabled: false, session: { userId: other, accessToken: 'test', expiresAt: Date.now() / 1000 + 600 } };
  vi.mocked(getSettings).mockImplementation(() => Promise.resolve(settings));
  vi.mocked(listHistory).mockResolvedValue([history]);
  vi.mocked(listNotes).mockResolvedValue([note]);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({}))));

  await syncNotes(other);
  expect(fetch).not.toHaveBeenCalled();
  expect(markNote).not.toHaveBeenCalled();
  if (settings.session) settings.session.userId = owner;
  await syncNotes(owner);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(markNote).toHaveBeenCalledWith(note, 'done');
});
