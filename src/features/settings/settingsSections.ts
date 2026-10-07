/**
 * Groups of the settings screen that other screens can open directly. The hash already holds the route, so
 * the requested group travels in memory instead of a URL fragment the router would misread.
 */
export type SettingsSection = 'permissions';

let requested: SettingsSection | null = null;

/** Call right before following a link to Settings: the screen then opens scrolled to `section`, with focus on it. */
export function requestSettingsSection(section: SettingsSection): void {
  requested = section;
}

/** The pending request, consumed once so a later visit to Settings starts at the top again. */
export function takeRequestedSection(): SettingsSection | null {
  const section = requested;
  requested = null;
  return section;
}
