import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { Icon } from '../shared/ui/Icon';
import { LivePlayer } from './LivePlayer';
import type { Section } from './navigation';
import { routeHash, type Route } from './routes';
import { SessionEntry } from './SessionEntry';
import { SiteBar } from './SiteBar';
import { accountGroup, appLinks, homeLink } from './siteMenu';
import './TopBar.css';

export interface TopBarProps {
  readonly current: Section;
  readonly route: Route['name'];
}

/** The bar inside the app: the way back to the home page, the sections, the live player and the session. */
export function TopBar({ current, route }: TopBarProps): React.JSX.Element {
  const { dict } = useI18n();
  const account = useAccountContext();
  // The account and settings screens belong to no section of the bar, so none is marked while they show.
  const section = route === 'account' || route === 'settings' ? null : current;
  const sections = appLinks(dict, section);
  const home = homeLink(dict);
  return (
    <SiteBar navLabel={dict.app.navLabel} brandHref={home.href ?? routeHash({ name: 'home' })}
      links={[home, ...sections]}
      menu={[
        { key: 'app', label: dict.app.menuGroups.app, links: sections },
        { key: 'site', label: dict.app.menuGroups.site, links: [home] },
        accountGroup(dict, account.session !== null, route),
      ]}
      end={(
        <>
          <LivePlayer variant="chip" />
          <a className="bn-topbar__settings" href={routeHash({ name: 'settings' })} aria-label={dict.app.menuLinks.settings}
            title={dict.app.menuLinks.settings} aria-current={route === 'settings' ? 'page' : undefined}>
            <Icon name="settings" />
          </a>
          <SessionEntry current={route === 'account'} />
        </>
      )} />
  );
}
