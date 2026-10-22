import { useEffect, useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, formatNumber, selectPlural, useI18n, type Messages } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { ChorusClock } from '../../shared/ui/ChorusClock';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { Page } from '../../shared/ui/Page';
import { Segmented } from '../../shared/ui/Segmented';
import { useAccountContext } from '../account/accountContext';
import { AccountRecordingButton } from '../recordings/AccountRecordingButton';
import { useLocalRecordingUsage } from '../recordings/useRecordings';
import { formatConfidence, formatDayTime, formatTime } from '../log/logFormat';
import { useLogRecords } from '../log/useLogRecords';
import { useOnline } from '../offline/useQueueStatus';
import { useSites } from '../sites/useSites';
import { IUCN_SCALE, useTaxon, type IucnCode, type TaxonState } from './gbif';
import { RangeMap } from './RangeMap';
import { SPECIES_RECENT_RECORDS } from './species.config';
import { fetchSpeciesRecord, type SpeciesRecord } from './speciesApi';
import { commonName, useSpeciesNames } from './speciesNames';
import { SpeciesPlate } from './SpeciesPlate';
import { bestFacts, busiestHour, cloudFacts, phoneFacts } from './speciesRecord';
import { SUMMARY_LICENSE, useSpeciesSummary } from './speciesSummary';
import { ReferenceSoundsSection } from './ReferenceSoundsSection';
import { WrittenCardSection } from './WrittenCardSection';
import './SpeciesPage.css';

/** The account's cloud record of the species, when signed in and online; null otherwise or while it loads. */
function useCloudRecord(species: string): SpeciesRecord | null {
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  const [found, setFound] = useState<{ readonly key: string; readonly record: SpeciesRecord } | null>(null);
  const key = `${token ?? ''}:${species}`;
  useEffect(() => {
    if (!token || !online) return;
    let active = true;
    // Offline or failing, the card falls back to what the phone holds.
    fetchSpeciesRecord(token, species).then((record) => { if (active) setFound({ key, record }); }).catch(() => undefined);
    return () => { active = false; };
  }, [token, online, species, key]);
  return found?.key === key ? found.record : null;
}

type CardTexts = Messages['species']['card'];

/** The two halves of the card: what is known about the bird, and what the person has recorded of it. */
const CARD_TABS = ['about', 'own'] as const;
type CardTab = (typeof CARD_TABS)[number];

/** The Red List category in plain words, with its place on the threat scale when it has one (DD and NE do not). */
function ConservationStatus({ code, texts }: { readonly code: IucnCode; readonly texts: CardTexts['facts'] }): React.JSX.Element {
  const onScale = (IUCN_SCALE as readonly IucnCode[]).includes(code);
  return (
    <span className="bn-species-page__iucn">
      {onScale && (
        // Decorative: the words beside it say the same.
        <span className="bn-species-page__scale" aria-hidden="true">
          {IUCN_SCALE.map((step) => (
            <span key={step} className={`bn-species-page__step bn-species-page__step--${step.toLowerCase()}${step === code ? ' bn-species-page__step--current' : ''}`} />
          ))}
        </span>
      )}
      <span>{texts.withCode(texts.iucn[code], code)}</span>
    </span>
  );
}

/** Order, family and conservation status from GBIF; one line when they cannot be shown. */
function FactSheet({ taxon, texts, loading }: { readonly taxon: TaxonState; readonly texts: CardTexts['facts']; readonly loading: string }): React.JSX.Element {
  if (taxon.status === 'loading') return <p className="bn-species-page__muted" role="status">{loading}</p>;
  if (taxon.status === 'none') return <p className="bn-species-page__muted">{texts.none}</p>;
  if (taxon.status !== 'loaded') return <p className="bn-species-page__muted">{texts.unavailable}</p>;
  const { conservation } = taxon;
  return (
    <>
      <dl className="bn-species-page__facts">
        <div className="bn-species-page__fact">
          <dt className="label">{texts.order}</dt>
          <dd>{taxon.taxon.order}</dd>
        </div>
        <div className="bn-species-page__fact">
          <dt className="label">{texts.family}</dt>
          <dd>{taxon.taxon.family}</dd>
        </div>
        <div className="bn-species-page__fact bn-species-page__fact--status">
          <dt className="label">{texts.status}</dt>
          <dd>
            {conservation === 'pending' && <span role="status">{loading}</span>}
            {conservation === null && texts.statusUnknown}
            {conservation !== 'pending' && conservation !== null && <ConservationStatus code={conservation} texts={texts} />}
          </dd>
        </div>
      </dl>
      <p className="bn-species-page__muted">{texts.source}</p>
    </>
  );
}

