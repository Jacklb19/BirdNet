import { useState } from 'react';
import { routeHash } from '../../app/routes';
import { PERIODS, type Period } from '../../config/contract';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAccountContext } from '../account/accountContext';
import { journalMessages } from '../journal/i18n';
import { SpeciesField } from '../journal/JournalParts';
import { localDateTime } from '../journal/validation';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { ASSISTANT_LIMITS, CONSENT_VERSION, INTENTS, TOPICS } from './assistant.config';
import { assistantMessages } from './i18n';
import { parseQuestion } from './parsers';
import { rowKey, structuredQuestion } from './queryPlan';
import type { Intent, Measurement, Question, ResultRow, TutorAnswer, TutorTopic } from './types';
import { useAssistant, type AssistantState } from './useAssistant';
import '../journal/Journal.css';

function GuidedQuery({ state }: { readonly state: AssistantState }): React.JSX.Element {
  const { locale } = useI18n(); const t = assistantMessages[locale];
  const [intent, setIntent] = useState<Intent>('detections'); const [species, setSpecies] = useState(''); const [period, setPeriod] = useState<Period>('all'); const [pending, setPending] = useState(false); const [invalid, setInvalid] = useState(false);
  return <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); try { const question = structuredQuestion(intent, locale, species, period, pending); setInvalid(false); void state.query(question); } catch { setInvalid(true); } }}>
    <h2>{t.guided}</h2><label>{t.intent}<select value={intent} onChange={(event) => { const value = event.target.value; if (INTENTS.some((entry) => entry === value)) setIntent(value as Intent); }}>{INTENTS.map((entry) => <option key={entry} value={entry}>{t.intents[entry]}</option>)}</select></label>
    {['detections', 'species', 'observations', 'wishlist'].includes(intent) && <SpeciesField value={species} onChange={setSpecies} required={false} />}
    {!['collections', 'wishlist'].includes(intent) && <label>{t.period}<select value={period} onChange={(event) => { const entry = PERIODS.find((option) => option.value === event.target.value); if (entry) setPeriod(entry.value); }}>{PERIODS.map((entry) => <option key={entry.value} value={entry.value}>{t.periods[entry.value]}</option>)}</select></label>}
    {intent === 'detections' && <label className="bn-journal__check"><input type="checkbox" checked={pending} onChange={(event) => { setPending(event.target.checked); }} />{t.pending}</label>}
    {invalid && <Notice tone="error">{t.invalid}</Notice>}<Button type="submit" disabled={!state.usable || state.busy !== null}>{t.search}</Button>
  </form>;
}
function MeasurementDetails({ value }: { readonly value: Measurement }): React.JSX.Element {
  const { locale } = useI18n(); const t = assistantMessages[locale]; const number = (value: number | null): string => value === null ? t.unknown : new Intl.NumberFormat(locale).format(value);
  return <p className="bn-journal__muted">{t.model}: {value.model} · {t.writtenAt}: {new Date(value.generatedAt).toLocaleString(locale)}<br />{t.tokens} · {t.input}: {number(value.usage.input_tokens)} · {t.output}: {number(value.usage.output_tokens)} · {t.total}: {number(value.usage.total_tokens)}</p>;
}
function PlanReview({ question, state }: { readonly question: Question; readonly state: AssistantState }): React.JSX.Element {
  const { locale } = useI18n(); const t = assistantMessages[locale];
  const [species, setSpecies] = useState('species' in question ? question.species ?? '' : '');
  const [since, setSince] = useState('since' in question && question.since ? localDateTime(question.since) : '');
  const [until, setUntil] = useState('until' in question && question.until ? localDateTime(question.until) : '');
  const [changed, setChanged] = useState(false); const [pending, setPending] = useState('review' in question && question.review === 'pending'); const [invalid, setInvalid] = useState(false);
  return <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); try {
    const next = { ...question, ...('species' in question ? { species: species.trim() || null } : {}), ...('review' in question ? { review: pending ? 'pending' : 'all' } : {}),
      ...(changed && 'since' in question ? { since: since ? new Date(since).toISOString() : null, until: until ? new Date(until).toISOString() : null } : {}) };
    void state.query(parseQuestion(next)); setInvalid(false);
  } catch { setInvalid(true); } }}><h2>{t.review}</h2><p>{t.intents[question.intent]}</p>
    {'species' in question && <SpeciesField required={false} value={species} onChange={setSpecies} />}
    {'since' in question && <><label>{t.since}<input type="datetime-local" value={since} onChange={(event) => { setSince(event.target.value); setChanged(true); }} /></label><label>{t.until}<input type="datetime-local" value={until} onChange={(event) => { setUntil(event.target.value); setChanged(true); }} /></label><p className="bn-journal__muted">{t.timezone}</p></>}
    {'review' in question && <label className="bn-journal__check"><input type="checkbox" checked={pending} onChange={(event) => { setPending(event.target.checked); }} />{t.pending}</label>}
    {invalid && <Notice tone="error">{t.invalid}</Notice>}<Button type="submit" disabled={state.busy !== null || !state.usable}>{t.confirm}</Button><Button variant="quiet" onClick={state.clearText}>{t.discard}</Button>
  </form>;
}
function ResultCard({ row }: { readonly row: ResultRow }): React.JSX.Element {
  const { locale } = useI18n(); const t = assistantMessages[locale]; const journal = journalMessages[locale]; const names = useSpeciesNames();
  const title = row.kind === 'collection' ? row.name : row.kind === 'outing' ? row.title ?? new Date(row.at).toLocaleString(locale) : commonName(names, row.species, locale);
  const href = routeHash(row.kind === 'detection' ? { name: 'detection', id: row.id } : row.kind === 'observation' ? { name: 'observations', id: row.id } : row.kind === 'outing' ? { name: 'outing', id: row.id } : row.kind === 'collection' ? { name: 'collection', id: row.id } : { name: 'species', species: row.species });
  return <li className="bn-journal__card"><h3><a href={href}>{title}</a></h3>
    {row.kind === 'detection' && <p>{new Date(row.at).toLocaleString(locale)} · {t.confidence}: {new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(row.confidence)} · {journal.states[row.status]}</p>}
    {row.kind === 'observation' && <p>{t.manual} · {new Date(row.at).toLocaleString(locale)}{row.individuals !== null ? ` · ${String(row.individuals)}` : ''}</p>}
    {row.kind === 'species' && <p>{t.totals.detections}: {row.detections} · {t.confidence}: {new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(row.bestConfidence)}</p>}
    {row.kind === 'outing' && <p>{t.totals.detections}: {row.detections} · {t.totals.observations}: {row.observations} · {t.totals.species}: {row.species}</p>}
  </li>;
}
function TutorText({ answer }: { readonly answer: TutorAnswer }): React.JSX.Element {
  const t = assistantMessages[useI18n().locale];
  return <section className="bn-journal__card">{answer.paragraphs.map((paragraph, index) => <p key={String(index)}>{paragraph}</p>)}<h3>{t.sources}</h3><ul>{answer.sources.map((source, index) => <li key={String(index)}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}{source.license ? ` · ${source.license}` : ''}</li>)}</ul><MeasurementDetails value={answer} /></section>;
}
function AssistantContents({ owner, token }: { readonly owner: string; readonly token: string | null }): React.JSX.Element {
  const { locale } = useI18n(); const t = assistantMessages[locale]; const state = useAssistant(owner, token, locale);
  const [mode, setMode] = useState<'records' | 'tutor'>('records'); const [topic, setTopic] = useState<TutorTopic>('confidence'); const [species, setSpecies] = useState('');
  const policy = state.policy;
  return <Page width="narrow" className="bn-journal"><PageHeader title={t.title} subtitle={t.intro} />
    <div className="bn-journal__actions">{(['records', 'tutor'] as const).map((next) => <Button key={next} variant={mode === next ? 'primary' : 'secondary'} aria-pressed={mode === next} onClick={() => { state.cancel(); state.clearText(); setMode(next); }}>{t[next]}</Button>)}</div>
    {!state.online && <Notice tone="caution">{t.errors.network}</Notice>}{state.error && <Notice tone="error">{t.errors[state.error]}</Notice>}
    {mode === 'records' && <GuidedQuery state={state} />}
    <section className="bn-journal__form"><Notice tone="caution">{t.notice}<p>{t.attachments}</p></Notice><p>{t.quota}</p><p>{t.withdrawal}</p>
      {policy ? <a href={policy.terms_url} target="_blank" rel="noreferrer">{t.terms}</a> : <p role="status">{t.policyLoading}</p>}
      <label className="bn-journal__check"><input type="checkbox" checked={state.accepted} disabled={!state.accepted && (!policy || policy.version !== CONSENT_VERSION || !state.usable)} onChange={(event) => { if (event.target.checked) state.approve(); else state.withdraw(); }} />{t.consent}</label>
      {state.accepted && <Button variant="quiet" onClick={state.withdraw}>{t.withdraw}</Button>}
      {mode === 'tutor' && <><label>{t.topic}<select value={topic} disabled={state.busy !== null} onChange={(event) => { const value = event.target.value; if (TOPICS.some((entry) => entry === value)) setTopic(value as TutorTopic); }}>{TOPICS.map((entry) => <option key={entry} value={entry}>{t.topics[entry]}</option>)}</select></label>{topic === 'species_facts' && <SpeciesField value={species} onChange={setSpecies} />}
        <Button variant="secondary" disabled={!state.usable || state.busy !== null || (topic === 'species_facts' && !species.trim())} onClick={() => { void state.explain(topic, topic === 'species_facts' ? species.trim() : null, false); }}>{t.explain}</Button></>}
      <label>{t.question}<textarea value={state.text} disabled={state.busy !== null} maxLength={ASSISTANT_LIMITS.text * 2} onChange={(event) => { state.setText(Array.from(event.target.value).slice(0, policy?.max_text_characters ?? ASSISTANT_LIMITS.text).join('')); }} /></label><p className="bn-journal__muted">{Array.from(state.text).length} / {policy?.max_text_characters ?? ASSISTANT_LIMITS.text}</p>
      <Button disabled={!state.canSendText || state.busy !== null || (mode === 'tutor' && topic === 'species_facts' && !species.trim())} onClick={() => { if (mode === 'records') void state.interpret(); else void state.explain(topic, topic === 'species_facts' ? species.trim() : null, true); }}>{mode === 'records' ? t.interpret : t.ask}</Button>
      {state.busy && <><p role="status">{t.busy}</p><Button variant="secondary" onClick={state.cancel}>{t.cancel}</Button></>}
    </section>
    {mode === 'records' && state.interpretation && <><MeasurementDetails value={state.interpretation} />{state.interpretation.status === 'ready' ? <PlanReview key={state.interpretation.generatedAt} question={state.interpretation.query} state={state} /> : <Notice tone="info">{t.reasons[state.interpretation.reasonCode]}</Notice>}</>}
    {mode === 'records' && state.answer && <section className="bn-journal"><h2>{t.results}</h2><dl>{Object.entries(state.answer.totals).map(([key, value]) => <div key={key}><dt>{key in t.totals ? t.totals[key as keyof typeof t.totals] : key}</dt><dd>{new Intl.NumberFormat(locale).format(value)}</dd></div>)}</dl>
      <ul className="bn-journal__list">{state.answer.rows.map((row) => <ResultCard key={rowKey(row)} row={row} />)}</ul>{!state.answer.rows.length && <p>{t.empty}</p>}{state.answer.hasMore && <Button variant="secondary" disabled={state.busy !== null || !state.usable} onClick={() => { void state.more(); }}>{t.more}</Button>}
    </section>}
    {mode === 'tutor' && state.tutor && (state.tutor.status === 'answered' ? <TutorText answer={state.tutor.answer} /> : <><Notice tone="info">{t.reasons[state.tutor.reasonCode]}</Notice><MeasurementDetails value={state.tutor} /></>)}
  </Page>;
}
export function AssistantPage(): React.JSX.Element | null {
  const { identity, session } = useAccountContext();
  return identity ? <AssistantContents key={identity.userId} owner={identity.userId} token={session?.access_token ?? null} /> : null;
}
export default AssistantPage;
