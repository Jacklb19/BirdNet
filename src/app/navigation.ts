import type { IconName } from '../shared/ui/Icon';
import { routeHash, type Route, type sectionOf } from './routes';

export type Section = ReturnType<typeof sectionOf>;

export interface NavItem {
  readonly section: Section;
  readonly href: string;
  readonly icon: IconName;
}

const item = (section: Section, route: Route, icon: IconName): NavItem => ({ section, href: routeHash(route), icon });

/**
 * Top-level sections in display order (tab bar on phones, the bar on wide screens). Places are reached from the
 * map, where they belong since songs are pinned to the walk (ADR-22).
 */
export const NAV_ITEMS: readonly NavItem[] = Object.freeze([
  item('listen', { name: 'listen' }, 'listen'),
  item('map', { name: 'map' }, 'map'),
  item('guide', { name: 'album' }, 'book'),
  item('log', { name: 'log' }, 'log'),
  item('account', { name: 'account' }, 'account'),
]);

/** The sections written in the bar; the account is reached from the session's corner of it, not from these links. */
export const TOP_BAR_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((entry) => entry.section !== 'account');

/** Tabs of the phone's bottom bar. Without a session there is no account to show, so its tab is left out (ADR-27). */
export function tabItems(signedIn: boolean): readonly NavItem[] {
  return signedIn ? NAV_ITEMS : TOP_BAR_ITEMS;
}
