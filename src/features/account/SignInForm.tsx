import { useId, useState, type SyntheticEvent } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Segmented } from '../../shared/ui/Segmented';
import { useOnline } from '../offline/useQueueStatus';
import { PASSWORD_MIN_LENGTH } from './account.constants';
import type { AccountState } from './useAccount';
import './SignInForm.css';

const MODES = ['signIn', 'signUp'] as const;
type Mode = (typeof MODES)[number];

/** Each mode tells the browser's password manager whether to fill a saved password or offer a new one. */
const PASSWORD_AUTOCOMPLETE: Readonly<Record<Mode, string>> = { signIn: 'current-password', signUp: 'new-password' };

/** E-mail and password sign-in, or account creation; the server reports problems through `account.error`. */
export function SignInForm({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.signIn;
  const online = useOnline();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationFor, setConfirmationFor] = useState<string | null>(null);
  const titleId = useId();
  const emailId = useId();
  const passwordId = useId();
  const hintId = useId();

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (account.working || !online) return;
    setConfirmationFor(null);
    if (mode === 'signIn') {
      await account.signIn(email.trim(), password);
      return;
    }
    const pending = await account.signUp(email.trim(), password);
    if (pending) {
      // The account exists but is inactive until the e-mail link is opened; signing in comes next.
      setConfirmationFor(email.trim());
      setMode('signIn');
      setPassword('');
    }
  };

  return (
    <section className="bn-account-signin" aria-labelledby={titleId}>
      <div className="bn-account-signin__intro">
        <h2 id={titleId} className="bn-account-signin__title">{texts.title}</h2>
        <p className="bn-account-signin__text">{texts.intro}</p>
      </div>
      <Segmented label={texts.modeLabel} value={mode} onChange={setMode}
        options={MODES.map((value) => ({ value, label: texts.modes[value] }))} />
      <form className="bn-account-signin__form" onSubmit={(event) => { void submit(event); }}>
        <div className="bn-account-signin__field">
          <label htmlFor={emailId} className="bn-account-signin__label">{texts.email}</label>
          <input id={emailId} className="bn-account-signin__input" type="email" name="email" autoComplete="email"
            inputMode="email" spellCheck={false} required value={email} onChange={(event) => { setEmail(event.target.value); }} />
        </div>
        <div className="bn-account-signin__field">
          <label htmlFor={passwordId} className="bn-account-signin__label">{texts.password}</label>
          {/* The minimum only applies to new passwords, so a later change to it never locks out existing accounts. */}
          <input id={passwordId} className="bn-account-signin__input" type="password" name="password"
            autoComplete={PASSWORD_AUTOCOMPLETE[mode]} required minLength={mode === 'signUp' ? PASSWORD_MIN_LENGTH : undefined}
            aria-describedby={mode === 'signUp' ? hintId : undefined} value={password} onChange={(event) => { setPassword(event.target.value); }} />
          {mode === 'signUp' && (
            <p id={hintId} className="bn-account-signin__hint">{texts.passwordHint(formatNumber(PASSWORD_MIN_LENGTH, locale))}</p>
          )}
        </div>
        {account.error && <Notice tone="error">{dict.account.errors[account.error]}</Notice>}
        {confirmationFor && (
          <Notice tone="success" icon="check" title={texts.confirmationTitle} live>{texts.confirmation(confirmationFor)}</Notice>
        )}
        {!online && <Notice tone="caution" icon="offline" live>{texts.offline}</Notice>}
        <Button type="submit" block aria-disabled={!online || account.working} aria-busy={account.working}>{texts.modes[mode]}</Button>
      </form>
    </section>
  );
}
