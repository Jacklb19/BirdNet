import { useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { journalMessages } from './i18n';
import { JOURNAL_PAGE_SIZE } from './journal.config';
import { JournalLinks, JournalNotices, SpeciesField } from './JournalParts';
import { setRelation } from './journalStore';
import { useJournal } from './useJournal';
import './Journal.css';

export function WishButton({ species }: { readonly species: string }): React.JSX.Element | null {
  const t = journalMessages[useI18n().locale]; const state = useJournal(); const names = useSpeciesNames();
  if (!state.owner || !names || !Object.hasOwn(names, species) || !/^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/.test(species)) return null;
  const wished = state.relations.some((row) => row.kind === 'wish' && row.recordId === species && row.present);
  return <><Button variant="secondary" disabled={state.busy || !state.ready} aria-pressed={wished} onClick={() => { if (state.owner) void state.run(() => setRelation(state.owner ?? '', 'wish', '', species, !wished)); }}>{wished ? t.unwish : t.wish}</Button><JournalNotices state={state} /></>;
}
export default function WishlistPage(): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const state = useJournal(); const names = useSpeciesNames(); const [species, setSpecies] = useState('');
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const rows = state.relations.filter((row) => row.kind === 'wish' && row.present).sort((a, b) => a.recordId.localeCompare(b.recordId));
  return <Page width="narrow" className="bn-journal"><PageHeader title={t.wishlist} subtitle={t.wishHelp} back={{ href: routeHash({ name: 'journal' }), label: t.back }} /><JournalLinks /><JournalNotices state={state} />
    <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); if (!state.owner) return; void state.run(async () => { if (!/^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$/.test(species)) throw new Error('Invalid scientific name.'); await setRelation(state.owner ?? '', 'wish', '', species, true); setSpecies(''); }); }}><SpeciesField value={species} onChange={setSpecies} /><Button type="submit" disabled={state.busy}>{t.add}</Button></form>
    <ul className="bn-journal__list">{rows.slice(0, limit).map((row) => <li className="bn-journal__card" key={row.key}><a href={routeHash({ name: 'species', species: row.recordId })}>{commonName(names, row.recordId, locale)}</a><Button variant="quiet" disabled={state.busy} onClick={() => { void state.run(() => setRelation(row.owner, 'wish', '', row.recordId, false)); }}>{t.unwish}</Button></li>)}</ul>{state.ready && !state.busy && !rows.length && <p>{t.empty}</p>}{rows.length > limit && <Button variant="secondary" onClick={() => { setLimit((value) => value + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}
  </Page>;
}
