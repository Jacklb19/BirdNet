import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { routeHash } from '../../app/routes';
import { DEFAULT_PERIOD, type Period } from '../../config/contract';
import { useIsDesktop } from '../../config/layout';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Segmented } from '../../shared/ui/Segmented';
import { useAccountContext } from '../account/accountContext';
import { useListening } from '../listen/listeningContext';
import { useOnline } from '../offline/useQueueStatus';
import { useWalkData } from '../walk/useWalkData';
import { TERRITORY_HEX_METERS, WALK_FOLLOW_ZOOM } from '../walk/walk.config';
import { useWalk } from '../walk/walkContext';
import { territories } from '../walk/walkGeometry';
import { walkTotals } from '../walk/walkPins';
import { LocateButton } from './LocateButton';
import { MapFilters } from './MapFilters';
import { MapSheet, type SheetMode } from './MapSheet';
import { MapView } from './MapView';
import { coveredEdges, NOTHING_COVERED, visibleCentreOffset, type CoveredEdges } from './mapViewport';
import { NO_WALK_OVERLAY, type WalkOverlay } from './mapWalkLayers';
import { MAP_OWN_FIT, MAP_SCOPES, MAP_WEBGL_CONTEXT, type MapScope } from './map.config';
import { ownExtent, ownMap } from './ownMap';
import { useLocate } from './useLocate';
import { useMapResult } from './useMapResult';
import { WalkPanel } from './WalkPanel';
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

/**
 * Full-bleed map with two scopes (ADR-25). "My map" is read from the phone: the songs pinned where they were heard,
 * the paths of the walks and the territories they uncover, live during a walk. "Everyone's" asks the server for the
 * community's shared songs in the visible area.
 */
