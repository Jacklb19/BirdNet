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

/**
 * Remuestreador continuo para flujos de audio en tiempo real (chunks de AudioWorklet).
 * Mantiene la fase fraccionaria y la muestra de frontera entre bloques sucesivos
 * para evitar artefactos, saltos de fase y pérdida de muestras en el remuestreo streaming (RF-03).
 */
export class StreamingResampler {
  public readonly sourceSampleRate: number;
  public readonly targetSampleRate: number;
  private readonly ratio: number;
  private phase: number = 0;
  private lastSample: number = 0;

  constructor(sourceSampleRate: number, targetSampleRate: number) {
    if (sourceSampleRate <= 0 || targetSampleRate <= 0) {
      throw new Error('Las frecuencias de muestreo deben ser mayores a cero.');
    }
    this.sourceSampleRate = sourceSampleRate;
    this.targetSampleRate = targetSampleRate;
    this.ratio = sourceSampleRate / targetSampleRate;
  }

  /**
   * Procesa un bloque de entrada y devuelve el bloque remuestreado a la tasa objetivo.
   * Si las frecuencias coinciden, retorna una copia directa.
   */
  public processChunk(input: Float32Array): Float32Array {
    const inputLen = input.length;
    if (inputLen === 0) {
      return new Float32Array(0);
    }

    if (this.sourceSampleRate === this.targetSampleRate) {
      this.lastSample = input[inputLen - 1] ?? 0;
      return new Float32Array(input);
    }

    const ratio = this.ratio;
    // Estimación de cota superior para preasignación rápida
    const maxSamples = Math.max(0, Math.ceil((inputLen - this.phase) / ratio) + 2);
    const output = new Float32Array(maxSamples);
    let outIdx = 0;
    let pos = this.phase;

    while (pos <= inputLen - 1) {
      let sample: number;
      if (pos < 0) {
        // Interpolar en la frontera entre la última muestra del bloque previo y la primera del actual
        const frac = pos + 1;
        sample = this.lastSample + frac * ((input[0] ?? 0) - this.lastSample);
      } else {
        const indexLow = Math.floor(pos);
        const frac = pos - indexLow;
        if (frac === 0 || indexLow >= inputLen - 1) {
          sample = input[indexLow] ?? 0;
        } else {
          const sLow = input[indexLow] ?? 0;
          const sHigh = input[indexLow + 1] ?? 0;
          sample = sLow + frac * (sHigh - sLow);
        }
      }
      output[outIdx++] = sample;
      pos += ratio;
    }

    this.lastSample = input[inputLen - 1] ?? 0;
    this.phase = pos - inputLen;

    return outIdx === output.length ? output : output.slice(0, outIdx);
  }

  public reset(): void {
    this.phase = 0;
    this.lastSample = 0;
  }
}
