import { useId, useState, type SyntheticEvent } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Segmented } from '../../shared/ui/Segmented';
import { useOnline } from '../offline/useQueueStatus';
import { PASSWORD_MIN_LENGTH, passwordsMatch } from './account.constants';
import { PasswordField, TextField } from './FormField';
import { GoogleMark } from './GoogleMark';
import type { AccountState } from './useAccount';
import './SignInForm.css';

const MODES = ['signIn', 'signUp'] as const;
type Mode = (typeof MODES)[number] | 'reset';

/** Each mode tells the browser's password manager whether to fill a saved password or offer a new one. */
const PASSWORD_AUTOCOMPLETE: Readonly<Record<Exclude<Mode, 'reset'>, string>> = { signIn: 'current-password', signUp: 'new-password' };

/**
 * Sign in with Google or with e-mail and password, create an account (the password is typed twice), or ask for a
 * password-reset e-mail. The server reports problems through `account.error`.
 */
export function SignInForm({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.signIn;
  const online = useOnline();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [confirmationFor, setConfirmationFor] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const titleId = useId();
  const blocked = !online || account.working;

  const changeMode = (next: Mode): void => {
    setMode(next);
    setMismatch(false);
    setResetSentTo(null);
    setPassword('');
    setConfirmation('');
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (blocked) return;
    const address = email.trim();
    setConfirmationFor(null);
    if (mode === 'reset') {
      if (await account.requestPasswordReset(address)) setResetSentTo(address);
      return;
    }
    if (mode === 'signIn') {
      await account.signIn(address, password);
      return;
    }
    if (!passwordsMatch(password, confirmation)) { setMismatch(true); return; }
    setMismatch(false);
    // With "Confirm email" off in Supabase (ADR-21) the account is signed in at once; with it on, a link is mailed.
    if (await account.signUp(address, password)) {
      setConfirmationFor(address);
      changeMode('signIn');
    }
  };

  return (
    <section className="bn-account-signin" aria-labelledby={titleId}>
      <div className="bn-account-signin__intro">
        <h2 id={titleId} className="bn-account-signin__title display">{mode === 'reset' ? texts.reset.title : texts.title}</h2>
        <p className="bn-account-signin__text">{mode === 'reset' ? texts.reset.intro : texts.intro}</p>
      </div>

      {mode !== 'reset' && (
        <>
          <button type="button" className="bn-account-google" aria-disabled={blocked} aria-busy={account.working}
            onClick={() => { if (!blocked) void account.signInWithGoogle(); }}>
            <GoogleMark />
            <span>{texts.google}</span>
          </button>
          <p className="bn-account-signin__divider" aria-hidden="true"><span>{texts.or}</span></p>
          <Segmented label={texts.modeLabel} value={mode} onChange={changeMode}
            options={MODES.map((value) => ({ value, label: texts.modes[value] }))} />
        </>
      )}

      <form className="bn-account-signin__form" onSubmit={(event) => { void submit(event); }}>
        <TextField label={texts.email} type="email" name="email" autoComplete="email" inputMode="email" spellCheck={false} required
          value={email} onChange={setEmail} />
        {mode !== 'reset' && (
          <PasswordField label={texts.password} name="password" autoComplete={PASSWORD_AUTOCOMPLETE[mode]} value={password} onChange={setPassword}
            // The minimum only applies to new passwords, so a later change to it never locks out existing accounts.
            minLength={mode === 'signUp' ? PASSWORD_MIN_LENGTH : undefined}
            hint={mode === 'signUp' ? texts.passwordHint(formatNumber(PASSWORD_MIN_LENGTH, locale)) : undefined} />
        )}
        {mode === 'signUp' && (
          <PasswordField label={texts.confirmPassword} name="password-confirmation" autoComplete="new-password" value={confirmation}
            onChange={(value) => { setConfirmation(value); setMismatch(false); }} minLength={PASSWORD_MIN_LENGTH}
            error={mismatch ? texts.mismatch : undefined} />
        )}
        {mode === 'signIn' && (
          <button type="button" className="bn-account-signin__link" onClick={() => { changeMode('reset'); }}>{texts.forgot}</button>
        )}

        {account.error && <Notice tone="error">{dict.account.errors[account.error]}</Notice>}
        {confirmationFor && (
          <Notice tone="success" icon="check" title={texts.confirmationTitle} live>{texts.confirmation(confirmationFor)}</Notice>
        )}
        {resetSentTo && <Notice tone="success" icon="check" title={texts.reset.sentTitle} live>{texts.reset.sent(resetSentTo)}</Notice>}
        {!online && <Notice tone="caution" icon="offline" live>{texts.offline}</Notice>}

        <Button type="submit" block aria-disabled={blocked} aria-busy={account.working}>
          {mode === 'reset' ? texts.reset.submit : texts.modes[mode]}
        </Button>
        {mode === 'reset' && <Button variant="quiet" block onClick={() => { changeMode('signIn'); }}>{texts.reset.back}</Button>}
      </form>
    </section>
  );
}
