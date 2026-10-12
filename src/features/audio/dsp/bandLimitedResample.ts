/**
 * Band-limited resampler for a whole analysis window. A model that takes a lower rate than the capture pipeline
 * must not hear what lies above its own Nyquist frequency folded back into its band (insects and hiss over 16 kHz
 * would land among the bird songs), which is what plain interpolation does. This one filters with a windowed sinc
 * while it changes the rate.
 */

/** Zero crossings of the sinc kept on each side of its centre; more of them make the cut sharper and the filter slower. */
const SINC_ZERO_CROSSINGS = 16;
/** Share of the lower Nyquist frequency that is kept; the rest is the room the filter needs to fall off. */
const PASSBAND_SHARE = 0.95;
/** Blackman window coefficients: side lobes about 58 dB down, which is what keeps the folded band inaudible. */
const BLACKMAN = Object.freeze({ a0: 0.42, a1: 0.5, a2: 0.08 });

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const angle = Math.PI * x;
  return Math.sin(angle) / angle;
}

/**
 * Filter taps for one fractional position between two input samples. `offset` is how far the output sample lies
 * past the input sample the taps are centred on, in input samples (0 ≤ offset < 1). The taps add up to one so a
 * constant signal keeps its level at every position.
 */
function kernelAt(offset: number, cutoff: number, halfWidth: number): Float32Array {
  const taps = new Float32Array(2 * halfWidth + 1);
  let sum = 0;
  for (let tap = 0; tap < taps.length; tap++) {
    const distance = tap - halfWidth - offset;
    const position = distance / (halfWidth + 1);
    const window = Math.abs(position) >= 1 ? 0
      : BLACKMAN.a0 + BLACKMAN.a1 * Math.cos(Math.PI * position) + BLACKMAN.a2 * Math.cos(2 * Math.PI * position);
    const value = cutoff * sinc(cutoff * distance) * window;
    taps[tap] = value;
    sum += value;
  }
  for (let tap = 0; tap < taps.length; tap++) taps[tap] = (taps[tap] ?? 0) / sum;
  return taps;
}

/**
 * Resamples `input` from `sourceRate` to `targetRate` (integer rates in Hz), keeping only what the lower of the
 * two can represent. Samples before and after the buffer count as silence.
 */
export function resampleBandLimited(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (!Number.isSafeInteger(sourceRate) || !Number.isSafeInteger(targetRate) || sourceRate <= 0 || targetRate <= 0) {
    throw new RangeError(`Sample rates must be positive integers, got ${String(sourceRate)} and ${String(targetRate)}.`);
  }
  if (sourceRate === targetRate) return new Float32Array(input);
  const divisor = greatestCommonDivisor(sourceRate, targetRate);
  // Output sample n lies at input position n * step / phases: a whole part and one of `phases` fractions.
  const phases = targetRate / divisor;
  const step = sourceRate / divisor;
  const cutoff = PASSBAND_SHARE * Math.min(1, targetRate / sourceRate);
  const halfWidth = Math.ceil(SINC_ZERO_CROSSINGS / cutoff);
  const kernels = Array.from({ length: phases }, (_, phase) => kernelAt(phase / phases, cutoff, halfWidth));
  const output = new Float32Array(Math.round((input.length * targetRate) / sourceRate));
  for (let index = 0; index < output.length; index++) {
    const position = index * step;
    const centre = Math.floor(position / phases);
    const kernel = kernels[position % phases];
    if (!kernel) continue;
    const first = Math.max(0, halfWidth - centre);
    const last = Math.min(kernel.length - 1, input.length - 1 - centre + halfWidth);
    let value = 0;
    for (let tap = first; tap <= last; tap++) value += (input[centre - halfWidth + tap] ?? 0) * (kernel[tap] ?? 0);
    output[index] = value;
  }
  return output;
}
