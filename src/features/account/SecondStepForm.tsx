import { useId, useState, type SyntheticEvent } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { AUTHENTICATOR_CODE_LENGTH } from './account.constants';
import { TextField } from './FormField';
import { normalizeCode } from './secondFactor';
import type { AccountState } from './useAccount';
import './SignInForm.css';

/** A code typed as it arrives (an authenticator app shows it with a space in the middle); the authenticator's by default. */
export function CodeField({ label, value, onChange, length = AUTHENTICATOR_CODE_LENGTH }: {
  readonly label: string; readonly value: string; readonly onChange: (code: string) => void; readonly length?: number;
}): React.JSX.Element {
  // No maxLength: it cut a pasted "123 456" to "123 45" before the space was dropped; normalizeCode caps the digits.
  return (
    <TextField label={label} value={value} onChange={(typed) => { onChange(normalizeCode(typed, length)); }} inputMode="numeric" autoComplete="one-time-code"
      pattern={`\\d{${String(length)}}`} required spellCheck={false} />
  );
}

/** After the password (or Google) of an account with the second step on: nothing of the account opens without the code. */
export function SecondStepForm({ account }: { readonly account: AccountState }): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.account.secondStep;
  const [code, setCode] = useState('');
  const titleId = useId();

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (account.working || code.length !== AUTHENTICATOR_CODE_LENGTH) return;
    if (!(await account.verifySecondStep(code))) setCode('');
  };

  return (
    <section className="bn-account-signin" aria-labelledby={titleId}>
      <div className="bn-account-signin__intro">
        <h2 id={titleId} className="bn-account-signin__title display">{texts.askTitle}</h2>
        <p className="bn-account-signin__text">{texts.askText}</p>
      </div>
      <form className="bn-account-signin__form" onSubmit={(event) => { void submit(event); }}>
        <CodeField label={texts.code} value={code} onChange={setCode} />
        {account.error && <Notice tone="error" live>{dict.account.errors[account.error]}</Notice>}
        <Button type="submit" block aria-disabled={account.working || code.length !== AUTHENTICATOR_CODE_LENGTH} aria-busy={account.working}>
          {account.working ? texts.checking : texts.enter}
        </Button>
        <Button type="button" variant="quiet" block onClick={() => { void account.signOut(); }}>{texts.leave}</Button>
      </form>
      <p className="bn-account-signin__hint">{texts.lost}</p>
    </section>
  );
}
