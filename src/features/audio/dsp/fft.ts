/**
 * Radix-2 Cooley-Tukey fast Fourier transform and time windowing for the spectrogram.
 */

/**
 * Hann window of length N: w[n] = 0.5 * (1 - cos(2 * PI * n / (N - 1))).
 * It tapers each frame to zero at both ends, which limits spectral leakage between bins.
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

/** Multiplies samples by a window, writing into `output` when given to avoid allocations per frame. */
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

/** Bit-reversal permutation that puts the input in the order the in-place butterflies expect. */
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
 * In-place radix-2 FFT. The length must be a power of two.
 *
 * @param real Real part, input and output.
 * @param imag Imaginary part, input and output (zeros for a real signal).
 */
export function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if ((n & (n - 1)) !== 0) {
    throw new RangeError(`FFT size must be a power of two, got ${String(n)}.`);
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
 * One-sided magnitude spectrum (N/2 + 1 bins) of a windowed frame.
 *
 * @param frame Input frame of N samples (power of two).
 * @param window Time window applied before the transform.
 * @param realBuffer Optional preallocated real work buffer, reused across frames.
 * @param imagBuffer Optional preallocated imaginary work buffer.
 * @param magnitudeOutput Optional output buffer of N/2 + 1 values.
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
