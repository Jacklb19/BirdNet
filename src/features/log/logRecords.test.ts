import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import type { HistoryEntry, StoredDetection } from '../offline/types';
import {
  explanationFor, groupByDay, matchesFilter, mergeRecords, msUntilNextLocalDay, placeOf, relativeDay, syncCounts, syncNotice, todaySummary,
  uploadStateOf,
  type LogRecord,
} from './logRecords';

const ids = {
  a: '0b6f2a52-1f0e-4f39-9a59-0d0f2f0d6c11',
  b: '1c7a3b63-2a1f-4a4a-8b6a-1e1a3a1e7d22',
  c: '2d8b4c74-3b2a-4b5b-9c7b-2f2b4b2f8e33',
};
const cell = { latitude: 4.711, longitude: -74.072 };

// Local wall-clock times, so the expectations hold in whatever time zone the tests run.
const at = (month: number, day: number, hour: number, minute = 0, year = 2026): number => new Date(year, month - 1, day, hour, minute).getTime();
const iso = (time: number): string => new Date(time).toISOString();

function pending(id: string, recordedAt: number, changes: Partial<StoredDetection> = {}): StoredDetection {
  return {
    id, species: 'Zonotrichia capensis', confidence: 0.91, status: 'confirmed', recorded_at: iso(recordedAt), location: cell, model_version: 'v',
    owner: ids.c, audioId: null, metadataSynced: false, bytes: 1, siteId: null, ...changes,
  };
}

function history(id: string, recordedAt: number, changes: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id, species: 'Turdus fuscater', confidence: 0.58, status: 'provisional', recorded_at: iso(recordedAt), siteId: null, syncedAt: iso(recordedAt), ...changes };
}

function record(recordedAt: number, changes: Partial<LogRecord> = {}): LogRecord {
  return { id: ids.a, species: 'Zonotrichia capensis', confidence: 0.9, status: 'confirmed', recordedAt, siteId: null, upload: 'cloud', located: true, audioId: null, ...changes };
}

describe('upload state', () => {
  it('keeps records without a cell on the phone even when they have an owner', () => {
    expect(uploadStateOf({ metadataSynced: false, location: null, owner: ids.c }, ids.c)).toBe('noLocation');
    expect(uploadStateOf({ metadataSynced: false, location: cell, owner: null }, ids.c)).toBe('needsAccount');
    expect(uploadStateOf({ metadataSynced: false, location: cell, owner: ids.c }, ids.c)).toBe('waiting');
    // Metadata in the cloud counts as uploaded while only the fragment is still pending.
    expect(uploadStateOf({ metadataSynced: true, location: cell, owner: ids.c }, null)).toBe('cloud');
  });

  it('does not promise an upload for records of an account that is not signed in', () => {
    expect(uploadStateOf({ metadataSynced: false, location: cell, owner: ids.c }, null)).toBe('needsSignIn');
    expect(uploadStateOf({ metadataSynced: false, location: cell, owner: ids.c }, ids.a)).toBe('needsSignIn');
    // While the session is still being read, an owned record is taken to be waiting.
    expect(uploadStateOf({ metadataSynced: false, location: cell, owner: ids.c }, undefined)).toBe('waiting');
  });
});

describe('merging pending and synchronized records', () => {
  it('lists each record once, newest first, preferring the synchronized copy', () => {
    const merged = mergeRecords(
      [pending(ids.a, at(10, 7, 6, 12)), pending(ids.b, at(10, 6, 17, 48), { owner: null })],
      [history(ids.a, at(10, 7, 6, 12)), history(ids.c, at(10, 7, 7, 30))],
      ids.c,
    );
    expect(merged.map((row) => [row.id, row.upload])).toEqual([[ids.c, 'cloud'], [ids.a, 'cloud'], [ids.b, 'needsAccount']]);
    expect(merged[1]).toMatchObject({ species: 'Turdus fuscater', status: 'provisional', located: true, audioId: null });
  });

  it('leaves out rows that storage returned damaged', () => {
    const merged = mergeRecords(
      [pending(ids.a, at(10, 7, 6)), { ...pending(ids.b, at(10, 7, 7)), recorded_at: 'not a date' }],
      [history(ids.c, at(10, 7, 8), { confidence: 1.5 })],
      ids.c,
    );
    expect(merged.map((row) => row.id)).toEqual([ids.a]);
  });
});

describe('filters', () => {
  it('separates records to verify and records not yet uploaded', () => {
    const toVerify = record(0, { status: 'provisional', upload: 'cloud' });
    const local = record(0, { upload: 'waiting' });
    expect(matchesFilter(toVerify, 'toVerify')).toBe(true);
    expect(matchesFilter(local, 'toVerify')).toBe(false);
    expect(matchesFilter(local, 'notUploaded')).toBe(true);
    expect(matchesFilter(record(0, { upload: 'noLocation' }), 'notUploaded')).toBe(true);
    expect(matchesFilter(toVerify, 'notUploaded')).toBe(false);
    expect(matchesFilter(toVerify, 'all')).toBe(true);
  });
});

