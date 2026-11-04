import { useI18n } from '../i18n';
import { Button } from '../shared/ui/Button';
import { routeHash, type Route } from './routes';
import { SiteBar } from './SiteBar';
import { accountGroup, homeLink, publicLinks } from './siteMenu';
import './PublicBar.css';

export interface PublicBarProps {
  readonly route: Route['name'];
}

/**
 * The bar without a session (ADR-45): the home page, the guide of birds and the ways in. Nothing of the app is
 * offered, because nothing of it opens without an account. On the way in, the bar offers the other one.
 */
export function PublicBar({ route }: PublicBarProps): React.JSX.Element {
  const { dict } = useI18n();
  const links = publicLinks(dict, route);
  const home = homeLink(dict);
  const signIn = <Button variant="secondary" className="bn-publicbar__secondary" href={routeHash({ name: 'signIn' })}>{dict.app.signIn}</Button>;
  const signUp = <Button href={routeHash({ name: 'signUp' })}>{dict.app.signUp}</Button>;
  return (
    <SiteBar navLabel={dict.app.navLabel} brandHref={home.href ?? routeHash({ name: 'home' })} links={links}
      menu={[
        { key: 'site', label: dict.app.menuGroups.site, links },
        accountGroup(dict, false, route),
      ]}
      end={route === 'signIn' ? signUp : route === 'signUp' ? signIn : <>{signIn}{signUp}</>} />
  );
}