/**
 * Species card (ADR-17, first phase of RF-14 without a language model), laid out as a page of a bird guide: the bird
 * on its plate and, under it, two tabs so the two kinds of information never run together: what is known about the
 * species in general (classification and conservation status, its Wikipedia summary, the map of where it lives) and
 * what the person recorded of it (when, where and how confidently). Opened from Listen, the log, the album, the map
 * and the places.
 */
export default function SpeciesPage({ species }: { readonly species: string }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.card;
  const names = useSpeciesNames();
  const { records, readAt } = useLogRecords();
  const { sites } = useSites();
  const cloud = useCloudRecord(species);
  const clips = useLocalRecordingUsage();
  const token = useAccountContext().session?.access_token ?? null;
  const summary = useSpeciesSummary(species, locale);
  const taxon = useTaxon(species);
  const factsId = useId();
  const aboutId = useId();
  const rangeId = useId();
  const ownId = useId();
  const whenId = useId();
  const whereId = useId();
  const recentId = useId();
  const name = commonName(names, species, locale);
  const [tab, setTab] = useState<CardTab>('about');

  const local = useMemo(() => (records ?? []).filter((record) => record.species === species), [records, species]);
  const facts = useMemo(() => bestFacts(phoneFacts(records ?? [], species, sites), cloud ? cloudFacts(cloud) : null), [records, species, sites, cloud]);
  const recorded = facts.detections > 0;
  const peak = busiestHour(facts.hours);
  const peakText = peak === null ? null : formatTime(new Date(readAt).setHours(peak, 0, 0, 0), locale);

  const notes = recorded ? [
    { label: texts.notes.records, value: formatNumber(facts.detections, locale) },
    ...(facts.bestConfidence !== null ? [{ label: texts.notes.best, value: formatConfidence(facts.bestConfidence, locale) }] : []),
    ...(facts.lastAt !== null ? [{ label: texts.notes.last, value: formatDayTime(facts.lastAt, readAt, locale) }] : []),
  ] : [];

  // Records on this phone link to their detail (recording, state); cloud-only ones are listed without a
  // link, with a button to play the recording the account keeps, if any.
  const recent = [
    ...local.map((record) => ({
      id: record.id, at: record.recordedAt, confidence: record.confidence, status: record.status,
      href: routeHash({ name: 'detection', id: record.id }), playable: false,
      extra: clips?.ids.has(record.id) ? texts.recent.withRecording : null,
    })),
    ...(cloud?.recent ?? []).filter((item) => !local.some((record) => record.id === item.id)).map((item) => ({
      id: item.id, at: Date.parse(item.recordedAt), confidence: item.confidence, status: item.status,
      href: undefined, playable: item.hasRecording, extra: texts.recent.cloudOnly,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, SPECIES_RECENT_RECORDS);

  return (
    <Page className="bn-species-page">
      <a className="bn-species-page__back" href={routeHash({ name: 'album' })}>
        <Icon name="back" size="s" />
        <span>{dict.species.album.title}</span>
      </a>
      <SpeciesPlate scientificName={species} name={name} headingLevel={1} notes={notes} drop
        eyebrow={<><Icon name="book" size="s" />{texts.eyebrow}</>} />

      <Segmented label={texts.tabs.label} value={tab} onChange={setTab}
        options={CARD_TABS.map((value) => ({ value, label: texts.tabs[value] }))} />

      {tab === 'about' && (
        <div className="bn-species-page__guide">
          <section className="bn-species-page__card bn-species-page__sheet" aria-labelledby={factsId}>
            <h2 id={factsId} className="bn-species-page__title label">{texts.facts.title}</h2>
            <FactSheet taxon={taxon} texts={texts.facts} loading={dict.common.loading} />
          </section>

          <section className="bn-species-page__card bn-species-page__about" aria-labelledby={aboutId}>
            <h2 id={aboutId} className="bn-species-page__title label">{texts.about.title}</h2>
            {summary.status === 'loading' && <p className="bn-species-page__muted" role="status">{dict.common.loading}</p>}
            {summary.status === 'none' && <p className="bn-species-page__muted">{texts.about.none}</p>}
            {summary.status === 'unavailable' && <p className="bn-species-page__muted">{texts.about.unavailable}</p>}
            {summary.status === 'loaded' && (
              <>
                <p className="bn-species-page__summary" lang={summary.summary.language}>{summary.summary.text}</p>
                <p className="bn-species-page__muted">
                  {summary.summary.language === locale ? texts.about.source(SUMMARY_LICENSE) : texts.about.sourceEnglish(SUMMARY_LICENSE)}
                  {dict.common.separator}
                  <a href={summary.summary.url} target="_blank" rel="noopener noreferrer">{texts.about.read}</a>
                </p>
              </>
            )}
          </section>

          <WrittenCardSection species={species} />

          <ReferenceSoundsSection species={species} />

          <section className="bn-species-page__card bn-species-page__range" aria-labelledby={rangeId}>
            <h2 id={rangeId} className="bn-species-page__title label">{texts.range.title}</h2>
            <RangeMap taxon={taxon} name={name} />
          </section>
        </div>

      )}

      {/* The person's own data, apart from the general knowledge of the other tab. */}
      {tab === 'own' && (
        <section className="bn-species-page__own" aria-labelledby={ownId}>
          <header className="bn-species-page__own-header">
            <h2 id={ownId} className="bn-species-page__own-title display">{texts.own.title}</h2>
            <p className="bn-species-page__muted">{texts.own.text}</p>
            {recorded && <p className="bn-species-page__source">{facts.source === 'cloud' ? texts.sourceCloud : texts.sourcePhone}</p>}
          </header>

          {!recorded && records === null && <p className="bn-species-page__muted" role="status">{dict.common.loading}</p>}
          {!recorded && records !== null && (
            <EmptyState icon="album" title={texts.notRecorded.title}
              action={<Button href={routeHash({ name: 'listen' })} icon="listen">{dict.species.album.empty.action}</Button>}>
              {texts.notRecorded.text}
            </EmptyState>
          )}

          {recorded && (
            <div className="bn-species-page__columns">
              <section className="bn-species-page__card bn-species-page__when" aria-labelledby={whenId}>
                <h3 id={whenId} className="bn-species-page__title label">{texts.when.title}</h3>
                <ChorusClock hourly={facts.hours} value={formatNumber(facts.detections, locale)}
                  unit={selectPlural(texts.when.unit, facts.detections, locale)}
                  description={texts.when.description(formatCount(texts.records, facts.detections, locale), peakText ? texts.when.peak(peakText) : texts.when.noPeak)} />
                {peakText && <p className="bn-species-page__muted">{texts.when.peak(peakText)}</p>}
              </section>

              <section className="bn-species-page__card" aria-labelledby={whereId}>
                <h3 id={whereId} className="bn-species-page__title label">{texts.where.title}</h3>
                {facts.sites.length ? (
                  <ul className="bn-species-page__sites">
                    {facts.sites.map((site) => (
                      <li key={site.id}>
                        <a className="bn-species-page__site" href={routeHash({ name: 'site', id: site.id })}>
                          <Icon name="sites" size="s" />
                          <span className="bn-species-page__site-name">{site.name}</span>
                          <span className="bn-species-page__muted">{formatCount(texts.records, site.detections, locale)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="bn-species-page__muted">{texts.where.empty}</p>}
                <Button variant="secondary" icon="map" href={routeHash({ name: 'map', species })}>{texts.where.map}</Button>
              </section>

              {recent.length > 0 && (
                <section className="bn-species-page__card" aria-labelledby={recentId}>
                  <h3 id={recentId} className="bn-species-page__title label">{texts.recent.title}</h3>
                  <ul className="bn-species-page__recent">
                    {recent.map((item) => {
                      const body = (
                        <>
                          <span className="bn-species-page__record-time">{formatDayTime(item.at, readAt, locale)}</span>
                          <span className="bn-species-page__muted">
                            {[formatConfidence(item.confidence, locale), item.extra].filter(Boolean).join(dict.common.separator)}
                          </span>
                          <span className={`bn-species-page__status bn-species-page__status--${item.status}`}>{dict.common.status[item.status]}</span>
                        </>
                      );
                      if (item.href) return <li key={item.id}><a className="bn-species-page__record" href={item.href}>{body}</a></li>;
                      return (
                        <li key={item.id} className="bn-species-page__playable">
                          {item.playable && token && (
                            <AccountRecordingButton detectionId={item.id} token={token}
                              labels={{ play: texts.recent.playRecording, stop: texts.recent.stopRecording, failed: texts.recent.recordingFailed }} />
                          )}
                          <div className="bn-species-page__record">{body}</div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}

          <p className="bn-species-page__caveat">{dict.common.absenceCaveat}</p>
        </section>
      )}
    </Page>
  );
}
