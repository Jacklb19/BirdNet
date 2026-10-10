import { useId, useMemo } from 'react';
import { PERIODS, type Period } from '../../config/contract';
import { intlTag, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
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
  const selectId = useId();

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
        <label className="visually-hidden" htmlFor={selectId}>{m.species}</label>
        <span className="bn-map-filters__icon bn-map-filters__icon--lead"><Icon name="filter" size="s" /></span>
        <select id={selectId} className="bn-map-filters__select" value={species ?? ''}
          onChange={(event) => { onSpeciesChange(event.target.value || null); }}>
          <option value="">{m.allSpecies}</option>
          {speciesChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
        <span className="bn-map-filters__icon bn-map-filters__icon--trail"><Icon name="down" size="s" /></span>
      </div>
      {period !== undefined && onPeriodChange && (
        <Segmented variant="chips" options={periodChoices} value={period} onChange={onPeriodChange} label={m.period} />
      )}
    </div>
  );
}
