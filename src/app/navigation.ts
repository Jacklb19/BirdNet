import type { IconName } from '../shared/ui/Icon';
import { routeHash, type Route, type sectionOf } from './routes';

export type Section = NonNullable<ReturnType<typeof sectionOf>>;

export interface NavItem {
  readonly section: Section;
  readonly href: string;
  readonly icon: IconName;
}

const item = (section: Section, route: Route, icon: IconName): NavItem => ({ section, href: routeHash(route), icon });

/**
 * The five destinations of the app (ADR-47), in the phone's tab bar and in the bar on wide screens. Places open from
 * the map and walks from the log's outings; the account, the settings and the credits from the avatar.
 */
export const NAV_ITEMS: readonly NavItem[] = Object.freeze([
  item('listen', { name: 'listen' }, 'listen'),
  item('map', { name: 'map' }, 'map'),
  item('guide', { name: 'album' }, 'book'),
  item('log', { name: 'log' }, 'log'),
  item('assistant', { name: 'assistant' }, 'chat'),
]);
