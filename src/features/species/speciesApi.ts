import { API_ROUTES, apiFetch } from '../../config/api';
import { HOURS_PER_DAY, isDetectionStatus, isUuid, type DetectionStatus } from '../../config/contract';
import { config } from '../../config/env';
import { deviceTimeZone, isCount, isProbability, isTimestamp } from '../../shared/apiValues';

/** Everything the account recorded of one species, across devices (`GET /v1/me/species/{species}`). */
export interface SpeciesRecord {
  readonly detections: number;
  readonly bestConfidence: number | null;
  readonly firstRecordedAt: string | null;
  readonly lastRecordedAt: string | null;
  /** Detections per local hour, index 0 = midnight. */
  readonly hours: readonly number[];
  readonly sites: readonly { readonly id: string; readonly name: string; readonly detections: number }[];
  readonly cells: readonly { readonly latitude: number; readonly longitude: number; readonly detections: number }[];
  readonly recent: readonly {
    readonly id: string;
    readonly recordedAt: string;
    readonly confidence: number;
    readonly status: DetectionStatus;
    readonly siteId: string | null;
    readonly hasAudio: boolean;
  }[];
}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] | null => (Array.isArray(value) ? value as Row[] : null);
const isCoordinate = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/** Every field is checked; one malformed list item is dropped rather than hiding the whole card. */
export function parseSpeciesRecord(body: unknown): SpeciesRecord {
  const row = body as Row | null;
  const hours = row?.hours;
  if (!row || !isCount(row.detections) || (row.best_confidence !== null && !isProbability(row.best_confidence)) ||
      (row.first_recorded_at !== null && !isTimestamp(row.first_recorded_at)) ||
      (row.last_recorded_at !== null && !isTimestamp(row.last_recorded_at)) ||
      !Array.isArray(hours) || hours.length !== HOURS_PER_DAY || !hours.every(isCount)) throw new Error('Invalid species record.');
  const sites = rows(row.sites) ?? [];
  const cells = rows(row.cells) ?? [];
  const recent = rows(row.recent) ?? [];
  return {
    detections: row.detections,
    bestConfidence: row.best_confidence,
    firstRecordedAt: row.first_recorded_at,
    lastRecordedAt: row.last_recorded_at,
    hours,
    sites: sites
      .filter((site) => isUuid(site.id) && typeof site.name === 'string' && isCount(site.detections))
      .map((site) => ({ id: site.id as string, name: site.name as string, detections: site.detections as number })),
    cells: cells
      .filter((cell) => isCoordinate(cell.latitude, MAX_LATITUDE) && isCoordinate(cell.longitude, MAX_LONGITUDE) && isCount(cell.detections))
      .map((cell) => ({ latitude: cell.latitude as number, longitude: cell.longitude as number, detections: cell.detections as number })),
    recent: recent
      .filter((item) => isUuid(item.id) && isTimestamp(item.recorded_at) && isProbability(item.confidence) && isDetectionStatus(item.status) &&
        (item.site_id === null || isUuid(item.site_id)) && typeof item.has_audio === 'boolean')
      .map((item) => ({
        id: item.id as string, recordedAt: item.recorded_at as string, confidence: item.confidence as number,
        status: item.status as DetectionStatus, siteId: item.site_id as string | null, hasAudio: item.has_audio as boolean,
      })),
  };
}

export async function fetchSpeciesRecord(token: string, species: string): Promise<SpeciesRecord> {
  const params = new URLSearchParams({ tz: deviceTimeZone(config.defaultTimeZone) });
  return parseSpeciesRecord(await (await apiFetch(API_ROUTES.meSpeciesRecord(species), { token, params })).json());
}
