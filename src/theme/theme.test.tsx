import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider, useTheme } from './index';

// ─── WCAG 2.1 Contrast Ratio Calculation Helpers ──────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrastRatio(hexForeground: string, hexBackground: string): number {
  const lum1 = relativeLuminance(hexToRgb(hexForeground));
  const lum2 = relativeLuminance(hexToRgb(hexBackground));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// ─── Theme Test Component ──────────────────────────────────────────────────

function ThemeConsumer(): React.JSX.Element {
  const { preference, resolved, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => { setTheme('light'); }}>Set Light</button>
      <button type="button" onClick={() => { setTheme('dark'); }}>Set Dark</button>
      <button type="button" onClick={() => { setTheme('system'); }}>Set System</button>
    </div>
  );
}

describe('Theme System & Provider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('inicia por defecto en modo sistema y aplica atributos al DOM', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('pref')).toHaveTextContent('system');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('permite cambiar a tema oscuro y añade data-theme="dark" al elemento raíz', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Set Dark' }));

    expect(screen.getByTestId('pref')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const stored = JSON.parse(localStorage.getItem('birdnet_settings') ?? '{}') as { theme?: string };
    expect(stored.theme).toBe('dark');
  });

  it('permite cambiar a tema claro y añade data-theme="light" al elemento raíz', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Set Light' }));

    expect(screen.getByTestId('pref')).toHaveTextContent('light');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('tolera fallos de localStorage sin lanzar excepción', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    await expect(user.click(screen.getByRole('button', { name: 'Set Dark' }))).resolves.not.toThrow();
    setItemSpy.mockRestore();
  });
});

describe('Theme WCAG AA Color Contrast Verification', () => {
  const lightTokens = {
    bg: '#ffffff',
    surface: '#ffffff',
    textPrimary: '#111827',
    textSecondary: '#374151',
    textMuted: '#4b5563',
    primary: '#047857',
    primaryText: '#ffffff',
    danger: '#dc2626',
    dangerText: '#ffffff',
    successBg: '#ecfdf5',
    successText: '#065f46',
    errorBg: '#fef2f2',
    errorText: '#991b1b',
    canvasBg: '#111827',
    canvasText: '#f9fafb',
  };

  const darkTokens = {
    bg: '#0f172a',
    surface: '#1e293b',
    textPrimary: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    primary: '#34d399',
    primaryText: '#022c22',
    danger: '#f87171',
    dangerText: '#450a0a',
    successBg: '#064e3b',
    successText: '#a7f3d0',
    errorBg: '#450a0a',
    errorText: '#fecaca',
    canvasBg: '#020617',
    canvasText: '#f1f5f9',
  };

  it('todos los pares de colores del tema claro cumplen o superan WCAG AA (>= 4.5:1)', () => {
    const ratioTextPrimary = calculateContrastRatio(lightTokens.textPrimary, lightTokens.bg);
    const ratioTextSecondary = calculateContrastRatio(lightTokens.textSecondary, lightTokens.bg);
    const ratioTextMuted = calculateContrastRatio(lightTokens.textMuted, lightTokens.bg);
    const ratioPrimaryText = calculateContrastRatio(lightTokens.primaryText, lightTokens.primary);
    const ratioDangerText = calculateContrastRatio(lightTokens.dangerText, lightTokens.danger);
    const ratioSuccess = calculateContrastRatio(lightTokens.successText, lightTokens.successBg);
    const ratioError = calculateContrastRatio(lightTokens.errorText, lightTokens.errorBg);
    const ratioCanvas = calculateContrastRatio(lightTokens.canvasText, lightTokens.canvasBg);

    expect(ratioTextPrimary).toBeGreaterThanOrEqual(4.5);
    expect(ratioTextSecondary).toBeGreaterThanOrEqual(4.5);
    expect(ratioTextMuted).toBeGreaterThanOrEqual(4.5);
    expect(ratioPrimaryText).toBeGreaterThanOrEqual(4.5);
    expect(ratioDangerText).toBeGreaterThanOrEqual(4.5);
    expect(ratioSuccess).toBeGreaterThanOrEqual(4.5);
    expect(ratioError).toBeGreaterThanOrEqual(4.5);
    expect(ratioCanvas).toBeGreaterThanOrEqual(4.5);
  });

  it('todos los pares de colores del tema oscuro cumplen o superan WCAG AA (>= 4.5:1)', () => {
    const ratioTextPrimary = calculateContrastRatio(darkTokens.textPrimary, darkTokens.bg);
    const ratioTextSecondary = calculateContrastRatio(darkTokens.textSecondary, darkTokens.bg);
    const ratioTextMuted = calculateContrastRatio(darkTokens.textMuted, darkTokens.bg);
    const ratioPrimaryText = calculateContrastRatio(darkTokens.primaryText, darkTokens.primary);
    const ratioDangerText = calculateContrastRatio(darkTokens.dangerText, darkTokens.danger);
    const ratioSuccess = calculateContrastRatio(darkTokens.successText, darkTokens.successBg);
    const ratioError = calculateContrastRatio(darkTokens.errorText, darkTokens.errorBg);
    const ratioCanvas = calculateContrastRatio(darkTokens.canvasText, darkTokens.canvasBg);

    expect(ratioTextPrimary).toBeGreaterThanOrEqual(4.5);
    expect(ratioTextSecondary).toBeGreaterThanOrEqual(4.5);
    expect(ratioTextMuted).toBeGreaterThanOrEqual(4.5);
    expect(ratioPrimaryText).toBeGreaterThanOrEqual(4.5);
    expect(ratioDangerText).toBeGreaterThanOrEqual(4.5);
    expect(ratioSuccess).toBeGreaterThanOrEqual(4.5);
    expect(ratioError).toBeGreaterThanOrEqual(4.5);
    expect(ratioCanvas).toBeGreaterThanOrEqual(4.5);
  });
});
