import { useId, useState, type SyntheticEvent } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { PASSWORD_MIN_LENGTH, passwordsMatch } from './account.constants';
import { PasswordField } from './FormField';
import type { AccountState } from './useAccount';
import './SignInForm.css';

/** Shown after opening a password-reset link: the new password, typed twice. */
export function RecoveryForm({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.recovery;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const titleId = useId();

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (account.working) return;
    if (!passwordsMatch(password, confirmation)) { setMismatch(true); return; }
    await account.updatePassword(password);
  };

  return (
    <section className="bn-account-signin" aria-labelledby={titleId}>
      <div className="bn-account-signin__intro">
        <h2 id={titleId} className="bn-account-signin__title display">{texts.title}</h2>
        <p className="bn-account-signin__text">{texts.intro}</p>
      </div>
      <form className="bn-account-signin__form" onSubmit={(event) => { void submit(event); }}>
        <PasswordField label={texts.password} name="new-password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH}
          hint={dict.account.signIn.passwordHint(formatNumber(PASSWORD_MIN_LENGTH, locale))} value={password} onChange={setPassword} />
        <PasswordField label={dict.account.signIn.confirmPassword} name="new-password-confirmation" autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} value={confirmation} error={mismatch ? dict.account.signIn.mismatch : undefined}
          onChange={(value) => { setConfirmation(value); setMismatch(false); }} />
        {account.error && <Notice tone="error">{dict.account.errors[account.error]}</Notice>}
        <Button type="submit" block aria-disabled={account.working} aria-busy={account.working}>{texts.submit}</Button>
      </form>
    </section>
  );
}
