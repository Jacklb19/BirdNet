import { API_ROUTES, TRUNCATED_HEADER, apiFetch } from '../../config/api';
import { HOURS_PER_DAY, isPeriod, type Period } from '../../config/contract';
import { config } from '../../config/env';
import { JSON_HEADERS } from '../offline/offline.constants';
import type { CachedSite } from '../offline/types';

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

const isCount = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * ISO 8601 date-time as the API serializes it. `Date.parse` alone also accepts locale formats such as
 * "Oct 7, 2026", which the API never sends, so the layout is checked before the value.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

const isTimestamp = (value: unknown): boolean => typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));

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

/** Hours are grouped in the device's time zone, so a dawn chorus stays at dawn wherever the API runs. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || config.defaultTimeZone;
}

export async function siteStats(token: string, id: string, period: Period): Promise<SiteStats> {
  const params = new URLSearchParams({ period, tz: deviceTimeZone() });
  return parseStats(await (await apiFetch(API_ROUTES.siteStats(id), { token, params })).json());
}

/** Detections of a site from `since` on (RF-16: a zone and a period); without `since`, the whole record. */
export async function exportCsv(token: string, id: string, since: Date | null = null): Promise<CsvExport> {
  const params = new URLSearchParams({ site_id: id });
  if (since) params.set('since', since.toISOString());
  const response = await apiFetch(API_ROUTES.export, { token, params });
  return { blob: await response.blob(), truncated: response.headers.get(TRUNCATED_HEADER) === 'true' };
}
