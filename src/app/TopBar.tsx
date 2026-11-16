import { useI18n } from '../i18n';
import { LivePlayer } from './LivePlayer';
import type { Section } from './navigation';
import { routeHash, type Route } from './routes';
import { SessionEntry } from './SessionEntry';
import { SiteBar } from './SiteBar';
import { accountGroup, appLinks, homeLink } from './siteMenu';
import './TopBar.css';

export interface TopBarProps {
  readonly current: Section | null;
  readonly route: Route['name'];
}

/**
 * The bar inside the app (ADR-47): the way back to the home page, the five destinations, the live player and the
 * avatar, which opens the account, the settings and the credits. The phone menu repeats all of it, grouped.
 */
export function TopBar({ current, route }: TopBarProps): React.JSX.Element {
  const { dict } = useI18n();
  const sections = appLinks(dict, current);
  const home = homeLink(dict);
  return (
    <SiteBar navLabel={dict.app.navLabel} brandHref={home.href ?? routeHash({ name: 'home' })}
      links={[home, ...sections]}
      menu={[
        { key: 'app', label: dict.app.menuGroups.app, links: sections },
        accountGroup(dict, true, route),
        { key: 'site', label: dict.app.menuGroups.site, links: [home] },
      ]}
      end={(
        <>
          <LivePlayer variant="chip" />
          <SessionEntry place={route} />
        </>
      )} />
  );
}
