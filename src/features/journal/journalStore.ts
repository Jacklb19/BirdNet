import { isUuid } from '../../config/contract';
import { JOURNAL_CHANGED, JOURNAL_DATABASE } from './journal.config';
import { count, object, validData } from './validation';
import type { EntityData, EntityKind, JournalEntity, JournalEntry, JournalRelation, JournalSnapshot, ObservationPhoto, ServerEntity } from './types';

const ENTRIES = 'entries';
const PHOTOS = 'photos';
export const entityKey = (owner: string, kind: EntityKind, id: string): string => `${owner}:${kind}:${id}`;
export const relationKey = (owner: string, kind: JournalRelation['kind'], parent: string, recordId: string, recordKind = 'detection'): string => `${owner}:${kind}:${parent}:${recordKind}:${recordId}`;
function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { operation.onsuccess = () => { resolve(operation.result); }; operation.onerror = () => { reject(operation.error ?? new Error('Journal storage failed.')); }; });
}
async function transact<T>(store: string, mode: IDBTransactionMode, action: (target: IDBObjectStore) => Promise<T>): Promise<T> {
  const opening = indexedDB.open(JOURNAL_DATABASE);
  opening.onupgradeneeded = () => { for (const name of [ENTRIES, PHOTOS]) if (!opening.result.objectStoreNames.contains(name)) opening.result.createObjectStore(name, { keyPath: 'key' }); };
  const db = await request(opening);
  const tx = db.transaction(store, mode);
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => { resolve(); }; tx.onerror = tx.onabort = () => { reject(tx.error ?? new Error('Journal transaction failed.')); }; });
  try { const result = await action(tx.objectStore(store)); await done; return result; }
  catch (error) { try { tx.abort(); } catch { /* The transaction may already have ended. */ } await done.catch(() => undefined); throw error; }
  finally { db.close(); }
}
export function announceJournal(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(JOURNAL_CHANGED));
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(JOURNAL_CHANGED); channel.postMessage(null); channel.close(); }
}
function validEntry(value: unknown): value is JournalEntry {
  if (!object(value) || typeof value.key !== 'string' || !isUuid(value.owner) || !count(value.revision) || typeof value.dirty !== 'boolean') return false;
  if (value.tag === 'entity') return ['outing', 'observation', 'collection'].includes(String(value.kind)) && isUuid(value.id) &&
    validData(value.kind as EntityKind, value.data) && (value.version === null || (count(value.version) && value.version > 0));
  return value.tag === 'relation' && ['outingDetection', 'collectionItem', 'wish'].includes(String(value.kind)) && typeof value.parent === 'string' && typeof value.recordId === 'string' && typeof value.present === 'boolean';
}
export async function readJournal(owner: string): Promise<JournalSnapshot> {
  if (!isUuid(owner)) throw new Error('Invalid journal owner.');
  const all: unknown[] = await transact(ENTRIES, 'readonly', (store) => request(store.getAll()));
  const entries = all.filter((value) => object(value) && value.owner === owner);
  if (!entries.every(validEntry)) throw new Error('Invalid stored journal.');
  return { entities: entries.filter((row): row is JournalEntity => row.tag === 'entity'), relations: entries.filter((row): row is JournalRelation => row.tag === 'relation') };
}
export async function changeEntry(key: string, action: (current: JournalEntry | null) => JournalEntry | null): Promise<void> {
  await transact(ENTRIES, 'readwrite', async (store) => {
    const current: unknown = await request(store.get(key));
    if (current !== undefined && !validEntry(current)) throw new Error('Invalid stored journal.');
    const next = action(current === undefined ? null : current);
    if (next) { if (!validEntry(next) || next.key !== key) throw new Error('Invalid journal entry.'); await request(store.put(next)); }
    else await request(store.delete(key));
  });
  announceJournal();
}
export async function saveEntity(owner: string, kind: EntityKind, data: EntityData, id = crypto.randomUUID()): Promise<string> {
  if (!isUuid(owner) || !isUuid(id) || !validData(kind, data)) throw new Error('Invalid journal data.');
  const key = entityKey(owner, kind, id);
  await changeEntry(key, (current) => {
    if (current?.tag === 'relation' || (current?.tag === 'entity' && current.deleted)) throw new Error('Journal entity was deleted.');
    const now = new Date().toISOString();
    return { tag: 'entity', key, owner, id, kind, data: structuredClone(data), version: current?.version ?? null,
      revision: (current?.revision ?? 0) + 1, dirty: true, pending: current?.pending ?? null, conflict: current?.conflict ?? false,
      deleted: false, createdAt: current?.createdAt ?? now, updatedAt: now } as JournalEntity;
  });
  return id;
}
export async function deleteEntity(owner: string, kind: EntityKind, id: string): Promise<void> {
  await changeEntry(entityKey(owner, kind, id), (current) => current?.tag === 'entity' ? { ...current, deleted: true, revision: current.revision + 1, dirty: true, conflict: false } : current);
}
export async function putRemote(owner: string, kind: EntityKind, remote: ServerEntity): Promise<void> {
  await changeEntry(entityKey(owner, kind, remote.id), (current) => {
    if (current?.dirty || (current?.tag === 'entity' && current.deleted)) return current;
    return { tag: 'entity', key: entityKey(owner, kind, remote.id), owner, id: remote.id, kind, data: remote.data, version: remote.version,
      revision: current?.revision ?? 0, dirty: false, pending: null, deleted: false, conflict: false, createdAt: remote.createdAt, updatedAt: remote.updatedAt } as JournalEntity;
  });
}
export async function setRelation(owner: string, kind: JournalRelation['kind'], parent: string, recordId: string, present: boolean, recordKind: 'detection' | 'observation' = 'detection'): Promise<void> {
  if (!isUuid(owner) || (kind !== 'wish' && (!isUuid(parent) || !isUuid(recordId)))) throw new Error('Invalid journal relation.');
  const key = relationKey(owner, kind, parent, recordId, recordKind);
  await changeEntry(key, (current) => ({ tag: 'relation', key, owner, kind, parent, recordId, recordKind, present,
    revision: (current?.revision ?? 0) + 1, dirty: true, pending: current?.tag === 'relation' ? current.pending : null }));
}
export async function remoteRelation(owner: string, kind: JournalRelation['kind'], parent: string, recordId: string, recordKind: 'detection' | 'observation' = 'detection'): Promise<void> {
  const key = relationKey(owner, kind, parent, recordId, recordKind);
  await changeEntry(key, (current) => current ?? { tag: 'relation', key, owner, kind, parent, recordId, recordKind, present: true, revision: 0, dirty: false, pending: null });
}
export async function savePhoto(owner: string, id: string, blob: Blob): Promise<void> {
  if (!isUuid(owner) || !isUuid(id) || blob.type !== 'image/jpeg') throw new Error('Invalid observation photo.');
  await transact(PHOTOS, 'readwrite', (store) => request(store.put({ key: entityKey(owner, 'observation', id), owner, id, blob } satisfies ObservationPhoto)));
  announceJournal();
}
export async function getPhoto(owner: string, id: string): Promise<Blob | null> {
  const value: unknown = await transact(PHOTOS, 'readonly', (store) => request(store.get(entityKey(owner, 'observation', id))));
  return object(value) && value.owner === owner && value.blob instanceof Blob ? value.blob : null;
}
export async function deletePhoto(owner: string, id: string): Promise<void> { await transact(PHOTOS, 'readwrite', (store) => request(store.delete(entityKey(owner, 'observation', id)))); announceJournal(); }
export async function deleteJournalOf(owner: string): Promise<void> {
  for (const name of [ENTRIES, PHOTOS]) await transact(name, 'readwrite', async (store) => {
    const all: unknown[] = await request(store.getAll());
    for (const row of all) if (object(row) && row.owner === owner && typeof row.key === 'string') await request(store.delete(row.key));
  });
  announceJournal();
}
