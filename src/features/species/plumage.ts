import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../config/storage';
import { PLUMAGE_OVERRIDES } from './plumage.config';
import { useSpeciesPhoto } from './speciesPhotos';

/**
 * The plates a bird can paint its screen with (ADR-20). Each has a fill and a text color in tokens.css
 * (`--plumage-<name>` and `--plumage-<name>-on`) whose contrast is tested, so any species reads well on its plate.
 */
export const PLUMAGES = Object.freeze([
  'mirla', 'colibri', 'esmeralda', 'escarlata', 'azulejo', 'canario', 'copeton', 'tangara', 'pizarra', 'rosado',
] as const);
export type Plumage = (typeof PLUMAGES)[number];

export type Rgb = readonly [number, number, number];

interface Hsl { readonly h: number; readonly s: number; readonly l: number }

const CHANNEL_MAX = 255;
const DEGREES = 360;
const HUE_SECTOR = 60;

function toHsl([red, green, blue]: Rgb): Hsl {
  const r = red / CHANNEL_MAX;
  const g = green / CHANNEL_MAX;
  const b = blue / CHANNEL_MAX;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * HUE_SECTOR + DEGREES) % DEGREES, s, l };
}

/** Plates chosen only for colorless birds: their hue says little, so they are never picked by hue. */
const NEUTRAL_PLATES: readonly Plumage[] = ['copeton', 'pizarra'];
/** Below this saturation a color reads as grey or brown rather than as a hue. */
const MIN_CHROMA = 0.25;
/** Hues (degrees) of browns: a desaturated color in this range gets the brown plate, otherwise slate. */
const BROWN_HUES = Object.freeze({ from: 15, to: 50 });
const MIN_BROWN_LIGHTNESS = 0.2;

/**
 * Plate of a color. Plates are vivid by design, so a colored bird is matched by hue alone (its photo is usually
 * duller than the plate); a colorless one gets the brown or the slate plate.
 */
export function nearestPlumage(color: Rgb, references: Readonly<Record<Plumage, Rgb>>): Plumage {
  const target = toHsl(color);
  if (target.s < MIN_CHROMA) {
    return target.h >= BROWN_HUES.from && target.h <= BROWN_HUES.to && target.l > MIN_BROWN_LIGHTNESS ? 'copeton' : 'pizarra';
  }
  let best: Plumage = PLUMAGES[0];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const name of PLUMAGES) {
    if (NEUTRAL_PLATES.includes(name)) continue;
    const gap = Math.abs(target.h - toHsl(references[name]).h);
    const circular = Math.min(gap, DEGREES - gap);
    if (circular < bestGap) { best = name; bestGap = circular; }
  }
  return best;
}

const RGBA = 4;
/** Hue bins of 15°: narrow enough to keep a bird's color apart from the background's. */
const HUE_BINS = 24;
/** Pixels this close to white or black (the sky, deep shade) say nothing about the bird. */
const MIN_LIGHTNESS = 0.08;
const MAX_LIGHTNESS = 0.94;
/** Foliage fills most bird photos, so green counts for less than the colors a bird is more likely to wear. */
const FOLIAGE_HUE = Object.freeze({ from: 55, to: 170, weight: 0.35 });
/** Share of the half-diagonal that counts as the centre, where the bird usually is; outside it pixels weigh nothing. */
const CENTRE_RADIUS = 0.7;
/** Neutral grey, the answer for a picture without any color. */
const GREY = 128;

/**
 * The most telling color of a small RGBA thumbnail: pixels are binned by hue and weighted by the square of their
 * saturation and of their closeness to the centre, so a vivid bird in the middle outweighs a dull background.
 * Returns the mean color of the heaviest bin, or grey when nothing in the picture has any color.
 */
export function dominantColor(pixels: Uint8ClampedArray, width: number, height: number): Rgb {
  const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const reach = (Math.hypot(cx, cy) || 1) * CENTRE_RADIUS;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * RGBA;
      const rgb: Rgb = [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
      const { h, s, l } = toHsl(rgb);
      if (l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue;
      const centre = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / reach) ** 2;
      const foliage = h >= FOLIAGE_HUE.from && h <= FOLIAGE_HUE.to ? FOLIAGE_HUE.weight : 1;
      const weight = s * s * centre * foliage;
      const bin = bins[Math.floor(h / (DEGREES / HUE_BINS)) % HUE_BINS];
      if (!bin || weight === 0) continue;
      bin.weight += weight; bin.r += rgb[0] * weight; bin.g += rgb[1] * weight; bin.b += rgb[2] * weight;
    }
  }
  const heaviest = bins.reduce((best, bin) => (bin.weight > best.weight ? bin : best));
  if (heaviest.weight === 0) return [GREY, GREY, GREY];
  return [Math.round(heaviest.r / heaviest.weight), Math.round(heaviest.g / heaviest.weight), Math.round(heaviest.b / heaviest.weight)];
}

