import { routeHash } from '../../app/routes';
import { formatCount, formatDistance, useI18n } from '../../i18n';
import { formatClock } from '../../shared/time';
import { Icon } from '../../shared/ui/Icon';
import { Sticker } from '../../shared/ui/Sticker';
import { formatDayTime } from '../log/logFormat';
import type { WalkView } from './useWalks';
import { WalkSketch } from './WalkSketch';
import { walkTitle } from './walkText';
import './WalkItem.css';

/** Species stickers shown on a walk of the list; the walk's page lists them all. */
const STICKERS_SHOWN = 3;

/** One saved walk in a list (ADR-35): its drawn route, name, length, duration, birds and where it is kept. */
export function WalkItem({ walk, now }: { readonly walk: WalkView; readonly now: Date }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.walk;
  const title = walkTitle(walk.name, walk.startedAt, locale, t.defaultName);
  const duration = walk.endedAt === null ? (walk.live ? t.underWay : t.interrupted) : formatClock(walk.endedAt - walk.startedAt);
  return (
    <a className="bn-walks__item" href={routeHash({ name: 'walk', id: walk.id })}>
      {walk.track && walk.track.length > 0
        ? <WalkSketch track={walk.track} label="" size="thumb" />
        : <span className="bn-walks__icon" aria-hidden="true"><Icon name="walk" /></span>}
      <span className="bn-walks__text">
        <span className="bn-walks__name">{title}</span>
        {/* A walk without a name is already titled by its date. */}
        {walk.name !== null && <span className="bn-walks__detail">{formatDayTime(walk.startedAt, now, locale)}</span>}
        <span className="bn-walks__detail">{t.line(formatDistance(walk.meters, locale), duration, formatCount(t.species, walk.species.length, locale))}</span>
        <span className="bn-walks__where">{t.where[walk.where]}</span>
      </span>
      {walk.species.length > 0 && (
        <span className="bn-walks__birds" aria-hidden="true">
          {walk.species.slice(0, STICKERS_SHOWN).map((entry, index) => <Sticker key={entry.species} scientificName={entry.species} alt="" size="xs" order={index} />)}
        </span>
      )}
      <Icon name="chevron" size="s" />
    </a>
  );
}
