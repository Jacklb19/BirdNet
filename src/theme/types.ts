/**
 * Theme model: the choices people have, their defaults and the context shape. Types are derived from the
 * data, so adding a choice here is enough for the guard and the settings options.
 */

/** Theme choices in the order settings shows them; 'system' follows the device's color scheme. */
export const THEME_PREFERENCES = Object.freeze(['system', 'light', 'dark'] as const);
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What is actually painted: a preference with 'system' already resolved. */
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/** Painted when the device cannot report its color scheme. */
export const DEFAULT_RESOLVED_THEME: ResolvedTheme = 'light';

/** Media query that the 'system' preference follows. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** Stored preferences are untrusted (older versions, manual edits), so they are checked before use. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (pref: ThemePreference) => void;
}
