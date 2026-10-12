import { describe, expect, it } from 'vitest';
import { resampleBandLimited } from './bandLimitedResample';
import { AUDIO_CONSTANTS } from './audio.constants';

const CAPTURE_RATE = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE;
const MODEL_RATE = 32_000;
/** Samples at each end where the filter still reaches past the buffer into silence. */
const EDGE = 200;

function tone(frequency: number, rate: number, samples: number): Float32Array {
  return Float32Array.from({ length: samples }, (_, index) => Math.sin((2 * Math.PI * frequency * index) / rate));
}

function rms(samples: Float32Array): number {
  const inner = samples.subarray(EDGE, samples.length - EDGE);
  return Math.sqrt(inner.reduce((sum, value) => sum + value * value, 0) / inner.length);
}

describe('resampleBandLimited', () => {
  it('turns one capture window into exactly one model window', () => {
    const output = resampleBandLimited(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), CAPTURE_RATE, MODEL_RATE);
    expect(output).toHaveLength(MODEL_RATE * AUDIO_CONSTANTS.WINDOW_DURATION_SEC);
  });

  it('keeps a bird-band tone at its pitch and level', () => {
    const output = resampleBandLimited(tone(4_000, CAPTURE_RATE, CAPTURE_RATE / 10), CAPTURE_RATE, MODEL_RATE);
    const expected = tone(4_000, MODEL_RATE, output.length);
    const worst = Math.max(...Array.from(output.subarray(EDGE, output.length - EDGE), (value, index) => Math.abs(value - (expected[index + EDGE] ?? 0))));
    expect(worst).toBeLessThan(1e-3);
  });

  it('removes what the lower rate cannot represent instead of folding it into the band', () => {
    // 20 kHz is over the 16 kHz the model rate reaches; interpolating it would leave a loud 12 kHz tone.
    const folded = resampleBandLimited(tone(20_000, CAPTURE_RATE, CAPTURE_RATE / 10), CAPTURE_RATE, MODEL_RATE);
    expect(rms(folded)).toBeLessThan(0.005);
  });

  it('handles rates that are not a simple fraction of each other and copies equal rates', () => {
    const output = resampleBandLimited(tone(2_000, 44_100, 44_100), 44_100, MODEL_RATE);
    expect(output).toHaveLength(MODEL_RATE);
    expect(rms(output)).toBeCloseTo(Math.SQRT1_2, 3);
    const input = new Float32Array([0.1, -0.2, 0.3]);
    const copy = resampleBandLimited(input, MODEL_RATE, MODEL_RATE);
    expect(Array.from(copy)).toEqual(Array.from(input));
    expect(copy).not.toBe(input);
  });

  it('rejects rates it cannot work with', () => {
    expect(() => resampleBandLimited(new Float32Array(4), 0, MODEL_RATE)).toThrow(RangeError);
    expect(() => resampleBandLimited(new Float32Array(4), CAPTURE_RATE, 31_999.5)).toThrow(RangeError);
  });
});
