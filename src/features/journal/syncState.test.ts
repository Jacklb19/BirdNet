import { describe, expect, it } from 'vitest';
import { acceptDeletion, acceptWrite, prepareWrite } from './syncState';
import { validData } from './validation';
import { parseEntity, parseEvent } from './journalApi';
import type { JournalEntity, ServerEntity } from './types';

const id = '00000000-0000-4000-8000-000000000001';
const at = '2026-11-15T12:00:00Z';
const original = (): JournalEntity => ({ tag: 'entity', key: `owner:collection:${id}`, owner: 'owner', kind: 'collection', id, data: { name: 'Garden', note: null },
  revision: 1, dirty: true, version: null, pending: null, deleted: false, conflict: false, createdAt: at, updatedAt: at });
const response = (version: number): ServerEntity => ({ id, version, data: { name: 'Garden', note: null }, createdAt: at, updatedAt: at });
function pending(row: JournalEntity) { if (!row.pending) throw new Error('Missing test operation.'); return row.pending; }

describe('versioned journal outbox', () => {
  it('retries the original creation before a later edit and keeps that edit after the lost acknowledgement', () => {
    const sent = prepareWrite(original(), 'first');
    const edited: JournalEntity = { ...sent, data: { name: 'Wetland', note: 'New note' }, revision: 2 } as JournalEntity;
    expect(prepareWrite(edited, 'retry').pending).toEqual(sent.pending);
    const acknowledged = acceptWrite(edited, pending(sent), response(1));
    expect(acknowledged.data).toEqual(edited.data);
    expect(acknowledged.dirty).toBe(true);
    expect(prepareWrite(acknowledged, 'second').pending).toMatchObject({ expectedVersion: 1, data: edited.data, revision: 2 });
  });
  it('resolves a lost creation response before deleting and ignores acknowledgements of another operation', () => {
    const sent = prepareWrite(original(), 'first');
    const deleted = { ...sent, deleted: true, revision: 2 };
    const next = prepareWrite(acceptWrite(deleted, pending(sent), response(1)), 'delete');
    expect(next.pending).toMatchObject({ method: 'DELETE', expectedVersion: 1 });
    expect(acceptWrite(next, pending(sent), response(1))).toBe(next);
    expect(acceptWrite(next, pending(next), null)).toMatchObject({ deleted: true, dirty: false, version: 2, pending: null });
  });
  it('does not generate another operation over an unresolved conflict', () => {
    const conflicted = { ...original(), conflict: true };
    expect(prepareWrite(conflicted, 'ignored')).toBe(conflicted);
  });
  it('keeps local edits after a remote deletion and ignores the older in-flight acknowledgement', () => {
    const sent = prepareWrite(original(), 'first');
    const deleted = acceptDeletion(sent, 2);
    expect(deleted).toMatchObject({ remoteDeleted: true, conflict: true, dirty: true, pending: null, version: 2 });
    expect(acceptWrite(deleted, pending(sent), response(1))).toBe(deleted);
    expect(prepareWrite(deleted, 'retry')).toBe(deleted);
    expect(acceptDeletion({ ...original(), dirty: false }, 2)).toMatchObject({ deleted: true, remoteDeleted: true });
    expect(acceptDeletion({ ...original(), deleted: true }, 2)).toMatchObject({ deleted: true, dirty: false, conflict: false, pending: null });
  });
});
describe('journal boundaries', () => {
  it('rejects raw coordinates, extra media and automatic confidence on visual observations', () => {
    const data = { species: 'Turdus fuscater', observed_at: at, location: { latitude: 4.6789, longitude: -74.1234 }, individuals: null, note: null, outing_id: null };
    expect(validData('observation', data)).toBe(true);
    expect(validData('observation', { ...data, location: { latitude: 4.678912, longitude: -74.1234 } })).toBe(false);
    expect(validData('observation', { ...data, confidence: 0.9 })).toBe(false);
    expect(validData('observation', { ...data, photo: 'private-media' })).toBe(false);
    expect(() => parseEntity('observation', { ...data, id, version: 1, source: 'model', created_at: at, updated_at: at })).toThrow();
  });
  it('keeps visual and acoustic events distinct, including simultaneous identifiers', () => {
    const common = { id, recorded_at: at, species: 'Turdus fuscater' };
    expect(parseEvent({ ...common, kind: 'observation', individuals: 2 }).kind).toBe('observation');
    expect(parseEvent({ ...common, kind: 'detection', confidence: 0.8, status: 'confirmed', has_recording: false }).kind).toBe('detection');
    expect(() => parseEvent({ ...common, kind: 'observation', confidence: 0.8, individuals: 2 })).toThrow();
  });
});
