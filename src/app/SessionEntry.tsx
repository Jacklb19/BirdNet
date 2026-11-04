import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { accountInitials } from '../features/account/accountInitials';
import { Button } from '../shared/ui/Button';
import { Icon } from '../shared/ui/Icon';
import { routeHash } from './routes';
import './SessionEntry.css';

export interface SessionEntryProps {
  /** The account screen is the one being shown. */
  readonly current?: boolean;
}

/**
 * The session's corner of the bar. Signed in: the person's photo or initials, leading to their account (offline, the
 * initials of the account the phone keeps signed in). Signed out: the way in, by its name, always there.
 */
export function SessionEntry({ current = false }: SessionEntryProps): React.JSX.Element {
  const { dict } = useI18n();
  const account = useAccountContext();
  if (!account.identity) {
    return <Button variant="secondary" className="bn-session__signin" href={routeHash({ name: 'signIn' })}>{dict.app.signIn}</Button>;
  }
  const initials = accountInitials(account.profile?.alias ?? account.identity.email);
  const avatar = account.profile?.avatarUrl;
  return (
    <a className="bn-session__avatar" href={routeHash({ name: 'account' })} aria-label={dict.app.accountButton}
      aria-current={current ? 'page' : undefined}>
      {avatar
        ? <img className="bn-session__photo" src={avatar} alt="" crossOrigin="anonymous" />
        : initials ?? <Icon name="account" />}
    </a>
  );
}
