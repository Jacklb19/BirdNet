import { useId, useState, type InputHTMLAttributes } from 'react';
import { useI18n } from '../../i18n';
import './SignInForm.css';

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>;

export interface TextFieldProps extends NativeInput {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Quiet help under the field (a rule the value must follow). */
  readonly hint?: string;
  /** Problem with the value, announced and linked to the field. */
  readonly error?: string;
}

/** Labelled input of the account forms: the hint and the error are tied to it for assistive technology. */
export function TextField({ label, value, onChange, hint, error, ...input }: TextFieldProps): React.JSX.Element {
  const id = useId();
  const hintId = useId();
  const errorId = useId();
  const described = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="bn-account-signin__field">
      <label htmlFor={id} className="bn-account-signin__label">{label}</label>
      <input id={id} className="bn-account-signin__input" value={value} aria-invalid={error ? true : undefined} aria-describedby={described}
        onChange={(event) => { onChange(event.target.value); }} {...input} />
      {hint && <p id={hintId} className="bn-account-signin__hint">{hint}</p>}
      {error && <p id={errorId} className="bn-account-signin__error" role="alert">{error}</p>}
    </div>
  );
}

/** Password input with a button that shows what was typed, which helps on a phone keyboard outdoors. */
export function PasswordField(props: Omit<TextFieldProps, 'type'>): React.JSX.Element {
  const { dict } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="bn-account-signin__password">
      <TextField {...props} type={visible ? 'text' : 'password'} required spellCheck={false} />
      <button type="button" className="bn-account-signin__reveal" aria-pressed={visible} onClick={() => { setVisible((current) => !current); }}>
        {visible ? dict.account.signIn.hidePassword : dict.account.signIn.showPassword}
      </button>
    </div>
  );
}
