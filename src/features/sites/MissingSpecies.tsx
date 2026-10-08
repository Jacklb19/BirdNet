import { useId } from 'react';
import type { Period } from '../../config/contract';
import { useI18n } from '../../i18n';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import './MissingSpecies.css';

export interface MissingSpeciesProps {
  /** Scientific names heard at the site before the period but not during it. */
  readonly missing: readonly string[];
  readonly period: Period;
}

/** Species not heard in the period; the caution that follows it explains that silence is not absence. */
export function MissingSpecies({ missing, period }: MissingSpeciesProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const names = useSpeciesNames();
  const titleId = useId();
  return (
    <section className="bn-site-missing" aria-labelledby={titleId}>
      <div className="bn-site-missing__head">
        <h2 id={titleId} className="bn-site-missing__title">{t.missingTitle(t.span[period])}</h2>
        <p className="bn-site-missing__intro">{t.missingIntro}</p>
      </div>
      <ul className="bn-site-missing__list">
        {missing.map((species) => (
          <li key={species}>
            <SpeciesRow photo="round" scientificName={species} name={commonName(names, species, locale)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
