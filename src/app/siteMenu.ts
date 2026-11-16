import type { HomeSection } from '../features/home/home.config';
import type { Messages } from '../i18n';
import type { IconName } from '../shared/ui/Icon';
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

/**
 * Places and walks, in the phone menu after the sections. They also open from the map and the log, but the audit of
 * 2026-11-02 found them too hard to find there alone (ADR-44); the bars keep only the sections.
 */
export function collectionLinks(dict: Messages, place: MenuPlace): SiteBarLink[] {
  return [
    { key: 'journal', label: dict.app.menuLinks.journal, href: routeHash({ name: 'journal' }), icon: 'log', current: ['journal', 'outing', 'observations', 'collections', 'wishlist'].includes(place) },
    { key: 'places', label: dict.app.menuLinks.places, href: routeHash({ name: 'sites' }), icon: 'sites', current: place === 'sites' || place === 'site' },
    { key: 'walks', label: dict.app.menuLinks.walks, href: routeHash({ name: 'walks' }), icon: 'walk', current: place === 'walks' || place === 'walk' },
  ];
}

/** The link back to the home page, first in the app's bar: the site and the app are one place (ADR-27). */
export function homeLink(dict: Messages): SiteBarLink {
  return { key: 'home', label: dict.app.nav.home, href: routeHash({ name: 'home' }), icon: 'home' };
}

/**
 * The account block of the phone menu. Signed in: the profile and the settings. Signed out there is no profile and
 * nothing to set: only the ways in, always offered (ADR-45).
 */
export function accountGroup(dict: Messages, signedIn: boolean, place: MenuPlace): SiteBarGroup {
  if (signedIn) {
    return {
      key: 'account', label: dict.app.menuGroups.account,
      links: [
        { key: 'profile', label: dict.app.menuLinks.profile, href: routeHash({ name: 'account' }), icon: 'account', current: place === 'account' },
        { key: 'settings', label: dict.app.menuLinks.settings, href: routeHash({ name: 'settings' }), icon: 'settings', current: place === 'settings' },
      ],
    };
  }
  return {
    key: 'account', label: dict.app.menuGroups.account,
    links: [
      { key: 'signIn', label: dict.app.signIn, href: routeHash({ name: 'signIn' }), icon: 'account', current: place === 'signIn' },
      { key: 'signUp', label: dict.app.signUp, href: routeHash({ name: 'signUp' }), icon: 'plus', current: place === 'signUp' },
    ],
  };
}

/** Sections of the home page written in the public bar, in page order; the home's album is the guide's own link. */
const PUBLIC_HOME_SECTIONS = ['how', 'map', 'privacy'] as const satisfies readonly HomeSection[];
const PUBLIC_SECTION_ICONS: Readonly<Record<(typeof PUBLIC_HOME_SECTIONS)[number], IconName>> = { how: 'listen', map: 'map', privacy: 'privacy' };

export interface PublicPlace {
  readonly place: MenuPlace;
  /** The section of the home page in view; null at its top or on any other screen. */
  readonly homeSection?: HomeSection | null;
  /** On the home page itself a section link also scrolls in place, since following the same address changes nothing. */
  readonly onHomeSection?: (section: HomeSection | null) => void;
}

/**
 * The public site (ADR-45, ADR-47): the same links on the home page, the way in, the guide and every card, so moving
 * between them never changes the bar. The guide is the real catalog; the other links lead back to the home's sections.
 */
export function publicLinks(dict: Messages, { place, homeSection = null, onHomeSection }: PublicPlace): SiteBarLink[] {
  const atHome = place === 'home';
  const select = (section: HomeSection | null): (() => void) | undefined => (onHomeSection ? () => { onHomeSection(section); } : undefined);
  return [
    { ...homeLink(dict), current: atHome && homeSection === null, onSelect: select(null) },
    { key: 'guide', label: dict.app.publicNav.guide, href: routeHash({ name: 'album' }), icon: 'book', current: place === 'album' || place === 'species' },
    ...PUBLIC_HOME_SECTIONS.map((section) => ({
      key: section, label: dict.app.publicNav[section], href: routeHash({ name: 'home', section }), icon: PUBLIC_SECTION_ICONS[section],
      current: atHome && homeSection === section, onSelect: select(section),
    })),
  ];
}
