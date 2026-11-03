import { useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { useAccountContext } from '../account/accountContext';
import { useAccountSongs } from '../map/useAccountSongs';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { LOG_PAGE_SIZE } from './log.config';
import { formatConfidence, formatDayTime } from './logFormat';
import './AccountSongsCard.css';

export interface AccountSongsCardProps {
  /** Ids of the records this phone keeps: those are already in the log. */
  readonly local: ReadonlySet<string>;
  readonly online: boolean;
  readonly now: Date;
}

/**
 * Songs of the account that this phone does not keep (ADR-44): recorded on another phone, or older than what the phone
 * keeps. Each one opens its detail, where the person reviews and annotates it against the account (RF-11). Hidden
 * without a session, a connection, or such songs.
 */
export function AccountSongsCard({ local, online, now }: AccountSongsCardProps): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const texts = dict.log.account;
  const names = useSpeciesNames();
  const { session } = useAccountContext();
  const songs = useAccountSongs(session?.access_token ?? null, session?.user.id ?? null, online);
  const [limit, setLimit] = useState(LOG_PAGE_SIZE);
  const titleId = useId();
  const missing = useMemo(() => songs.filter((song) => !local.has(song.id)), [songs, local]);
  if (missing.length === 0) return null;
  return (
    <section className="bn-log-account" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-log-account__title">
        <Icon name="synced" size="s" />{texts.title}
        <span className="bn-log-account__count">{formatCount(dict.log.today.detections, missing.length, locale)}</span>
      </h2>
      <p className="bn-log-account__text">{texts.text}</p>
      <ul className="bn-log-account__list">
        {missing.slice(0, limit).map((song) => (
          <li key={song.id}>
            <a className="bn-log-account__song" href={routeHash({ name: 'detection', id: song.id })}>
              <span className="bn-log-account__name">{commonName(names, song.species, locale)}</span>
              <span className="bn-log-account__meta">
                {[dict.common.status[song.status], formatConfidence(song.confidence, locale), formatDayTime(Date.parse(song.recorded_at), now, locale)]
                  .join(dict.common.separator)}
              </span>
              <Icon name="chevron" size="s" />
            </a>
          </li>
        ))}
      </ul>
      {missing.length > limit && (
        <Button variant="quiet" onClick={() => { setLimit((shown) => shown + LOG_PAGE_SIZE); }}>{texts.more}</Button>
      )}
    </section>
  );
}
