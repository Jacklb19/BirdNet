import { useState } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { FieldIcon } from '../../shared/FieldIcon';
import type { AccountState } from './useAccount';

/** Email and password access; local records are only associated after an explicit choice. */
export function AccountPage({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const a = dict.account;
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setConfirmationSent(false);
    if (mode === 'signIn') await account.signIn(email.trim(), password);
    else setConfirmationSent(await account.signUp(email.trim(), password));
  };

  return (
    <section aria-label={a.title} className="page account-page">
      <header className="page-heading"><p className="eyebrow">{dict.app.navAccount}</p><h2>{a.title}</h2><p>{a.subtitle}</p></header>
      {!account.configured ? <p className="account-notice"><FieldIcon name="shield" />{a.unavailable}</p>
        : account.session ? (
          <div className="account-panel">
            <p className="account-identity"><span>{a.signedInAs}</span><strong>{account.session.user.email}</strong></p>
            <p className="account-notice"><FieldIcon name="ready" />{a.syncNotice}</p>
            {account.unownedCount > 0 && (
              <div className="account-claim" role="group" aria-labelledby="account-claim-title">
                <h3 id="account-claim-title">{a.claimTitle}</h3>
                <p>{a.claimDescription.replace('{count}', formatNumber(account.unownedCount, locale))}</p>
                <div className="account-actions">
                  <button type="button" className="offline-action" disabled={account.working} onClick={() => { void account.claimLocal(); }}>{a.claimAccept}</button>
                  <button type="button" className="account-secondary" disabled={account.working} onClick={() => { account.declineClaim(); }}>{a.claimDecline}</button>
                </div>
              </div>
            )}
            {account.claimed && <p role="status" className="account-notice"><FieldIcon name="ready" />{a.claimed}</p>}
            <button type="button" className="account-secondary" disabled={account.working} onClick={() => { void account.signOut(); }}>{a.signOut}</button>
          </div>
        ) : (
          <form className="account-form" onSubmit={(event) => { void submit(event); }}>
            <label>{a.email}<input type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); }} /></label>
            <label>{a.password}
              <input type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} required minLength={8}
                aria-describedby="account-password-hint" value={password} onChange={(event) => { setPassword(event.target.value); }} />
            </label>
            <p id="account-password-hint" className="account-hint">{a.passwordHint}</p>
            <button type="submit" className="offline-action" disabled={account.working}>{account.working ? a.working : mode === 'signIn' ? a.signIn : a.signUp}</button>
            <button type="button" className="account-link" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setConfirmationSent(false); }}>
              {mode === 'signIn' ? a.switchToSignUp : a.switchToSignIn}
            </button>
            {confirmationSent && <p role="status" className="account-notice"><FieldIcon name="clock" />{a.checkEmail}</p>}
          </form>
        )}
      {account.error && <p role="alert" className="account-error"><FieldIcon name="error" />{account.error === 'invalidCredentials' ? a.invalidCredentials : a.genericError}</p>}
    </section>
  );
}
