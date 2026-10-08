import { describe, expect, it } from 'vitest';
import { WAVEFORM_MIN_BAR } from './log.config';
import { waveformPeaks } from './waveform';

describe('fragment waveform', () => {
  it('scales slice peaks to the loudest one and keeps silent slices visible', () => {
    const samples = new Float32Array([0, 0.1, -0.2, 0, 0, 0, 0.05, -0.1]);
    expect(waveformPeaks(samples, 4)).toEqual([0.5, 1, WAVEFORM_MIN_BAR, 0.5]);
  });

  it('draws silence as minimum bars and nothing for an empty fragment', () => {
    expect(waveformPeaks(new Float32Array(6), 3)).toEqual([WAVEFORM_MIN_BAR, WAVEFORM_MIN_BAR, WAVEFORM_MIN_BAR]);
    expect(waveformPeaks(new Float32Array(), 3)).toEqual([]);
  });
});
