import { formatCount, formatPercent, useI18n, type Locale } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { SpeciesRow, type StatusTone } from '../../shared/ui/SpeciesRow';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { assistantMessages } from './i18n';
import type { ReadPlan } from './plan';
import { periodLabel, planSummary } from './planText';
import { rowKey } from './queryPlan';
import type { CompareAnswer, JournalAnswer, QueryAnswer, ResultRow, Status } from './types';
import { rowRoute } from './useAssistant';
import { routeHash } from '../../app/routes';

type Texts = (typeof assistantMessages)['es'];

const STATUS_TONE: Readonly<Record<Status, StatusTone>> = { confirmed: 'confirmed', provisional: 'provisional', verified: 'verified', corrected: 'corrected', discarded: 'neutral' };

function totalsLine(answer: QueryAnswer, texts: Texts, locale: Locale): string {
  const t = answer.totals;
  switch (answer.intent) {
    case 'detections': case 'species': return texts.of(formatCount(texts.totals.detections, t.detections ?? 0, locale), formatCount(texts.totals.species, t.species ?? 0, locale));
    case 'observations': return texts.of(formatCount(texts.totals.observations, t.observations ?? 0, locale), formatCount(texts.totals.species, t.species ?? 0, locale));
    case 'outings': return formatCount(texts.totals.outings, t.outings ?? 0, locale);
    case 'collections': return formatCount(texts.totals.collections, t.collections ?? 0, locale);
    case 'wishlist': return formatCount(texts.totals.wishes, t.species ?? 0, locale);
  }
}

function Row({ row }: { readonly row: ResultRow }): React.JSX.Element {
  const { locale } = useI18n();
  const texts = assistantMessages[locale];
  const names = useSpeciesNames();
  const when = (value: string): string => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const href = routeHash(rowRoute(row));
  switch (row.kind) {
    case 'detection':
      return <SpeciesRow scientificName={row.species} name={commonName(names, row.species, locale)} href={href} status={texts.statuses[row.status]} tone={STATUS_TONE[row.status]}
        detail={[when(row.at), texts.rows.confidence(formatPercent(row.confidence, locale, 0)), row.hasRecording ? texts.rows.recording : ''].filter(Boolean).join(' · ')} />;
    case 'species':
      return <SpeciesRow scientificName={row.species} name={commonName(names, row.species, locale)} href={href} photo="round"
        status={formatCount(texts.totals.detections, row.detections, locale)} tone="brand" detail={texts.rows.best(formatPercent(row.bestConfidence, locale, 0))} />;
    case 'observation':
      return <SpeciesRow scientificName={row.species} name={commonName(names, row.species, locale)} href={href} status={texts.rows.manual} detail={when(row.at)} />;
    case 'wish':
      return <SpeciesRow scientificName={row.species} name={commonName(names, row.species, locale)} href={href} photo="round" detail={texts.rows.added(new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(row.at)))} />;
    case 'outing':
      return (
        <a className="bn-answer__item" href={href}>
          <span className="bn-answer__item-title">{row.title ?? texts.rows.untitled}</span>
          <span className="bn-answer__item-detail">{texts.rows.outingKinds[row.outingKind]} · {when(row.at)}</span>
          <span className="bn-answer__item-detail">{texts.rows.outingTotals(formatCount(texts.totals.detections, row.detections, locale), formatCount(texts.totals.observations, row.observations, locale), formatCount(texts.totals.species, row.species, locale))}</span>
        </a>
      );
    case 'collection':
      return (
        <a className="bn-answer__item" href={href}>
          <span className="bn-answer__item-title">{row.name}</span>
          <span className="bn-answer__item-detail">{formatCount(texts.rows.items, row.items, locale)}</span>
        </a>
      );
  }
}

function Comparison({ plan, answer }: { readonly plan: ReadPlan; readonly answer: CompareAnswer }): React.JSX.Element {
  const { locale } = useI18n();
  const texts = assistantMessages[locale];
  const names = useSpeciesNames();
  const number = new Intl.NumberFormat(locale);
  const first = periodLabel(plan.period, texts, locale);
  const second = plan.compare_period ? periodLabel(plan.compare_period, texts, locale) : '';
  const lines = [
    { label: texts.compare.songs, a: answer.first.detections, b: answer.second.detections },
    { label: texts.compare.species, a: answer.first.species, b: answer.second.species },
    { label: texts.compare.seen, a: answer.first.observations, b: answer.second.observations },
    { label: texts.compare.seenSpecies, a: answer.first.observedSpecies, b: answer.second.observedSpecies },
  ];
  const only = (list: readonly string[]): string => (list.length ? list.map((species) => commonName(names, species, locale)).join(', ') : texts.compare.none);
  return (
    <>
      <table className="bn-answer__compare">
        <thead><tr><th scope="col"><span className="visually-hidden">{texts.intents.compare}</span></th><th scope="col">{first}</th><th scope="col">{second}</th></tr></thead>
        <tbody>{lines.map((line) => <tr key={line.label}><th scope="row">{line.label}</th><td>{number.format(line.a)}</td><td>{number.format(line.b)}</td></tr>)}</tbody>
      </table>
      <p className="bn-answer__only"><strong>{texts.compare.onlyIn(first)}</strong> {only(answer.onlyFirst)}</p>
      <p className="bn-answer__only"><strong>{texts.compare.onlyIn(second)}</strong> {only(answer.onlySecond)}</p>
      {answer.hasMore && <p className="bn-answer__note">{texts.compare.limited}</p>}
      <p className="bn-answer__note">{texts.compare.note}</p>
    </>
  );
}

/**
 * One answer beside its question (ADR-47): its filters in words, the figures the API computed and the first rows,
 * each a link to the record itself. Only the latest answer can grow with "Show more"; older ones keep what they had.
 */
export function AnswerCard({ plan, answer, active, busy, onMore }: {
  readonly plan: ReadPlan; readonly answer: JournalAnswer; readonly active: boolean; readonly busy: boolean; readonly onMore: () => void;
}): React.JSX.Element {
  const { locale } = useI18n();
  const texts = assistantMessages[locale];
  const names = useSpeciesNames();
  const speciesName = plan.species ? commonName(names, plan.species, locale) : null;
  return (
    <div className="bn-answer">
      <p className="bn-answer__plan label">{planSummary(plan, texts, locale, speciesName)}</p>
      {answer.intent === 'compare' ? <Comparison plan={plan} answer={answer} /> : (
        <>
          <p className="bn-answer__totals display">{totalsLine(answer, texts, locale)}</p>
          {answer.rows.length ? (
            <ul className="bn-answer__rows">{answer.rows.map((row) => <li key={rowKey(row)}><Row row={row} /></li>)}</ul>
          ) : <p className="bn-answer__note">{texts.empty}</p>}
          {active && answer.hasMore && <Button variant="secondary" disabled={busy} onClick={onMore}>{texts.more}</Button>}
        </>
      )}
    </div>
  );
}
