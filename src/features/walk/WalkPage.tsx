import { useId, useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { formatCount, formatDistance, formatNumber, useI18n } from '../../i18n';
import { formatClock } from '../../shared/time';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { useAccountContext } from '../account/accountContext';
import { formatConfidence, formatDayTime } from '../log/logFormat';
import { useOnline } from '../offline/useQueueStatus';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useWalkDetail, type WalkDetailView } from './useWalks';
import { WALK_NAME_MAX_LENGTH } from './walk.config';
import { downloadCsv, downloadGpx, removeWalk, renameWalk } from './walkActions';
import { WalkSketch } from './WalkSketch';
import { cleanWalkName, walkTitle } from './walkText';
import './WalkPage.css';

type Task = { readonly kind: 'idle' | 'working' } | { readonly kind: 'done'; readonly file: string; readonly truncated: boolean } | { readonly kind: 'failed' };

/** The name of a walk, changed in place: an empty name goes back to the one built from the date. */
function RenameForm({ walk, title, onDone }: { readonly walk: WalkDetailView; readonly title: string; readonly onDone: () => void }): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.walk.rename;
  const { session } = useAccountContext();
  const online = useOnline();
  const inputId = useId();
  const [value, setValue] = useState(walk.name ?? '');
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const save = async (name: string | null): Promise<void> => {
    setState('working');
    try {
      await renameWalk(walk, name, session?.access_token ?? null, online);
      onDone();
    } catch {
      setState('failed');
    }
  };
  return (
    <form className="bn-walk-page__rename" onSubmit={(event) => { event.preventDefault(); void save(cleanWalkName(value)); }}>
      <label htmlFor={inputId} className="label">{t.label}</label>
      <input id={inputId} className="bn-walk-page__input" value={value} placeholder={title} maxLength={WALK_NAME_MAX_LENGTH}
        autoComplete="off" onChange={(event) => { setValue(event.target.value); }} />
      <div className="bn-walk-page__row">
        <Button type="submit" disabled={state === 'working'}>{t.save}</Button>
        {walk.name !== null && <Button variant="quiet" disabled={state === 'working'} onClick={() => { void save(null); }}>{t.reset}</Button>}
        <Button variant="quiet" disabled={state === 'working'} onClick={onDone}>{dict.common.actions.cancel}</Button>
      </div>
      {state === 'failed' && <Notice tone="error">{t.error}</Notice>}
    </form>
  );
}

