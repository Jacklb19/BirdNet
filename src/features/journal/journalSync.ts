import { ApiError, apiFetch } from '../../config/api';
import { isUuid } from '../../config/contract';
import { getSettings, listHistory } from '../offline/queueStore';
import { JOURNAL_PAGE_SIZE, JOURNAL_ROUTES, JOURNAL_SYNC_LOCK } from './journal.config';
import { entityPath, fetchEntity, fetchEntityPage, fetchEvents, putEntity } from './journalApi';
import { changeEntry, entityKey, putRemote, readJournal, remoteRelation } from './journalStore';
import { acceptWrite, prepareWrite } from './syncState';
import { count, object, timestamp } from './validation';
import type { EntityKind, JournalEntity, JournalRelation, TimelineEvent } from './types';

async function session(owner: string): Promise<string | null> {
  const current = (await getSettings()).session;
  return current?.userId === owner && current.expiresAt * 1000 > Date.now() ? current.accessToken : null;
}
async function syncEntity(owner: string, row: JournalEntity): Promise<void> {
  await changeEntry(row.key, (current) => current?.tag === 'entity' ? prepareWrite(current, crypto.randomUUID()) : current);
  const current = (await readJournal(owner)).entities.find((entry) => entry.key === row.key);
  const sent = current?.pending;
  const token = await session(owner);
  if (!current || !sent || current.conflict || !token) return;
  try {
    const response = sent.method === 'PUT' ? await putEntity(token, current.kind, current.id, sent.data, sent.expectedVersion) : null;
    if (sent.method === 'DELETE') await apiFetch(entityPath(current.kind, current.id), { token, method: 'DELETE', params: new URLSearchParams({ expected_version: String(sent.expectedVersion ?? 1) }) });
    // Missing rows are never recreated by an acknowledgement after account deletion.
    await changeEntry(current.key, (latest) => latest?.tag === 'entity' ? acceptWrite(latest, sent, response) : latest);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await changeEntry(current.key, (latest) => latest?.tag === 'entity' ? { ...latest, conflict: true } : latest);
      return;
    }
    throw error;
  }
}
function relationPath(row: JournalRelation): string {
  if (row.kind === 'wish') return `${JOURNAL_ROUTES.wishlist}/${encodeURIComponent(row.recordId)}`;
  if (row.kind === 'outingDetection') return `${entityPath('outing', row.parent)}/detections/${encodeURIComponent(row.recordId)}`;
  return `${entityPath('collection', row.parent)}/items/${row.recordKind}/${encodeURIComponent(row.recordId)}`;
}
async function syncRelations(owner: string): Promise<void> {
  const snapshot = await readJournal(owner);
  const uploaded = new Set((await listHistory()).filter((row) => row.owner === owner).map((row) => row.id));
  for (const row of snapshot.relations.filter((entry) => entry.dirty)) {
    const token = await session(owner);
    if (!token) return;
    if (row.kind !== 'wish' && row.present) {
      const parent = snapshot.entities.find((entry) => entry.id === row.parent && entry.kind === (row.kind === 'outingDetection' ? 'outing' : 'collection'));
      if (!parent || parent.deleted || parent.version === null || parent.dirty) continue;
      if (row.recordKind === 'detection' && !uploaded.has(row.recordId)) continue;
      if (row.recordKind === 'observation' && !snapshot.entities.some((entry) => entry.kind === 'observation' && entry.id === row.recordId && !entry.deleted && entry.version !== null && !entry.dirty)) continue;
    }
    await changeEntry(row.key, (current) => current?.tag === 'relation' && !current.pending ? { ...current, pending: { id: crypto.randomUUID(), revision: current.revision, present: current.present } } : current);
    const latest = (await readJournal(owner)).relations.find((entry) => entry.key === row.key);
    if (!latest?.pending) continue;
    const sent = latest.pending;
    await apiFetch(relationPath(latest), { token, method: sent.present ? 'PUT' : 'DELETE' });
    await changeEntry(row.key, (current) => current?.tag === 'relation' && current.pending?.id === sent.id ? { ...current, pending: null, dirty: current.revision !== sent.revision } : current);
  }
}

/** Run after existing detections and walks; entities and links keep their own idempotent outbox. */
export async function synchronizeJournal(owner: string): Promise<void> {
  const run = async (): Promise<void> => {
    for (const kind of ['outing', 'observation', 'collection'] as const) {
      for (const row of (await readJournal(owner)).entities.filter((entry) => entry.kind === kind && entry.dirty && !entry.conflict)) await syncEntity(owner, row);
    }
    await syncRelations(owner);
  };
  if (typeof navigator !== 'undefined' && 'locks' in navigator) await navigator.locks.request(JOURNAL_SYNC_LOCK, run);
  else await run();
}

