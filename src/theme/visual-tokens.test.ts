import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const result: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)) {
    if (match[1] && match[2]) result[match[1]] = match[2];
  }
  return result;
}

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Field visual tokens from the production stylesheet', () => {
  for (const [name, selector] of [['light', ':root {'], ['dark', '[data-theme="dark"] {']] as const) {
    const theme = tokens(selector);
    it(`keeps all field text AA in the ${name} theme`, () => {
      const pairs = [
        ...['color-bg', 'color-surface', 'color-surface-raised'].flatMap((background) =>
          ['color-text-primary', 'color-text-secondary', 'color-text-muted', 'color-text-subtle', 'color-primary'].map((foreground) => [foreground, background])),
        ['color-primary-text', 'color-primary'], ['color-danger-text', 'color-danger'],
        ['color-success-text', 'color-success-bg'], ['color-error-text', 'color-error-bg'],
        ['color-badge-active-text', 'color-badge-active-bg'], ['color-badge-inactive-text', 'color-badge-inactive-bg'],
        ['color-canvas-text', 'color-canvas-bg'], ['color-canvas-text-muted', 'color-canvas-bg'],
        ['color-swatch-light-text', 'color-swatch-light-bg'], ['color-swatch-dark-text', 'color-swatch-dark-bg'],
        ['color-warning', 'color-bg'], ['color-success-text', 'color-surface'],
      ];
      for (const [foreground = '', background = ''] of pairs) {
        expect(theme[foreground], foreground).toBeDefined();
        expect(theme[background], background).toBeDefined();
        expect(contrast(theme[foreground] ?? '', theme[background] ?? ''), `${foreground} / ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`keeps controls and readings distinguishable in the ${name} theme`, () => {
      for (const foreground of ['color-border', 'color-primary', 'color-danger', 'color-warning', 'color-focus']) {
        for (const background of ['color-bg', 'color-surface', 'color-surface-raised']) {
          expect(contrast(theme[foreground] ?? '', theme[background] ?? ''), `${foreground} / ${background}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
  it('uses identical dark color tokens for the system fallback', () => {
    expect(tokens(':root:not([data-theme="light"]):not([data-theme="dark"]) {')).toEqual(tokens('[data-theme="dark"] {'));
  });
});
