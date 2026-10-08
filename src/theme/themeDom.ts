/**
 * Theme side effects on the document, kept apart from the provider so they can run before React renders.
 */
import { readPreferences } from '../config/storage';
import { applySky } from './sky';
import {
  DARK_SCHEME_QUERY, DEFAULT_RESOLVED_THEME, DEFAULT_THEME_PREFERENCE, isThemePreference,
  type ResolvedTheme, type ThemePreference,
} from './types';

/** The browser chrome (address bar, task switcher) takes this token's color, so it blends with the page. */
const THEME_COLOR_TOKEN = '--color-bg-canvas';
const THEME_COLOR_META_NAME = 'theme-color';

/** Null where matchMedia is missing (jsdom, some embedded web views); those get the default theme. */
export function darkSchemeQuery(): MediaQueryList | null {
  const { matchMedia } = window as Partial<Pick<Window, 'matchMedia'>>;
  return typeof matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null;
}

export function readStoredTheme(): ThemePreference {
  const { theme } = readPreferences();
  return isThemePreference(theme) ? theme : DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  const query = darkSchemeQuery();
  if (!query) return DEFAULT_RESOLVED_THEME;
  return query.matches ? 'dark' : 'light';
}

/**
 * Copies the page background into every <meta name="theme-color">, creating one when the document has none.
 * All of them get the resolved color: a media-specific pair would otherwise override an explicit choice.
 */
function syncThemeColor(): void {
  const color = getComputedStyle(document.documentElement).getPropertyValue(THEME_COLOR_TOKEN).trim();
  // Before the stylesheet loads there is no token; the static value in index.html is kept until then.
  if (!color) return;
  const selector = `meta[name="${THEME_COLOR_META_NAME}"]`;
  if (!document.head.querySelector(selector)) {
    const meta = document.createElement('meta');
    meta.name = THEME_COLOR_META_NAME;
    document.head.append(meta);
  }
  for (const meta of document.head.querySelectorAll<HTMLMetaElement>(selector)) meta.content = color;
}

/** The resolved theme is always written, so the stylesheet needs a single dark block. */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  syncThemeColor();
}

/** Called before the first render so a dark system theme never flashes light, nor the day sky at night. */
export function applyInitialTheme(): void {
  applySky();
  applyTheme(resolveTheme(readStoredTheme()));
}
