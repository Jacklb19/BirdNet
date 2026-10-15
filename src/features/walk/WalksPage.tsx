import { routeHash } from '../../app/routes';
import { formatCount, formatDistance, useI18n } from '../../i18n';
import { formatClock } from '../../shared/time';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Sticker } from '../../shared/ui/Sticker';
import { formatDayTime } from '../log/logFormat';
import { useWalkList, type WalkView } from './useWalks';
import { WalkSketch } from './WalkSketch';
import { walkTitle } from './walkText';
import './WalksPage.css';

/** Species stickers shown on a walk of the list; the walk's page lists them all. */
const STICKERS_SHOWN = 3;

function WalkItem({ walk, now }: { readonly walk: WalkView; readonly now: Date }): React.JSX.Element {
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

/** Every walk of the person (ADR-35): those on this phone and those in their account, newest first. */
export default function WalksPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.walk;
  const list = useWalkList();
  const now = new Date();
  const walks = list.walks;
  const accountNote = list.account === 'loading' ? t.accountLoading : list.account === 'error' ? t.accountError : list.account === 'offline' ? t.accountOffline : null;

  return (
    <Page width="narrow" className="bn-walks">
      <PageHeader back={{ href: routeHash({ name: 'log' }), label: dict.log.title }} title={t.listTitle}
        subtitle={walks?.length ? formatCount(t.listSubtitle, walks.length, locale) : undefined} />
      {accountNote && <Notice tone={list.account === 'error' ? 'caution' : 'info'} icon={list.account === 'offline' ? 'offline' : undefined} live>{accountNote}</Notice>}
      {walks === null && <p role="status">{dict.common.loading}</p>}
      {walks?.length === 0 && list.account !== 'loading' && (
        <EmptyState icon="walk" title={t.empty.title} action={<Button href={routeHash({ name: 'map' })} icon="walk">{t.empty.action}</Button>}>
          <p>{t.empty.text}</p>
        </EmptyState>
      )}
      {walks && walks.length > 0 && (
        <ul className="bn-walks__list">
          {walks.map((walk) => <li key={walk.id}><WalkItem walk={walk} now={now} /></li>)}
        </ul>
      )}
      {list.hasMore && (
        <Button variant="secondary" block aria-busy={list.loadingMore} onClick={list.loadMore}>{list.loadingMore ? dict.common.loading : t.loadMore}</Button>
      )}
    </Page>
  );
}
