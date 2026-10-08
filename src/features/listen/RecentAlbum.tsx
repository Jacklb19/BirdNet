import { useId, useMemo } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { Sticker } from '../../shared/ui/Sticker';
import { useLogRecords } from '../log/useLogRecords';
import { albumEntries } from '../species/album';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { RECENT_ALBUM_COUNT } from './listen.config';
import './RecentAlbum.css';

/**
 * The latest stickers of the album, beside the plate while no session is running, so the screen shows what the
 * person has already collected instead of an empty column. Hidden until there is something to show.
 */
export function RecentAlbum(): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const names = useSpeciesNames();
  const { records } = useLogRecords();
  const titleId = useId();
  const recent = useMemo(() => albumEntries(records ?? [], null).slice(0, RECENT_ALBUM_COUNT), [records]);
  if (recent.length === 0) return null;
  return (
    <section className="bn-listen-recent" aria-labelledby={titleId}>
      <div className="bn-listen-recent__header">
        <h2 id={titleId} className="bn-listen-recent__title display">{dict.listen.recent.title}</h2>
        <a className="bn-listen-recent__link" href={routeHash({ name: 'album' })}>
          {dict.listen.recent.open}<Icon name="chevron" size="s" />
        </a>
      </div>
      <ul className="bn-listen-recent__grid">
        {recent.map((entry) => {
          const name = commonName(names, entry.species, locale);
          return (
            <li key={entry.species}>
              <a className="bn-listen-recent__cell" href={routeHash({ name: 'species', species: entry.species })}>
                <Sticker scientificName={entry.species} alt="" size="s" />
                <span className="bn-listen-recent__name">{name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
