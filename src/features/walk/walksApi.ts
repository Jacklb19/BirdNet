/**
 * Walks saved in the account (ADR-35). Every answer is checked before use: the server is a boundary like any other.
 */
import { API_ROUTES, apiFetch, TRUNCATED_HEADER } from '../../config/api';
import { isUuid } from '../../config/contract';
import { JSON_HEADERS } from '../offline/offline.constants';
import type { TrackPoint } from '../offline/types';
import type { WalkPlace, WalkSpeciesCount } from './walkSummary';

/** A walk as the account holds it; the figures come from the person's own detections within its period. */
export interface AccountWalk {
  readonly id: string;
  readonly name: string | null;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  readonly endedAt: number;
  readonly meters: number;
  readonly points: number;
  readonly songs: number;
  readonly species: readonly WalkSpeciesCount[];
}

export interface AccountWalkDetail extends AccountWalk {
  readonly track: readonly TrackPoint[];
  readonly places: readonly WalkPlace[];
}

export interface WalkPage {
  readonly walks: readonly AccountWalk[];
  readonly hasMore: boolean;
}

export interface WalkUsage {
  readonly walks: number;
  readonly limit: number;
}

type Body = Record<string, unknown>;

const isObject = (value: unknown): value is Body => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isConfidence = (value: unknown): value is number => isFiniteNumber(value) && value >= 0 && value <= 1;
const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function time(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error('Invalid walk time.');
  return parsed;
}

function parseSpecies(value: unknown): WalkSpeciesCount {
  if (!isObject(value) || !isName(value.species) || !isCount(value.detections) || !isConfidence(value.best_confidence)) throw new Error('Invalid walk species.');
  return { species: value.species, songs: value.detections, bestConfidence: value.best_confidence };
}

function parseWalk(value: unknown): AccountWalk {
  if (!isObject(value) || !isUuid(value.id) || !(value.name === null || isName(value.name)) || !isFiniteNumber(value.distance_m) || value.distance_m < 0 ||
      !isCount(value.points) || !isCount(value.detections) || !Array.isArray(value.species)) throw new Error('Invalid walk.');
  return {
    id: value.id, name: value.name, startedAt: time(value.started_at), endedAt: time(value.ended_at), meters: value.distance_m,
    points: value.points, songs: value.detections, species: value.species.map(parseSpecies),
  };
}

function parsePoint(value: unknown): TrackPoint {
  if (!Array.isArray(value) || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1])) throw new Error('Invalid walk point.');
  if (value.length === 2) return [value[0], value[1]];
  if (value.length === 3 && isCount(value[2])) return [value[0], value[1], value[2]];
  throw new Error('Invalid walk point.');
}

function parsePlace(value: unknown): WalkPlace {
  if (!isObject(value) || !isName(value.species) || !isFiniteNumber(value.latitude) || !isFiniteNumber(value.longitude) || !isCount(value.detections) ||
      !isConfidence(value.best_confidence)) throw new Error('Invalid walk place.');
  return {
    species: value.species, latitude: value.latitude, longitude: value.longitude, songs: value.detections,
    bestConfidence: value.best_confidence, firstAt: time(value.first_recorded_at),
  };
}

/** The body the API stores a walk from. */
export interface WalkUpload {
  readonly name: string | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly track: readonly TrackPoint[];
}

export async function putWalk(token: string, id: string, walk: WalkUpload): Promise<AccountWalk> {
  const body = { name: walk.name, started_at: new Date(walk.startedAt).toISOString(), ended_at: new Date(walk.endedAt).toISOString(), track: walk.track };
  const response = await apiFetch(API_ROUTES.walk(id), { method: 'PUT', token, headers: JSON_HEADERS, body: JSON.stringify(body) });
  return parseWalk(await response.json());
}

export async function renameAccountWalk(token: string, id: string, name: string | null): Promise<AccountWalk> {
  const response = await apiFetch(API_ROUTES.walk(id), { method: 'PATCH', token, headers: JSON_HEADERS, body: JSON.stringify({ name }) });
  return parseWalk(await response.json());
}

/** Newest first; `before` is the start of the last walk already received. */
export async function fetchWalkPage(token: string, before: number | null, limit: number, signal?: AbortSignal): Promise<WalkPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before !== null) params.set('before', new Date(before).toISOString());
  const body: unknown = await (await apiFetch(API_ROUTES.walks, { token, params, signal })).json();
  if (!isObject(body) || !Array.isArray(body.walks) || typeof body.has_more !== 'boolean') throw new Error('Invalid walk list.');
  return { walks: body.walks.map(parseWalk), hasMore: body.has_more };
}

export async function fetchAccountWalk(token: string, id: string, signal?: AbortSignal): Promise<AccountWalkDetail> {
  const body: unknown = await (await apiFetch(API_ROUTES.walk(id), { token, signal })).json();
  if (!isObject(body) || !Array.isArray(body.track) || !Array.isArray(body.places)) throw new Error('Invalid walk.');
  return { ...parseWalk(body), track: body.track.map(parsePoint), places: body.places.map(parsePlace) };
}

export async function deleteAccountWalk(token: string, id: string): Promise<void> {
  await apiFetch(API_ROUTES.walk(id), { method: 'DELETE', token });
}

export async function fetchWalkUsage(token: string, signal?: AbortSignal): Promise<WalkUsage> {
  const body: unknown = await (await apiFetch(API_ROUTES.meWalks, { token, signal })).json();
  if (!isObject(body) || !isCount(body.walks) || !isCount(body.limit)) throw new Error('Invalid walk usage.');
  return { walks: body.walks, limit: body.limit };
}

/** Deletes every walk of the account; resolves with how many there were. Their songs stay. */
export async function deleteAccountWalks(token: string): Promise<number> {
  const body: unknown = await (await apiFetch(API_ROUTES.meWalks, { method: 'DELETE', token })).json();
  if (!isObject(body) || !isCount(body.deleted)) throw new Error('Invalid answer.');
  return body.deleted;
}

export interface CsvFile {
  readonly blob: Blob;
  readonly truncated: boolean;
}

/** The account's CSV of one walk, or of the whole record when `walkId` is null. */
export async function exportAccountCsv(token: string, walkId: string | null): Promise<CsvFile> {
  const params = walkId ? new URLSearchParams({ walk_id: walkId }) : undefined;
  const response = await apiFetch(API_ROUTES.export, { token, params });
  return { blob: await response.blob(), truncated: response.headers.get(TRUNCATED_HEADER) === 'true' };
}
