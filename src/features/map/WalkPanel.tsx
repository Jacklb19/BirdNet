import { useMemo, useState, type Ref } from 'react';
import { routeHash } from '../../app/routes';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatCount, formatDistance, formatMeters, formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Sticker } from '../../shared/ui/Sticker';
import { formatClock } from '../../shared/time';
import { useElapsed } from '../../shared/useElapsed';
import { useNow } from '../../shared/useNow';
import { useAccountContext } from '../account/accountContext';
import { useListening } from '../listen/listeningContext';
import { showsSessionError, startBlocker } from '../listen/listenState';
import { SessionErrorNotice } from '../listen/SessionErrorNotice';
import { sharesMap } from '../offline/queuePolicy';
import { useModel } from '../offline/useModel';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { requestSettingsSection } from '../settings/settingsSections';
import { plateStyle, usePlumage } from '../species/plumage';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useWalk } from '../walk/walkContext';
import { trackMeters } from '../walk/walkGeometry';
import type { WalkTotals } from '../walk/walkPins';
import type { MapResult } from './mapData';
import { summarizeArea } from './mapSummary';
import { MapSpeciesRow } from './MapSpeciesRow';
import { MAP_CLOCK_TICK_MS } from './map.config';
import { SheetShell } from './SheetShell';
import './WalkPanel.css';

export interface WalkPanelProps {
  readonly ref?: Ref<HTMLElement>;
  /** The person's songs that pass the map filters; null while the phone's records are being read. */
  readonly result: MapResult | null;
  /** Everything walked and heard so far, whatever the filters. */
  readonly totals: WalkTotals;
  readonly territoriesShown: boolean;
  readonly loadError: boolean;
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
}

/** The bird of the moment during a walk: its plate takes its plumage, as on the listening screen. */
function WalkNow(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.map.walk;
  const names = useSpeciesNames();
  const { singing, species } = useListening();
  const bird = singing ?? species[0] ?? null;
  const plumage = usePlumage(bird?.scientificName ?? null);
  if (!bird) {
    return (
      <div className="bn-walk-now bn-walk-now--waiting">
        <span className="bn-walk-now__rings" aria-hidden="true"><span /><span /></span>
        <span className="bn-walk-now__text">
          <span className="bn-walk-now__name display">{t.waiting}</span>
          <span>{t.waitingText}</span>
        </span>
      </div>
    );
  }
  return (
    <a className="bn-walk-now bn-plate" style={plateStyle(plumage)} href={routeHash({ name: 'species', species: bird.scientificName })}>
      <Sticker key={bird.scientificName} scientificName={bird.scientificName} alt="" size="xs" drop />
      <span className="bn-walk-now__text">
        <span className="label">{singing ? t.now : t.last}</span>
        <span className="bn-walk-now__name display">{commonName(names, bird.scientificName, locale, bird.label)}</span>
      </span>
    </a>
  );
}

/**
 * The panel of the person's own map (ADR-25). During a walk: who is singing, how far and how long, and the stop
 * control. Otherwise: the door to a walk, what has been covered so far, and the birds heard, so a first visit
 * explains itself instead of showing an empty list.
 */
