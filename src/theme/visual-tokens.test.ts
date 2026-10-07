import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');

const THEMES = [['light', ':root {'], ['dark', ":root[data-theme='dark'] {"]] as const;

/** WCAG 2.1 minimum contrast: 4.5:1 for text, 3:1 for icons, borders and other graphical objects. */
const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;

const PAGE_BACKGROUNDS = ['color-bg-canvas', 'color-bg-surface'];

/** Species rows: their text sits on the page, on the hover fill (sunken) and on the singing-now highlight. */
const ROW_BACKGROUNDS = [...PAGE_BACKGROUNDS, 'color-bg-sunken', 'color-highlight-now'];

const STATUS_COLORS = ['color-status-confirmed', 'color-status-provisional', 'color-status-verified', 'color-status-corrected'];

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ...['color-text-primary', 'color-text-secondary', ...STATUS_COLORS].flatMap((foreground) =>
    ROW_BACKGROUNDS.map((background) => [foreground, background] as const)),
  ...['color-brand', 'color-error'].flatMap((foreground) => PAGE_BACKGROUNDS.map((background) => [foreground, background] as const)),
  ['color-on-brand', 'color-brand'], ['color-text-inverse', 'color-bg-inverse'],
  // Caution notices: the state color and the secondary body text on the soft fill.
  ['color-status-provisional', 'color-status-provisional-soft'], ['color-text-secondary', 'color-status-provisional-soft'],
];

const GRAPHIC_PAIRS: readonly (readonly [string, string])[] = [
  'color-brand', 'color-record', 'color-border-strong',
  'color-status-confirmed', 'color-status-provisional', 'color-status-verified', 'color-status-corrected',
].flatMap((foreground) => [...PAGE_BACKGROUNDS, 'color-bg-sunken'].map((background) => [foreground, background] as const));

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

describe('design token contrast (src/styles/tokens.css)', () => {
  for (const [name, selector] of THEMES) {
    const theme = tokens(selector);
    const check = (pairs: readonly (readonly [string, string])[], minimum: number): void => {
      for (const [foreground, background] of pairs) {
        expect(theme[foreground], foreground).toBeDefined();
        expect(theme[background], background).toBeDefined();
        expect(contrast(theme[foreground] ?? '', theme[background] ?? ''), `${foreground} / ${background}`).toBeGreaterThanOrEqual(minimum);
      }
    };
    it(`keeps text AA in the ${name} theme`, () => { check(TEXT_PAIRS, TEXT_CONTRAST); });
    it(`keeps controls and markers distinguishable in the ${name} theme`, () => { check(GRAPHIC_PAIRS, GRAPHIC_CONTRAST); });
  }
});
