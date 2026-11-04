import { useEffect, useId, useRef, useState } from 'react';
import type { Session } from '@supabase/auth-js';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { useNow } from '../../shared/useNow';
import { useOnline } from '../offline/useQueueStatus';
import { RECENT_SIGN_IN_MARGIN_MS, RECENT_SIGN_IN_MINUTES } from './account.constants';
import type { AccountState } from './useAccount';
import { PasswordField, TextField } from './FormField';
import { signedInAt } from './sessionClaims';
import './DeleteAccountCard.css';

/** How often an open deletion checks that the sign-in is still recent enough. */
const RECENT_CHECK_MS = 15_000;

/** Whether the session's latest sign-in is recent enough to delete the account, with a margin for clock skew. */
function signedInRecently(session: Session | null, now: number): boolean {
  const at = session ? signedInAt(session.access_token) : null;
  return at !== null && now - at <= RECENT_SIGN_IN_MINUTES * 60_000 - RECENT_SIGN_IN_MARGIN_MS;
}

/** Accounts with a password confirm with it; accounts made with Google, with Google. */
function hasPassword(session: Session | null): boolean {
  return session?.user.identities?.some((identity) => identity.provider === 'email') ?? false;
}

/**
 * Deleting the account (ADR-38): first the full list of what goes and what stays, then the word typed by hand, so it
 * is never one tap away. A sign-in older than ten minutes is renewed first, so a session left open is not enough. It
 * needs the network, because the account is deleted before anything on the phone.
 */
export function DeleteAccountCard({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.account.deletion;
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [failed, setFailed] = useState(false);
  const [password, setPassword] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const now = useNow(RECENT_CHECK_MS, open);
  const recent = signedInRecently(account.session, now);
  const wasRecent = useRef(recent);
  const headingId = useId();
  const whyId = useId();

  // Opening moves the focus to the explanation, so a screen reader starts reading what will be deleted.
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open]);
  // Confirming (or the sign-in getting too old) swaps the step in place; the focus goes with it.
  useEffect(() => {
    if (open && wasRecent.current !== recent) stepRef.current?.focus();
    wasRecent.current = recent;
  }, [open, recent]);

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
      <div ref={stepRef} tabIndex={-1} className="bn-delete-account__step">
        {recent ? (
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
        ) : (
          <IdentityStep account={account} password={password} onPassword={setPassword} online={online}
            onCancel={() => { setOpen(false); setTyped(''); setPassword(''); setFailed(false); }} />
        )}
      </div>
    </section>
  );
}

/** The sign-in renewed in place: the password again, or Google for an account made with it. */
function IdentityStep({ account, password, onPassword, online, onCancel }: {
  readonly account: AccountState; readonly password: string; readonly onPassword: (value: string) => void; readonly online: boolean;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.account.deletion.identity;
  const minutes = formatNumber(RECENT_SIGN_IN_MINUTES, locale);
  const withPassword = hasPassword(account.session);
  const blocked = !online || account.working;
  const confirm = async (): Promise<void> => {
    if (blocked) return;
    if (withPassword) { if (await account.confirmIdentity(password)) onPassword(''); }
    else await account.signInWithGoogle();
  };
  return (
    <form className="bn-delete-account__form" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
      <h3 className="bn-delete-account__subtitle">{t.title}</h3>
      <p className="bn-delete-account__hint">{withPassword ? t.password(minutes) : t.google(minutes)}</p>
      {withPassword && <PasswordField label={t.passwordLabel} name="password" autoComplete="current-password" value={password} onChange={onPassword} />}
      {account.error && account.errorScope === 'identity' && <Notice tone="error" live>{dict.account.errors[account.error]}</Notice>}
      {!online && <p className="bn-delete-account__hint">{dict.account.deletion.needsConnection}</p>}
      <div className="bn-delete-account__actions">
        <Button type="submit" aria-disabled={blocked || (withPassword && password.length === 0)} aria-busy={account.working}>
          {withPassword ? t.confirm : t.confirmGoogle}
        </Button>
        <Button type="button" variant="quiet" disabled={account.working} onClick={onCancel}>{dict.common.actions.cancel}</Button>
      </div>
    </form>
  );
}
