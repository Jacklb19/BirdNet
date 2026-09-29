import { AUDIO_CONSTANTS } from './audio.constants';

/**
 * Calcula el valor pico absoluto (máxima amplitud) del búfer de audio.
 */
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

/**
 * Calcula la raíz del valor cuadrático medio (RMS) del búfer de audio.
 * Útil para medir la energía/volumen sonoro y niveles de vúmetro.
 */
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
 * Normaliza la señal de audio en relación con su valor pico.
 * Si el pico es inferior al umbral de silencio, no se escala para no amplificar el ruido.
 * Modifica o devuelve un nuevo búfer Float32Array normalizado.
 *
 * @param samples Búfer de audio
 * @param targetPeak Amplitud pico deseada (por defecto 0.95 para evitar saturación)
 * @param inPlace Si es true, modifica el array original; si es false, devuelve una copia
 */
export function normalizeAudio(
  samples: Float32Array,
  targetPeak: number = 0.95,
  inPlace: boolean = false,
): Float32Array {
  const peak = calculatePeak(samples);
  const output = inPlace ? samples : new Float32Array(samples);

  if (peak <= AUDIO_CONSTANTS.SILENCE_THRESHOLD_RMS) {
    return output;
  }

  const factor = targetPeak / peak;
  for (let i = 0; i < output.length; i++) {
    output[i] = (output[i] ?? 0) * factor;
  }

  return output;
}
