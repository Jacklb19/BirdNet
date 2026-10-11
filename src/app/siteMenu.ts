import type { Messages } from '../i18n';
import { requestSignInMode } from '../features/account/signInIntent';
import { TOP_BAR_ITEMS, type Section } from './navigation';
import { routeHash, type Route } from './routes';
import type { SiteBarGroup, SiteBarLink } from './SiteBar';

/** Where the person is, so the menu marks it: a section of the app, a screen outside the sections, or the home page. */
export type MenuPlace = Section | Route['name'];

/** The app's sections as bar links; `current` is the section being shown, or null on the home page. */
export function appLinks(dict: Messages, current: Section | null): SiteBarLink[] {
  return TOP_BAR_ITEMS.map((entry) => ({
    key: entry.section, label: dict.app.nav[entry.section], href: entry.href, icon: entry.icon, current: entry.section === current,
  }));
}

/** The link back to the home page, first in the app's bar: the site and the app are one place (ADR-27). */
export function homeLink(dict: Messages): SiteBarLink {
  return { key: 'home', label: dict.app.nav.home, href: routeHash({ name: 'home' }), icon: 'home' };
}

/**
 * The account block of the phone menu. Without a session there is no profile to show: only the ways in. Settings
 * stay reachable either way, because permissions, theme and language need no account.
 */
export function accountGroup(dict: Messages, signedIn: boolean, accountsAvailable: boolean, place: MenuPlace): SiteBarGroup {
  const settings: SiteBarLink = {
    key: 'settings', label: dict.app.menuLinks.settings, href: routeHash({ name: 'settings' }), icon: 'settings', current: place === 'settings',
  };
  const account = routeHash({ name: 'account' });
  if (signedIn) {
    return {
      key: 'account', label: dict.app.menuGroups.account,
      links: [{ key: 'profile', label: dict.app.menuLinks.profile, href: account, icon: 'account', current: place === 'account' }, settings],
    };
  }
  if (!accountsAvailable) return { key: 'account', label: dict.app.menuGroups.settings, links: [settings] };
  return {
    key: 'account', label: dict.app.menuGroups.account,
    links: [
      { key: 'signIn', label: dict.app.signIn, href: account, icon: 'account', current: place === 'account', onSelect: () => { requestSignInMode('signIn'); } },
      { key: 'signUp', label: dict.app.signUp, href: account, icon: 'plus', onSelect: () => { requestSignInMode('signUp'); } },
      settings,
    ],
  };
}
