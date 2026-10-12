import { useId, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { SpeciesPhoto } from '../../shared/ui/SpeciesPhoto';
import { SpeciesRow, type StatusTone } from '../../shared/ui/SpeciesRow';
import { formatConfidence, formatTime } from './logFormat';
import { displayStatus, type LogRecord, type SpeciesGroup } from './logRecords';
import './LogSpeciesGroup.css';

/** A discarded record has no state color: it is no longer an indication of the bird. */
function toneOf(record: Pick<LogRecord, 'status' | 'review'>): StatusTone {
  const shown = displayStatus(record);
  return shown === 'discarded' ? 'neutral' : shown;
}

export interface LogSpeciesGroupProps {
  readonly group: SpeciesGroup;
  /** Common name in the active language (the scientific name when there is none). */
  readonly name: string;
}

/**
 * Every song of one species on one day, as a single row: how many, between which hours and the best confidence.
 * A bird that sings all morning is one line, not dozens. The row opens to list each record, which still leads to
 * its own detail; what is unverified or not uploaded is counted on the row, so folding hides nothing that matters.
 */
export function LogSpeciesGroup({ group, name }: LogSpeciesGroupProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.log.group;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [only] = group.records;

  // One record needs no folding: the row is the record.
  if (group.records.length === 1 && only) {
    return (
      <SpeciesRow href={routeHash({ name: 'detection', id: only.id })} scientificName={group.species} name={name}
        status={dict.common.status[displayStatus(only)]} tone={toneOf(only)}
        detail={[formatTime(only.recordedAt, locale), formatConfidence(only.confidence, locale)].join(dict.common.separator)} />
    );
  }

  const named = name !== group.species;
  const hours = t.between(formatTime(group.firstAt, locale), formatTime(group.lastAt, locale));
  return (
    <div className={`bn-log-group${open ? ' bn-log-group--open' : ''}`}>
      <button type="button" className="bn-log-group__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => { setOpen((value) => !value); }}>
        {/* The name follows as text; the photo would only repeat it to screen readers. */}
        <SpeciesPhoto scientificName={group.species} alt="" />
        <span className="bn-log-group__names">
          <span className={named ? 'bn-log-group__name' : 'bn-log-group__name scientific'}>{name}</span>
          <span className="bn-log-group__detail">{[hours, t.best(formatConfidence(group.bestConfidence, locale))].join(dict.common.separator)}</span>
          {(group.toVerify > 0 || group.notUploaded > 0) && (
            <span className="bn-log-group__flags">
              {group.toVerify > 0 && <span className="bn-log-group__flag bn-log-group__flag--verify">{formatCount(t.toVerify, group.toVerify, locale)}</span>}
              {group.notUploaded > 0 && <span className="bn-log-group__flag">{formatCount(t.notUploaded, group.notUploaded, locale)}</span>}
            </span>
          )}
        </span>
        <span className="bn-log-group__count">{formatCount(dict.log.today.detections, group.records.length, locale)}</span>
        <span className="bn-log-group__chevron"><Icon name="down" size="s" /></span>
      </button>
      <ul id={panelId} className="bn-log-group__records" hidden={!open} aria-label={t.records(name)}>
        {open && group.records.map((record) => (
          <li key={record.id}>
            <a className="bn-log-group__record" href={routeHash({ name: 'detection', id: record.id })}>
              <span className="bn-log-group__time">{formatTime(record.recordedAt, locale)}</span>
              <span className={`bn-log-group__status bn-log-group__status--${displayStatus(record)}`}>{dict.common.status[displayStatus(record)]}</span>
              <span className="bn-log-group__confidence">{formatConfidence(record.confidence, locale)}</span>
              <Icon name="chevron" size="s" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
