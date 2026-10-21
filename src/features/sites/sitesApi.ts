import { ApiError, API_ROUTES, TRUNCATED_HEADER, WRITING_TIMEOUT_MS, apiFetch } from '../../config/api';
import { HOURS_PER_DAY, isPeriod, REPORT_MAX_NAMES, REPORT_NAME_MAX_LENGTH, REPORT_NAME_PATTERN, type Period } from '../../config/contract';
import { config } from '../../config/env';
import type { Locale } from '../../i18n/locales';
import { deviceTimeZone, isCount, isTimestamp } from '../../shared/apiValues';
import { JSON_HEADERS } from '../offline/offline.constants';
import type { CachedSite } from '../offline/types';

const NOT_FOUND = 404;

export interface SpeciesStat { species: string; detections: number; days: number; first_seen: string; is_new: boolean }
export interface SiteStats {
  period: Period;
  since: string | null;
  until: string;
  species_count: number;
  previous_species_count: number | null;
  detections: number;
  active_days: number;
  hourly: number[];
  species: SpeciesStat[];
  missing: string[];
}

/** A CSV download; `truncated` means the API stopped at its row cap and the file is incomplete. */
export interface CsvExport { readonly blob: Blob; readonly truncated: boolean }

function toSite(value: unknown): CachedSite | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.latitude !== 'number' || typeof row.longitude !== 'number') return null;
  return { id: row.id, name: row.name, latitude: row.latitude, longitude: row.longitude };
}

export async function listSites(token: string): Promise<CachedSite[]> {
  const body = await (await apiFetch(API_ROUTES.sites, { token })).json() as { sites?: unknown };
  if (!Array.isArray(body.sites)) throw new Error('Invalid sites response.');
  return body.sites.map(toSite).filter((site): site is CachedSite => site !== null);
}

export async function createSite(token: string, name: string, location: { latitude: number; longitude: number }): Promise<CachedSite> {
  const response = await apiFetch(API_ROUTES.sites, {
    token, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name, location }),
  });
  const site = toSite(await response.json());
  if (!site) throw new Error('Invalid site response.');
  return site;
}

/** Every field a species row formats: a bad date or count would otherwise break the whole screen, not one row. */
function isSpeciesStat(value: unknown): boolean {
  const entry = value as Partial<Record<keyof SpeciesStat, unknown>> | null;
  if (!entry) return false;
  return typeof entry.species === 'string' && isCount(entry.detections) && isCount(entry.days) &&
    isTimestamp(entry.first_seen) && typeof entry.is_new === 'boolean';
}

/** Validates every field (the API's `SiteStats` contract) so a partial response never draws a misleading chart. */
export function parseStats(body: unknown): SiteStats {
  const s = body as Partial<Record<keyof SiteStats, unknown>> | null;
  if (!s || !isPeriod(s.period) ||
      // `since` is null for the whole record; `until` always closes the window.
      (s.since !== null && !isTimestamp(s.since)) || !isTimestamp(s.until) ||
      !Array.isArray(s.hourly) || s.hourly.length !== HOURS_PER_DAY || !s.hourly.every(isCount) ||
      !Array.isArray(s.species) || !s.species.every(isSpeciesStat) ||
      !Array.isArray(s.missing) || !s.missing.every((species) => typeof species === 'string') ||
      !isCount(s.species_count) || !isCount(s.detections) || !isCount(s.active_days) ||
      // Null when there is no previous period to compare with (the whole record).
      (s.previous_species_count !== null && !isCount(s.previous_species_count))) throw new Error('Invalid statistics.');
  return s as unknown as SiteStats;
}


export async function siteStats(token: string, id: string, period: Period): Promise<SiteStats> {
  const params = new URLSearchParams({ period, tz: deviceTimeZone(config.defaultTimeZone) });
  return parseStats(await (await apiFetch(API_ROUTES.siteStats(id), { token, params })).json());
}

/** Detections of a site from `since` on (RF-16: a zone and a period); without `since`, the whole record. */
export async function exportCsv(token: string, id: string, since: Date | null = null): Promise<CsvExport> {
  const params = new URLSearchParams({ site_id: id });
  if (since) params.set('since', since.toISOString());
  const response = await apiFetch(API_ROUTES.export, { token, params });
  return { blob: await response.blob(), truncated: response.headers.get(TRUNCATED_HEADER) === 'true' };
}

/**
 * A report of the site written by the language model, only when the person asks (RF-15, ADR-37), with the figures it
 * was written from: every number in its paragraphs is one of them. `stale` says the figures changed since.
 */
export interface SiteReport {
  readonly paragraphs: readonly string[];
  readonly stats: SiteStats;
  readonly generatedAt: string;
  readonly stale: boolean;
}

export function parseReport(body: unknown): SiteReport {
  const row = body as Record<string, unknown> | null;
  if (!row || !Array.isArray(row.paragraphs) || row.paragraphs.length === 0 || !row.paragraphs.every((p) => typeof p === 'string' && p.trim()) ||
      !isTimestamp(row.generated_at) || typeof row.stale !== 'boolean') throw new Error('Invalid report.');
  return { paragraphs: row.paragraphs as string[], stats: parseStats(row.stats), generatedAt: row.generated_at, stale: row.stale };
}

/** The names the person's app shows, for the species the report may mention; names the API would refuse are left out. */
export function reportNames(stats: SiteStats, nameOf: (scientificName: string) => string): Record<string, string> {
  const names: Record<string, string> = {};
  for (const species of [...stats.species.map((entry) => entry.species), ...stats.missing].slice(0, REPORT_MAX_NAMES)) {
    const name = nameOf(species).trim();
    if (name !== species && name.length <= REPORT_NAME_MAX_LENGTH && REPORT_NAME_PATTERN.test(name)) names[species] = name;
  }
  return names;
}

/** The last report of the site for this period and language, or null when none was written. */
export async function fetchReport(token: string, id: string, period: Period, locale: Locale): Promise<SiteReport | null> {
  const params = new URLSearchParams({ period, tz: deviceTimeZone(config.defaultTimeZone), locale });
  try {
    return parseReport(await (await apiFetch(API_ROUTES.siteReport(id), { token, params })).json());
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND) return null;
    throw error;
  }
}

export async function writeReport(token: string, id: string, period: Period, locale: Locale, names: Record<string, string>): Promise<SiteReport> {
  const body = JSON.stringify({ period, tz: deviceTimeZone(config.defaultTimeZone), locale, names });
  const response = await apiFetch(API_ROUTES.siteReport(id), { token, method: 'POST', headers: JSON_HEADERS, body, timeoutMs: WRITING_TIMEOUT_MS });
  return parseReport(await response.json());
}
