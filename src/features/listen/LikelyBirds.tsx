import { useId, useMemo } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { Sticker } from '../../shared/ui/Sticker';
import { birdnetWeek } from '../inference/geoFilter';
import { useRegionSpecies } from '../inference/regionSpecies';
import { useLogRecords } from '../log/useLogRecords';
import { albumEntries } from '../species/album';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useRegionPlace } from '../species/useRegionPlace';
import { LIKELY_BIRDS_COUNT } from './listen.config';
import './RecentAlbum.css';

/**
 * Birds the geographic model considers most likely around here this week that the person has not heard yet: what
 * to listen for, beside the plate while no session is running. Hidden when the model cannot say (not installed).
 */
export function LikelyBirds(): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const t = dict.listen.likely;
  const names = useSpeciesNames();
  const { records } = useLogRecords();
  const place = useRegionPlace();
  const titleId = useId();
  const collected = useMemo(() => new Set(albumEntries(records ?? [], null).map((entry) => entry.species)), [records]);
  // Asks for more than it shows, so the birds already in the album can be left out.
  const region = useRegionSpecies(place, birdnetWeek(new Date()), LIKELY_BIRDS_COUNT + collected.size);
  if (region.status !== 'ready') return null;
  const birds = region.species.filter((species) => !collected.has(species.scientificName)).slice(0, LIKELY_BIRDS_COUNT);
  if (birds.length === 0) return null;
  return (
    <section className="bn-listen-recent" aria-labelledby={titleId}>
      <div className="bn-listen-recent__header">
        <h2 id={titleId} className="bn-listen-recent__title display">{t.title}</h2>
        <a className="bn-listen-recent__link" href={routeHash({ name: 'album' })}>
          {t.open}<Icon name="chevron" size="s" />
        </a>
      </div>
      <p className="bn-listen-recent__note">{t.text}</p>
      <ul className="bn-listen-recent__grid">
        {birds.map((bird) => (
          <li key={bird.scientificName}>
            <a className="bn-listen-recent__cell" href={routeHash({ name: 'species', species: bird.scientificName })}>
              <Sticker scientificName={bird.scientificName} alt="" size="s" missing />
              <span className="bn-listen-recent__name">{commonName(names, bird.scientificName, locale, bird.commonName)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
