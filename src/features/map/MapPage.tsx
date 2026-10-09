import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DEFAULT_PERIOD, type Period } from '../../config/contract';
import { useIsDesktop } from '../../config/layout';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAccountContext } from '../account/accountContext';
import { useListening } from '../listen/listeningContext';
import { useOnline } from '../offline/useQueueStatus';
import { LocateButton } from './LocateButton';
import { MapFilters } from './MapFilters';
import { MapSheet, type SheetMode } from './MapSheet';
import { MapView } from './MapView';
import { coveredEdges, NOTHING_COVERED, visibleCentreOffset, type CoveredEdges } from './mapViewport';
import { MAP_WEBGL_CONTEXT } from './map.config';
import { useLocate } from './useLocate';
import { useMapResult } from './useMapResult';
import './MapPage.css';

/** Probed once per page load: each probe creates a WebGL context, and browsers cap how many may exist at a time. */
let webGLSupport: boolean | undefined;

function supportsWebGL(): boolean {
  if (webGLSupport !== undefined) return webGLSupport;
  try {
    const context = document.createElement('canvas').getContext(MAP_WEBGL_CONTEXT);
    webGLSupport = context !== null;
    // Released at once rather than whenever the canvas is collected, so it never competes with the map's own.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webGLSupport = false;
  }
  return webGLSupport;
}

/** Full-bleed map of the community's detections with the "In this area" summary of what is visible. */
function MapScreen({ initialSpecies }: { readonly initialSpecies: string | null }): React.JSX.Element {
  const { dict } = useI18n();
  const m = dict.map;
  const { configured, session } = useAccountContext();
  const token = session?.access_token ?? null;
  const online = useOnline();
  const { active: listening } = useListening();
  const isDesktop = useIsDesktop();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // A species card opens the map already filtered to its species (`#/map?species=…`).
  const [species, setSpecies] = useState<string | null>(initialSpecies);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [listExpanded, setListExpanded] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);

  // The panel floats over the map (bottom sheet on phones, right panel on wide screens); what it covers is left
  // out of "In this area" and of the centring.
  const covered = useCallback((): CoveredEdges => {
    const sheet = sheetRef.current;
    if (!map || !sheet) return NOTHING_COVERED;
    return coveredEdges(map.getContainer().getBoundingClientRect(), sheet.getBoundingClientRect(), isDesktop ? 'right' : 'bottom');
  }, [isDesktop, map]);

  const focusOffset = useCallback((): [number, number] => {
    if (!map) return [0, 0];
    const container = map.getContainer();
    return visibleCentreOffset(container.clientWidth, container.clientHeight, covered());
  }, [map, covered]);

  const enabled = token !== null && online;
  const { result, status, failure, speciesOptions, retry } = useMapResult(map, { token, enabled, species, period, covered });
  const locate = useLocate(map, focusOffset);
  const shown = enabled ? result : null;

  // The query covers what the collapsed sheet leaves visible. Enlarged, the sheet leaves only a strip under the
  // filters, so every new view (pan, zoom, filter, retry) first returns it to its height; the list then describes
  // the area the person is looking at, not that strip.
  useEffect(() => {
    if (!map) return;
    const collapse = (): void => { setListExpanded(false); };
    map.on('movestart', collapse);
    return () => { map.off('movestart', collapse); };
  }, [map]);
  const changeSpecies = useCallback((value: string | null): void => { setListExpanded(false); setSpecies(value); }, []);
  const changePeriod = useCallback((value: Period): void => { setListExpanded(false); setPeriod(value); }, []);
  const retryLoad = useCallback((): void => { setListExpanded(false); retry(); }, [retry]);

  let mode: SheetMode = 'ready';
  if (!configured) mode = 'unavailable';
  else if (!token) mode = 'signedOut';
  else if (!online) mode = 'offline';
  else if (status === 'error') mode = 'error';
  else if (!shown) mode = 'loading';

  // Without a list (empty area, error, offline) the grabber is gone, so the sheet must not stay enlarged.
  const listed = mode === 'ready' && shown !== null && shown.detections.length > 0;
  if (listExpanded && !listed) setListExpanded(false);

  const overlay = (
    <div className="bn-map__overlay">
      {/* Filters only change what the server returns, so they are offered only when it can be asked. */}
      {enabled && (
        <MapFilters species={species} options={speciesOptions} onSpeciesChange={changeSpecies} period={period} onPeriodChange={changePeriod} />
      )}
      {locate.error && (
        <div className="bn-map__message">
          <Notice tone="error" icon="locate" action={<Button variant="quiet" onClick={locate.dismiss}>{dict.common.actions.close}</Button>}>
            {m.locateError[locate.error]}
          </Notice>
        </div>
      )}
    </div>
  );

  return (
    <Page bleed className={`bn-map${listening ? ' bn-map--with-player' : ''}`}>
      {/* The design shows no title over the map; the heading still names the screen for assistive technology. */}
      <div className="visually-hidden"><PageHeader title={m.title} /></div>
      <MapView result={shown} onReady={setMap} focusOffset={focusOffset} overlay={overlay}
        control={locate.supported ? <LocateButton busy={locate.busy} onLocate={locate.locate} /> : null} />
      <MapSheet ref={sheetRef} mode={mode} result={shown} updating={mode === 'ready' && status === 'loading'}
        failure={failure} expanded={listExpanded} onExpandedChange={setListExpanded} onRetry={retryLoad} />
    </Page>
  );
}

export default function MapPage({ species }: { readonly species: string | null }): React.JSX.Element {
  const { dict } = useI18n();
  const [webgl] = useState(supportsWebGL);
  if (webgl) return <MapScreen initialSpecies={species} />;
  return (
    <Page width="narrow">
      <PageHeader title={dict.map.title} />
      <Notice tone="error" icon="map">{dict.map.sheet.unsupported}</Notice>
    </Page>
  );
}
