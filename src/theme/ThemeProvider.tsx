import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { ThemePreference, ResolvedTheme, ThemeContextValue } from './types';
import { ThemeContext } from './useTheme';

const STORAGE_KEY = 'birdnet_settings';

interface StoredSettings {
  locale?: string;
  theme?: ThemePreference;
}

function loadStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredSettings;
      if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
        return parsed.theme;
      }
    }
  } catch {
    // Private browsing or quota exceeded
  }
  return 'system';
}

function saveTheme(theme: ThemePreference): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const current: StoredSettings = raw ? (JSON.parse(raw) as StoredSettings) : {};
    current.theme = theme;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Silently ignore storage errors
  }
}

function getSystemTheme(): ResolvedTheme {
  const hasMatchMedia =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { matchMedia?: unknown }).matchMedia === 'function';

  if (hasMatchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? getSystemTheme() : pref;
}

function applyThemeToDOM(resolved: ResolvedTheme, preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', resolved);
  }
}

export interface ThemeProviderProps {
  children: ReactNode;
  initialPreference?: ThemePreference;
}

export function ThemeProvider({ children, initialPreference }: ThemeProviderProps): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    initialPreference ?? loadStoredTheme(),
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(resolveTheme(preference));

  const setTheme = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    const newResolved = resolveTheme(pref);
    setResolved(newResolved);
    applyThemeToDOM(newResolved, pref);
    saveTheme(pref);
  }, []);

  useEffect(() => {
    applyThemeToDOM(resolved, preference);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasMatchMedia =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { matchMedia?: unknown }).matchMedia === 'function';

    if (preference !== 'system' || !hasMatchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => {
      const newResolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(newResolved);
      applyThemeToDOM(newResolved, 'system');
    };

    mediaQuery.addEventListener('change', handler);
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setTheme }),
    [preference, resolved, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