/** Stable plate for a species without a usable photo, so it keeps the same color on every screen and visit. */
export function fallbackPlumage(scientificName: string): Plumage {
  let hash = 0;
  for (const character of scientificName) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return PLUMAGES[hash % PLUMAGES.length] ?? PLUMAGES[0];
}

/** Small tilt (−1…1) of a species' sticker; derived from the name, so the album does not reshuffle on every render. */
export function stickerTilt(scientificName: string): number {
  const index = PLUMAGES.indexOf(fallbackPlumage(scientificName));
  return (index / (PLUMAGES.length - 1)) * 2 - 1;
}

function isPlumage(value: unknown): value is Plumage {
  return PLUMAGES.some((name) => name === value);
}

/** Reference colors are the tokens themselves, read once, so the palette has a single source. */
function readReferences(): Record<Plumage, Rgb> | null {
  const style = getComputedStyle(document.documentElement);
  const entries = PLUMAGES.map((name) => {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(style.getPropertyValue(`--plumage-${name}`).trim());
    return match ? [name, [parseInt(match[1] ?? '0', 16), parseInt(match[2] ?? '0', 16), parseInt(match[3] ?? '0', 16)] as Rgb] as const : null;
  });
  if (entries.some((entry) => entry === null)) return null;
  return Object.fromEntries(entries as (readonly [Plumage, Rgb])[]) as Record<Plumage, Rgb>;
}

/** Side of the thumbnail the color is read from: enough to find the dominant color, cheap on the main thread. */
const SAMPLE_SIZE = 24;

const memory = new Map<string, Plumage>();

function readStored(scientificName: string): Plumage | null {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.plumagePrefix + scientificName);
    return isPlumage(value) ? value : null;
  } catch { return null; }
}

function store(scientificName: string, plumage: Plumage): void {
  memory.set(scientificName, plumage);
  try { localStorage.setItem(STORAGE_KEYS.plumagePrefix + scientificName, plumage); } catch { /* Recomputed next time. */ }
}

/** Reads the photo's colors; the image host sends CORS headers, so the canvas stays readable (not tainted). */
function samplePhoto(url: string): Promise<Rgb> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) { reject(new Error('Canvas unavailable.')); return; }
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(dominantColor(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE, SAMPLE_SIZE));
      } catch (error) { reject(error instanceof Error ? error : new Error('Photo unreadable.')); }
    };
    image.onerror = () => { reject(new Error('Photo unavailable.')); };
    image.src = url;
  });
}

/**
 * The plate already known for a species, without waiting for its photo: the hand-picked one, the one snapped from
 * its photo on an earlier visit, or the stable fallback. For drawings outside React (the map's territories).
 */
export function knownPlumage(scientificName: string): Plumage {
  return PLUMAGE_OVERRIDES[scientificName] ?? memory.get(scientificName) ?? readStored(scientificName) ?? fallbackPlumage(scientificName);
}

/**
 * The plate of a species: chosen by hand for the region's most common birds (photo backgrounds mislead the
 * automatic choice for some of them), otherwise snapped from its photo once and remembered; until then (or without a photo) a stable
 * fallback, so the screen is never colorless while the photo loads.
 */
export function usePlumage(scientificName: string | null): Plumage {
  const photo = useSpeciesPhoto(scientificName);
  const known = scientificName ? PLUMAGE_OVERRIDES[scientificName] ?? memory.get(scientificName) ?? readStored(scientificName) : null;
  const [computed, setComputed] = useState<{ readonly name: string; readonly plumage: Plumage } | null>(null);
  useEffect(() => {
    if (!scientificName || !photo || known) return;
    let active = true;
    samplePhoto(photo.url)
      .then((color) => {
        const references = readReferences();
        if (!references) return;
        const plumage = nearestPlumage(color, references);
        store(scientificName, plumage);
        if (active) setComputed({ name: scientificName, plumage });
      })
      // Without a readable photo the fallback plate stays; nothing else depends on it.
      .catch(() => undefined);
    return () => { active = false; };
  }, [scientificName, photo, known]);
  if (!scientificName) return PLUMAGES[0];
  if (known) return known;
  return computed?.name === scientificName ? computed.plumage : fallbackPlumage(scientificName);
}

/** Inline custom properties that paint an element with a plate (used with the `.bn-plate` class). */
export function plateStyle(plumage: Plumage): React.CSSProperties {
  return { '--plate': `var(--plumage-${plumage})`, '--on-plate': `var(--plumage-${plumage}-on)` } as React.CSSProperties;
}
