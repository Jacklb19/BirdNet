import { isUuid } from '../../config/contract';
import { approximateLocation } from '../offline/queuePolicy';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT } from './journal.config';
import type { EntityData, EntityKind } from './types';

export const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d\d:\d\d)$/.test(value);
const nullableId = (value: unknown): boolean => value === null || isUuid(value);
const note = (value: unknown): boolean => value === null || (typeof value === 'string' && value.length <= JOURNAL_NOTE_LIMIT);
const name = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0 && value.length <= JOURNAL_NAME_LIMIT;
export const ENTITY_FIELDS: Readonly<Record<EntityKind, readonly string[]>> = {
  outing: ['title', 'kind', 'started_at', 'ended_at', 'note', 'site_id', 'walk_id'],
  observation: ['species', 'observed_at', 'location', 'individuals', 'note', 'outing_id'], collection: ['name', 'note'],
};

export function validData(kind: EntityKind, value: unknown): value is EntityData {
  if (!object(value) || !note(value.note) || Object.keys(value).length !== ENTITY_FIELDS[kind].length || !Object.keys(value).every((key) => ENTITY_FIELDS[kind].includes(key))) return false;
  if (kind === 'collection') return name(value.name);
  if (kind === 'outing') return (value.title === null || name(value.title)) && ['stationary', 'walk', 'import'].includes(String(value.kind)) && timestamp(value.started_at) &&
    (value.ended_at === null || (timestamp(value.ended_at) && Date.parse(value.ended_at) >= Date.parse(value.started_at))) && nullableId(value.site_id) && nullableId(value.walk_id) && (value.walk_id === null || value.kind === 'walk');
  if (typeof value.species !== 'string' || !/^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/.test(value.species) || !timestamp(value.observed_at) || !nullableId(value.outing_id) ||
      !(value.individuals === null || (count(value.individuals) && value.individuals >= 1 && value.individuals <= 999))) return false;
  if (value.location === null) return true;
  if (!object(value.location) || Object.keys(value.location).length !== 2 || typeof value.location.latitude !== 'number' || typeof value.location.longitude !== 'number') return false;
  try {
    const rounded = approximateLocation(value.location.latitude, value.location.longitude);
    return rounded.latitude === value.location.latitude && rounded.longitude === value.location.longitude;
  } catch { return false; }
}

export const cleanName = (value: string): string => value.trim().replace(/\s+/g, ' ');
export const cleanNote = (value: string): string | null => value.trim() || null;

export function localDateTime(value = new Date().toISOString()): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
