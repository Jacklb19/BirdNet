/**
 * Remuestreador determinista de señal de audio mono mediante interpolación lineal.
 * Permite adaptar la tasa de muestreo del dispositivo a la frecuencia requerida por el modelo.
 */

/**
 * Remuestrea un búfer de audio Float32Array a una nueva tasa de muestreo.
 * Si las tasas de muestreo de origen y destino son idénticas, devuelve una copia directa.
 *
 * @param input Búfer de audio de entrada en formato Float32Array
 * @param sourceSampleRate Frecuencia de muestreo original en Hz
 * @param targetSampleRate Frecuencia de muestreo objetivo en Hz
 * @returns Búfer remuestreado en formato Float32Array
 */
export function resampleAudio(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
    throw new Error('Las frecuencias de muestreo deben ser mayores a cero.');
  }

  if (input.length === 0) {
    return new Float32Array(0);
  }

  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(input);
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const originalPos = i * ratio;
    const indexLow = Math.floor(originalPos);
    const indexHigh = Math.min(indexLow + 1, input.length - 1);
    const fraction = originalPos - indexLow;

    const sampleLow = input[indexLow] ?? 0;
    const sampleHigh = input[indexHigh] ?? 0;

    output[i] = sampleLow + fraction * (sampleHigh - sampleLow);
  }

  return output;
}
