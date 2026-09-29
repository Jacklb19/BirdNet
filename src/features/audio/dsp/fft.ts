/**
 * Implementación eficiente de la Transformada Rápida de Fourier (FFT Radix-2 Cooley-Tukey)
 * y funciones de ventaneo temporal para análisis espectral acústico.
 */

/**
 * Genera una ventana de Hann de tamaño N.
 * w[n] = 0.5 * (1 - cos(2 * PI * n / (N - 1)))
 */
export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  if (size <= 1) {
    window.fill(1);
    return window;
  }
  const factor = (2 * Math.PI) / (size - 1);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos(factor * i));
  }
  return window;
}

/**
 * Aplica una ventana temporal sobre un búfer de muestras.
 */
export function applyWindow(
  samples: Float32Array,
  window: Float32Array,
  output?: Float32Array,
): Float32Array {
  const n = Math.min(samples.length, window.length);
  const out = output ?? new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (samples[i] ?? 0) * (window[i] ?? 1);
  }
  return out;
}

/**
 * Reordena los arrays por inversión de bits (Bit-Reversal Permutation) para FFT in-place.
 */
function bitReversePermutation(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i] ?? 0;
      real[i] = real[j] ?? 0;
      real[j] = tempR;

      const tempI = imag[i] ?? 0;
      imag[i] = imag[j] ?? 0;
      imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
}

/**
 * Ejecuta la FFT in-place (Cooley-Tukey Radix-2).
 * El tamaño de los arrays debe ser una potencia de 2.
 *
 * @param real Componente real de entrada y salida
 * @param imag Componente imaginaria de entrada y salida (inicialmente con ceros para señales reales)
 */
export function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error('El tamaño de la FFT debe ser una potencia de 2.');
  }

  bitReversePermutation(real, imag);

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1;
      let wI = 0;
      for (let j = 0; j < halfLen; j++) {
        const uR = real[i + j] ?? 0;
        const uI = imag[i + j] ?? 0;

        const vR = (real[i + j + halfLen] ?? 0) * wR - (imag[i + j + halfLen] ?? 0) * wI;
        const vI = (real[i + j + halfLen] ?? 0) * wI + (imag[i + j + halfLen] ?? 0) * wR;

        real[i + j] = uR + vR;
        imag[i + j] = uI + vI;
        real[i + j + halfLen] = uR - vR;
        imag[i + j + halfLen] = uI - vI;

        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }
}

/**
 * Calcula el espectro de magnitud de un lado (N/2 + 1 bins) para una trama de audio con ventana.
 *
 * @param frame Trama de audio de entrada de tamaño N (potencia de 2)
 * @param window Ventana temporal aplicada
 * @param realBuffer Búfer preasignado para cómputo real (opcional para evitar allocs)
 * @param imagBuffer Búfer preasignado para cómputo imag (opcional)
 * @param magnitudeOutput Búfer de salida de tamaño N/2 + 1
 */
export function computeMagnitudeSpectrum(
  frame: Float32Array,
  window: Float32Array,
  realBuffer?: Float32Array,
  imagBuffer?: Float32Array,
  magnitudeOutput?: Float32Array,
): Float32Array {
  const n = frame.length;
  const numBins = (n >> 1) + 1;

  const real = realBuffer ?? new Float32Array(n);
  const imag = imagBuffer ?? new Float32Array(n);
  const magnitudes = magnitudeOutput ?? new Float32Array(numBins);

  applyWindow(frame, window, real);
  imag.fill(0);

  fftInPlace(real, imag);

  for (let k = 0; k < numBins; k++) {
    const r = real[k] ?? 0;
    const im = imag[k] ?? 0;
    magnitudes[k] = Math.sqrt(r * r + im * im);
  }

  return magnitudes;
}