function MapScreen({ initialSpecies }: { readonly initialSpecies: string | null }): React.JSX.Element {
  const { dict } = useI18n();
  const m = dict.map;
  const { configured, session } = useAccountContext();
  const token = session?.access_token ?? null;
  const online = useOnline();
  const { active: listening, walking } = useListening();
  const walk = useWalk();
  const own = useWalkData();
  const isDesktop = useIsDesktop();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // A species card opens the map already filtered to its species (`#/map?species=…`).
  const [species, setSpecies] = useState<string | null>(initialSpecies);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [listExpanded, setListExpanded] = useState(false);
  const [scope, setScope] = useState<MapScope>('mine');
  const [territoriesOn, setTerritoriesOn] = useState(true);
  // The camera follows a walk until the person drags the map; the locate button takes it back.
  const [following, setFollowing] = useState(true);
  const framed = useRef(false);
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

  const mine = scope === 'mine';
  const enabled = !mine && token !== null && online;
  const { result, status, failure, speciesOptions, retry } = useMapResult(map, { token, enabled, species, period, covered });
  const locate = useLocate(map, focusOffset);
  const shown = enabled ? result : null;

  const view = useMemo(
    () => ownMap(own.pins ?? [], own.walks, { species, walking: walk.walking }),
    [own.pins, own.walks, species, walk.walking],
  );
  const totals = useMemo(() => walkTotals(own.walks, own.pins ?? []), [own.walks, own.pins]);
  const overlayData = useMemo<WalkOverlay>(() => (mine ? {
    tracks: walk.walking ? [...view.tracks, walk.track] : view.tracks,
    territories: territoriesOn ? territories(view.result.detections, TERRITORY_HEX_METERS) : [],
  } : NO_WALK_OVERLAY), [mine, view, walk.walking, walk.track, territoriesOn]);

  // Opens on what the person has covered, once: after that the camera is theirs.
  useEffect(() => {
    if (!map || framed.current || !mine || walk.walking || own.pins === null) return;
    framed.current = true;
    const extent = ownExtent(view);
    if (!extent) return;
    const hidden = covered();
    map.fitBounds(extent, {
      padding: { top: MAP_OWN_FIT.paddingPx, left: MAP_OWN_FIT.paddingPx, right: hidden.right + MAP_OWN_FIT.paddingPx, bottom: hidden.bottom + MAP_OWN_FIT.paddingPx },
      maxZoom: MAP_OWN_FIT.maxZoom, animate: false,
    });
  }, [map, mine, walk.walking, own.pins, view, covered]);

  useEffect(() => {
    if (!map) return;
    const release = (): void => { setFollowing(false); };
    map.on('dragstart', release);
    return () => { map.off('dragstart', release); };
  }, [map]);

  useEffect(() => {
    if (!map || !mine || !following || !walk.position) return;
    // Not marked essential, so MapLibre jumps without animation when reduced motion is requested.
    map.easeTo({ center: [walk.position.longitude, walk.position.latitude], zoom: Math.max(map.getZoom(), WALK_FOLLOW_ZOOM), offset: focusOffset() });
  }, [map, mine, following, walk.position, focusOffset]);

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
  const changeScope = useCallback((value: MapScope): void => { setListExpanded(false); setScope(value); }, []);
  const centre = useCallback((): void => { setFollowing(true); locate.locate(); }, [locate]);

  let mode: SheetMode = 'ready';
  if (!configured) mode = 'unavailable';
  else if (!token) mode = 'signedOut';
  else if (!online) mode = 'offline';
  else if (status === 'error') mode = 'error';
  else if (!shown) mode = 'loading';

  // Without a list (empty area, error, offline) the grabber is gone, so the sheet must not stay enlarged.
  const listed = mine ? !walk.walking && view.result.detections.length > 0 : mode === 'ready' && shown !== null && shown.detections.length > 0;
  if (listExpanded && !listed) setListExpanded(false);

  const overlay = (
    <div className="bn-map__overlay">
      <div className="bn-map__scope">
        <Segmented variant="chips" label={m.scope.label} value={scope} onChange={changeScope}
          options={MAP_SCOPES.map((value) => ({ value, label: m.scope[value] }))} />
        <span className="bn-map__tools">
          {mine && (
            <button type="button" className="bn-map__tool" aria-pressed={territoriesOn} aria-label={m.tools.territories} title={m.tools.territories}
              onClick={() => { setTerritoriesOn((value) => !value); }}>
              <Icon name="layers" />
            </button>
          )}
          <a className="bn-map__tool" href={routeHash({ name: 'sites' })} aria-label={m.tools.places} title={m.tools.places}><Icon name="sites" /></a>
        </span>
      </div>
      {/* Filters need something to filter: the person's own songs (hidden during a walk, which shows it all), or a server to ask. */}
      {mine && !walk.walking && view.speciesOptions.length > 0 && (
        <MapFilters species={species} options={view.speciesOptions} onSpeciesChange={changeSpecies} />
      )}
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
    <Page bleed className={`bn-map${listening && !walking ? ' bn-map--with-player' : ''}`}>
      {/* The design shows no title over the map; the heading still names the screen for assistive technology. */}
      <div className="visually-hidden"><PageHeader title={m.title} /></div>
      <MapView result={mine ? view.result : shown} onReady={setMap} focusOffset={focusOffset} overlay={overlay} walk={overlayData}
        position={mine && walk.walking ? walk.position : null}
        control={locate.supported ? <LocateButton busy={locate.busy} onLocate={centre} /> : null} />
      {mine ? (
        <WalkPanel ref={sheetRef} result={own.pins === null ? null : view.result} totals={totals} territoriesShown={territoriesOn}
          loadError={own.error} expanded={listExpanded} onExpandedChange={setListExpanded} />
      ) : (
        <MapSheet ref={sheetRef} mode={mode} result={shown} updating={mode === 'ready' && status === 'loading'}
          failure={failure} expanded={listExpanded} onExpandedChange={setListExpanded} onRetry={retryLoad} />
      )}
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
