import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../config/api';
import { acceptDeletion } from './syncState';
import { loadRemoteEvents, refreshJournal, resolveJournalConflict, synchronizeJournal } from './journalSync';
import type { EntityRecord, JournalEntity, JournalEntry, JournalRelation, ServerEntity } from './types';

const state = vi.hoisted(() => ({ entries: new Map<string, JournalEntry>(), token: true, put: vi.fn(), api: vi.fn(), page: vi.fn(), events: vi.fn(), entity: vi.fn(), saved: vi.fn(), photo: vi.fn(), removePhoto: vi.fn(), savePhoto: vi.fn() }));
const owner = '00000000-0000-4000-8000-000000000001'; const id = '00000000-0000-4000-8000-000000000002'; const at = '2026-11-15T12:00:00.123456Z'; const key = `${owner}:collection:${id}`;
vi.mock('../../config/api', async (original) => ({ ...await original<typeof import('../../config/api')>(), apiFetch: state.api }));
vi.mock('../offline/queueStore', () => ({ getSettings: () => Promise.resolve({ session: state.token ? { userId: '00000000-0000-4000-8000-000000000001', accessToken: 'token', expiresAt: Date.now() / 1000 + 3600 } : null }), listDetections: () => Promise.resolve([]) }));
vi.mock('../walk/walkStore', () => ({ listWalks: () => Promise.resolve([]) }));
vi.mock('./journalApi', () => ({ putEntity: state.put, fetchEntityPage: state.page, fetchEntity: state.entity, fetchEvents: state.events, entityPath: (kind: string, value: string) => `/v1/${kind}s/${value}` }));
vi.mock('./journalStore', () => ({
  entityKey: (person: string, kind: string, value: string) => `${person}:${kind}:${value}`,
  changeEntry: (entryKey: string, action: (row: JournalEntry | null) => JournalEntry | null) => { const next = action(state.entries.get(entryKey) ?? null); if (next) state.entries.set(entryKey, next); else state.entries.delete(entryKey); return Promise.resolve(); },
  readJournal: (person: string) => Promise.resolve({ entities: [...state.entries.values()].filter((row) => row.owner === person && row.tag === 'entity'), relations: [...state.entries.values()].filter((row) => row.owner === person && row.tag === 'relation') }),
  putRemote: vi.fn(), remoteRelation: vi.fn(), saveEntity: state.saved, getPhoto: state.photo, deletePhoto: state.removePhoto, savePhoto: state.savePhoto,
}));
const row = (): JournalEntity => ({ tag: 'entity', key, owner, id, kind: 'collection', data: { name: 'Garden', note: 'Keep this note' }, version: null, revision: 1, dirty: true, pending: null, deleted: false, conflict: false, createdAt: at, updatedAt: at });
const remote = (version = 1): ServerEntity => ({ id, version, data: { name: 'Garden', note: 'Keep this note' }, createdAt: at, updatedAt: at });
function entity(): EntityRecord<'collection'> { const value = state.entries.get(key); if (value?.tag !== 'entity' || value.kind !== 'collection') throw new Error('Missing test entity.'); return value; }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('indexedDB', {}); state.entries.clear(); state.token = true; state.put.mockResolvedValue(remote()); state.page.mockResolvedValue({ rows: [], more: false }); state.api.mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(path.includes('deletions') ? { deletions: [], has_more: false } : { species: [], has_more: false })))); });
afterEach(() => { vi.unstubAllGlobals(); });

