import { useId, type CSSProperties } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Sticker } from '../../shared/ui/Sticker';
import { useNow } from '../../shared/useNow';
import { plateStyle, usePlumage } from '../species/plumage';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { HEARD_AGO_REFRESH_MS } from './listen.config';
import { confidenceText, heardAgoText } from './listenFormat';
import { displayStatus, heardAgo, listPhase } from './listenState';
import type { SessionSpecies } from './session';
import './SessionAlbum.css';

interface SwatchProps {
  readonly row: SessionSpecies;
  readonly singing: boolean;
  readonly now: number;
}

function Swatch({ row, singing, now }: SwatchProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen;
  const names = useSpeciesNames();
  const plumage = usePlumage(row.scientificName);
  const name = commonName(names, row.scientificName, locale, row.label);
  const status = displayStatus(row.status);
  const style: CSSProperties = plateStyle(plumage);
  return (
    <li className="bn-listen-album__item">
      <a className={`bn-listen-album__swatch bn-plate${singing ? ' bn-listen-album__swatch--singing' : ''}`} style={style}
        href={routeHash({ name: 'species', species: row.scientificName })} aria-label={t.session.open(name)}>
        <Sticker scientificName={row.scientificName} alt="" size="xs" />
        <span className="bn-listen-album__name">{name}</span>
        <span className="bn-listen-album__meta">
          {confidenceText(row.confidence, locale)}{dict.common.separator}{dict.common.status[status]}
        </span>
        <span className="bn-listen-album__meta">{heardAgoText(heardAgo(row.lastHeard, now, singing), locale, t)}</span>
        <span className="bn-listen-album__count label">{formatCount(t.session.windows, row.windows, locale)}</span>
      </a>
    </li>
  );
}

/**
 * The species of the session as color swatches, each in its plumage with its sticker, current singers first. Every
 * swatch opens the species card. After stopping the list stays as the last session.
 */
export function SessionAlbum({ species, active }: { readonly species: readonly SessionSpecies[]; readonly active: boolean }): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const t = dict.listen;
  const now = useNow(HEARD_AGO_REFRESH_MS, species.length > 0);
  const headingId = useId();
  const list = listPhase(active, species.length);
  if (list === 'hidden' || list === 'waiting') return null;
  return (
    <section className="bn-listen-album" aria-labelledby={headingId}>
      <div className="bn-listen-album__header">
        <h2 id={headingId} className="bn-listen-album__title display">{list === 'live' ? t.list.live : t.list.last}</h2>
        <p className="bn-listen-album__total">{formatCount(t.list.count, species.length, locale)}</p>
      </div>
      <ul className="bn-listen-album__grid">
        {species.map((row) => <Swatch key={row.scientificName} row={row} singing={active && row.singingNow} now={now} />)}
      </ul>
      <p className="bn-listen-album__caveat">{dict.common.absenceCaveat}</p>
    </section>
  );
}
