/**
 * Records as CSV, built on the phone so it works without an account or a connection: those of a walk (ADR-35) or the
 * whole record kept on this phone (S11). Same columns, order, decimals and states as the API's export (`ExportColumn`
 * in the API), so both files can be read together; what the phone does not keep (the model version of synchronized
 * records) is left empty.
 */
import { LOCATION_GRID_DECIMALS } from '../../config/contract';
import type { NoteContent } from '../notes/notePolicy';
import type { CachedSite, HistoryEntry, StoredDetection } from '../offline/types';
import type { ReviewIndex } from '../review/reviewPolicy';

export const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const CSV_COLUMNS = [
  'id', 'species', 'confidence', 'status', 'recorded_at', 'latitude', 'longitude', 'model_version', 'site', 'model_species', 'reviewed_by',
  'individuals', 'note',
] as const;
const CONFIDENCE_DECIMALS = 3;
/** The line ending of Python's csv module, which writes the API's export. */
const CSV_LINE_END = '\r\n';
/**
 * A spreadsheet runs a cell that starts with one of these as a formula. Text a person wrote (a note, a site name) is
 * written with a leading apostrophe instead, as the API's export does (`spreadsheet_text`).
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export type NoteIndex = ReadonlyMap<string, NoteContent>;

/** The whole period: every record the phone keeps. */
export const ALL_TIME = Object.freeze({ from: Number.NEGATIVE_INFINITY, until: Number.POSITIVE_INFINITY });

type ExportStatus = 'confirmed' | 'provisional' | 'verified' | 'corrected' | 'discarded';

export interface CsvRecord {
  readonly id: string;
  readonly species: string;
  readonly confidence: number;
  readonly status: ExportStatus;
  /** ISO timestamp. */
  readonly recordedAt: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly modelVersion: string;
  readonly site: string;
  readonly modelSpecies: string;
  readonly reviewed: boolean;
  readonly individuals: number | null;
  readonly note: string;
}

const STATUS_BY_VERDICT = Object.freeze({ confirm: 'verified', correct: 'corrected', discard: 'discarded' } as const);

/**
 * Every record the phone keeps between `from` and `until` (epoch milliseconds, inclusive), oldest first, discarded
 * ones included with their state. A record acknowledged between both reads appears once.
 */
export function walkRecords(pending: readonly StoredDetection[], history: readonly HistoryEntry[], reviews: ReviewIndex, notes: NoteIndex,
  sites: readonly CachedSite[], from: number, until: number): CsvRecord[] {
  const siteNames = new Map(sites.map((site) => [site.id, site.name]));
  const byId = new Map<string, CsvRecord>();
  for (const row of [...history, ...pending]) {
    const time = Date.parse(row.recorded_at);
    if (!(time >= from && time <= until)) continue;
    const verdict = reviews.get(row.id);
    const corrected = verdict?.action === 'correct' && verdict.species ? verdict.species : null;
    const note = notes.get(row.id);
    byId.set(row.id, {
      id: row.id, species: corrected ?? row.species, confidence: row.confidence,
      status: verdict ? STATUS_BY_VERDICT[verdict.action] : row.status, recordedAt: new Date(time).toISOString(),
      latitude: row.location?.latitude ?? null, longitude: row.location?.longitude ?? null,
      modelVersion: 'model_version' in row ? row.model_version : '',
      site: (row.siteId && siteNames.get(row.siteId)) ?? '', modelSpecies: corrected ? row.species : '', reviewed: Boolean(verdict),
      individuals: note?.individuals ?? null, note: note?.note ?? '',
    });
  }
  return [...byId.values()].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
}

/** A field quoted only when it must be (RFC 4180), as Python's csv module does by default. */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const gridValue = (value: number | null): string => (value === null ? '' : value.toFixed(LOCATION_GRID_DECIMALS));

export function spreadsheetText(value: string): string {
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

export function recordsCsv(records: readonly CsvRecord[]): string {
  const rows = records.map((record) => [
    record.id, record.species, record.confidence.toFixed(CONFIDENCE_DECIMALS), record.status, record.recordedAt,
    gridValue(record.latitude), gridValue(record.longitude), record.modelVersion, spreadsheetText(record.site), record.modelSpecies,
    record.reviewed ? 'person' : '', record.individuals === null ? '' : String(record.individuals), spreadsheetText(record.note),
  ]);
  return [CSV_COLUMNS, ...rows].map((row) => row.map(field).join(',')).join(CSV_LINE_END) + CSV_LINE_END;
}
