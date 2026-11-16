import { useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { routeHash } from '../../app/routes';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { journalMessages } from './i18n';
import { LIST_PAGE_SIZE } from '../../config/lists';
import { JournalNotices, SpeciesField } from './JournalParts';
import { setRelation } from './journalStore';
import { useJournal } from './useJournal';
import './Journal.css';

const SCIENTIFIC_NAME = /^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/;

/** On a species card: adds the bird to the person's private list of birds of interest, or takes it out. */
export function WishButton({ species }: { readonly species: string }): React.JSX.Element | null {
  const t = journalMessages[useI18n().locale]; const state = useJournal(); const names = useSpeciesNames();
  if (!state.owner || !names || !Object.hasOwn(names, species) || !SCIENTIFIC_NAME.test(species)) return null;
  const wished = state.relations.some((row) => row.kind === 'wish' && row.recordId === species && row.present);
  return <><Button variant="secondary" icon={wished ? 'check' : 'plus'} disabled={state.busy || !state.ready} aria-pressed={wished} onClick={() => { if (state.owner) void state.run(() => setRelation(state.owner ?? '', 'wish', '', species, !wished)); }}>{wished ? t.unwish : t.wish}</Button><JournalNotices state={state} /></>;
}

/**
 * The birds the person wants to find (ADR-46, ADR-47), a part of the guide: a private list, each leading to its
 * card. During a listening session a possible match is pointed out once, without confirming the species.
 */
export function WishlistPart(): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const state = useJournal(); const names = useSpeciesNames(); const [species, setSpecies] = useState('');
  const [limit, setLimit] = useState(LIST_PAGE_SIZE);
  const rows = state.relations.filter((row) => row.kind === 'wish' && row.present)
    .sort((a, b) => commonName(names, a.recordId, locale).localeCompare(commonName(names, b.recordId, locale), locale));
  return (
    <div className="bn-journal">
      <p className="bn-journal__muted">{t.wishHelp}</p>
      <form className="bn-journal__form bn-journal__inline-form" onSubmit={(event) => {
        event.preventDefault(); if (!state.owner || !SCIENTIFIC_NAME.test(species)) return;
        void state.run(async () => { await setRelation(state.owner ?? '', 'wish', '', species, true); setSpecies(''); });
      }}>
        <SpeciesField value={species} onChange={setSpecies} />
        <Button type="submit" icon="plus" disabled={state.busy || !species}>{t.add}</Button>
      </form>
      <JournalNotices state={state} />
      {state.ready && !rows.length && <EmptyState icon="bird" title={t.wishlistEmpty}>{t.wishlistEmptyText}</EmptyState>}
      {rows.length > 0 && (
        <ul className="bn-journal__rows">
          {rows.slice(0, limit).map((row) => (
            <li key={row.key} className="bn-journal__candidate">
              <span className="bn-journal__grow">
                <SpeciesRow scientificName={row.recordId} name={commonName(names, row.recordId, locale)} photo="round" href={routeHash({ name: 'species', species: row.recordId })} />
              </span>
              <Button variant="quiet" disabled={state.busy} aria-label={`${t.unwish}: ${commonName(names, row.recordId, locale)}`}
                onClick={() => { void state.run(() => setRelation(row.owner, 'wish', '', row.recordId, false)); }}>{t.removeShort}</Button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && <Button variant="secondary" block onClick={() => { setLimit((value) => value + LIST_PAGE_SIZE); }}>{t.showMore}</Button>}
    </div>
  );
}
