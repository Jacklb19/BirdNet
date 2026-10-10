import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { accountInitials } from '../features/account/accountInitials';
import { BrandMark } from '../shared/ui/BrandMark';
import { Icon } from '../shared/ui/Icon';
import { LivePlayer } from './LivePlayer';
import { TOP_BAR_ITEMS, type Section } from './navigation';
import { routeHash } from './routes';
import './TopBar.css';

/** Floating bar on wide screens: brand, sections, the live player while listening, and the account. */
export function TopBar({ current }: { readonly current: Section }): React.JSX.Element {
  const { dict } = useI18n();
  const account = useAccountContext();
  const initials = accountInitials(account.session?.user.email ?? null);
  return (
    <header className="bn-topbar">
      <div className="bn-topbar__inner">
        <a className="bn-topbar__brand" href={routeHash({ name: 'listen' })}>
          <BrandMark name={dict.app.name} />
        </a>
        <nav className="bn-topbar__nav" aria-label={dict.app.navLabel}>
          <ul>
            {TOP_BAR_ITEMS.map((entry) => (
              <li key={entry.section}>
                <a className="bn-topbar__link" href={entry.href} aria-current={entry.section === current ? 'page' : undefined}>
                  {dict.app.nav[entry.section]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="bn-topbar__end">
          <LivePlayer variant="chip" />
          <a className="bn-topbar__account" href={routeHash({ name: 'account' })} aria-label={dict.app.accountButton}
            aria-current={current === 'account' ? 'page' : undefined}>
            {initials ?? <Icon name="account" />}
          </a>
        </div>
      </div>
    </header>
  );
}
