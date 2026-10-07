import { AUDIO_CONSTANTS } from './audio.constants';

/** Largest absolute amplitude of the buffer. */
export function calculatePeak(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i] ?? 0);
    if (abs > max) {
      max = abs;
    }
  }
  return max;
}

/** Root mean square of the buffer: its average energy, the quantity a level meter shows. */
export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const val = samples[i] ?? 0;
    sumSquares += val * val;
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Scales the signal so its peak equals `targetPeak`. A buffer whose peak is at or below
 * `silenceThreshold` is returned unscaled so background noise in silence is not amplified.
 *
 * @param samples Audio buffer.
 * @param targetPeak Peak amplitude after scaling.
 * @param inPlace When true the input buffer is modified; otherwise a scaled copy is returned.
 * @param silenceThreshold Peak at or below which the buffer is left unscaled.
 */
export function normalizeAudio(
  samples: Float32Array,
  targetPeak: number = AUDIO_CONSTANTS.NORMALIZATION_TARGET_PEAK,
  inPlace: boolean = false,
  silenceThreshold: number = AUDIO_CONSTANTS.SILENCE_THRESHOLD_RMS,
): Float32Array {
  const peak = calculatePeak(samples);
  const output = inPlace ? samples : new Float32Array(samples);

  if (peak <= silenceThreshold) {
    return output;
  }

  const factor = targetPeak / peak;
  for (let i = 0; i < output.length; i++) {
    output[i] = (output[i] ?? 0) * factor;
  }

  return output;
}
