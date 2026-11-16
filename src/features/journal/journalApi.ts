import { apiFetch } from '../../config/api';
import { isUuid } from '../../config/contract';
import { JOURNAL_PAGE_SIZE, JOURNAL_ROUTES } from './journal.config';
import { count, ENTITY_FIELDS, object, timestamp, validData, validEvent } from './validation';
import type { EntityData, EntityKind, ServerEntity, TimelineEvent } from './types';

export const entityPath = (kind: EntityKind, id: string): string => `${JOURNAL_ROUTES[kind]}/${encodeURIComponent(id)}`;
export function parseEntity(kind: EntityKind, body: unknown): ServerEntity {
  if (!object(body) || !isUuid(body.id) || !count(body.version) || body.version < 1 || !timestamp(body.created_at) || !timestamp(body.updated_at)) throw new Error('Invalid journal response.');
  const data: unknown = Object.fromEntries(ENTITY_FIELDS[kind].map((field) => [field, body[field]]));
  if (!validData(kind, data)) throw new Error('Invalid journal metadata.');
  if (kind === 'observation' && body.source !== 'manual') throw new Error('Invalid observation source.');
  return { id: body.id, version: body.version, createdAt: body.created_at, updatedAt: body.updated_at, data };
}
export async function fetchEntity(token: string, kind: EntityKind, id: string, signal?: AbortSignal): Promise<ServerEntity> {
  return parseEntity(kind, await (await apiFetch(entityPath(kind, id), { token, signal })).json());
}
export async function fetchEntityPage(token: string, kind: EntityKind, before?: string, afterId?: string, signal?: AbortSignal): Promise<{ rows: ServerEntity[]; more: boolean }> {
  const params = new URLSearchParams({ limit: String(JOURNAL_PAGE_SIZE) });
  if (before && afterId) { params.set('before', before); params.set('after_id', afterId); }
  const body: unknown = await (await apiFetch(JOURNAL_ROUTES[kind], { token, params, signal })).json();
  const field = kind === 'collection' ? 'collections' : kind === 'observation' ? 'observations' : 'outings';
  if (!object(body) || !Array.isArray(body[field]) || typeof body.has_more !== 'boolean') throw new Error('Invalid journal page.');
  return { rows: body[field].map((row: unknown) => parseEntity(kind, row)), more: body.has_more };
}
export async function putEntity(token: string, kind: EntityKind, id: string, data: EntityData, version: number | null): Promise<ServerEntity> {
  if (!isUuid(id) || !validData(kind, data) || !(version === null || (count(version) && version > 0))) throw new Error('Invalid journal request.');
  const body: unknown = await (await apiFetch(entityPath(kind, id), { method: 'PUT', token, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, expected_version: version }) })).json();
  const parsed = parseEntity(kind, body);
  if (parsed.id !== id) throw new Error('Invalid journal acknowledgement.');
  return parsed;
}
export function parseEvent(value: unknown): TimelineEvent {
  if (!validEvent(value)) throw new Error('Invalid journal event.');
  return value;
}
export async function fetchEvents(token: string, kind: 'outing' | 'collection', id: string, last?: TimelineEvent, signal?: AbortSignal): Promise<{ rows: TimelineEvent[]; more: boolean }> {
  const params = new URLSearchParams({ limit: String(JOURNAL_PAGE_SIZE) });
  if (last) { params.set('after', last.recorded_at); params.set('after_id', last.id); params.set('after_kind', last.kind); }
  const body: unknown = await (await apiFetch(`${entityPath(kind, id)}/${kind === 'outing' ? 'timeline' : 'items'}`, { token, params, signal })).json();
  const field = kind === 'outing' ? 'events' : 'items';
  if (!object(body) || !Array.isArray(body[field]) || typeof body.has_more !== 'boolean') throw new Error('Invalid event page.');
  return { rows: body[field].map(parseEvent), more: body.has_more };
}
