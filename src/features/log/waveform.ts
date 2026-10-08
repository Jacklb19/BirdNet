import { WAVEFORM_MIN_BAR } from './log.config';

/**
 * Peak amplitude of each of `bars` equal slices of the fragment, relative to the loudest slice, so the drawing shows
 * where the call is regardless of how loud the recording was. Silent slices keep a minimum height.
 */
export function waveformPeaks(samples: Float32Array, bars: number): number[] {
  if (!Number.isInteger(bars) || bars <= 0 || samples.length === 0) return [];
  const peaks = Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * samples.length) / bars);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * samples.length) / bars));
    let peak = 0;
    for (let index = start; index < end && index < samples.length; index++) peak = Math.max(peak, Math.abs(samples[index] ?? 0));
    return peak;
  });
  const loudest = Math.max(...peaks);
  return peaks.map((peak) => (loudest > 0 ? Math.max(WAVEFORM_MIN_BAR, peak / loudest) : WAVEFORM_MIN_BAR));
}
