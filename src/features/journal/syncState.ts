import type { JournalEntity, PendingWrite, ServerEntity } from './types';

/** A sent snapshot survives later edits and a lost response; creation is retried before a later edit. */
export function prepareWrite(row: JournalEntity, operationId: string): JournalEntity {
  if (!row.dirty || row.conflict || row.pending) return row;
  const pending: PendingWrite = { id: operationId, revision: row.revision, method: row.deleted ? 'DELETE' : 'PUT', expectedVersion: row.version, data: structuredClone(row.data) };
  return { ...row, pending };
}

/** An old acknowledgement advances the known server version without erasing a newer local edit. */
export function acceptWrite(row: JournalEntity, sent: PendingWrite, response: ServerEntity | null): JournalEntity {
  if (row.pending?.id !== sent.id || row.remoteDeleted) return row;
  const current = row.revision === sent.revision;
  return { ...row, version: response?.version ?? (sent.expectedVersion ?? 0) + 1, pending: null,
    dirty: !current, conflict: false, ...(current && response ? { data: response.data } : {}),
    updatedAt: response?.updatedAt ?? row.updatedAt } as JournalEntity;
}

/** A deletion observed during a request wins over its older acknowledgement. */
export function acceptDeletion(row: JournalEntity, version: number): JournalEntity {
  return { ...row, remoteDeleted: true, version: Math.max(row.version ?? 0, version), pending: null,
    ...(row.dirty && !row.deleted ? { conflict: true } : { deleted: true, dirty: false, conflict: false }) };
}
