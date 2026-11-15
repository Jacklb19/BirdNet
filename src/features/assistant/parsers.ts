import { isUuid } from '../../config/contract';
import type { Locale } from '../../i18n';
import { ASSISTANT_LIMITS, INTENTS, REASON_CODES, STATUSES, TOPICS } from './assistant.config';
import type { Intent, Interpretation, Question, QueryAnswer, ResultRow, Source, TextPolicy, TokenUsage, TutorAnswer, TutorResponse } from './types';

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid assistant object.');
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const body = record(value);
  if (Object.keys(body).length !== keys.length || keys.some((key) => !(key in body))) throw new Error('Invalid assistant fields.');
  return body;
}
export function text(value: unknown, max: number = ASSISTANT_LIMITS.species): string {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max || !validUnicode(value)) throw new Error('Invalid assistant text.');
  return value;
}
export function validUnicode(value: string): boolean {
  return !Array.from(value).some((character) => { const point = character.codePointAt(0) ?? 0; return point >= 0xd800 && point <= 0xdfff; });
}
export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid assistant count.');
  return value;
}
function positive(value: unknown): number { const result = count(value); if (!result) throw new Error('Invalid version.'); return result; }
function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid confidence.');
  return value;
}
function flag(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Invalid assistant flag.'); return value; }
function uuid(value: unknown): string { if (!isUuid(value)) throw new Error('Invalid assistant identifier.'); return value; }
function nullable<T>(value: unknown, parse: (input: unknown) => T): T | null { return value === null ? null : parse(value); }
function member<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error('Invalid assistant option.');
  return value;
}
export function timestamp(value: unknown): string {
  const raw = text(value, 40);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.exec(raw);
  if (!parts || !Number.isFinite(Date.parse(raw))) throw new Error('Invalid assistant timestamp.');
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || second === undefined ||
      month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year + 400, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) throw new Error('Invalid calendar date.');
  // Preserve microseconds: converting to Date/toISOString would lose part of the pagination cursor.
  return raw;
}
function species(value: unknown): string { const raw = text(value); if (!/^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/u.test(raw)) throw new Error('Invalid scientific name.'); return raw; }
function locale(value: unknown): Locale { return member(value, ['es', 'en']); }
function https(value: unknown): string {
  const raw = text(value, 2000); const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source link.');
  return raw;
}
export function parseUsage(value: unknown): TokenUsage {
  const body = exact(value, ['input_tokens', 'output_tokens', 'total_tokens']);
  return { input_tokens: nullable(body.input_tokens, count), output_tokens: nullable(body.output_tokens, count), total_tokens: nullable(body.total_tokens, count) };
}
export function parsePolicy(value: unknown): TextPolicy {
  const body = exact(value, ['version', 'provider', 'terms_url', 'max_text_characters', 'max_output_tokens']);
  if (body.provider !== 'Google Gemini' || body.terms_url !== 'https://aistudio.google.com/docs/terms' || body.max_text_characters !== ASSISTANT_LIMITS.text || body.max_output_tokens !== 1200) throw new Error('Unsupported assistant policy.');
  return { version: text(body.version, 80), provider: body.provider, terms_url: body.terms_url, max_text_characters: body.max_text_characters, max_output_tokens: body.max_output_tokens };
}
export function parseQuestion(value: unknown): Question {
  const source = record(value); const intent = member(source.intent, INTENTS);
  const extras: Record<Intent, readonly string[]> = {
    detections: ['since', 'until', 'before', 'after_id', 'species', 'review'], species: ['since', 'until', 'species', 'after_species'],
    outings: ['since', 'until', 'before', 'after_id'], observations: ['since', 'until', 'before', 'after_id', 'species', 'outing_id'],
    collections: ['before', 'after_id'], wishlist: ['species', 'after_species'],
  };
  const body = exact(value, ['intent', 'locale', 'tz', 'limit', ...extras[intent]]);
  const tz = text(body.tz, 64); new Intl.DateTimeFormat('en', { timeZone: tz });
  const limit = positive(body.limit); if (limit > ASSISTANT_LIMITS.maxPage) throw new Error('Invalid page size.');
  const base = { locale: locale(body.locale), tz, limit };
  const period = ('since' in body) ? { since: nullable(body.since, timestamp), until: nullable(body.until, timestamp) } : { since: null, until: null };
  if (period.since && period.until && Date.parse(period.since) >= Date.parse(period.until)) throw new Error('Invalid period.');
  const cursor = ('before' in body) ? { before: nullable(body.before, timestamp), after_id: nullable(body.after_id, uuid) } : { before: null, after_id: null };
  if ((cursor.before === null) !== (cursor.after_id === null)) throw new Error('Incomplete cursor.');
  switch (intent) {
    case 'detections': return { ...base, ...period, ...cursor, intent, species: nullable(body.species, species), review: member(body.review, ['all', 'pending']) };
    case 'species': return { ...base, ...period, intent, species: nullable(body.species, species), after_species: nullable(body.after_species, species) };
    case 'outings': return { ...base, ...period, ...cursor, intent };
    case 'observations': return { ...base, ...period, ...cursor, intent, species: nullable(body.species, species), outing_id: nullable(body.outing_id, uuid) };
    case 'collections': return { ...base, ...cursor, intent };
    case 'wishlist': return { ...base, intent, species: nullable(body.species, species), after_species: nullable(body.after_species, species) };
  }
}
function row(intent: Intent, value: unknown): ResultRow {
  switch (intent) {
    case 'detections': { const b = exact(value, ['id', 'species', 'confidence', 'status', 'recorded_at', 'has_recording']); return { kind: 'detection', id: uuid(b.id), species: species(b.species), at: timestamp(b.recorded_at), confidence: probability(b.confidence), status: member(b.status, STATUSES), hasRecording: flag(b.has_recording) }; }
    case 'species': { const b = exact(value, ['species', 'detections', 'best_confidence', 'first_recorded_at', 'last_recorded_at']); return { kind: 'species', species: species(b.species), detections: count(b.detections), bestConfidence: probability(b.best_confidence), firstAt: timestamp(b.first_recorded_at), lastAt: timestamp(b.last_recorded_at) }; }
    case 'outings': { const b = exact(value, ['id', 'version', 'title', 'kind', 'started_at', 'ended_at', 'detections', 'observations', 'species']); return { kind: 'outing', id: uuid(b.id), version: positive(b.version), title: nullable(b.title, (v) => text(v, 80)), outingKind: member(b.kind, ['stationary', 'walk', 'import']), at: timestamp(b.started_at), endedAt: nullable(b.ended_at, timestamp), detections: count(b.detections), observations: count(b.observations), species: count(b.species) }; }
    case 'observations': { const b = exact(value, ['id', 'version', 'source', 'species', 'observed_at', 'individuals', 'outing_id']); const individuals = nullable(b.individuals, positive); if (individuals !== null && individuals > 999) throw new Error('Invalid individuals.'); return { kind: 'observation', id: uuid(b.id), version: positive(b.version), source: member(b.source, ['manual']), species: species(b.species), at: timestamp(b.observed_at), individuals, outingId: nullable(b.outing_id, uuid) }; }
    case 'collections': { const b = exact(value, ['id', 'version', 'name', 'created_at', 'updated_at', 'items']); return { kind: 'collection', id: uuid(b.id), version: positive(b.version), name: text(b.name, 80), at: timestamp(b.created_at), updatedAt: timestamp(b.updated_at), items: count(b.items) }; }
    case 'wishlist': { const b = exact(value, ['species', 'created_at']); return { kind: 'wish', species: species(b.species), at: timestamp(b.created_at) }; }
  }
}
export function parseQueryAnswer(value: unknown): QueryAnswer {
  const raw = record(value); const intent = member(raw.intent, INTENTS);
  const body = exact(value, ['intent', 'filters', 'totals', intent, 'has_more', 'usage']);
  const filterKeys: Record<Intent, readonly string[]> = { detections: ['species', 'since', 'until', 'review'], species: ['species', 'since', 'until'], outings: ['since', 'until'], observations: ['species', 'since', 'until', 'outing_id'], collections: [], wishlist: ['species'] };
  const filterBody = exact(body.filters, filterKeys[intent]); const filters: Record<string, string | null> = {};
  for (const [key, input] of Object.entries(filterBody)) filters[key] = key === 'review' ? member(input, ['all', 'pending']) : nullable(input, key === 'since' || key === 'until' ? timestamp : key === 'outing_id' ? uuid : species);
  const totalKeys: Record<Intent, readonly string[]> = { detections: ['detections', 'species'], species: ['detections', 'species'], outings: ['outings'], observations: ['observations', 'species'], collections: ['collections'], wishlist: ['species'] };
  const totalBody = exact(body.totals, totalKeys[intent]); const totals: Record<string, number> = {};
  for (const [key, input] of Object.entries(totalBody)) totals[key] = count(input);
  const rows = body[intent];
  if (!Array.isArray(rows) || rows.length > ASSISTANT_LIMITS.maxPage || body.usage !== null) throw new Error('Invalid query page.');
  const hasMore = flag(body.has_more); if (hasMore && !rows.length) throw new Error('Empty continuing page.');
  return { intent, filters, totals, rows: rows.map((value) => row(intent, value)), hasMore };
}
function source(value: unknown): Source {
  const body = exact(value, ['name', 'url', 'license']);
  return { name: text(body.name), url: nullable(body.url, https), license: nullable(body.license, (v) => text(v)) };
}
export function parseTutor(value: unknown): TutorAnswer {
  const body = exact(value, ['topic', 'species', 'locale', 'paragraphs', 'sources', 'model', 'generated_at', 'usage']);
  if (!Array.isArray(body.paragraphs) || !body.paragraphs.length || body.paragraphs.length > ASSISTANT_LIMITS.paragraphs || !Array.isArray(body.sources) || !body.sources.length || body.sources.length > ASSISTANT_LIMITS.page) throw new Error('Invalid tutor answer.');
  const topic = member(body.topic, TOPICS); const scientific = nullable(body.species, species);
  if ((topic === 'species_facts') !== (scientific !== null)) throw new Error('Invalid tutor context.');
  return { topic, species: scientific, locale: locale(body.locale), paragraphs: body.paragraphs.map((v: unknown) => text(v, ASSISTANT_LIMITS.text)), sources: body.sources.map(source), model: text(body.model), generatedAt: timestamp(body.generated_at), usage: parseUsage(body.usage) };
}
function measurement(body: Record<string, unknown>) { return { model: text(body.model), generatedAt: timestamp(body.generated_at), usage: parseUsage(body.usage) }; }
export function parseInterpretation(value: unknown): Interpretation {
  const raw = record(value);
  if (raw.status === 'ready') {
    const body = exact(value, ['status', 'query', 'model', 'generated_at', 'usage']); const query = parseQuestion(body.query);
    if (('before' in query && query.before !== null) || ('after_species' in query && query.after_species !== null) || ('outing_id' in query && query.outing_id !== null)) throw new Error('Unexpected private reference or initial cursor.');
    return { ...measurement(body), status: 'ready', query };
  }
  const body = exact(value, ['status', 'reason_code', 'model', 'generated_at', 'usage']);
  const status = member(body.status, ['clarification', 'rejected']);
  const codes = status === 'clarification' ? REASON_CODES.slice(0, 4) : REASON_CODES.slice(4, 8);
  return { ...measurement(body), status, reasonCode: member(body.reason_code, codes) };
}
export function parseTutorResponse(value: unknown): TutorResponse {
  const raw = record(value);
  if (raw.status === 'answered') { const b = exact(value, ['status', 'answer']); return { status: 'answered', answer: parseTutor(b.answer) }; }
  const b = exact(value, ['status', 'reason_code', 'topic', 'species', 'locale', 'model', 'generated_at', 'usage']);
  member(b.status, ['rejected']); const topic = member(b.topic, TOPICS); const scientific = nullable(b.species, species);
  if ((topic === 'species_facts') !== (scientific !== null)) throw new Error('Invalid tutor context.');
  return { ...measurement(b), status: 'rejected', reasonCode: member(b.reason_code, ['outside_topic', 'identification_request', 'private_statistics_request', 'insufficient_public_facts']), topic, species: scientific, locale: locale(b.locale) };
}