/** One walk (ADR-35): its drawing and figures, the birds heard, renaming, exporting and deleting. */
export default function WalkPage({ id }: { readonly id: string }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.walk;
  const names = useSpeciesNames();
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  const [reload, setReload] = useState(0);
  const detail = useWalkDetail(id, reload);
  const [renaming, setRenaming] = useState(false);
  const [gpx, setGpx] = useState<Task>({ kind: 'idle' });
  const [csv, setCsv] = useState<Task>({ kind: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState<'idle' | 'working' | 'failed'>('idle');
  const back = { href: routeHash({ name: 'walks' }), label: t.back };

  if (detail.status !== 'ready') {
    if (detail.status === 'loading') {
      return <Page width="narrow"><PageHeader back={back} title={t.listTitle} /><p role="status">{dict.common.loading}</p></Page>;
    }
    return (
      <Page width="narrow">
        <PageHeader back={back} title={t.listTitle} />
        {detail.status === 'notFound'
          ? <EmptyState icon="walk" title={t.notFound.title} action={<Button href={back.href}>{t.back}</Button>}><p>{t.notFound.text}</p></EmptyState>
          : (
            <Notice tone={detail.status === 'offline' ? 'info' : 'error'} icon={detail.status === 'offline' ? 'offline' : undefined}
              action={<Button variant="quiet" onClick={() => { setReload((times) => times + 1); }}>{dict.common.actions.retry}</Button>}>
              {detail.status === 'offline' ? t.openNeedsConnection : t.loadError}
            </Notice>
          )}
      </Page>
    );
  }

  const walk = detail.walk;
  const title = walkTitle(walk.name, walk.startedAt, locale, t.defaultName);
  const now = new Date();
  const accountOnly = walk.where === 'account';
  const needsConnection = (accountOnly || walk.where === 'both') && (!online || !token);
  const duration = walk.endedAt === null ? (walk.live ? t.underWay : t.interrupted) : formatClock(walk.endedAt - walk.startedAt);
  const distance = formatDistance(walk.meters, locale);

  const exportGpx = (): void => {
    try {
      const file = downloadGpx(walk, title, (place) => ({
        name: commonName(names, place.species, locale),
        description: `${place.species} · ${t.heardLine(formatCount(t.songs, place.songs, locale), formatConfidence(place.bestConfidence, locale))}`,
      }));
      setGpx({ kind: 'done', file, truncated: false });
    } catch {
      setGpx({ kind: 'failed' });
    }
  };
  const exportCsv = async (): Promise<void> => {
    setCsv({ kind: 'working' });
    try {
      const { fileName, truncated } = await downloadCsv(walk, title, token, Date.now());
      setCsv({ kind: 'done', file: fileName, truncated });
    } catch {
      setCsv({ kind: 'failed' });
    }
  };
  const remove = async (): Promise<void> => {
    setDeleting('working');
    try {
      await removeWalk(walk, token);
      navigateTo({ name: 'walks' });
    } catch {
      setDeleting('failed');
    }
  };
  const feedback = (task: Task): React.JSX.Element | null => {
    if (task.kind === 'failed') return <Notice tone="error">{t.exportError}</Notice>;
    if (task.kind !== 'done') return null;
    return task.truncated ? <Notice tone="caution" icon="pending" live>{t.exportTruncated}</Notice> : <Notice tone="success" icon="check" live>{t.exportDone(task.file)}</Notice>;
  };

  return (
    <Page width="narrow" className="bn-walk-page">
      {/* A walk without a name is already titled by its date; the date is repeated only under a name. */}
      <PageHeader back={back} title={title} subtitle={walk.name === null ? t.where[walk.where] : `${formatDayTime(walk.startedAt, now, locale)} · ${t.where[walk.where]}`}
      />
      {renaming
        ? null
        : <Button variant="quiet" className="bn-walk-page__rename-button" disabled={accountOnly && needsConnection} onClick={() => { setRenaming(true); }}>{t.rename.action}</Button>}
      {renaming && <RenameForm walk={walk} title={title} onDone={() => { setRenaming(false); setReload((times) => times + 1); }} />}
      {renaming && accountOnly && needsConnection && <p className="bn-walk-page__hint">{t.rename.needsConnection}</p>}

      <section className="bn-walk-page__card">
        {walk.track.length > 0 || walk.places.length > 0
          ? <WalkSketch track={walk.track} marks={walk.places} label={t.sketchLabel(distance)} />
          : <p className="bn-walk-page__hint">{t.noPath}</p>}
        <dl className="bn-walk-page__stats">
          <div><dt className="label">{t.stats.duration}</dt><dd className="display">{duration}</dd></div>
          <div><dt className="label">{t.stats.distance}</dt><dd className="display">{distance}</dd></div>
          <div><dt className="label">{t.stats.species}</dt><dd className="display">{formatNumber(walk.species.length, locale)}</dd></div>
          <div><dt className="label">{t.stats.songs}</dt><dd className="display">{formatNumber(walk.songs, locale)}</dd></div>
        </dl>
        <Button variant="secondary" icon="map" href={routeHash({ name: 'map' })}>{t.openMap}</Button>
      </section>

      <section className="bn-walk-page__section" aria-labelledby={`${id}-heard`}>
        <h2 id={`${id}-heard`} className="bn-walk-page__heading">{t.heardTitle}</h2>
        {walk.species.length === 0
          ? <p className="bn-walk-page__hint">{t.heardNone}</p>
          : (
            <ul className="bn-walk-page__species">
              {walk.species.map((entry) => (
                <li key={entry.species}>
                  <SpeciesRow scientificName={entry.species} name={commonName(names, entry.species, locale)} photo="round" tone="brand"
                    status={formatCount(t.songs, entry.songs, locale)} detail={t.best(formatConfidence(entry.bestConfidence, locale))}
                    href={routeHash({ name: 'species', species: entry.species })} />
                </li>
              ))}
            </ul>
          )}
        {/* A permanent caveat, so it is not live. */}
        <Notice tone="caution">{dict.common.absenceCaveat}</Notice>
      </section>

      <section className="bn-walk-page__section" aria-labelledby={`${id}-export`}>
        <h2 id={`${id}-export`} className="bn-walk-page__heading">{t.exportTitle}</h2>
        <p className="bn-walk-page__hint">{t.exportWhat}</p>
        <div className="bn-walk-page__row">
          <Button icon="export" disabled={walk.track.length === 0 && walk.places.length === 0} onClick={exportGpx}>{t.exportGpx}</Button>
          <Button icon="export" variant="secondary" disabled={accountOnly && needsConnection} aria-busy={csv.kind === 'working'}
            onClick={() => { if (csv.kind !== 'working') void exportCsv(); }}>{t.exportCsv}</Button>
        </div>
        {accountOnly && needsConnection && <p className="bn-walk-page__hint">{t.exportNeedsConnection}</p>}
        {feedback(gpx)}
        {feedback(csv)}
      </section>

      <section className="bn-walk-page__section bn-walk-page__danger">
        {confirming ? (
          <div role="group" aria-label={t.delete.action}>
            <p>{walk.where === 'both' || accountOnly ? t.delete.confirmAccount : t.delete.confirmPhone}</p>
            <div className="bn-walk-page__row">
              <Button disabled={deleting === 'working'} onClick={() => { void remove(); }}>{t.delete.confirm}</Button>
              <Button variant="quiet" disabled={deleting === 'working'} onClick={() => { setConfirming(false); setDeleting('idle'); }}>{dict.common.actions.cancel}</Button>
            </div>
          </div>
        ) : (
          <Button variant="quiet" onClick={() => { setConfirming(true); }}>{t.delete.action}</Button>
        )}
        {deleting === 'failed' && <Notice tone="error">{t.delete.error}</Notice>}
      </section>
    </Page>
  );
}
