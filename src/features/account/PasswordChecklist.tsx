import { formatNumber, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { PASSWORD_MIN_LENGTH } from './account.constants';
import { PASSWORD_ROOMY_LENGTH } from './account.config';
import { passwordGuidance } from './passwordGuidance';

export interface PasswordChecklistProps {
  readonly id: string;
  readonly password: string;
  readonly confirmation: string;
}

/**
 * The rules of a new password as it is typed: what is required, met or still missing, and apart from it what is only
 * suggested. Tied to the password field by `id` (aria-describedby) and not live, so a reader is not interrupted at
 * every key; the form still reports a mismatch on sending. It promises no strength, only what each line says.
 */
export function PasswordChecklist({ id, password, confirmation }: PasswordChecklistProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.signIn.checklist;
  const state = passwordGuidance(password, confirmation, PASSWORD_MIN_LENGTH, PASSWORD_ROOMY_LENGTH);
  const required = [
    { key: 'length', met: state.longEnough, label: texts.length(formatNumber(PASSWORD_MIN_LENGTH, locale)) },
    { key: 'match', met: state.matches === true, label: state.matches === false ? texts.noMatch : texts.match },
  ];
  const suggested = [
    { key: 'roomy', met: state.roomy, label: texts.roomy(formatNumber(PASSWORD_ROOMY_LENGTH, locale)) },
    { key: 'varied', met: state.varied, label: texts.varied },
  ];
  const line = (entry: { readonly key: string; readonly met: boolean; readonly label: string }, kind: 'required' | 'suggested'): React.JSX.Element => (
    <li key={entry.key} className={`bn-password-checks__item${entry.met ? ' bn-password-checks__item--met' : ''} bn-password-checks__item--${kind}`}>
      <span className="bn-password-checks__mark" aria-hidden="true">{entry.met ? <Icon name="check" size="s" /> : null}</span>
      <span>{entry.label}</span>
      <span className="visually-hidden">{entry.met ? texts.met : texts.missing}</span>
    </li>
  );
  return (
    <div id={id} className="bn-password-checks">
      <p className="label bn-password-checks__heading">{texts.required}</p>
      <ul className="bn-password-checks__list">{required.map((entry) => line(entry, 'required'))}</ul>
      <p className="label bn-password-checks__heading">{texts.suggested}</p>
      <ul className="bn-password-checks__list">{suggested.map((entry) => line(entry, 'suggested'))}</ul>
    </div>
  );
}
