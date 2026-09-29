import { createContext, useContext } from 'react';
import type { ThemeContextValue } from './types';

export const defaultThemeValue: ThemeContextValue = {
  preference: 'system',
  resolved: 'light',
  setTheme: () => {},
};

export const ThemeContext = createContext<ThemeContextValue>(defaultThemeValue);

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
