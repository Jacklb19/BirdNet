import { API_ROUTES, TRUNCATED_HEADER, apiFetch } from '../../config/api';
import { HOURS_PER_DAY, type Period } from '../../config/contract';
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

/** Validates the shape so a partial response never draws a misleading chart. */
export function parseStats(body: unknown): SiteStats {
  const s = body as Partial<SiteStats> | null;
  if (!s || !Array.isArray(s.hourly) || s.hourly.length !== HOURS_PER_DAY || !Array.isArray(s.species) || !Array.isArray(s.missing) ||
      typeof s.species_count !== 'number' || typeof s.detections !== 'number' || typeof s.active_days !== 'number') throw new Error('Invalid statistics.');
  return s as SiteStats;
}

/** Hours are grouped in the device's time zone, so a dawn chorus stays at dawn wherever the API runs. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || config.defaultTimeZone;
}

export async function siteStats(token: string, id: string, period: Period): Promise<SiteStats> {
  const params = new URLSearchParams({ period, tz: deviceTimeZone() });
  return parseStats(await (await apiFetch(API_ROUTES.siteStats(id), { token, params })).json());
}

export async function exportCsv(token: string, id: string): Promise<CsvExport> {
  const response = await apiFetch(API_ROUTES.export, { token, params: new URLSearchParams({ site_id: id }) });
  return { blob: await response.blob(), truncated: response.headers.get(TRUNCATED_HEADER) === 'true' };
}
