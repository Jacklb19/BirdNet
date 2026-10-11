import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { accountInitials } from '../features/account/accountInitials';
import { requestSignInMode } from '../features/account/signInIntent';
import { Button } from '../shared/ui/Button';
import { Icon } from '../shared/ui/Icon';
import { routeHash } from './routes';
import './SessionEntry.css';

export interface SessionEntryProps {
  /** The account screen is the one being shown. */
  readonly current?: boolean;
}

/**
 * The session's corner of the bar. Signed in: the person's photo or initials, leading to their account. Signed
 * out: the way in, by its name, always there. There is no anonymous profile, because without a session there is
 * none to show.
 */
export function SessionEntry({ current = false }: SessionEntryProps): React.JSX.Element {
  const { dict } = useI18n();
  const account = useAccountContext();
  if (!account.session) {
    return (
      <Button variant="secondary" className="bn-session__signin" href={routeHash({ name: 'account' })}
        aria-current={current ? 'page' : undefined} onClick={() => { requestSignInMode('signIn'); }}>
        {dict.app.signIn}
      </Button>
    );
  }
  const initials = accountInitials(account.profile?.alias ?? account.session.user.email ?? null);
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
