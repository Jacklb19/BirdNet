/**
 * The field log as plain data: pending and synchronized records merged into one list, grouped by local day,
 * filtered, and summarized for the sync notice. No React and no storage access, so every rule is testable.
 */
import { classifyConfidence } from '../inference/detectionPolicy';
import { QUEUED_STATUS_BY_LOCAL_STATUS, type QueuedDetectionStatus } from '../offline/offline.constants';
import type { CachedSite, HistoryEntry, StoredDetection } from '../offline/types';

/**
 * Where a record stands on its way to the shared map: in the cloud, waiting for the next synchronization, or kept
 * on the phone because it has no account, belongs to an account that is not signed in, or has no location
 * (synchronization skips all three).
 */
export type UploadState = 'cloud' | 'waiting' | 'needsAccount' | 'needsSignIn' | 'noLocation';

/**
 * Account that synchronization currently runs for: its user id, null when signed out, or undefined while it is not
 * known yet (then an owned record counts as waiting rather than flashing a sign-in notice).
 */
export type SyncUser = string | null | undefined;

export interface LogRecord {
  readonly id: string;
  /** Scientific name. */
  readonly species: string;
  readonly confidence: number;
  readonly status: QueuedDetectionStatus;
  /** Epoch milliseconds. */
  readonly recordedAt: number;
  readonly siteId: string | null;
  readonly upload: UploadState;
  /** Whether an approximate cell was stored with the record. */
  readonly located: boolean;
  /** Doubtful fragment still kept on this phone, if any. */
  readonly audioId: string | null;
}

const QUEUED_STATUSES: readonly string[] = Object.values(QUEUED_STATUS_BY_LOCAL_STATUS);

function isQueuedStatus(value: unknown): value is QueuedDetectionStatus {
  return typeof value === 'string' && QUEUED_STATUSES.includes(value);
}

/** Device storage is a boundary: a row another version wrote badly is left out instead of breaking the log. */
function isValid(record: LogRecord): boolean {
  return Boolean(record.id) && Boolean(record.species) && isQueuedStatus(record.status) && Number.isFinite(record.recordedAt) &&
    Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 1;
}

export function uploadStateOf(row: Pick<StoredDetection, 'metadataSynced' | 'location' | 'owner'>, syncUser: SyncUser): UploadState {
  if (row.metadataSynced) return 'cloud';
  // Checked before the account: a record without a cell is never sent, even after signing in.
  if (!row.location) return 'noLocation';
  if (!row.owner) return 'needsAccount';
  // Synchronization only sends the records of the account that is signed in.
  if (syncUser !== undefined && row.owner !== syncUser) return 'needsSignIn';
  return 'waiting';
}

function fromPending(row: StoredDetection, syncUser: SyncUser): LogRecord {
  return {
    id: row.id, species: row.species, confidence: row.confidence, status: row.status, recordedAt: Date.parse(row.recorded_at),
    siteId: row.siteId ?? null, upload: uploadStateOf(row, syncUser), located: Boolean(row.location), audioId: row.audioId,
  };
}

function fromHistory(entry: HistoryEntry): LogRecord {
  // Synchronization only sends records with a cell, so every acknowledged record had one (history does not keep it).
  return {
    id: entry.id, species: entry.species, confidence: entry.confidence, status: entry.status, recordedAt: Date.parse(entry.recorded_at),
    siteId: entry.siteId, upload: 'cloud', located: true, audioId: null,
  };
}

function newestFirst(a: LogRecord, b: LogRecord): number {
  return b.recordedAt - a.recordedAt || a.id.localeCompare(b.id);
}

/**
 * One list, newest first. A record acknowledged between reading the pending queue and the history can appear in
 * both; the history copy is the newer state, so it wins.
 */
export function mergeRecords(pending: readonly StoredDetection[], history: readonly HistoryEntry[], syncUser: SyncUser): LogRecord[] {
  const byId = new Map<string, LogRecord>();
  for (const record of [...pending.map((row) => fromPending(row, syncUser)), ...history.map(fromHistory)]) {
    if (isValid(record)) byId.set(record.id, record);
  }
  return [...byId.values()].sort(newestFirst);
}

/** Filters of the log, in the order they are offered. */
export const LOG_FILTERS = Object.freeze(['all', 'toVerify', 'notUploaded'] as const);
export type LogFilter = (typeof LOG_FILTERS)[number];

export function matchesFilter(record: LogRecord, filter: LogFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'toVerify': return record.status === 'provisional';
    case 'notUploaded': return record.upload !== 'cloud';
  }
}

export type RelativeDay = 'today' | 'yesterday' | 'other';

