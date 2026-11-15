import { useEffect, useRef, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAccountContext } from '../account/accountContext';
import { useListening } from '../listen/listeningContext';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { approximateLocation } from '../offline/queuePolicy';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { journalMessages } from '../journal/i18n';
import { JournalLinks } from '../journal/JournalParts';
import { JOURNAL_NAME_LIMIT } from '../journal/journal.config';
import { cleanName } from '../journal/validation';
import { IMPORT_FILE_ACCEPT } from './import.config';
import { importMessages } from './i18n';
import { useImportActive } from './importActivity';
import { importRecording, type ImportProgress, type ImportResult } from './importRecording';
import { ImportError } from './errors';
import { originalTimestamp } from './metadata';
import '../journal/Journal.css';

export default function ImportPage(): React.JSX.Element {
  const { locale } = useI18n(); const t = importMessages[locale]; const journal = journalMessages[locale];
  const owner = useAccountContext().identity?.userId ?? null; const listening = useListening(); const active = useImportActive(); const names = useSpeciesNames(); const settings = useOfflineSettings().settings;
  const [file, setFile] = useState<File | null>(null); const [date, setDate] = useState(''); const [offset, setOffset] = useState(''); const [save, setSave] = useState(false);
  const [title, setTitle] = useState(''); const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null); const [result, setResult] = useState<ImportResult | null>(null); const [error, setError] = useState<ImportError['reason'] | null>(null);
  const operation = useRef<AbortController | null>(null); const alive = useRef(true); const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); }; }, []);
  const run = async (): Promise<void> => {
    if (!owner || !file || active || listening.active) return;
    const controller = new AbortController(); operation.current = controller; setError(null); setResult(null); setProgress(null);
    try {
      if ((latitude.trim() === '') !== (longitude.trim() === '')) throw new ImportError('metadata');
      const recordedAt = originalTimestamp(date, offset);
      const location = latitude.trim() ? approximateLocation(Number(latitude), Number(longitude)) : null;
      const completed = await importRecording(file, { owner, save, recordedAt, location, title: cleanName(title) || null }, (value) => { if (alive.current) setProgress(value); }, controller);
      if (alive.current) { setResult(completed); setFile(null); if (fileInput.current) fileInput.current.value = ''; }
    } catch (failure) { if (alive.current) setError(failure instanceof ImportError ? failure.reason : 'metadata'); }
    finally { if (operation.current === controller) operation.current = null; }
  };
  return <Page width="narrow" className="bn-journal"><PageHeader title={t.title} subtitle={t.intro} back={{ href: routeHash({ name: 'journal' }), label: journal.back }} /><JournalLinks />
    {listening.active && <Notice tone="caution" action={<Button onClick={() => { void listening.stop(); }}>{t.stopListen}</Button>}>{t.stopHelp}</Notice>}
    <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); void run(); }}><label>{t.file}<input ref={fileInput} type="file" accept={IMPORT_FILE_ACCEPT} required disabled={active} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} /></label><p>{t.formats}</p>
      <label>{t.date}<input type="datetime-local" value={date} disabled={active} onChange={(event) => { setDate(event.target.value); }} /></label><label>{t.offset}<input value={offset} disabled={active} placeholder="-05:00" onChange={(event) => { setOffset(event.target.value); }} /></label><p className="bn-journal__muted">{t.dateHelp}</p>
      <label>{journal.latitude}<input type="number" min={-90} max={90} step="any" disabled={active} value={latitude} onChange={(event) => { setLatitude(event.target.value); }} /></label><label>{journal.longitude}<input type="number" min={-180} max={180} step="any" disabled={active} value={longitude} onChange={(event) => { setLongitude(event.target.value); }} /></label><p>{t.locationHelp}</p>
      <label className="bn-journal__check"><input type="checkbox" checked={save} disabled={active} onChange={(event) => { setSave(event.target.checked); }} />{t.save}</label>
      {save && <><label>{journal.titleLabel}<input maxLength={JOURNAL_NAME_LIMIT} value={title} disabled={active} onChange={(event) => { setTitle(event.target.value); }} /></label><p>{t.saveHelp}</p><p>{settings?.shareMap === true ? t.shared : t.private}</p></>}
      <Button type="submit" disabled={active || listening.active || !file || (save && !date)}>{t.analyze}</Button>{active && <Button variant="secondary" onClick={() => { operation.current?.abort(); }}>{t.cancel}</Button>}
    </form>
    {error && <Notice tone="error">{t.errors[error]}</Notice>}
    {progress && <section className="bn-journal__card" aria-live="polite"><p>{t.progress}: {progress.windows} · {t.seconds}: {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(progress.seconds)}</p>{progress.duration !== null && <progress max={progress.duration} value={Math.min(progress.seconds, progress.duration)} />}</section>}
    {result && <Notice tone={result.cancelled ? 'caution' : 'success'}>{result.cancelled ? t.cancelled : t.complete}{!save && <p>{t.ephemeral}</p>}{result.outingId && <p><a href={routeHash({ name: 'outing', id: result.outingId })}>{t.open}</a></p>}<p>{t.runAgain}</p></Notice>}
    {progress && <section className="bn-journal"><h2>{t.candidates}</h2><ul className="bn-journal__list">{progress.species.map((row) => <li className="bn-journal__card" key={row.scientificName}><a href={routeHash({ name: 'species', species: row.scientificName })}>{commonName(names, row.scientificName, locale)}</a><p>{journal.confidence}: {new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(row.confidence)} · {row.status === 'confirmed_local' ? journal.states.confirmed : journal.states.provisional}</p><p>{t.relativeTime}: {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(row.lastHeard / 1000)}</p></li>)}</ul>{!progress.species.length && <p>{t.empty}</p>}</section>}
    <p>{t.fullWindows}</p>
  </Page>;
}
