import { useId, useState, type SyntheticEvent } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Segmented } from '../../shared/ui/Segmented';
import { useStepFocus } from '../../shared/ui/useStepFocus';
import { useOnline } from '../offline/useQueueStatus';
import { AUTH_ERROR_CODES, EMAIL_CODE_LENGTH, PASSWORD_MIN_LENGTH, passwordsMatch } from './account.constants';
import { PasswordField, TextField } from './FormField';
import { GoogleMark } from './GoogleMark';
import { CodeField } from './SecondStepForm';
import type { AccountState } from './useAccount';
import './SignInForm.css';

const MODES = ['signIn', 'signUp'] as const;
export type PasswordMode = (typeof MODES)[number];
/** `confirm`: the code of the e-mail that activates a new account. */
type Mode = PasswordMode | 'reset' | 'confirm';

/** Each mode tells the browser's password manager whether to fill a saved password or offer a new one. */
const PASSWORD_AUTOCOMPLETE: Readonly<Record<PasswordMode, string>> = { signIn: 'current-password', signUp: 'new-password' };

const isPasswordMode = (mode: Mode): mode is PasswordMode => mode === 'signIn' || mode === 'signUp';

/**
 * Sign in with Google or with e-mail and password, create an account (the password is typed twice) and activate it
 * with the code mailed to it, or ask for a password-reset e-mail. The server reports problems through `account.error`.
 */
export function SignInForm({ account, requestedMode = 'signIn' }: {
  readonly account: AccountState;
  /** The side the address asked for (`#/signin` or `#/signup`); following the other link switches the form in place. */
  readonly requestedMode?: PasswordMode;
}): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.signIn;
  const online = useOnline();
  const [mode, setMode] = useState<Mode>(requestedMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [code, setCode] = useState('');
  const [codeResent, setCodeResent] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const titleId = useId();
  const blocked = !online || account.working;
  const address = email.trim();
  // The code step replaces the whole form, so the focus goes to its title and comes back to the form after it.
  const [titleRef, sectionRef] = useStepFocus<HTMLHeadingElement, HTMLElement>(mode === 'confirm');

  const changeMode = (next: Mode): void => {
    setMode(next);
    // What failed in the other form does not apply to this one.
    account.clearError();
    setMismatch(false);
    setResetSentTo(null);
    setCode('');
    setCodeResent(false);
    setPassword('');
    setConfirmation('');
  };

  // A link followed while the form is already on screen ("Create account" in the bar) switches it in place.
  const [shownRequest, setShownRequest] = useState(requestedMode);
  if (shownRequest !== requestedMode) {
    setShownRequest(requestedMode);
    setMode(requestedMode);
    setMismatch(false);
    setResetSentTo(null);
    setPassword('');
    setConfirmation('');
  }

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (blocked) return;
    if (mode === 'confirm') {
      if (code.length !== EMAIL_CODE_LENGTH) return;
      setCodeResent(false);
      // On success the session starts and the account screen replaces this form.
      if (!(await account.confirmSignUp(address, code))) setCode('');
      return;
    }
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
    // With "Confirm email" off in Supabase the account is signed in at once; with it on, a code (and a link) is mailed.
    if (await account.signUp(address, password)) changeMode('confirm');
  };

  const resendCode = async (): Promise<void> => {
    if (blocked) return;
    setCode('');
    setCodeResent(await account.resendSignUpCode(address));
  };

  const title = mode === 'reset' ? texts.reset.title : mode === 'confirm' ? texts.code.title : texts.titles[mode];
  const intro = mode === 'reset' ? texts.reset.intro
    : mode === 'confirm' ? texts.code.intro(address, formatNumber(EMAIL_CODE_LENGTH, locale)) : texts.intros[mode];
  // An account created before (or on another device) that was never activated can still be activated here.
  const unconfirmed = mode === 'signIn' && account.error === AUTH_ERROR_CODES.email_not_confirmed && address.length > 0;

  return (
    <section ref={sectionRef} className="bn-account-signin" aria-labelledby={titleId}>
      <div className="bn-account-signin__intro">
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="bn-account-signin__title display">{title}</h2>
        <p className="bn-account-signin__text">{intro}</p>
      </div>

      {isPasswordMode(mode) && (
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
        {mode === 'confirm' ? (
          <CodeField label={texts.code.label} value={code} onChange={setCode} length={EMAIL_CODE_LENGTH} />
        ) : (
          <TextField label={texts.email} type="email" name="email" autoComplete="email" inputMode="email" spellCheck={false} required
            value={email} onChange={setEmail} />
        )}
        {isPasswordMode(mode) && (
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

        {account.error && (
          <Notice tone="error" live={mode === 'confirm'}>
            {dict.account.errors[account.error]}
            {account.errorDetail && <span className="bn-account-signin__detail">{dict.account.errorDetail(account.errorDetail)}</span>}
          </Notice>
        )}
        {unconfirmed && <Button variant="secondary" block onClick={() => { changeMode('confirm'); }}>{texts.code.enter}</Button>}
        {codeResent && <Notice tone="success" icon="check" title={texts.code.resentTitle} live>{texts.code.resent(address)}</Notice>}
        {resetSentTo && <Notice tone="success" icon="check" title={texts.reset.sentTitle} live>{texts.reset.sent(resetSentTo)}</Notice>}
        {!online && <Notice tone="caution" icon="offline" live>{texts.offline}</Notice>}

        <Button type="submit" block aria-disabled={blocked || (mode === 'confirm' && code.length !== EMAIL_CODE_LENGTH)} aria-busy={account.working}>
          {mode === 'reset' ? texts.reset.submit : mode === 'confirm' ? (account.working ? texts.code.checking : texts.code.submit) : texts.modes[mode]}
        </Button>
        {mode === 'reset' && <Button variant="quiet" block onClick={() => { changeMode('signIn'); }}>{texts.reset.back}</Button>}
        {mode === 'confirm' && (
          <>
            <Button variant="quiet" block aria-disabled={blocked} onClick={() => { void resendCode(); }}>{texts.code.resend}</Button>
            <Button variant="quiet" block onClick={() => { changeMode('signUp'); }}>{texts.code.otherEmail}</Button>
          </>
        )}
      </form>
      {mode === 'confirm' && <p className="bn-account-signin__hint">{texts.code.spam}</p>}
    </section>
  );
}
