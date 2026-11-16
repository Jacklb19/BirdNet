import type { Locale } from '../../i18n';
import { ASSISTANT_LIMITS, PLAN_INTENTS, RELATIVE_PERIODS } from './assistant.config';
import type { Question } from './types';

export type PlanIntent = typeof PLAN_INTENTS[number];
export type RelativePeriod = typeof RELATIVE_PERIODS[number];
export type PlanPeriod =
  | { readonly kind: 'all' }
  | { readonly kind: 'relative'; readonly value: RelativePeriod }
  | { readonly kind: 'dates'; readonly first: string; readonly last: string };

/**
 * The active query in words (ADR-47): what the person is looking at, small enough to send back as context. It holds
 * a public species name at most; never a result, identifier, note, place, collection or coordinate.
 */
export interface ReadPlan {
  readonly intent: PlanIntent;
  readonly species: string | null;
  readonly period: PlanPeriod;
  readonly review: 'all' | 'pending';
  /** The second period of a comparison; `period` is then the first. */
  readonly compare_period: PlanPeriod | null;
}

const SCIENTIFIC = /^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
function calendarDate(value: string): boolean {
  if (!DATE.test(value) || value.startsWith('0000') || value === '9999-12-31') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The same rules the API applies to a plan (`ReadPlan` in text_contracts.py); null when the plan breaks one. */
export function validPlan(plan: ReadPlan): ReadPlan | null {
  if (plan.species !== null && !SCIENTIFIC.test(plan.species)) return null;
  if (plan.intent !== 'detections' && plan.review !== 'all') return null;
  if ((plan.intent === 'outings' || plan.intent === 'collections') && plan.species !== null) return null;
  if ((plan.intent === 'collections' || plan.intent === 'wishlist') && plan.period.kind !== 'all') return null;
  if ((plan.intent === 'compare') !== (plan.compare_period !== null)) return null;
  for (const period of [plan.period, plan.compare_period]) {
    if (period?.kind === 'dates' && (!calendarDate(period.first) || !calendarDate(period.last) || period.first > period.last)) return null;
  }
  return plan;
}

export function plan(intent: PlanIntent, changes: Partial<ReadPlan> = {}): ReadPlan {
  return { intent, species: null, period: { kind: 'all' }, review: 'all', compare_period: null, ...changes };
}

function startOfDay(day: Date): Date { const result = new Date(day); result.setHours(0, 0, 0, 0); return result; }
function addDays(day: Date, days: number): Date { const result = new Date(day); result.setDate(result.getDate() + days); return result; }
function fromIsoDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const result = new Date(0); result.setFullYear(year, month - 1, day); result.setHours(0, 0, 0, 0); return result;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a period starts and ends on this device's calendar, as the API resolves the same words in the person's time
 * zone (periods.py): weeks start on Monday, "last 7 days" runs up to now, the end is excluded. Null ends are open.
 */
export function periodBounds(period: PlanPeriod, now: Date): { readonly since: string | null; readonly until: string | null } {
  if (period.kind === 'all') return { since: null, until: null };
  if (period.kind === 'dates') return { since: fromIsoDate(period.first).toISOString(), until: addDays(fromIsoDate(period.last), 1).toISOString() };
  const today = startOfDay(now);
  const span = (first: Date, after: Date): { since: string; until: string } => ({ since: first.toISOString(), until: after.toISOString() });
  switch (period.value) {
    case 'today': return span(today, addDays(today, 1));
    case 'yesterday': return span(addDays(today, -1), today);
    case 'this_week': case 'last_week': {
      const monday = addDays(today, -((today.getDay() + 6) % 7) - (period.value === 'last_week' ? 7 : 0));
      return span(monday, addDays(monday, 7));
    }
    case 'this_month': return span(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1));
    case 'last_month': return span(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1));
    case 'this_year': return span(new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear() + 1, 0, 1));
    case 'last_year': return span(new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear(), 0, 1));
    case 'last_7_days': return { since: new Date(now.getTime() - 7 * DAY_MS).toISOString(), until: now.toISOString() };
    case 'last_30_days': return { since: new Date(now.getTime() - 30 * DAY_MS).toISOString(), until: now.toISOString() };
  }
}

/** The read-only question a plan asks, built and checked in the browser; null when it cannot be asked (an open comparison). */
export function planQuestion(source: ReadPlan, locale: Locale, tz: string, now: Date): Question | null {
  const checked = validPlan(source);
  if (!checked) return null;
  const base = { locale, tz, limit: ASSISTANT_LIMITS.page };
  const span = periodBounds(checked.period, now);
  const cursor = { before: null, after_id: null };
  switch (checked.intent) {
    case 'detections': return { ...base, ...span, ...cursor, intent: 'detections', species: checked.species, review: checked.review };
    case 'species': return { ...base, ...span, intent: 'species', species: checked.species, after_species: null };
    case 'outings': return { ...base, ...span, ...cursor, intent: 'outings' };
    case 'observations': return { ...base, ...span, ...cursor, intent: 'observations', species: checked.species, outing_id: null };
    case 'collections': return { ...base, ...cursor, intent: 'collections' };
    case 'wishlist': return { ...base, intent: 'wishlist', species: checked.species, after_species: null };
    case 'compare': {
      const other = checked.compare_period ? periodBounds(checked.compare_period, now) : null;
      if (!span.since || !span.until || !other?.since || !other.until) return null;
      return { ...base, intent: 'compare', species: checked.species, first: { since: span.since, until: span.until }, second: { since: other.since, until: other.until } };
    }
  }
}
