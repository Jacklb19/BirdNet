import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.protocol';

/**
 * `scroll`: the newest sound enters at the right and the picture moves left.
 * `sweep`: for reduced motion, the picture stays still and a cursor overwrites the oldest columns in place.
 */
export type SpectrogramLayout = 'scroll' | 'sweep';

/** Ring column of a display column nothing has been written to yet. */
export const EMPTY_COLUMN = -1;

/** Bytes per pixel of canvas image data (RGBA). */
const CHANNELS = 4;

export type SpectrogramWindow = Pick<MelSpectrogramResponse, 'data' | 'numFrames' | 'numMelBands' | 'windowIndex'>;

export interface SpectrogramRamps {
  /** Colours of every column but the newest window's. */
  readonly history: Uint8ClampedArray;
  /** Colours of the newest window, so people can see which sound was analysed last. */
  readonly latest: Uint8ClampedArray;
}

/**
 * The last seconds of sound as intensity levels in a ring of columns (one per STFT frame). Only levels are
 * kept, so a theme change repaints the same sound with the new palette.
 */
export class SpectrogramHistory {
  readonly columns: number;
  readonly bands: number;
  /** Level of every pixel, column by column; band 0 is the lowest frequency. */
  private readonly levels: Uint8Array;
  /** Ring column the next frame is written to. */
  private next = 0;
  private filled = 0;
  /** Columns written by the newest window. */
  private latest = 0;
  private lastWindow: number | null = null;

  constructor(columns: number, bands: number) {
    this.columns = columns;
    this.bands = bands;
    this.levels = new Uint8Array(columns * bands);
  }

  get empty(): boolean {
    return this.filled === 0;
  }

  clear(): void {
    this.next = 0;
    this.filled = 0;
    this.latest = 0;
    this.lastWindow = null;
  }

  /**
   * Adds a window. Consecutive windows overlap, so only its last `framesPerHop` frames are new sound; the
   * first window, and one after a dropped window, is added whole. A repeated window is ignored.
   */
  append(window: SpectrogramWindow, framesPerHop: number, toLevel: (db: number) => number): void {
    const { data, numFrames, numMelBands, windowIndex } = window;
    if (numMelBands !== this.bands || numFrames <= 0 || windowIndex === this.lastWindow) return;
    const consecutive = this.lastWindow !== null && windowIndex === this.lastWindow + 1;
    const count = Math.min(this.columns, consecutive ? Math.min(framesPerHop, numFrames) : numFrames);
    for (let frame = numFrames - count; frame < numFrames; frame++) {
      const base = this.next * this.bands;
      for (let band = 0; band < this.bands; band++) {
        this.levels[base + band] = toLevel(data[frame * numMelBands + band] ?? Number.NaN);
      }
      this.next = (this.next + 1) % this.columns;
    }
    this.filled = Math.min(this.columns, this.filled + count);
    this.latest = count;
    this.lastWindow = windowIndex;
  }

  /** Ring column shown at display column `x` (0 = left edge), or `EMPTY_COLUMN`. */
  columnAt(x: number, layout: SpectrogramLayout): number {
    if (x < 0 || x >= this.columns) return EMPTY_COLUMN;
    if (layout === 'sweep') return x < this.filled ? x : EMPTY_COLUMN;
    const age = this.columns - 1 - x;
    return age < this.filled ? this.ringColumn(age) : EMPTY_COLUMN;
  }

  /** True when a ring column belongs to the newest window. */
  isLatest(column: number): boolean {
    return column !== EMPTY_COLUMN && (this.next - 1 - column + this.columns) % this.columns < this.latest;
  }

  level(column: number, band: number): number {
    return this.levels[column * this.bands + band] ?? 0;
  }

  /**
   * Writes the picture into RGBA image data `columns` wide and `bands` high, highest frequency on top.
   * Columns without sound stay transparent so the card shows through.
   */
  paint(layout: SpectrogramLayout, ramps: SpectrogramRamps, target: Uint8ClampedArray): void {
    for (let x = 0; x < this.columns; x++) {
      const column = this.columnAt(x, layout);
      const ramp = this.isLatest(column) ? ramps.latest : ramps.history;
      for (let band = 0; band < this.bands; band++) {
        const pixel = ((this.bands - 1 - band) * this.columns + x) * CHANNELS;
        const color = column === EMPTY_COLUMN ? -1 : this.level(column, band) * CHANNELS;
        for (let channel = 0; channel < CHANNELS; channel++) target[pixel + channel] = color < 0 ? 0 : ramp[color + channel] ?? 0;
      }
    }
  }

  private ringColumn(age: number): number {
    return (this.next - 1 - age + this.columns * 2) % this.columns;
  }
}
