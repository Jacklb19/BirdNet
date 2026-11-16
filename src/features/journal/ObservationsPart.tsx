import { useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { journalMessages } from './i18n';
import { JOURNAL_PAGE_SIZE } from './journal.config';
import { JournalNotices } from './JournalParts';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import './Journal.css';

/**
 * The birds the person saw (ADR-46, ADR-47): manual records with their own origin and no model confidence, newest
 * first. They are listed apart from the songs, so no acoustic summary ever counts them.
 */
export function ObservationsPart(): React.JSX.Element {
  const { locale } = useI18n();
  const t = journalMessages[locale];
  const names = useSpeciesNames();
  const state = useJournal();
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const rows = state.entities
    .filter((entry): entry is EntityRecord<'observation'> => entry.kind === 'observation' && (!entry.deleted || entry.conflict))
    .sort((a, b) => b.data.observed_at.localeCompare(a.data.observed_at) || a.id.localeCompare(b.id));
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="bn-journal">
      <JournalNotices state={state} />
      {state.ready && !rows.length && (
        <EmptyState icon="camera" title={t.observationsEmpty}
          action={<Button icon="camera" href={routeHash({ name: 'observations' })}>{t.newObservation}</Button>}>
          {t.manualHelp}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <ul className="bn-journal__rows">
          {rows.slice(0, limit).map((row) => (
            <li key={row.id}>
              <SpeciesRow scientificName={row.data.species} name={commonName(names, row.data.species, locale)}
                href={routeHash({ name: 'observations', id: row.id })} status={row.conflict ? t.conflictShort : t.manual}
                tone={row.conflict ? 'provisional' : 'neutral'}
                detail={`${when.format(new Date(row.data.observed_at))}${row.data.individuals ? ` · ${t.individualsShort(String(row.data.individuals))}` : ''}`} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && <Button variant="secondary" block onClick={() => { setLimit((value) => value + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}
    </div>
  );
}
