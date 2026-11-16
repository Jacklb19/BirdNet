import { PERIODS, type Period } from '../../config/contract';
import type { Locale } from '../../i18n';
import { ASSISTANT_LIMITS } from './assistant.config';
import { parseQuestion } from './parsers';
import type { Intent, Question, QueryAnswer, ResultRow } from './types';

export function browserTimeZone(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
export function structuredQuestion(intent: Intent, locale: Locale, scientific: string, period: Period, pending: boolean, now = Date.now()): Question {
  const base = { intent, locale, tz: browserTimeZone(), limit: ASSISTANT_LIMITS.page };
  const days = PERIODS.find((entry) => entry.value === period)?.days ?? null;
  const span = { since: days === null ? null : new Date(now - days * 24 * 60 * 60 * 1000).toISOString(), until: days === null ? null : new Date(now).toISOString() };
  const cursor = { before: null, after_id: null };
  const species = scientific.trim() || null;
  switch (intent) {
    case 'detections': return parseQuestion({ ...base, ...span, ...cursor, intent, species, review: pending ? 'pending' : 'all' });
    case 'species': return parseQuestion({ ...base, ...span, intent, species, after_species: null });
    case 'outings': return parseQuestion({ ...base, ...span, ...cursor, intent });
    case 'observations': return parseQuestion({ ...base, ...span, ...cursor, intent, species, outing_id: null });
    case 'collections': return parseQuestion({ ...base, ...cursor, intent });
    case 'wishlist': return parseQuestion({ ...base, intent, species, after_species: null });
  }
}
export function nextQuestion(question: Question, answer: QueryAnswer): Question {
  if (question.intent !== answer.intent || !answer.hasMore) throw new Error('No following query page.');
  const last = answer.rows.at(-1); if (!last) throw new Error('Missing query cursor.');
  if ((question.intent === 'species' && last.kind === 'species') || (question.intent === 'wishlist' && last.kind === 'wish')) {
    if (question.after_species === last.species) throw new Error('Repeated query cursor.');
    return { ...question, after_species: last.species };
  }
  if ('before' in question && 'id' in last && 'at' in last) {
    if (question.before === last.at && question.after_id === last.id) throw new Error('Repeated query cursor.');
    return { ...question, before: last.at, after_id: last.id };
  }
  throw new Error('Mismatched query cursor.');
}
export function rowKey(row: ResultRow): string { return `${row.kind}:${'id' in row ? row.id : row.species}`; }
export function mergePage(previous: QueryAnswer, page: QueryAnswer): QueryAnswer {
  if (previous.intent !== page.intent) throw new Error('Different query intents.');
  const rows = new Map(previous.rows.map((row) => [rowKey(row), row]));
  for (const row of page.rows) rows.set(rowKey(row), row);
  return { ...page, rows: [...rows.values()] };
}
