/**
 * Deterministic linear-interpolation resampler for mono audio. It adapts the device sample rate to the
 * rate the model expects.
 */

/** Rejects rates that would make the resampling ratio zero, negative or not a number. */
function assertValidSampleRates(sourceSampleRate: number, targetSampleRate: number): void {
  if (!(sourceSampleRate > 0) || !(targetSampleRate > 0) || !Number.isFinite(sourceSampleRate) || !Number.isFinite(targetSampleRate)) {
    throw new RangeError(`Sample rates must be positive finite numbers, got ${String(sourceSampleRate)} and ${String(targetSampleRate)}.`);
  }
}

/**
 * Resamples a whole buffer to a new sample rate; equal rates return a copy.
 *
 * @param input Input samples.
 * @param sourceSampleRate Input rate in Hz.
 * @param targetSampleRate Output rate in Hz.
 * @returns Resampled samples.
 */
export function resampleAudio(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  assertValidSampleRates(sourceSampleRate, targetSampleRate);

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
 * Streaming resampler for real-time blocks (AudioWorklet render quanta). It carries the fractional phase
 * and the boundary sample across blocks so streaming output has no phase jumps or lost samples (RF-03).
 */
export class StreamingResampler {
  public readonly sourceSampleRate: number;
  public readonly targetSampleRate: number;
  private readonly ratio: number;
  private phase: number = 0;
  private lastSample: number = 0;

  constructor(sourceSampleRate: number, targetSampleRate: number) {
    assertValidSampleRates(sourceSampleRate, targetSampleRate);
    this.sourceSampleRate = sourceSampleRate;
    this.targetSampleRate = targetSampleRate;
    this.ratio = sourceSampleRate / targetSampleRate;
  }

  /** Resamples one input block to the target rate; equal rates return a copy. */
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
    // Upper bound of the output length, so the buffer is allocated once per block.
    const maxSamples = Math.max(0, Math.ceil((inputLen - this.phase) / ratio) + 2);
    const output = new Float32Array(maxSamples);
    let outIdx = 0;
    let pos = this.phase;

    while (pos <= inputLen - 1) {
      let sample: number;
      if (pos < 0) {
        // Interpolate across the boundary between the previous block's last sample and this block's first.
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
