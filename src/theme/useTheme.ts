import { createContext, useContext } from 'react';
import { DEFAULT_RESOLVED_THEME, DEFAULT_THEME_PREFERENCE, type ThemeContextValue } from './types';

/** Value outside a ThemeProvider (isolated component tests): defaults, and a setter that does nothing. */
export const defaultThemeValue: ThemeContextValue = {
  preference: DEFAULT_THEME_PREFERENCE,
  resolved: DEFAULT_RESOLVED_THEME,
  setTheme: () => {},
};

export const ThemeContext = createContext<ThemeContextValue>(defaultThemeValue);

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
