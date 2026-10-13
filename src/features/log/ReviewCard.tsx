import { useId, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { SPECIES_SEARCH_LIMIT } from '../review/review.config';
import { correctionVerdict, type Verdict } from '../review/reviewPolicy';
import { saveReview } from '../review/reviewStore';
import { searchSpecies } from '../review/speciesSearch';
import { useSpeciesNames } from '../species/speciesNames';
import type { LogRecord } from './logRecords';
import './ReviewCard.css';

export interface ReviewCardProps {
  readonly record: Pick<LogRecord, 'id' | 'species' | 'review' | 'modelSpecies'>;
}

/**
 * The verdict of the person on a detection (RF-11): it was this bird, it was another one, or it was no bird.
 * The verdict is stored on the phone at once and sent to the account with the next synchronization; it can be
 * changed at any time, and what the model said is kept apart from it.
 */
export function ReviewCard({ record }: ReviewCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.log.detail.review;
  const names = useSpeciesNames();
  const titleId = useId();
  const searchId = useId();
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const modelSpecies = record.modelSpecies ?? record.species;
  const matches = useMemo(() => (names && choosing ? searchSpecies(names, query, locale, SPECIES_SEARCH_LIMIT) : []), [names, choosing, query, locale]);

  const save = async (verdict: Verdict): Promise<void> => {
    setWorking(true);
    setFailed(false);
    try {
      await saveReview(record.id, verdict);
      setChoosing(false);
      setQuery('');
    } catch {
      setFailed(true);
    } finally { setWorking(false); }
  };

  return (
    <section className="bn-log-review" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-log-review__title">{texts.title}</h2>
      <p className="bn-log-review__hint">{texts.hint}</p>
      <div className="bn-log-review__actions">
        <Button variant={record.review === 'confirm' ? 'primary' : 'secondary'} icon="check" aria-pressed={record.review === 'confirm'} disabled={working}
          onClick={() => { void save({ action: 'confirm', species: null }); }}>{texts.confirm}</Button>
        <Button variant={record.review === 'correct' || choosing ? 'primary' : 'secondary'} icon="bird" aria-pressed={record.review === 'correct'} aria-expanded={choosing} disabled={working}
          onClick={() => { setChoosing((open) => !open); }}>{texts.correct}</Button>
        <Button variant={record.review === 'discard' ? 'primary' : 'secondary'} icon="close" aria-pressed={record.review === 'discard'} disabled={working}
          onClick={() => { void save({ action: 'discard', species: null }); }}>{texts.discard}</Button>
      </div>
      {choosing && (
        <div className="bn-log-review__picker">
          <label className="bn-log-review__label" htmlFor={searchId}>{texts.search}</label>
          <input id={searchId} className="bn-log-review__input" type="search" autoComplete="off" value={query} placeholder={texts.searchPlaceholder}
            onChange={(event) => { setQuery(event.target.value); }} />
          {matches.length > 0 && (
            <ul className="bn-log-review__matches">
              {matches.map((match) => (
                <li key={match.scientificName}>
                  <button type="button" className="bn-log-review__match" disabled={working}
                    onClick={() => { void save(correctionVerdict(match.scientificName, modelSpecies)); }}>
                    <span>{match.name}</span>
                    <span className="bn-log-review__scientific scientific">{match.scientificName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Announced, so a search that finds nothing is not mistaken for one still running. */}
          <p className="bn-log-review__empty" role="status">{names && query.trim().length > 1 && matches.length === 0 ? texts.noMatches : ''}</p>
        </div>
      )}
      {failed && <Notice tone="error" live>{texts.saveError}</Notice>}
    </section>
  );
}
