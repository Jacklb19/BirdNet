import { useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatBytes, formatCount, formatDate, formatNumber, formatPercent, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Sticker } from '../../shared/ui/Sticker';
import { birdnetWeek } from '../inference/geoFilter';
import { useRegionSpecies, type RegionSpecies } from '../inference/regionSpecies';
import { formatDayTime } from '../log/logFormat';
import { useLogRecords } from '../log/useLogRecords';
import { useOnline } from '../offline/useQueueStatus';
import { useSites } from '../sites/useSites';
import { albumEntries, matchesSearch } from './album';
import { guidePlace, useRegionGuide } from './regionGuide';
import { ALBUM_MISSING_PREVIEW, GUIDE_BYTES_PER_SPECIES, GUIDE_MAX_SPECIES } from './species.config';
import { commonName, useSpeciesNames } from './speciesNames';
import { useOwnSpecies } from './useOwnSpecies';
import './AlbumPage.css';

/** Album (ADR-17): a sticker per recorded species, the likely birds of the area still to find, and the optional offline guide. */
export default function AlbumPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.album;
  const names = useSpeciesNames();
  const online = useOnline();
  const { records, readAt } = useLogRecords();
  const cloud = useOwnSpecies();
  const { sites, active } = useSites();
  const [query, setQuery] = useState('');
  const [showAllMissing, setShowAllMissing] = useState(false);
  const searchId = useId();
  const discoverId = useId();
  const guideId = useId();

  const entries = useMemo(() => albumEntries(records ?? [], cloud), [records, cloud]);
  const visible = entries.filter((entry) => matchesSearch(query, entry.species, commonName(names, entry.species, locale)));
  // The region is the active site's, or the first saved site's: the album never asks for the device position.
  const place = active ?? sites[0] ?? null;
  const region = useRegionSpecies(place, birdnetWeek(new Date()), GUIDE_MAX_SPECIES);
  const guide = useRegionGuide(locale);
  const collected = new Set(entries.map((entry) => entry.species));
  const missing: readonly RegionSpecies[] = region.status === 'ready'
    ? region.species.filter((species) => !collected.has(species.scientificName) &&
      matchesSearch(query, species.scientificName, commonName(names, species.scientificName, locale, species.commonName)))
    : [];
  const shownMissing = showAllMissing ? missing : missing.slice(0, ALBUM_MISSING_PREVIEW);

  return (
    <Page className="bn-album">
      <PageHeader title={texts.title} subtitle={formatCount(texts.subtitle, entries.length, locale)} />

      <div className="bn-album__search">
        <label htmlFor={searchId} className="visually-hidden">{texts.search}</label>
        <Icon name="search" size="s" />
        <input id={searchId} type="search" className="bn-album__search-input" placeholder={texts.searchPlaceholder} value={query}
          autoComplete="off" spellCheck={false} onChange={(event) => { setQuery(event.target.value); }} />
      </div>

      {records !== null && entries.length === 0 && (
        <EmptyState icon="album" title={texts.empty.title}
          action={<Button href={routeHash({ name: 'listen' })} icon="listen">{texts.empty.action}</Button>}>
          {texts.empty.text}
        </EmptyState>
      )}
      {entries.length > 0 && visible.length === 0 && <p className="bn-album__muted">{texts.noMatches}</p>}

      {visible.length > 0 && (
        <ul className="bn-album__grid">
          {visible.map((entry, index) => {
            const name = commonName(names, entry.species, locale);
            return (
              <li key={entry.species}>
                <a className="bn-album__cell" href={routeHash({ name: 'species', species: entry.species })}>
                  <Sticker scientificName={entry.species} alt="" size="m" drop order={Math.min(index, ALBUM_MISSING_PREVIEW)} />
                  <span className="bn-album__name display">{name}</span>
                  {name !== entry.species && <span className="bn-album__scientific scientific">{entry.species}</span>}
                  <span className="bn-album__muted">
                    {formatCount(texts.count, entry.detections, locale)}{dict.common.separator}{formatDayTime(entry.lastAt, readAt, locale)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <section className="bn-album__discover" aria-labelledby={discoverId}>
        <h2 id={discoverId} className="bn-album__title display">{texts.discover.title}</h2>
        {!place && <p className="bn-album__muted">{texts.discover.needsPlace}</p>}
        {place && region.status === 'loading' && <p className="bn-album__muted" role="status">{texts.discover.loading}</p>}
        {place && region.status === 'unavailable' && <p className="bn-album__muted">{texts.discover.unavailable}</p>}
        {place && region.status === 'ready' && (
          <>
            <p className="bn-album__muted">{texts.discover.text(place.name)}</p>
            <ul className="bn-album__grid bn-album__grid--missing">
              {shownMissing.map((species) => {
                const name = commonName(names, species.scientificName, locale, species.commonName);
                return (
                  <li key={species.scientificName}>
                    <a className="bn-album__cell bn-album__cell--missing" href={routeHash({ name: 'species', species: species.scientificName })}
                      title={texts.discover.probability(formatPercent(species.probability, locale, 0))}>
                      <Sticker scientificName={species.scientificName} alt="" size="s" missing />
                      <span className="bn-album__name">{name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
            {missing.length > shownMissing.length && (
              <Button variant="quiet" onClick={() => { setShowAllMissing(true); }}>{texts.discover.showAll(formatNumber(missing.length, locale))}</Button>
            )}
          </>
        )}
      </section>

      {place && region.status === 'ready' && region.species.length > 0 && (
        <section className="bn-album__guide" aria-labelledby={guideId}>
          <span className="bn-album__guide-icon" aria-hidden="true"><Icon name="download" /></span>
          <div className="bn-album__guide-body">
            <h2 id={guideId} className="bn-album__guide-title">{texts.guide.title}</h2>
            <p>{texts.guide.text(formatNumber(region.species.length, locale), formatBytes(region.species.length * GUIDE_BYTES_PER_SPECIES, locale))}</p>
            {guide.saved && guide.progress.status === 'idle' && (
              <p className="bn-album__muted">{texts.guide.savedBefore(formatNumber(guide.saved.species, locale), formatDate(new Date(guide.saved.savedAt), locale))}</p>
            )}
            {guide.progress.status === 'saving' && (
              <p role="status">{texts.guide.saving(formatNumber(guide.progress.done, locale), formatNumber(guide.progress.total, locale))}</p>
            )}
            {guide.progress.status === 'saved' && (
              <Notice tone="success" icon="check" live>
                <p>{texts.guide.saved(formatNumber(guide.progress.saved, locale))}</p>
                {guide.progress.failed > 0 && <p>{texts.guide.partial(formatNumber(guide.progress.failed, locale))}</p>}
              </Notice>
            )}
            {!online && <p className="bn-album__muted">{texts.guide.offline}</p>}
            <Button variant="secondary" icon="download" aria-disabled={!online || guide.progress.status === 'saving'}
              aria-busy={guide.progress.status === 'saving'}
              onClick={() => { if (online && guide.progress.status !== 'saving') void guide.save(guidePlace(place), region.species); }}>
              {guide.saved?.place === guidePlace(place) ? texts.guide.update : texts.guide.save}
            </Button>
          </div>
        </section>
      )}

      <p className="bn-album__muted">{dict.common.absenceCaveat}</p>
    </Page>
  );
}