export function WalkPanel({ ref, result, totals, territoriesShown, loadError, expanded, onExpandedChange }: WalkPanelProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.map.walk;
  const names = useSpeciesNames();
  const walk = useWalk();
  const session = useListening();
  const model = useModel();
  const { settings } = useOfflineSettings();
  const { session: account } = useAccountContext();
  const now = useNow(MAP_CLOCK_TICK_MS);
  const elapsed = useElapsed(walk.startedAt);
  const [startFailed, setStartFailed] = useState(false);
  const summary = useMemo(() => (result ? summarizeArea(result.detections) : null), [result]);
  const distance = formatMeters(APPROX_CELL_METERS, locale);
  const blocker = startBlocker(model.state);
  const listed = !walk.walking && summary !== null && summary.detections > 0;

  const begin = (): void => {
    setStartFailed(false);
    void walk.start().then((started) => { setStartFailed(!started); });
  };

  if (walk.walking) {
    const fix = walk.fix === 'found' ? t.fix.found(distance) : t.fix[walk.fix];
    return (
      <SheetShell ref={ref} title={t.liveTitle} summary={fix} expandable={false} expanded={false} onExpandedChange={onExpandedChange}>
        <dl className="bn-walk-stats">
          <div><dt className="label">{t.stats.time}</dt><dd className="display">{formatClock(elapsed)}</dd></div>
          <div><dt className="label">{t.stats.distance}</dt><dd className="display">{formatDistance(trackMeters(walk.track), locale)}</dd></div>
          <div><dt className="label">{t.stats.species}</dt><dd className="display">{formatNumber(session.species.length, locale)}</dd></div>
        </dl>
        <WalkNow />
        <Button variant="secondary" block onClick={() => { void walk.stop(); }}>{t.stop}</Button>
        <p className="bn-map-sheet__note">{walk.keepsScreenOn ? t.screenOn : t.screenManual}</p>
      </SheetShell>
    );
  }

  const heardLine = dict.map.sheet.totals(formatCount(dict.map.sheet.songs, totals.songs, locale), formatCount(dict.map.sheet.species, totals.species, locale));
  // Songs heard in place have a pin but no path, so walks are counted only once there is one.
  const totalsLine = totals.walks > 0
    ? t.totals(formatCount(t.walks, totals.walks, locale), formatDistance(totals.meters, locale), formatCount(dict.map.sheet.species, totals.species, locale))
    : totals.songs > 0 ? heardLine : t.noWalks;
  const sharing = !account ? t.sharing.local : sharesMap(settings ?? {}) ? t.sharing.shared : t.sharing.own;

  return (
    <SheetShell ref={ref} title={t.title} summary={result === null && !loadError ? dict.common.loading : totalsLine}
      expandable={listed} expanded={expanded} onExpandedChange={onExpandedChange}>
      {loadError && <Notice tone="error">{t.loadError}</Notice>}
      {/* A session already running in place keeps its own control (the live player); a walk starts from idle. */}
      {!session.active && (
        <div className="bn-walk-start">
          <Button variant="accent" icon="walk" block disabled={blocker !== null} onClick={begin}>
            {blocker ? dict.listen.record[blocker] : t.start}
          </Button>
          <p className="bn-map-sheet__note">{t.how(distance)}</p>
        </div>
      )}
      {startFailed && <Notice tone="error" live>{t.startFailed}</Notice>}
      {/* A walk that could not start, or ended on an error, says why here: the person is not on the listening screen. */}
      {session.sessionError !== null && showsSessionError(session.sessionError, model.state) && <SessionErrorNotice error={session.sessionError} />}
      {listed && (
        <>
          <h3 className="label bn-walk-heading">{t.heard}</h3>
          <ul className="bn-map-sheet__list">
            {summary.species.map((entry) => (
              <li key={entry.species}>
                <MapSpeciesRow summary={entry} name={commonName(names, entry.species, locale)} now={now} />
              </li>
            ))}
          </ul>
        </>
      )}
      {summary !== null && summary.detections === 0 && totals.songs > 0 && <p className="bn-map-sheet__hint">{t.filteredOut}</p>}
      {territoriesShown && totals.songs > 0 && (
        <p className="bn-map-sheet__note bn-walk-legend"><Icon name="layers" size="s" />{t.territories}</p>
      )}
      <p className="bn-map-sheet__note">
        {sharing}{' '}
        {account && (
          <a className="bn-walk-link" href={routeHash({ name: 'settings' })} onClick={() => { requestSettingsSection('permissions'); }}>{t.sharing.change}</a>
        )}
      </p>
      <p className="bn-map-sheet__note">{dict.common.absenceCaveat}</p>
    </SheetShell>
  );
}
