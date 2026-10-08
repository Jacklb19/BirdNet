import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { writePreference } from '../config/storage';
import { applyTheme, darkSchemeQuery, readStoredTheme, resolveTheme } from './themeDom';
import type { ResolvedTheme, ThemeContextValue, ThemePreference } from './types';
import { ThemeContext } from './useTheme';

export interface ThemeProviderProps {
  children: ReactNode;
  /** Overrides the stored preference; used by tests and previews. */
  initialPreference?: ThemePreference;
}

/** Owns the theme preference, persists it and keeps the document's data-theme and theme-color in step. */
export function ThemeProvider({ children, initialPreference }: ThemeProviderProps): React.JSX.Element {
  const [preference, setPreference] = useState<ThemePreference>(() => initialPreference ?? readStoredTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Applies the first theme; later changes are applied synchronously below, before descendants' effects
  // (canvas and map drawing) read the tokens of the new theme.
  useEffect(() => { applyTheme(resolved); }, [resolved]);

  const setTheme = useCallback((next: ThemePreference) => {
    const nextResolved = resolveTheme(next);
    setPreference(next);
    setResolved(nextResolved);
    applyTheme(nextResolved);
    writePreference('theme', next);
  }, []);

  useEffect(() => {
    const query = preference === 'system' ? darkSchemeQuery() : null;
    if (!query) return;
    const changed = (): void => {
      const next = resolveTheme(preference);
      setResolved(next);
      applyTheme(next);
    };
    query.addEventListener('change', changed);
    return () => { query.removeEventListener('change', changed); };
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => ({ preference, resolved, setTheme }), [preference, resolved, setTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
