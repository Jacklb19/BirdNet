import { useId } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, formatDistance, useI18n } from '../../i18n';
import { formatClock } from '../../shared/time';
import { Button } from '../../shared/ui/Button';
import { Sticker } from '../../shared/ui/Sticker';
import { useAccountContext } from '../account/accountContext';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useWalkData } from './useWalkData';
import { useWalkDetail } from './useWalks';
import { WalkSaveChoice } from './WalkSaveChoice';
import { WalkSketch } from './WalkSketch';
import { walkTitle } from './walkText';
import './WalkDoneCard.css';

/** Stickers of the birds heard that land on the card; the walk's page lists them all. */
const STICKERS_SHOWN = 5;

/**
 * Shown on the map right after a walk ends: its drawing, how far and how long, the birds that landed, the way to
 * the walk's page (name, export) and, for a signed-in person who has not answered, whether to save walks in the account.
 */
export function WalkDoneCard({ id, onDismiss }: { readonly id: string; readonly onDismiss: () => void }): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const t = dict.walk;
  const titleId = useId();
  const names = useSpeciesNames();
  const detail = useWalkDetail(id, 0);
  const { session } = useAccountContext();
  const { settings } = useOfflineSettings();
  const { walks } = useWalkData();
  if (detail.status !== 'ready') return null;
  const walk = detail.walk;
  const asks = Boolean(session) && settings !== null && settings.saveWalks === undefined;
  const phoneWalks = walks.filter((entry) => !entry.owner || entry.owner === session?.user.id).length;
  const duration = walk.endedAt === null ? t.interrupted : formatClock(walk.endedAt - walk.startedAt);
  return (
    <section className="bn-walk-done" aria-labelledby={titleId}>
      <div className="bn-walk-done__head">
        <div>
          <h3 id={titleId} className="label bn-walk-done__kicker">{t.done.title}</h3>
          <p className="bn-walk-done__name display">{walkTitle(walk.name, walk.startedAt, locale, t.defaultName)}</p>
          <p className="bn-walk-done__line">{t.line(formatDistance(walk.meters, locale), duration, formatCount(t.species, walk.species.length, locale))}</p>
        </div>
        <Button variant="quiet" onClick={onDismiss}>{t.done.dismiss}</Button>
      </div>
      {walk.track.length > 0 && <WalkSketch track={walk.track} marks={walk.places} label={t.sketchLabel(formatDistance(walk.meters, locale))} />}
      {walk.species.length > 0 && (
        <ul className="bn-walk-done__birds" aria-label={t.heardTitle}>
          {walk.species.slice(0, STICKERS_SHOWN).map((entry, index) => (
            <li key={entry.species}><Sticker scientificName={entry.species} alt={commonName(names, entry.species, locale)} size="xs" drop order={index} /></li>
          ))}
        </ul>
      )}
      <Button variant="secondary" block href={routeHash({ name: 'walk', id })}>{t.done.view}</Button>
      {asks && <WalkSaveChoice phoneWalks={phoneWalks} />}
    </section>
  );
}
