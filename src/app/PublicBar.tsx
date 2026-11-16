import type { ReactNode } from 'react';
import { useAccountContext } from '../features/account/accountContext';
import { useI18n } from '../i18n';
import { Button } from '../shared/ui/Button';
import { routeHash } from './routes';
import { SessionEntry } from './SessionEntry';
import { SiteBar } from './SiteBar';
import { accountGroup, appLinks, publicLinks, type PublicPlace } from './siteMenu';
import './PublicBar.css';

export interface PublicBarProps extends PublicPlace {
  /** The brand on the home page also scrolls back to its top. */
  readonly onBrand?: () => void;
  /** Runs before a link into the app is followed (the home page starts the model download from there). */
  readonly onOpenApp?: () => void;
}

/**
 * The bar of the public site (ADR-45, ADR-47): the home page, the way in, the guide and its cards share it, so
 * moving between them never changes the links. Signing in is the main way in and creating an account the second;
 * on the way in the bar offers only the other one. Signed in, the home page offers the app instead.
 */
export function PublicBar({ place, homeSection, onHomeSection, onBrand, onOpenApp }: PublicBarProps): React.JSX.Element {
  const { dict } = useI18n();
  const signedIn = useAccountContext().identity !== null;
  const links = publicLinks(dict, { place, homeSection, onHomeSection });
  const signIn = <Button href={routeHash({ name: 'signIn' })}>{dict.app.signIn}</Button>;
  const signUp = <Button variant="secondary" className="bn-publicbar__secondary" href={routeHash({ name: 'signUp' })}>{dict.app.signUp}</Button>;
  let end: ReactNode;
  if (signedIn) end = <><SessionEntry /><Button href={routeHash({ name: 'listen' })} onClick={onOpenApp}>{dict.app.openApp}</Button></>;
  else if (place === 'signIn') end = signUp;
  else if (place === 'signUp') end = signIn;
  else end = <>{signUp}{signIn}</>;
  return (
    <SiteBar navLabel={dict.app.navLabel} brandHref={routeHash({ name: 'home' })} onBrand={onBrand} links={links}
      menu={[
        { key: 'site', label: dict.app.menuGroups.site, links },
        ...(signedIn ? [{ key: 'app', label: dict.app.menuGroups.app, links: appLinks(dict, null).map((link) => ({ ...link, onSelect: onOpenApp })) }] : []),
        accountGroup(dict, signedIn, place),
      ]}
      end={end} />
  );
}