/** Replay the ledger each reconciliation: timestamps are page cursors, not global commit positions. */
async function reconcileDeletions(owner: string, token: string, signal?: AbortSignal): Promise<void> {
  let cursor: { kind: EntityKind; id: string; deleted_at: string } | null = null;
  do {
    const params = new URLSearchParams({ limit: String(JOURNAL_PAGE_SIZE) });
    if (cursor) { params.set('after', cursor.deleted_at); params.set('after_id', cursor.id); params.set('after_kind', cursor.kind); }
    const body: unknown = await (await apiFetch(JOURNAL_ROUTES.deletions, { token, params, signal })).json();
    if (!object(body) || !Array.isArray(body.deletions) || typeof body.has_more !== 'boolean') throw new Error('Invalid deletion page.');
    if (!await session(owner)) return;
    for (const value of body.deletions) {
      if (!object(value) || !isUuid(value.id) || !['outing', 'observation', 'collection'].includes(String(value.kind)) || !timestamp(value.deleted_at) || !count(value.version)) throw new Error('Invalid deletion.');
      const kind = value.kind as EntityKind;
      await changeEntry(entityKey(owner, kind, value.id), (current) => current?.tag === 'entity' ? current.dirty ? { ...current, conflict: true } : { ...current, deleted: true, pending: null } : current);
      cursor = { kind, id: value.id, deleted_at: value.deleted_at };
    }
    if (!body.has_more) return;
    if (!body.deletions.length) throw new Error('Deletion cursor did not advance.');
  } while (cursor);
}
export async function refreshJournal(owner: string, signal?: AbortSignal): Promise<void> {
  const token = await session(owner);
  if (!token) return;
  await reconcileDeletions(owner, token, signal);
  for (const kind of ['outing', 'observation', 'collection'] as const) {
    let before: string | undefined;
    let after: string | undefined;
    for (;;) {
      const page = await fetchEntityPage(token, kind, before, after, signal);
      if (!await session(owner)) return;
      for (const row of page.rows) await putRemote(owner, kind, row);
      if (!page.more) break;
      const last = page.rows.at(-1);
      if (!last) throw new Error('Journal cursor did not advance.');
      after = last.id;
      before = kind === 'outing' && 'started_at' in last.data ? last.data.started_at : kind === 'observation' && 'observed_at' in last.data ? last.data.observed_at : last.createdAt;
    }
  }
  let after: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: String(JOURNAL_PAGE_SIZE), ...(after ? { after_species: after } : {}) });
    const body: unknown = await (await apiFetch(JOURNAL_ROUTES.wishlist, { token, params, signal })).json();
    if (!object(body) || !Array.isArray(body.species) || typeof body.has_more !== 'boolean') throw new Error('Invalid wish list.');
    if (!await session(owner)) return;
    for (const value of body.species) {
      if (!object(value) || typeof value.species !== 'string' || !timestamp(value.created_at)) throw new Error('Invalid wished species.');
      await remoteRelation(owner, 'wish', '', value.species);
      after = value.species;
    }
    if (!body.has_more) break;
    if (!body.species.length) throw new Error('Wish cursor did not advance.');
  }
}
export async function loadRemoteEvents(owner: string, kind: 'outing' | 'collection', id: string, signal?: AbortSignal): Promise<TimelineEvent[]> {
  const token = await session(owner);
  if (!token) return [];
  const events: TimelineEvent[] = [];
  for (;;) {
    const page = await fetchEvents(token, kind, id, events.at(-1), signal);
    if (!await session(owner)) return [];
    events.push(...page.rows);
    if (!page.more) return events;
    if (!page.rows.length) throw new Error('Event cursor did not advance.');
  }
}
/** Explicit conflict choices; no remote version is overwritten automatically. */
export async function resolveJournalConflict(owner: string, kind: EntityKind, id: string, choice: 'remote' | 'local'): Promise<void> {
  const token = await session(owner);
  if (!token) throw new Error('Account connection required.');
  const remote = await fetchEntity(token, kind, id);
  if (!await session(owner)) return;
  await changeEntry(entityKey(owner, kind, id), (row) => row?.tag === 'entity' ? choice === 'local'
    ? { ...row, pending: null, version: remote.version, conflict: false, dirty: true }
    : { ...row, data: remote.data, version: remote.version, pending: null, conflict: false, dirty: false, deleted: false } as JournalEntity : row);
}
