import { useId, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, formatDate, formatNumber, formatPercent, formatRelativeTime, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { SpeciesPhoto } from '../../shared/ui/SpeciesPhoto';
import { useSpeciesPhotoLoad } from '../../shared/ui/useSpeciesPhotoLoad';
import type { SpeciesSummary } from './mapSummary';
import { MAP_CONFIDENCE_FRACTION_DIGITS, MAP_SPECIES_RECENT_LIMIT } from './map.config';
import './MapSpeciesRow.css';

export interface MapSpeciesRowProps {
  readonly summary: SpeciesSummary;
  /** Common name in the active language (the scientific name when there is none). */
  readonly name: string;
  /** Reference time of the relative "last heard" phrase, epoch milliseconds. */
  readonly now: number;
}

/**
 * One species of the visible area. The row opens to list its most recent detections, so each one shows its
 * verification state and confidence without leaving the list (the map's popups are not reachable by keyboard).
 */
export function MapSpeciesRow({ summary, name, now }: MapSpeciesRowProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const m = dict.map;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // The thumbnail's photo; its credit is shown with the opened details once the image has loaded.
  const picture = useSpeciesPhotoLoad(summary.species);
  const named = name !== summary.species;
  const shown = summary.recent.slice(0, MAP_SPECIES_RECENT_LIMIT);
  const lastHeard = new Date(summary.lastHeard);

  return (
    <div className={`bn-map-row${open ? ' bn-map-row--open' : ''}`}>
      <button type="button" className="bn-map-row__toggle" aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen((value) => !value); }}>
        {/* The name follows as text; the photo would only repeat it to screen readers. */}
        <SpeciesPhoto load={picture} alt="" />
        <span className="bn-map-row__names">
          {/* Without a common name the scientific one is the name: once, and in italics. */}
          <span className={named ? 'bn-map-row__name' : 'bn-map-row__name scientific'}>{name}</span>
          {named && <span className="bn-map-row__scientific scientific">{summary.species}</span>}
          {summary.provisional > 0 && (
            <span className="bn-map-row__pending">{formatCount(m.sheet.toVerify, summary.provisional, locale)}</span>
          )}
        </span>
        <span className="bn-map-row__meta">
          <span className="bn-map-row__count">{formatCount(m.sheet.songs, summary.detections, locale)}</span>
          <time className="bn-map-row__when" dateTime={lastHeard.toISOString()}>{formatRelativeTime(lastHeard, new Date(now), locale)}</time>
        </span>
        <span className="bn-map-row__chevron"><Icon name="down" size="s" /></span>
      </button>
      <div id={panelId} className="bn-map-row__panel" hidden={!open}>
        <ul className="bn-map-row__detections" aria-label={m.species.recentLabel(name)}>
          {shown.map((row) => (
            <li key={row.id} className="bn-map-row__detection">
              <span className={`bn-map-row__status bn-map-row__status--${row.status}`}>{dict.common.status[row.status]}</span>
              <span className="bn-map-row__detail">
                {m.species.detail(formatDate(new Date(row.recorded_at), locale), formatPercent(row.confidence, locale, MAP_CONFIDENCE_FRACTION_DIGITS))}
              </span>
            </li>
          ))}
        </ul>
        {summary.detections > shown.length && (
          <p className="bn-map-row__note">{m.species.showing(formatNumber(shown.length, locale), formatNumber(summary.detections, locale))}</p>
        )}
        <a className="bn-map-row__card" href={routeHash({ name: 'species', species: summary.species })}>
          <Icon name="book" size="s" />{m.popup.card}
        </a>
        {picture.status === 'loaded' && (
          <p className="bn-map-row__note">{dict.common.photoCredit(picture.photo.author ?? dict.common.photoAuthorUnknown, picture.photo.license)}</p>
        )}
      </div>
    </div>
  );
}
