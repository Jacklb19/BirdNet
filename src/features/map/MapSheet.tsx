import { useMemo, type Ref } from 'react';
import { routeHash } from '../../app/routes';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatCount, formatMeters, formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { useNow } from '../../shared/useNow';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import type { MapFailure, MapResult } from './mapData';
import { summarizeArea } from './mapSummary';
import { MapSpeciesRow } from './MapSpeciesRow';
import { MAP_CLOCK_TICK_MS } from './map.config';
import { SheetShell } from './SheetShell';

/**
 * What the sheet can show, in order of precedence: a build without accounts, no session, no network, a failed
 * load, the first load, data.
 */
export type SheetMode = 'unavailable' | 'signedOut' | 'offline' | 'error' | 'loading' | 'ready';

export interface MapSheetProps {
  readonly ref?: Ref<HTMLElement>;
  readonly mode: SheetMode;
  readonly result: MapResult | null;
  /** A newer view is loading while the previous result is still shown. */
  readonly updating: boolean;
  /** Cause of the failure in the 'error' mode. */
  readonly failure: MapFailure | null;
  /** Enlarged over the map (phones). The screen owns it, because every new view returns the sheet to its height. */
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onRetry: () => void;
}

/** "In this area": bottom sheet on phones, side panel over the map on wide screens. */
export function MapSheet({ ref, mode, result, updating, failure, expanded, onExpandedChange, onRetry }: MapSheetProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const m = dict.map.sheet;
  const names = useSpeciesNames();
  const now = useNow(MAP_CLOCK_TICK_MS);
  const summary = useMemo(() => (result ? summarizeArea(result.detections) : null), [result]);
  const ready = mode === 'ready' && summary !== null;
  const empty = ready && summary.detections === 0;
  // Only a list can be enlarged; without one there is no grabber either (see `listed` in MapPage).
  const expandable = ready && !empty;

  let live = '';
  if (mode === 'loading') live = dict.common.loading;
  else if (empty) live = m.empty;
  else if (ready) live = m.totals(formatCount(m.songs, summary.detections, locale), formatCount(m.species, summary.species.length, locale));

  return (
    <SheetShell ref={ref} title={m.title} summary={live} busy={updating} expandable={expandable} expanded={expanded} onExpandedChange={onExpandedChange}
      aside={updating && <span className="bn-map-sheet__updating" aria-hidden="true">{m.updating}</span>}>
      {mode === 'unavailable' && <Notice icon="map" title={m.unavailableTitle}>{m.unavailable}</Notice>}
      {mode === 'signedOut' && (
        <Notice icon="account" title={m.signedOutTitle}
          action={<Button href={routeHash({ name: 'account' })}>{m.signIn}</Button>}>
          {m.signedOut}
        </Notice>
      )}
      {mode === 'offline' && <Notice tone="caution" icon="offline" title={m.offlineTitle} live>{m.offline}</Notice>}
      {mode === 'error' && (
        <Notice tone="error" title={m.error} action={<Button variant="quiet" onClick={onRetry}>{dict.common.actions.retry}</Button>}>
          {failure === 'server' ? m.serverError : dict.common.errors.network}
        </Notice>
      )}
      {ready && (
        <>
          {result?.truncated && <Notice tone="caution" icon="map">{m.truncated(formatNumber(summary.detections, locale))}</Notice>}
          {empty ? <p className="bn-map-sheet__hint">{m.emptyHint}</p> : (
            <ul className="bn-map-sheet__list">
              {summary.species.map((entry) => (
                <li key={entry.species}>
                  <MapSpeciesRow summary={entry} name={commonName(names, entry.species, locale)} now={now} />
                </li>
              ))}
            </ul>
          )}
          <p className="bn-map-sheet__note">{m.approximate(formatMeters(APPROX_CELL_METERS, locale))}</p>
          <p className="bn-map-sheet__note">{dict.common.absenceCaveat}</p>
        </>
      )}
    </SheetShell>
  );
}