it('retries a lost creation snapshot before uploading a newer edit', async () => {
  state.entries.set(key, row()); state.put.mockRejectedValueOnce(new Error('Response lost'));
  await expect(synchronizeJournal(owner)).rejects.toThrow(); const pending = entity().pending;
  state.entries.set(key, { ...entity(), data: { name: 'Wetland', note: 'New note' }, revision: 2 });
  await synchronizeJournal(owner);
  expect(entity()).toMatchObject({ dirty: true, version: 1, data: { name: 'Wetland', note: 'New note' } });
  state.put.mockResolvedValue({ ...remote(2), data: entity().data }); await synchronizeJournal(owner);
  expect(state.put.mock.calls[1]?.[3]).toEqual(pending?.data); expect(state.put.mock.calls[1]?.[4]).toBeNull(); expect(state.put.mock.calls[2]?.[4]).toBe(1);
  expect(entity()).toMatchObject({ dirty: false, version: 2, pending: null });
});
it('retains conflicts and never recreates an entity removed while the request was in flight', async () => {
  state.entries.set(key, row()); state.put.mockRejectedValueOnce(new ApiError(409)); await synchronizeJournal(owner); expect(entity().conflict).toBe(true);
  state.entries.set(key, row()); state.put.mockImplementationOnce(() => { state.entries.set(key, acceptDeletion(entity(), 2)); return Promise.resolve(remote()); });
  await synchronizeJournal(owner); expect(entity()).toMatchObject({ remoteDeleted: true, conflict: true, version: 2 });
  state.entries.set(key, row()); state.put.mockImplementationOnce(() => { state.entries.delete(key); return Promise.resolve(remote()); });
  await synchronizeJournal(owner); expect(state.entries.has(key)).toBe(false);
});
it('acknowledges deletion only after the server responds and pauses without the owner session', async () => {
  state.entries.set(key, { ...row(), version: 1, deleted: true }); await synchronizeJournal(owner); expect(state.entries.has(key)).toBe(false);
  state.entries.set(key, row()); state.token = false; await synchronizeJournal(owner); expect(entity().dirty).toBe(true); expect(state.put).not.toHaveBeenCalled();
});
it('keeps a newer desired relation after the older relation response and retries known rejections', async () => {
  const relation: JournalRelation = { tag: 'relation', key: 'relation', owner, kind: 'wish', parent: '', recordKind: 'detection', recordId: 'Turdus fuscater', present: true, revision: 1, dirty: true, pending: null };
  state.entries.set(relation.key, relation);
  state.api.mockResolvedValueOnce(new Response(JSON.stringify({ deletions: [], has_more: false })));
  state.api.mockImplementationOnce(() => { const latest = state.entries.get(relation.key); if (latest?.tag === 'relation') state.entries.set(relation.key, { ...latest, present: false, revision: 2 }); return Promise.resolve(new Response(null, { status: 204 })); });
  await synchronizeJournal(owner); expect(state.entries.get(relation.key)).toMatchObject({ dirty: true, present: false, pending: null });
  state.api.mockResolvedValueOnce(new Response(JSON.stringify({ deletions: [], has_more: false }))).mockRejectedValueOnce(new ApiError(404)); await expect(synchronizeJournal(owner)).rejects.toThrow(); expect(state.entries.get(relation.key)).toMatchObject({ dirty: true, pending: null });
  state.api.mockResolvedValueOnce(new Response(JSON.stringify({ deletions: [], has_more: false }))).mockResolvedValueOnce(new Response(null, { status: 204 })); await synchronizeJournal(owner); expect(state.entries.get(relation.key)).toMatchObject({ dirty: false });
});
it('replays deletions, preserves dirty metadata and removes clean wishes missing from the account', async () => {
  state.entries.set(key, row()); state.entries.set('wish', { tag: 'relation', key: 'wish', owner, kind: 'wish', parent: '', recordKind: 'detection', recordId: 'Turdus fuscater', present: true, revision: 1, dirty: false, pending: null });
  state.api.mockResolvedValueOnce(new Response(JSON.stringify({ deletions: [{ kind: 'collection', id, version: 2, deleted_at: at }], has_more: false })));
  await refreshJournal(owner); expect(entity()).toMatchObject({ conflict: true, remoteDeleted: true, data: row().data }); expect(state.entries.get('wish')).toMatchObject({ present: false });
  expect(state.page).toHaveBeenCalledTimes(3);
});
it('uses the exact triple event cursor and clears removed cached links', async () => {
  const event = { kind: 'observation', id, recorded_at: at, species: 'Turdus fuscater', individuals: 1 };
  state.events.mockResolvedValueOnce({ rows: [event], more: true }).mockResolvedValueOnce({ rows: [], more: false });
  state.entries.set('old', { tag: 'relation', key: 'old', owner, kind: 'collectionItem', parent: id, recordKind: 'detection', recordId: owner, present: true, revision: 1, dirty: false, pending: null });
  expect(await loadRemoteEvents(owner, 'collection', id)).toEqual([event]); expect(state.events.mock.calls[1]?.[3]).toEqual(event); expect(state.entries.get('old')).toMatchObject({ present: false });
});
it('resolves an edit only by explicit choice and reveals remote deletion before discarding a local note', async () => {
  state.entries.set(key, { ...row(), conflict: true }); state.entity.mockResolvedValue(remote(3));
  await resolveJournalConflict(owner, 'collection', id, 'local'); expect(entity()).toMatchObject({ version: 3, dirty: true, conflict: false, pending: null });
  state.entity.mockRejectedValue(new ApiError(404)); await resolveJournalConflict(owner, 'collection', id, 'remote'); expect(entity()).toMatchObject({ remoteDeleted: true, data: row().data });
  await resolveJournalConflict(owner, 'collection', id, 'remote'); expect(state.entries.has(key)).toBe(false);
});
