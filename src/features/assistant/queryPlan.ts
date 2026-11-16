import type { Question, QueryAnswer, ResultRow } from './types';

export function browserTimeZone(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }

/** The next page of a list question, from the last row shown: the API's own cursor, never anything the model wrote. */
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
