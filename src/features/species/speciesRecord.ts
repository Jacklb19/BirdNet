/**
 * What a species card shows about the person's own records, as plain data: built from the records on this phone,
 * or taken from the account's cloud record when it is available (it also covers other devices).
 */
import { HOURS_PER_DAY } from '../../config/contract';
import type { LogRecord } from '../log/logRecords';
import type { CachedSite } from '../offline/types';
import type { SpeciesRecord } from './speciesApi';

export interface SpeciesFacts {
  readonly detections: number;
  readonly bestConfidence: number | null;
  /** Epoch milliseconds. */
  readonly firstAt: number | null;
  readonly lastAt: number | null;
  readonly hours: readonly number[];
  readonly sites: readonly { readonly id: string; readonly name: string; readonly detections: number }[];
  /** Where the facts come from: the account (every device) or only this phone. */
  readonly source: 'cloud' | 'phone';
}

/** Facts from the records kept on this phone; hours are local hours of the device. */
export function phoneFacts(records: readonly LogRecord[], species: string, sites: readonly Pick<CachedSite, 'id' | 'name'>[]): SpeciesFacts {
  const own = records.filter((record) => record.species === species);
  const hours = Array.from({ length: HOURS_PER_DAY }, () => 0);
  const bySite = new Map<string, number>();
  for (const record of own) {
    const hour = new Date(record.recordedAt).getHours();
    hours[hour] = (hours[hour] ?? 0) + 1;
    if (record.siteId) bySite.set(record.siteId, (bySite.get(record.siteId) ?? 0) + 1);
  }
  const times = own.map((record) => record.recordedAt);
  return {
    detections: own.length,
    bestConfidence: own.length ? Math.max(...own.map((record) => record.confidence)) : null,
    firstAt: times.length ? Math.min(...times) : null,
    lastAt: times.length ? Math.max(...times) : null,
    hours,
    // A site this phone no longer knows (another account's, deleted) has no name to show, so it is left out.
    sites: [...bySite.entries()]
      .flatMap(([id, detections]) => {
        const site = sites.find((candidate) => candidate.id === id);
        return site ? [{ id, name: site.name, detections }] : [];
      })
      .sort((a, b) => b.detections - a.detections),
    source: 'phone',
  };
}

/** Facts from the account's cloud record. */
export function cloudFacts(record: SpeciesRecord): SpeciesFacts {
  return {
    detections: record.detections,
    bestConfidence: record.bestConfidence,
    firstAt: record.firstRecordedAt ? Date.parse(record.firstRecordedAt) : null,
    lastAt: record.lastRecordedAt ? Date.parse(record.lastRecordedAt) : null,
    hours: record.hours,
    sites: [...record.sites].sort((a, b) => b.detections - a.detections),
    source: 'cloud',
  };
}

/**
 * The cloud record wins when it knows at least as many detections as the phone; otherwise the phone holds records
 * not uploaded yet (offline, no account) and its own view is the more complete one.
 */
export function bestFacts(phone: SpeciesFacts, cloud: SpeciesFacts | null): SpeciesFacts {
  return cloud && cloud.detections >= phone.detections ? cloud : phone;
}

/** Busiest local hour, or null without records. */
export function busiestHour(hours: readonly number[]): number | null {
  const max = Math.max(0, ...hours);
  return max > 0 ? hours.indexOf(max) : null;
}