describe('local days', () => {
  const now = new Date(at(3, 1, 9));

  it('names today and yesterday by the calendar, not by 24-hour distance', () => {
    expect(relativeDay(at(3, 1, 0, 1), now)).toBe('today');
    // One minute before midnight is yesterday, even though it is only nine hours ago.
    expect(relativeDay(at(2, 28, 23, 59), now)).toBe('yesterday');
    expect(relativeDay(at(2, 27, 23, 59), now)).toBe('other');
    expect(relativeDay(at(3, 2, 6), now)).toBe('other');
  });

  it('knows when the local day changes', () => {
    const lateEvening = new Date(at(3, 1, 23, 30));
    expect(lateEvening.getTime() + msUntilNextLocalDay(lateEvening)).toBe(at(3, 2, 0));
  });

  it('groups consecutive records by local day', () => {
    const records = [record(at(3, 1, 8)), record(at(3, 1, 0, 5)), record(at(2, 28, 23, 50)), record(at(2, 20, 12))];
    const groups = groupByDay(records, now);
    expect(groups.map((group) => [group.relative, group.records.length])).toEqual([['today', 2], ['yesterday', 1], ['other', 1]]);
    expect(groups[2]?.day).toEqual(new Date(2026, 1, 20));
  });

  it('counts today’s detections and distinct species', () => {
    const records = [
      record(at(3, 1, 8)), record(at(3, 1, 7), { species: 'Turdus fuscater' }), record(at(3, 1, 6)), record(at(2, 28, 7), { species: 'Colibri coruscans' }),
    ];
    expect(todaySummary(records, now)).toEqual({ detections: 3, species: 2 });
  });
});

describe('sync notice', () => {
  const counts = syncCounts([record(0, { upload: 'waiting' }), record(0, { upload: 'waiting' }), record(0, { upload: 'needsAccount' }), record(0, { upload: 'cloud' })]);

  it('counts records by what keeps them on the phone', () => {
    expect(counts).toEqual({ waiting: 2, needsAccount: 1, needsSignIn: 0, noLocation: 0 });
  });

  it('sends records of a signed-out account to the account screen', () => {
    expect(syncNotice({ waiting: 0, needsAccount: 0, needsSignIn: 2, noLocation: 0 }, { online: true, syncFailed: false }))
      .toEqual({ lines: [{ kind: 'needsSignIn', count: 2 }], retry: false, account: true });
  });

  it('mentions waiting records only offline or after a failed attempt, which can be retried', () => {
    expect(syncNotice(counts, { online: false, syncFailed: false })).toEqual({ lines: [{ kind: 'waitingOffline', count: 2 }, { kind: 'needsAccount', count: 1 }], retry: false, account: true });
    expect(syncNotice(counts, { online: true, syncFailed: true })?.lines[0]).toEqual({ kind: 'failed', count: 2 });
    expect(syncNotice(counts, { online: true, syncFailed: true })?.retry).toBe(true);
    expect(syncNotice({ ...counts, needsAccount: 0 }, { online: true, syncFailed: false })).toBeNull();
    expect(syncNotice({ waiting: 0, needsAccount: 0, needsSignIn: 0, noLocation: 3 }, { online: true, syncFailed: true })).toEqual({ lines: [{ kind: 'noLocation', count: 3 }], retry: false, account: false });
  });
});

describe('explanation', () => {
  it('quotes the thresholds only when the record’s own confidence agrees with them', () => {
    expect(explanationFor({ status: 'confirmed', confidence: CONFIDENCE_THRESHOLDS.confirmedFrom })).toEqual({ kind: 'confirmed', quotesThresholds: true });
    expect(explanationFor({ status: 'provisional', confidence: CONFIDENCE_THRESHOLDS.discardBelow })).toEqual({ kind: 'provisional', quotesThresholds: true });
    // Classified under earlier thresholds: the state is kept, the numbers are not quoted.
    expect(explanationFor({ status: 'confirmed', confidence: CONFIDENCE_THRESHOLDS.discardBelow })).toEqual({ kind: 'confirmed', quotesThresholds: false });
    expect(explanationFor({ status: 'provisional', confidence: 1 })).toEqual({ kind: 'provisional', quotesThresholds: false });
  });
});

describe('place', () => {
  const sites = [{ id: ids.b, name: 'Finca' }];

  it('names the site when known and otherwise only the approximate cell', () => {
    expect(placeOf({ siteId: ids.b, located: false }, sites)).toEqual({ kind: 'site', name: 'Finca' });
    expect(placeOf({ siteId: ids.c, located: true }, sites)).toEqual({ kind: 'cell' });
    expect(placeOf({ siteId: null, located: false }, sites)).toEqual({ kind: 'none' });
  });
});
