import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { accountInitials } from '../features/account/accountInitials';
import { Icon } from '../shared/ui/Icon';
import { LivePlayer } from './LivePlayer';
import { TOP_BAR_ITEMS, type Section } from './navigation';
import { routeHash } from './routes';
import { SiteBar } from './SiteBar';
import './TopBar.css';

/** The bar inside the app on wide screens: sections, the live player while listening, and the account. */
export function TopBar({ current }: { readonly current: Section }): React.JSX.Element {
  const { dict } = useI18n();
  const account = useAccountContext();
  const initials = accountInitials(account.profile?.alias ?? account.session?.user.email ?? null);
  const avatar = account.profile?.avatarUrl;
  return (
    <SiteBar variant="app" navLabel={dict.app.navLabel} brandHref={routeHash({ name: 'listen' })}
      links={TOP_BAR_ITEMS.map((entry) => ({ key: entry.section, label: dict.app.nav[entry.section], href: entry.href, current: entry.section === current }))}
      end={(
        <>
          <LivePlayer variant="chip" />
          <a className="bn-topbar__account" href={routeHash({ name: 'account' })} aria-label={dict.app.accountButton}
            aria-current={current === 'account' ? 'page' : undefined}>
            {avatar
              ? <img className="bn-topbar__photo" src={avatar} alt="" crossOrigin="anonymous" />
              : initials ?? <Icon name="account" />}
          </a>
        </>
      )} />
  );
}
