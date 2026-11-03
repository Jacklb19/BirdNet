import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { FIELD_LIMITS } from '../../config/contract';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import type { CachedSite } from '../offline/types';
import './NewSiteForm.css';
import './SiteManageCard.css';

export interface SiteManageCardProps {
  readonly site: CachedSite;
  readonly online: boolean;
  readonly onRename: (name: string) => Promise<boolean>;
  /** Resolves true once the site is gone; the page then leaves for the list. */
  readonly onRemove: () => Promise<boolean>;
}

type Mode = 'idle' | 'renaming' | 'removing';

/**
 * Renaming and deleting a site (ADR-44). Where it is cannot change: its songs are filed under it. Deleting it keeps
 * the songs, without a site, and is confirmed in place. Focus follows the step for keyboard and screen reader users.
 */
export function SiteManageCard({ site, online, onRename, onRemove }: SiteManageCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const texts = t.manage;
  const uid = useId();
  const [mode, setMode] = useState<Mode>('idle');
  const [name, setName] = useState(site.name);
  const [submitted, setSubmitted] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<'rename' | 'remove' | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const askRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const nameMissing = submitted && !name.trim();

  useEffect(() => {
    if (mode === 'renaming') nameRef.current?.focus();
    else if (mode === 'removing') askRef.current?.focus();
    else if (opened.current) actionsRef.current?.querySelector('button')?.focus();
    opened.current = mode !== 'idle';
  }, [mode]);

  const close = (): void => {
    setMode('idle');
    setName(site.name);
    setSubmitted(false);
    setFailed(null);
  };

  const rename = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (working) return;
    setSubmitted(true);
    if (!name.trim()) { nameRef.current?.focus(); return; }
    setWorking(true);
    setFailed(null);
    const done = await onRename(name.trim());
    setWorking(false);
    if (done) close(); else setFailed('rename');
  };

  const remove = async (): Promise<void> => {
    if (working) return;
    setWorking(true);
    setFailed(null);
    const done = await onRemove();
    setWorking(false);
    if (!done) setFailed('remove');
  };

  return (
    <section className="bn-site-manage" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="bn-site-manage__title">{texts.title}</h2>
      {mode === 'idle' && (
        <>
          <div className="bn-site-manage__actions" ref={actionsRef}>
            <Button variant="secondary" disabled={!online} onClick={() => { setMode('renaming'); }}>{texts.rename}</Button>
            <Button variant="quiet" disabled={!online} onClick={() => { setMode('removing'); }}>{texts.remove}</Button>
          </div>
          {!online && <p className="bn-site-manage__hint">{texts.needsConnection}</p>}
        </>
      )}
      {mode === 'renaming' && (
        <form className="bn-site-manage__form" noValidate onSubmit={(event) => { void rename(event); }}>
          <div className="bn-new-site__field">
            <label htmlFor={`${uid}-name`} className="bn-new-site__label">{t.nameLabel}</label>
            <input ref={nameRef} id={`${uid}-name`} className="bn-new-site__input" type="text" required autoComplete="off"
              maxLength={FIELD_LIMITS.siteName} value={name} onChange={(event) => { setName(event.target.value); }}
              aria-invalid={nameMissing} aria-describedby={`${uid}-hint${nameMissing ? ` ${uid}-error` : ''}`} />
            <p id={`${uid}-hint`} className="bn-new-site__hint">{t.nameHint(formatNumber(FIELD_LIMITS.siteName, locale))}</p>
            {nameMissing && <p id={`${uid}-error`} className="bn-new-site__error">{t.nameRequired}</p>}
          </div>
          {failed === 'rename' && <Notice tone="error" live>{texts.renameError}</Notice>}
          <div className="bn-site-manage__actions">
            <Button type="submit" aria-disabled={working} aria-busy={working}>{working ? texts.saving : texts.save}</Button>
            <Button variant="quiet" disabled={working} onClick={close}>{dict.common.actions.cancel}</Button>
          </div>
        </form>
      )}
      {mode === 'removing' && (
        <div className="bn-site-manage__form" role="group" aria-labelledby={`${uid}-ask`}>
          <p id={`${uid}-ask`} ref={askRef} tabIndex={-1} className="bn-site-manage__ask">{texts.removeAsk}</p>
          {failed === 'remove' && <Notice tone="error" live>{texts.removeError}</Notice>}
          <div className="bn-site-manage__actions">
            <Button aria-disabled={working} aria-busy={working} onClick={() => { void remove(); }}>
              {working ? texts.removing : texts.removeConfirm}
            </Button>
            <Button variant="quiet" disabled={working} onClick={close}>{dict.common.actions.cancel}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
