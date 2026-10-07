import { useId } from 'react';
import { useI18n } from '../../i18n';
import { SpeciesPhoto } from '../../shared/ui/SpeciesPhoto';
import { useSpeciesPhotoLoad } from '../../shared/ui/useSpeciesPhotoLoad';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { confidenceText } from './listenFormat';
import { displayStatus } from './listenState';
import type { SessionSpecies } from './session';
import './SingingHero.css';

export interface SingingHeroProps {
  /** The bird singing now, or the last one heard when nobody is singing. */
  readonly species: SessionSpecies;
  readonly active: boolean;
}

/** Wide screens: a large card for the current singer, with its state, confidence and photo credit. */
export function SingingHero({ species, active }: SingingHeroProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen.hero;
  const names = useSpeciesNames();
  const picture = useSpeciesPhotoLoad(species.scientificName);
  const headingId = useId();
  const name = commonName(names, species.scientificName, locale, species.label);
  const status = displayStatus(species.status);
  return (
    <section className="bn-listen-hero" aria-labelledby={headingId}>
      <SpeciesPhoto load={picture} alt={name} variant="hero" />
      <div className="bn-listen-hero__body">
        <p className="bn-listen-hero__eyebrow">{active && species.singingNow ? t.now : t.last}</p>
        <h2 id={headingId} className="bn-listen-hero__name">{name}</h2>
        <p className="bn-listen-hero__scientific scientific">{species.scientificName}</p>
        <p className="bn-listen-hero__sentence">
          {t.sentence(dict.common.status[status], confidenceText(species.confidence, locale), status === 'confirmed' ? t.confirmed : t.provisional)}
        </p>
        {picture.status === 'loaded' && (
          <p className="bn-listen-hero__credit">{dict.common.photoCredit(picture.photo.author ?? dict.common.photoAuthorUnknown, picture.photo.license)}</p>
        )}
      </div>
    </section>
  );
}
