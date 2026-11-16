import { useEffect, useSyncExternalStore } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { registerAccountActivity } from '../account/sessionActivity';
import { useListening } from '../listen/listeningContext';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { journalMessages } from './i18n';
import { useJournal } from './useJournal';
import { WishlistNotices } from './wishlistMatches';

const notices = new WishlistNotices();
export function WishlistNotice(): React.JSX.Element | null {
  const { locale } = useI18n(); const t = journalMessages[locale]; const names = useSpeciesNames(); const state = useJournal(); const session = useListening();
  const match = useSyncExternalStore(notices.subscribe, () => notices.snapshot(state.owner, session.startedAt));
  useEffect(() => registerAccountActivity(() => { notices.clear(); return Promise.resolve(); }), []);
  useEffect(() => {
    if (!state.owner || !session.active || session.startedAt === null) return;
    const wished = new Set(state.relations.filter((row) => row.kind === 'wish' && row.present).map((row) => row.recordId));
    notices.claim(state.owner, session.startedAt, session.species.filter((row) => row.singingNow).map((row) => row.scientificName), wished);
  }, [state.owner, state.relations, session.active, session.startedAt, session.species]);
  return match && session.active ? <Notice tone="info" live action={<Button variant="quiet" href={routeHash({ name: 'species', species: match })}>{t.openRecord}</Button>}>{t.possible(commonName(names, match, locale))}</Notice> : null;
}
