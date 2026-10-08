import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS, readPreferences } from '../config/storage';
import { DEFAULT_RESOLVED_THEME, DEFAULT_THEME_PREFERENCE, THEME_PREFERENCES, ThemeProvider, useTheme } from './index';

function ThemeConsumer(): React.JSX.Element {
  const { preference, resolved, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      {THEME_PREFERENCES.map((option) => (
        <button key={option} type="button" onClick={() => { setTheme(option); }}>{option}</button>
      ))}
    </div>
  );
}

function renderTheme(): void {
  render(<ThemeProvider><ThemeConsumer /></ThemeProvider>);
}

function themeColorMeta(): string | null {
  return document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null;
}

describe('ThemeProvider', () => {
  const reset = (): void => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '';
  };
  beforeEach(reset);
  afterEach(reset);

  it('starts from the default preference and writes the resolved theme to the document', () => {
    renderTheme();
    expect(screen.getByTestId('pref')).toHaveTextContent(DEFAULT_THEME_PREFERENCE);
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_RESOLVED_THEME);
  });

  it('applies and stores an explicit choice', async () => {
    const user = userEvent.setup();
    renderTheme();
    await user.click(screen.getByRole('button', { name: 'dark' }));
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(readPreferences().theme).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ theme: 'sepia' }));
    renderTheme();
    expect(screen.getByTestId('pref')).toHaveTextContent(DEFAULT_THEME_PREFERENCE);
  });

  it('keeps the browser theme-color in step with the page background', async () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/tokens.css', 'utf8');
    document.head.append(style);
    const background = (): string => getComputedStyle(document.documentElement).getPropertyValue('--color-bg-canvas').trim();
    const user = userEvent.setup();
    renderTheme();
    await user.click(screen.getByRole('button', { name: 'light' }));
    const light = themeColorMeta();
    expect(light).toBe(background());
    await user.click(screen.getByRole('button', { name: 'dark' }));
    expect(themeColorMeta()).toBe(background());
    expect(themeColorMeta()).not.toBe(light);
  });

  it('keeps working when storage fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const user = userEvent.setup();
    renderTheme();
    await user.click(screen.getByRole('button', { name: 'dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
