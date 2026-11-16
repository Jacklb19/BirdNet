import { useId, useMemo } from 'react';
import { PERIODS, type Period } from '../../config/contract';
import { intlTag, useI18n } from '../../i18n';
import { Dropdown } from '../../shared/ui/Dropdown';
import { Segmented } from '../../shared/ui/Segmented';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import './MapFilters.css';

export interface MapFiltersProps {
  readonly species: string | null;
  /** Scientific names available in the current area. */
  readonly options: readonly string[];
  readonly onSpeciesChange: (species: string | null) => void;
  /** Without a period the chips are left out: the person's own map always shows everything they have. */
  readonly period?: Period;
  readonly onPeriodChange?: (period: Period) => void;
}

/** Floating species picker and, for the shared map, period chips. */
export function MapFilters({ species, options, onSpeciesChange, period, onPeriodChange }: MapFiltersProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const m = dict.map.filters;
  const names = useSpeciesNames();
  const labelId = useId();

  const speciesChoices = useMemo(() => {
    // A chosen species stays selectable even after panning to an area where it was not recorded.
    const values = species && !options.includes(species) ? [species, ...options] : options;
    const collator = new Intl.Collator(intlTag(locale));
    return values
      .map((value) => ({ value, label: commonName(names, value, locale) }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [species, options, names, locale]);

  const periodChoices = useMemo(
    () => PERIODS.map((entry) => ({ value: entry.value, label: dict.common.periods[entry.value] })),
    [dict],
  );

  return (
    <div className="bn-map-filters" role="group" aria-label={m.label}>
      <div className="bn-map-filters__species">
        <span id={labelId} className="visually-hidden">{m.species}</span>
        <Dropdown variant="pill" icon="filter" labelId={labelId} value={species ?? ''} onChange={(next) => { onSpeciesChange(next || null); }}
          options={[{ value: '', label: m.allSpecies }, ...speciesChoices.map((choice) => ({ ...choice, detail: choice.value }))]} />
      </div>
      {period !== undefined && onPeriodChange && (
        <Segmented variant="chips" options={periodChoices} value={period} onChange={onPeriodChange} label={m.period} />
      )}
    </div>
  );
}
