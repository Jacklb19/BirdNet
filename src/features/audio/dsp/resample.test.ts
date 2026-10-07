import { describe, it, expect } from 'vitest';
import { resampleAudio, StreamingResampler } from './resample';

describe('resampleAudio', () => {
  it('returns an identical copy when the rates are equal', () => {
    const input = new Float32Array([0.1, 0.5, -0.3, 0.8]);
    const result = resampleAudio(input, 48000, 48000);

    expect(result.length).toBe(input.length);
    expect(Array.from(result)).toEqual(Array.from(input));
    expect(result).not.toBe(input); // a new instance
  });

  it('upsamples to twice the rate', () => {
    // 2 samples at 10 Hz become 4 samples at 20 Hz
    const input = new Float32Array([0.0, 1.0]);
    const result = resampleAudio(input, 10, 20);

    expect(result.length).toBe(4);
    expect(result[0]).toBeCloseTo(0.0, 4);
    expect(result[1]).toBeCloseTo(0.5, 4);
    expect(result[2]).toBeCloseTo(1.0, 4);
    expect(result[3]).toBeCloseTo(1.0, 4);
  });

  it('downsamples to half the rate', () => {
    // 4 samples at 20 Hz become 2 samples at 10 Hz
    const input = new Float32Array([0.0, 0.5, 1.0, 1.0]);
    const result = resampleAudio(input, 20, 10);

    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.0, 4);
    expect(result[1]).toBeCloseTo(1.0, 4);
  });

  it('rejects non-positive sample rates', () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(() => resampleAudio(input, 0, 48000)).toThrow();
    expect(() => resampleAudio(input, 48000, -10)).toThrow();
  });

  it('handles empty buffers', () => {
    const input = new Float32Array(0);
    const result = resampleAudio(input, 44100, 48000);
    expect(result.length).toBe(0);
  });
});

describe('StreamingResampler', () => {
  it('keeps a linear signal continuous across consecutive blocks', () => {
    const resampler = new StreamingResampler(10, 20);
    // A ramp from 0 to 30 in 4 blocks of 2 samples
    const chunk1 = new Float32Array([0, 10]);
    const chunk2 = new Float32Array([20, 30]);

    const out1 = resampler.processChunk(chunk1);
    const out2 = resampler.processChunk(chunk2);

    const merged = new Float32Array(out1.length + out2.length);
    merged.set(out1, 0);
    merged.set(out2, out1.length);

    // A linear ramp upsampled 2x advances exactly 5 per sample
    for (let i = 1; i < merged.length; i++) {
      const curr = merged[i] ?? 0;
      const prev = merged[i - 1] ?? 0;
      const step = curr - prev;
      expect(step).toBeCloseTo(5.0, 3);
    }
  });

  it('returns an identical copy when source and target rates are equal', () => {
    const resampler = new StreamingResampler(48000, 48000);
    const chunk = new Float32Array([1, 2, 3]);
    const out = resampler.processChunk(chunk);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('rejects non-positive rates', () => {
    expect(() => new StreamingResampler(-1, 48000)).toThrow();
    expect(() => new StreamingResampler(48000, 0)).toThrow();
  });
});

