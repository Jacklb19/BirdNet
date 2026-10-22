import { useId, useState, type SyntheticEvent } from 'react';
import { NOTE_LIMITS } from '../../config/contract';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { cleanNote, EMPTY_NOTE, type NoteContent, type StoredNote } from '../notes/notePolicy';
import { saveNote } from '../notes/noteStore';
import { scheduleSynchronization } from '../offline/offlineClient';
import './NoteCard.css';

/**
 * A note and a count of individuals on one record (ADR-40): kept on the phone first, sent to the account by the next
 * synchronization, private everywhere. The counter has its own buttons so it works with a thumb in the field. The
 * caller keys it by the stored note, so a note changed elsewhere (another tab) starts the form again.
 */
export function NoteCard({ detectionId, stored }: { readonly detectionId: string; readonly stored: StoredNote | null }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.log.detail.note;
  const saved: NoteContent = stored ?? EMPTY_NOTE;
  const [individuals, setIndividuals] = useState<number | null>(saved.individuals);
  const [text, setText] = useState(saved.note ?? '');
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const titleId = useId();
  const countId = useId();
  const textId = useId();
  const remainingId = useId();

  const changed = cleanNote(text) !== saved.note || individuals !== saved.individuals;
  const step = (delta: number): void => {
    setIndividuals((current) => {
      const next = (current ?? 0) + delta;
      return next < NOTE_LIMITS.minIndividuals ? null : Math.min(next, NOTE_LIMITS.maxIndividuals);
    });
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!changed || working) return;
    setWorking(true);
    setFailed(false);
    try {
      await saveNote(detectionId, { note: cleanNote(text), individuals });
      void scheduleSynchronization().catch(() => undefined);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  const status = stored && !changed && (stored.note !== null || stored.individuals !== null)
    ? stored.sync === 'done' ? texts.savedEverywhere : stored.sync === 'rejected' ? texts.rejected : texts.saved
    : null;

  return (
    <section className="bn-log-note" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-log-note__title">{texts.title}</h2>
      <p className="bn-log-note__privacy"><Icon name="privacy" size="s" />{texts.privacy}</p>
      <form className="bn-log-note__form" onSubmit={(event) => { void submit(event); }}>
        <div className="bn-log-note__count" role="group" aria-labelledby={countId}>
          <span id={countId} className="bn-log-note__label">{texts.individuals}</span>
          <div className="bn-log-note__stepper">
            <button type="button" className="bn-log-note__step" aria-label={texts.fewer} disabled={individuals === null} onClick={() => { step(-1); }}>−</button>
            <output className="bn-log-note__value" aria-live="polite">
              {individuals === null ? texts.notCounted : formatNumber(individuals, locale)}
            </output>
            <button type="button" className="bn-log-note__step" aria-label={texts.more} disabled={individuals === NOTE_LIMITS.maxIndividuals}
              onClick={() => { step(1); }}>+</button>
          </div>
        </div>
        <label htmlFor={textId} className="bn-log-note__label">{texts.text}</label>
        <textarea id={textId} className="bn-log-note__text" value={text} maxLength={NOTE_LIMITS.noteLength} rows={3}
          placeholder={texts.placeholder} aria-describedby={remainingId} onChange={(event) => { setText(event.target.value); }} />
        <p id={remainingId} className="bn-log-note__remaining">{texts.remaining(formatNumber(NOTE_LIMITS.noteLength - text.length, locale))}</p>
        {failed && <Notice tone="error" live>{texts.saveError}</Notice>}
        {status && <p className="bn-log-note__status" role="status"><Icon name="check" size="s" />{status}</p>}
        {changed && (
          <Button type="submit" variant="secondary" aria-busy={working}>{texts.save}</Button>
        )}
      </form>
    </section>
  );
}
