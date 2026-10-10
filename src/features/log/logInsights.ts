/**
 * What the log adds up to, as plain data: totals, the species that are new this week, the hour with most songs,
 * and the walks with what was heard on each. Computed from the phone's records, never estimated.
 */
import type { StoredWalk } from '../offline/types';
import { trackMeters } from '../walk/walkGeometry';
import type { LogRecord } from './logRecords';

const MS_PER_DAY = 86_400_000;
const NEW_SPECIES_DAYS = 7;
const HOURS_PER_DAY = 24;

type Heard = Pick<LogRecord, 'species' | 'recordedAt'>;

export interface LogInsights {
  readonly songs: number;
  readonly species: number;
  /** Species whose first record on this phone is at most a week old, most recent first. */
  readonly newSpecies: readonly string[];
  /** Local hour (0-23) with most songs; null without records. The earliest hour wins a tie. */
  readonly busiestHour: number | null;
}

export function logInsights(records: readonly Heard[], now: number): LogInsights {
  const firstHeard = new Map<string, number>();
  const perHour = new Array<number>(HOURS_PER_DAY).fill(0);
  for (const record of records) {
    const first = firstHeard.get(record.species);
    if (first === undefined || record.recordedAt < first) firstHeard.set(record.species, record.recordedAt);
    const hour = new Date(record.recordedAt).getHours();
    perHour[hour] = (perHour[hour] ?? 0) + 1;
  }
  const since = now - NEW_SPECIES_DAYS * MS_PER_DAY;
  const newSpecies = [...firstHeard].filter(([, first]) => first >= since).sort((a, b) => b[1] - a[1]).map(([species]) => species);
  const most = Math.max(...perHour);
  return { songs: records.length, species: firstHeard.size, newSpecies, busiestHour: most > 0 ? perHour.indexOf(most) : null };
}

export interface WalkSummary {
  readonly id: string;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  /** Null for a walk that was interrupted before it could be closed. */
  readonly durationMs: number | null;
  readonly meters: number;
  readonly songs: number;
  readonly species: number;
}

/** The walks kept on this phone with what was heard during each, newest first. */
export function walkSummaries(walks: readonly StoredWalk[], records: readonly Heard[]): WalkSummary[] {
  return walks.map((walk) => {
    const startedAt = Date.parse(walk.startedAt);
    const endedAt = walk.endedAt ? Date.parse(walk.endedAt) : null;
    // An interrupted walk has no end: only its path is known, so no songs are attributed to it.
    const heard = endedAt === null ? [] : records.filter((record) => record.recordedAt >= startedAt && record.recordedAt <= endedAt);
    return {
      id: walk.id, startedAt, durationMs: endedAt === null ? null : endedAt - startedAt, meters: trackMeters(walk.track),
      songs: heard.length, species: new Set(heard.map((record) => record.species)).size,
    };
  }).sort((a, b) => b.startedAt - a.startedAt);
}