function startOfLocalDay(time: number | Date): Date {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar day in the device time zone; built from local date parts so daylight-saving days still count as one. */
export function relativeDay(time: number, now: Date): RelativeDay {
  const day = startOfLocalDay(time).getTime();
  const today = startOfLocalDay(now);
  if (day === today.getTime()) return 'today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  return day === yesterday.getTime() ? 'yesterday' : 'other';
}

/** Time left until the next local midnight, when "today" and "yesterday" move on. */
export function msUntilNextLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}

export interface DayGroup {
  /** Local midnight of the day. */
  readonly day: Date;
  readonly relative: RelativeDay;
  readonly records: readonly LogRecord[];
}

/** Consecutive records of the same local day; `records` must already be newest first. */
export function groupByDay(records: readonly LogRecord[], now: Date): DayGroup[] {
  const groups: { day: Date; relative: RelativeDay; records: LogRecord[] }[] = [];
  for (const record of records) {
    const day = startOfLocalDay(record.recordedAt);
    const last = groups.at(-1);
    if (last?.day.getTime() === day.getTime()) last.records.push(record);
    else groups.push({ day, relative: relativeDay(record.recordedAt, now), records: [record] });
  }
  return groups;
}

export interface DaySummary {
  readonly detections: number;
  readonly species: number;
}

export function todaySummary(records: readonly LogRecord[], now: Date): DaySummary {
  const today = records.filter((record) => relativeDay(record.recordedAt, now) === 'today');
  return { detections: today.length, species: new Set(today.map((record) => record.species)).size };
}

export interface SyncCounts {
  readonly waiting: number;
  readonly needsAccount: number;
  readonly needsSignIn: number;
  readonly noLocation: number;
}

export function syncCounts(records: readonly LogRecord[]): SyncCounts {
  const count = (state: UploadState): number => records.filter((record) => record.upload === state).length;
  return { waiting: count('waiting'), needsAccount: count('needsAccount'), needsSignIn: count('needsSignIn'), noLocation: count('noLocation') };
}

export type SyncLineKind = 'waitingOffline' | 'failed' | 'needsAccount' | 'needsSignIn' | 'noLocation';

export interface SyncNotice {
  readonly lines: readonly { readonly kind: SyncLineKind; readonly count: number }[];
  /** A failed attempt can be retried by hand while there is a connection. */
  readonly retry: boolean;
  /** Records without an account, or of an account that is not signed in, upload once the person signs in. */
  readonly account: boolean;
}

/**
 * What the log says about records that are not in the cloud. Records waiting while online are being uploaded in the
 * background, so they are only mentioned when that failed; otherwise the notice would flicker during listening.
 */
export function syncNotice(counts: SyncCounts, connection: { readonly online: boolean; readonly syncFailed: boolean }): SyncNotice | null {
  const lines: { kind: SyncLineKind; count: number }[] = [];
  const retry = counts.waiting > 0 && connection.online && connection.syncFailed;
  if (counts.waiting > 0 && !connection.online) lines.push({ kind: 'waitingOffline', count: counts.waiting });
  if (retry) lines.push({ kind: 'failed', count: counts.waiting });
  if (counts.needsAccount > 0) lines.push({ kind: 'needsAccount', count: counts.needsAccount });
  if (counts.needsSignIn > 0) lines.push({ kind: 'needsSignIn', count: counts.needsSignIn });
  if (counts.noLocation > 0) lines.push({ kind: 'noLocation', count: counts.noLocation });
  return lines.length ? { lines, retry, account: counts.needsAccount > 0 || counts.needsSignIn > 0 } : null;
}

export interface Explanation {
  readonly kind: QueuedDetectionStatus;
  /**
   * Whether the sentence may quote the current thresholds. A record classified under other thresholds would
   * otherwise be explained with a range its own confidence contradicts.
   */
  readonly quotesThresholds: boolean;
}

export function explanationFor(record: Pick<LogRecord, 'status' | 'confidence'>): Explanation {
  const current = classifyConfidence(record.confidence);
  return { kind: record.status, quotesThresholds: current !== null && QUEUED_STATUS_BY_LOCAL_STATUS[current] === record.status };
}

export type Place =
  | { readonly kind: 'site'; readonly name: string }
  | { readonly kind: 'cell' }
  | { readonly kind: 'none' };

/** The monitoring site when this phone still knows its name, otherwise only that an approximate cell exists. */
export function placeOf(record: Pick<LogRecord, 'siteId' | 'located'>, sites: readonly Pick<CachedSite, 'id' | 'name'>[]): Place {
  const site = record.siteId ? sites.find((candidate) => candidate.id === record.siteId) : undefined;
  if (site) return { kind: 'site', name: site.name };
  return record.located ? { kind: 'cell' } : { kind: 'none' };
}
