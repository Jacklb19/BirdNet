import { useId } from 'react';
import { formatCount, useI18n } from '../../i18n';
import { EmptyState } from '../../shared/ui/EmptyState';
import type { IconName } from '../../shared/ui/Icon';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { useNow } from '../../shared/useNow';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { HEARD_AGO_REFRESH_MS } from './listen.config';
import { confidenceText, heardAgoText } from './listenFormat';
import { displayStatus, heardAgo, listPhase, type SessionPhase } from './listenState';
import type { SessionSpecies } from './session';
import './SessionList.css';

export interface SessionListProps {
  readonly species: readonly SessionSpecies[];
  readonly phase: SessionPhase;
  readonly active: boolean;
}

type EmptyKey = 'idle' | 'preparingModel' | 'waitingMicrophone' | 'waiting';

const EMPTY_ICONS: Readonly<Record<EmptyKey, IconName>> = Object.freeze({
  idle: 'listen', preparingModel: 'download', waitingMicrophone: 'listen', waiting: 'bird',
});

function emptyKey(phase: SessionPhase): EmptyKey {
  if (phase === 'preparingModel' || phase === 'waitingMicrophone') return phase;
  return phase === 'listening' ? 'waiting' : 'idle';
}

/**
 * Species of the session with their confidence and state, the current singer highlighted. Session species
 * are not stored detections yet, so rows open nothing. After stopping, the list stays as the last session.
 */
export function SessionList({ species, phase, active }: SessionListProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen;
  const names = useSpeciesNames();
  const now = useNow(HEARD_AGO_REFRESH_MS, species.length > 0);
  const headingId = useId();
  const list = listPhase(active, species.length);

  if (list === 'hidden' || list === 'waiting') {
    const key = emptyKey(phase);
    return (
      <div className="bn-listen-list bn-listen-list--empty">
        <EmptyState icon={EMPTY_ICONS[key]} title={t.states[key].title}>
          <p>{t.states[key].text}</p>
          {key === 'waiting' && <p>{dict.common.absenceCaveat}</p>}
        </EmptyState>
      </div>
    );
  }

  return (
    <section className="bn-listen-list" aria-labelledby={headingId}>
      <div className="bn-listen-list__header">
        <h2 id={headingId} className="bn-listen-list__title">{list === 'live' ? t.list.live : t.list.last}</h2>
        <p className="bn-listen-list__count">{formatCount(t.list.count, species.length, locale)}</p>
      </div>
      <ul className="bn-listen-list__rows">
        {species.map((row) => {
          const singing = active && row.singingNow;
          const status = displayStatus(row.status);
          return (
            <li key={row.scientificName}>
              <SpeciesRow
                scientificName={row.scientificName}
                name={commonName(names, row.scientificName, locale, row.label)}
                status={dict.common.status[status]}
                tone={status}
                detail={t.list.detail(confidenceText(row.confidence, locale), heardAgoText(heardAgo(row.lastHeard, now, singing), locale, t))}
                singing={singing}
              />
            </li>
          );
        })}
      </ul>
      <p className="bn-listen-list__caveat">{dict.common.absenceCaveat}</p>
    </section>
  );
}
