import { useCallback, useEffect, useId, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatDate, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { useAccountContext } from '../account/accountContext';
import { useOnline } from '../offline/useQueueStatus';
import { failureOf, fetchWrittenCard, writeCard, type CardFailure, type WrittenCard } from './speciesCardApi';
import './WrittenCardSection.css';

const DATE_ONLY: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: undefined };

type CardState =
  | { readonly status: 'loading' | 'none' | 'unavailable' | 'writing' }
  | { readonly status: 'failed'; readonly failure: CardFailure; readonly card: WrittenCard | null }
  | { readonly status: 'loaded'; readonly card: WrittenCard };

/**
 * The plain-language card the language model writes from GBIF and Wikipedia (RF-14). It sits apart from the Wikipedia
 * summary and always says who wrote it and from what: it is never presented as the summary itself, nor as certain.
 */
export function WrittenCardSection({ species }: { readonly species: string }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.species.card.written;
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  const headingId = useId();
  const key = `${locale}:${species}`;
  const [state, setState] = useState<{ readonly key: string; readonly value: CardState } | null>(null);
  const current = state?.key === key ? state.value : { status: 'loading' as const };

  useEffect(() => {
    let active = true;
    fetchWrittenCard(species, locale)
      .then((card) => { if (active) setState({ key, value: card ? { status: 'loaded', card } : { status: 'none' } }); })
      .catch(() => { if (active) setState({ key, value: { status: 'unavailable' } }); });
    return () => { active = false; };
  }, [species, locale, key]);

  const shown = current.status === 'loaded' || current.status === 'failed' ? current.card : null;
  const write = useCallback(() => {
    if (!token) return;
    setState({ key, value: { status: 'writing' } });
    writeCard(token, species, locale)
      .then((card) => { setState({ key, value: { status: 'loaded', card } }); })
      .catch((error: unknown) => { setState({ key, value: { status: 'failed', failure: failureOf(error), card: shown } }); });
  }, [token, species, locale, key, shown]);

  const canWrite = token !== null && online;
  const writeButton = (label: string, quiet = false): React.JSX.Element => (
    <Button variant={quiet ? 'quiet' : undefined} icon="generated" disabled={!canWrite} onClick={write}>{label}</Button>
  );

  return (
    <section className="bn-species-page__card bn-written-card" aria-labelledby={headingId} aria-busy={current.status === 'writing'}>
      <h2 id={headingId} className="bn-species-page__title label">{t.title}</h2>
      {current.status === 'loading' && <p className="bn-species-page__muted" role="status">{dict.common.loading}</p>}
      {current.status === 'unavailable' && <p className="bn-species-page__muted">{t.unavailable}</p>}
      {current.status === 'writing' && <p className="bn-written-card__writing" role="status"><Icon name="generated" size="s" />{t.writing}</p>}

      {shown && (
        <>
          <p className="bn-written-card__badge"><Icon name="generated" size="s" />{t.badge}</p>
          <div className="bn-written-card__text">
            {shown.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <p className="bn-species-page__muted">
            {t.basedOn}{' '}
            {shown.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 && dict.common.separator}
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a> ({source.license})
              </span>
            ))}
            {dict.common.separator}{t.writtenOn(formatDate(new Date(shown.generatedAt), locale, DATE_ONLY))}
          </p>
          {shown.stale && token && writeButton(t.rewrite, true)}
        </>
      )}

      {(current.status === 'none' || (current.status === 'failed' && !shown)) && (
        <>
          {current.status === 'none' && <p className="bn-species-page__muted">{t.none}</p>}
          {token ? current.status === 'failed' && current.failure === 'unknownSpecies' ? null : writeButton(t.write) : (
            <p className="bn-species-page__muted">
              {t.needsAccount} <a href={routeHash({ name: 'account' })}>{t.signIn}</a>
            </p>
          )}
        </>
      )}
      {token && !online && (current.status === 'none' || shown?.stale) && <p className="bn-species-page__muted">{t.needsConnection}</p>}
      {current.status === 'failed' && <Notice tone={current.failure === 'quota' ? 'caution' : 'error'} live>{t.failures[current.failure]}</Notice>}
      {current.status === 'none' && token && <p className="bn-species-page__muted">{t.howItIsWritten}</p>}
    </section>
  );
}
