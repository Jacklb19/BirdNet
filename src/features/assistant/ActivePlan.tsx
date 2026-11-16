import { useId } from 'react';
import { useI18n } from '../../i18n';
import { Dropdown } from '../../shared/ui/Dropdown';
import { Icon } from '../../shared/ui/Icon';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { INTENTS, RELATIVE_PERIODS } from './assistant.config';
import { periodLabel } from './planText';
import { assistantMessages } from './i18n';
import { plan as fresh, validPlan, type PlanPeriod, type ReadPlan } from './plan';

const ALL = 'all';
const periodValue = (period: PlanPeriod): string => (period.kind === 'relative' ? period.value : period.kind === 'all' ? ALL : 'dates');

/** A plan for another list, keeping what still applies to it (a species for songs, a period where there is one). */
function retarget(current: ReadPlan, intent: ReadPlan['intent']): ReadPlan {
  const candidate = fresh(intent, { species: current.species, period: current.period });
  return validPlan(candidate) ?? validPlan(fresh(intent, { period: current.period })) ?? fresh(intent);
}

/**
 * The active query above the composer (ADR-47): its filters as small controls the person can change without writing,
 * each change a new query that the API answers without the model. What a filter does not apply to is not offered.
 */
export function ActivePlan({ plan, busy, onChange }: { readonly plan: ReadPlan; readonly busy: boolean; readonly onChange: (plan: ReadPlan) => void }): React.JSX.Element {
  const { locale } = useI18n();
  const texts = assistantMessages[locale];
  const names = useSpeciesNames();
  const ids = { what: useId(), when: useId(), against: useId() };
  const periodOptions = (current: PlanPeriod, withAll: boolean) => [
    ...(withAll ? [{ value: ALL, label: texts.periods.all }] : []),
    ...RELATIVE_PERIODS.map((value) => ({ value, label: texts.periods[value] })),
    ...(current.kind === 'dates' ? [{ value: 'dates', label: periodLabel(current, texts, locale) }] : []),
  ];
  const toPeriod = (value: string, current: PlanPeriod): PlanPeriod => {
    if (value === ALL) return { kind: 'all' };
    const relative = RELATIVE_PERIODS.find((entry) => entry === value);
    return relative ? { kind: 'relative', value: relative } : current;
  };
  const change = (next: ReadPlan): void => { const checked = validPlan(next); if (checked && !busy) onChange(checked); };
  const timed = plan.intent !== 'collections' && plan.intent !== 'wishlist';
  return (
    <div className="bn-active-plan" role="group" aria-label={texts.active.label}>
      {plan.intent !== 'compare' && (
        <span className="bn-active-plan__field">
          <span id={ids.what} className="visually-hidden">{texts.active.what}</span>
          <Dropdown variant="pill" labelId={ids.what} value={plan.intent} disabled={busy}
            options={INTENTS.map((value) => ({ value, label: texts.intents[value] }))} onChange={(value) => { change(retarget(plan, value)); }} />
        </span>
      )}
      {timed && (
        <span className="bn-active-plan__field">
          <span id={ids.when} className="visually-hidden">{texts.active.when}</span>
          <Dropdown variant="pill" icon="clock" labelId={ids.when} value={periodValue(plan.period)} disabled={busy}
            options={periodOptions(plan.period, plan.intent !== 'compare')} onChange={(value) => { change({ ...plan, period: toPeriod(value, plan.period) }); }} />
        </span>
      )}
      {plan.compare_period && (
        <span className="bn-active-plan__field">
          <span id={ids.against} className="visually-hidden">{texts.active.against}</span>
          <Dropdown variant="pill" icon="layers" labelId={ids.against} value={periodValue(plan.compare_period)} disabled={busy}
            options={periodOptions(plan.compare_period, false)} onChange={(value) => { if (plan.compare_period) change({ ...plan, compare_period: toPeriod(value, plan.compare_period) }); }} />
        </span>
      )}
      {plan.intent === 'detections' && (
        <button type="button" className="bn-active-plan__toggle" aria-pressed={plan.review === 'pending'} disabled={busy}
          onClick={() => { change({ ...plan, review: plan.review === 'pending' ? 'all' : 'pending' }); }}>
          {plan.review === 'pending' && <Icon name="check" size="s" />}
          <span>{texts.active.pending}</span>
        </button>
      )}
      {plan.species && (
        <button type="button" className="bn-active-plan__toggle bn-active-plan__toggle--species" disabled={busy}
          aria-label={texts.active.removeSpecies(commonName(names, plan.species, locale))} onClick={() => { change({ ...plan, species: null }); }}>
          <span>{commonName(names, plan.species, locale)}</span>
          <Icon name="close" size="s" />
        </button>
      )}
    </div>
  );
}
