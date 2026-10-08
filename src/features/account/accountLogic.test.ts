import { describe, expect, it } from 'vitest';
import { localTotals } from './localTotals';
import { syncAge } from './syncAge';
import { pendingSync, syncPhase } from './syncStatus';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('localTotals', () => {
  it('counts pending and synchronized songs together, and distinct species', () => {
    const pending = [{ id: 'a', species: 'Turdus fuscater' }, { id: 'b', species: 'Zonotrichia capensis' }];
    const history = [
      { id: 'c', species: 'Turdus fuscater', syncedAt: ago(HOUR) },
      { id: 'd', species: 'Colibri coruscans', syncedAt: ago(MINUTE) },
    ];
    expect(localTotals(pending, history)).toEqual({ songs: 4, species: 3, lastSyncedAt: ago(MINUTE) });
  });

  it('counts a record read in both stores during a synchronization once', () => {
    const totals = localTotals([{ id: 'a', species: 'Turdus fuscater' }], [{ id: 'a', species: 'Turdus fuscater', syncedAt: ago(0) }]);
    expect(totals.songs).toBe(1);
  });

  it('ignores unreadable synchronization times and reports nothing synchronized when none is valid', () => {
    expect(localTotals([], [{ id: 'a', species: 'Turdus fuscater', syncedAt: 'not a date' }]).lastSyncedAt).toBeNull();
    expect(localTotals([], [])).toEqual({ songs: 0, species: 0, lastSyncedAt: null });
  });
});

describe('syncAge', () => {
  it('buckets the elapsed time into the coarsest natural unit', () => {
    expect(syncAge(ago(30_000), NOW)).toEqual({ unit: 'justNow' });
    expect(syncAge(ago(MINUTE), NOW)).toEqual({ unit: 'minutes', value: 1 });
    expect(syncAge(ago(59 * MINUTE + 59_000), NOW)).toEqual({ unit: 'minutes', value: 59 });
    expect(syncAge(ago(HOUR), NOW)).toEqual({ unit: 'hours', value: 1 });
    expect(syncAge(ago(23 * HOUR + 59 * MINUTE), NOW)).toEqual({ unit: 'hours', value: 23 });
    expect(syncAge(ago(24 * HOUR), NOW)).toEqual({ unit: 'date', date: new Date(NOW - 24 * HOUR) });
  });

  it('treats a time slightly in the future as just now (clock skew)', () => {
    expect(syncAge(new Date(NOW + MINUTE).toISOString(), NOW)).toEqual({ unit: 'justNow' });
  });

  it('returns null when nothing was synchronized or the time is unreadable', () => {
    expect(syncAge(null, NOW)).toBeNull();
    expect(syncAge('yesterday', NOW)).toBeNull();
  });
});

describe('pendingSync', () => {
  const USER = '6f1c2a8e-0d4b-4c3e-9a51-2f7d8b9c0e1a';
  const CELL = { latitude: 4.711, longitude: -74.072 };

  it('counts as uploadable only records of this person that carry a location, as the queue does', () => {
    const rows = [
      { owner: USER, location: CELL, metadataSynced: false },
      { owner: USER, location: null, metadataSynced: false },
      { owner: null, location: CELL, metadataSynced: false },
      { owner: 'another-user', location: CELL, metadataSynced: false },
    ];
    expect(pendingSync(rows, USER, false)).toEqual({ uploadable: 1, withoutLocation: 1 });
  });

  it('counts an acknowledged song kept for its audio fragment as pending only while audio may be sent', () => {
    const rows = [{ owner: USER, location: CELL, metadataSynced: true }];
    expect(pendingSync(rows, USER, true)).toEqual({ uploadable: 1, withoutLocation: 0 });
    expect(pendingSync(rows, USER, false)).toEqual({ uploadable: 0, withoutLocation: 0 });
  });
});

describe('syncPhase', () => {
  const base = { uploadable: 3, online: true, syncing: false, syncFailed: false };

  it('reports synced when nothing that could upload is left, even offline or after a failure', () => {
    expect(syncPhase({ ...base, uploadable: 0, online: false, syncFailed: true })).toBe('synced');
  });

  it('distinguishes waiting for a connection, a failed attempt, an ongoing one and normal pending work', () => {
    expect(syncPhase({ ...base, online: false, syncFailed: true })).toBe('offline');
    expect(syncPhase({ ...base, syncFailed: true })).toBe('failed');
    expect(syncPhase({ ...base, syncing: true })).toBe('syncing');
    expect(syncPhase(base)).toBe('pending');
  });
});
