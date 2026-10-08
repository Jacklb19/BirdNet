import { hzToMel, melToHz } from '../dsp/mel';

/** One RGBA colour, each channel 0–255. */
export type Rgba = readonly [number, number, number, number];

/** Bytes per pixel of canvas image data (RGBA). */
const CHANNELS = 4;

export interface DecibelRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Intensity level of a mel value, from 0 (at or below `range.min`) to `steps - 1` (at or above `range.max`).
 * The level indexes the colour ramp; NaN, which no real band produces, is drawn as silence.
 */
export function spectrogramLevel(db: number, range: DecibelRange, steps: number): number {
  if (Number.isNaN(db) || range.max <= range.min || steps < 1) return 0;
  const ratio = Math.min(1, Math.max(0, (db - range.min) / (range.max - range.min)));
  return Math.min(steps - 1, Math.floor(ratio * steps));
}

/**
 * Lookup table of `steps` RGBA entries interpolated linearly between evenly spaced colour stops, so drawing a
 * pixel is one table read instead of a colour computation.
 */
export function buildRamp(stops: readonly Rgba[], steps: number): Uint8ClampedArray {
  const ramp = new Uint8ClampedArray(steps * CHANNELS);
  const first = stops[0];
  if (!first) return ramp;
  const segments = stops.length - 1;
  for (let level = 0; level < steps; level++) {
    const position = steps > 1 && segments > 0 ? (level / (steps - 1)) * segments : 0;
    const index = Math.min(Math.floor(position), Math.max(0, segments - 1));
    const from = stops[index] ?? first;
    const to = stops[index + 1] ?? from;
    const weight = position - index;
    for (let channel = 0; channel < CHANNELS; channel++) {
      const start = from[channel] ?? 0;
      ramp[level * CHANNELS + channel] = Math.round(start + ((to[channel] ?? start) - start) * weight);
    }
  }
  return ramp;
}

export interface FrequencyTick {
  readonly hz: number;
  /** Height from the bottom of the picture (0) to its top (1); the vertical axis is linear in mels. */
  readonly position: number;
}

/**
 * Axis labels spread evenly over the mel axis between `minHz` and `maxHz`, rounded to multiples of `stepHz`
 * and placed where the rounded frequency really lies. Lowest first; duplicates and out-of-range values dropped.
 */
export function frequencyTicks(minHz: number, maxHz: number, count: number, stepHz: number): FrequencyTick[] {
  const minMel = hzToMel(minHz);
  const span = hzToMel(maxHz) - minMel;
  if (span <= 0 || count < 1 || stepHz <= 0) return [];
  const ticks: FrequencyTick[] = [];
  for (let index = 0; index < count; index++) {
    const target = melToHz(minMel + ((index + 0.5) / count) * span);
    const hz = Math.max(stepHz, Math.round(target / stepHz) * stepHz);
    if (hz < minHz || hz > maxHz || ticks.some((tick) => tick.hz === hz)) continue;
    ticks.push({ hz, position: (hzToMel(hz) - minMel) / span });
  }
  return ticks;
}
