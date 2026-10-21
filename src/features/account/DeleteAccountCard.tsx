import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { useOnline } from '../offline/useQueueStatus';
import type { AccountState } from './useAccount';
import { TextField } from './FormField';
import './DeleteAccountCard.css';

/**
 * Deleting the account (ADR-38): first the full list of what goes and what stays, then the word typed by hand, so it
 * is never one tap away. It needs the network, because the account is deleted before anything on the phone.
 */
export function DeleteAccountCard({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.account.deletion;
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [failed, setFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const whyId = useId();

  // Opening moves the focus to the explanation, so a screen reader starts reading what will be deleted.
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open]);

  if (!open) {
    return (
      <ListGroup>
        <ListRow label={t.open} description={t.openHint} tone="danger" onClick={() => { setOpen(true); }} />
      </ListGroup>
    );
  }

  const confirmed = typed.trim().toLocaleUpperCase() === t.word;
  const ready = confirmed && online && !account.working;
  const remove = async (): Promise<void> => {
    setFailed(false);
    if ((await account.deleteAccount()) === null) setFailed(true);
  };

  return (
    <section className="bn-delete-account" aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="bn-delete-account__title">{t.title}</h2>
      <p>{t.intro}</p>
      <div className="bn-delete-account__lists">
        <div>
          <h3 className="bn-delete-account__subtitle">{t.accountTitle}</h3>
          <ul>{t.account.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h3 className="bn-delete-account__subtitle">{t.phoneTitle}</h3>
          <ul>{t.phone.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h3 className="bn-delete-account__subtitle">{t.keptTitle}</h3>
          <ul>{t.kept.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
      <p className="bn-delete-account__warning">{t.irreversible}</p>
      <form className="bn-delete-account__form" onSubmit={(event) => { event.preventDefault(); if (ready) void remove(); }}>
        <TextField label={t.typeLabel(t.word)} value={typed} onChange={setTyped} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        {failed && <Notice tone="error" live>{t.failed}</Notice>}
        {!online && <p id={whyId} className="bn-delete-account__hint">{t.needsConnection}</p>}
        <div className="bn-delete-account__actions">
          <Button type="submit" className="bn-delete-account__confirm" disabled={!ready} aria-busy={account.working}
            aria-describedby={online ? undefined : whyId}>
            {account.working ? t.deleting : t.confirm}
          </Button>
          <Button type="button" variant="quiet" disabled={account.working} onClick={() => { setOpen(false); setTyped(''); setFailed(false); }}>
            {dict.common.actions.cancel}
          </Button>
        </div>
      </form>
    </section>
  );
}
