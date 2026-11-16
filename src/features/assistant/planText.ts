import type { Locale } from '../../i18n';
import type { assistantMessages } from './i18n';
import type { PlanPeriod, ReadPlan } from './plan';

type Texts = (typeof assistantMessages)['es'];

export function periodLabel(period: PlanPeriod, texts: Texts, locale: Locale): string {
  if (period.kind === 'all') return texts.periods.all;
  if (period.kind === 'relative') return texts.periods[period.value];
  const day = (value: string): string => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  return texts.periods.dates(day(period.first), day(period.last));
}

/** "Songs · This week · To verify only": the plan of an answer in words, the same the composer's controls show. */
export function planSummary(plan: ReadPlan, texts: Texts, locale: Locale, speciesName: string | null): string {
  const parts = [texts.intents[plan.intent], periodLabel(plan.period, texts, locale)];
  if (plan.compare_period) parts.push(periodLabel(plan.compare_period, texts, locale));
  if (speciesName) parts.push(speciesName);
  if (plan.review === 'pending') parts.push(texts.active.pending);
  return parts.join(' · ');
}
