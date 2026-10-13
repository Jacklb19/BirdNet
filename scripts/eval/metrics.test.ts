import { describe, expect, it } from 'vitest';
import { parseAudacityLabels, type Annotation } from './annotations';
import {
  averagePrecision, collectSamples, countStretches, rates, recordingSpecies, stretchScores, stretchTruth,
  type Decision, type RankedSample, type StretchOptions,
} from './metrics';

const OPTIONS: StretchOptions = { stretchSeconds: 15, marginSeconds: 3, minOverlapSeconds: 1 };

const sound = (species: string, start: number, end: number, uncertain = false): Annotation => ({ species, start, end, uncertain });
const heard = (species: string, time: number, confidence: number): Decision => ({ species, time, confidence });

describe('parseAudacityLabels', () => {
  it('reads times, names and the uncertainty mark, in either decimal notation', () => {
    expect(parseAudacityLabels('1.5\t4.25\tTurdus fuscater\r\n10,0\t12,5\tZonotrichia capensis?\n\\\t1000\t4000\n\n')).toEqual([
      sound('Turdus fuscater', 1.5, 4.25), sound('Zonotrichia capensis', 10, 12.5, true),
    ]);
  });

  it.each(['abc\t2\tTurdus fuscater', '5\t2\tTurdus fuscater', '1\t2\t', '1\t2\t?'])('rejects the malformed line %j', (line) => {
    expect(() => parseAudacityLabels(line)).toThrow();
  });
});

describe('stretchTruth', () => {
  it('demands a species where it sings and tolerates it at the edges', () => {
    // Sings from 14.5 s to 20 s: half a second in the first stretch, the rest in the second.
    const truth = stretchTruth([sound('thrush', 14.5, 20)], 45, OPTIONS);
    expect(truth.map((stretch) => [...stretch.present])).toEqual([[], ['thrush'], []]);
    expect(truth.map((stretch) => [...stretch.tolerated])).toEqual([['thrush'], [], []]);
  });

  it('demands a call shorter than the minimum overlap when it lies whole inside the stretch', () => {
    expect([...(stretchTruth([sound('wren', 5, 5.3)], 15, OPTIONS)[0]?.present ?? [])]).toEqual(['wren']);
  });

  it('never demands an uncertain sound', () => {
    const [stretch] = stretchTruth([sound('wren', 2, 8, true)], 15, OPTIONS);
    expect(stretch?.present.size).toBe(0);
    expect(stretch?.tolerated.has('wren')).toBe(true);
  });
});

describe('countStretches', () => {
  const truth = stretchTruth([sound('thrush', 2, 6), sound('wren', 14.5, 20)], 30, OPTIONS);

  it('counts hits, false alarms and misses per stretch and species', () => {
    const scores = stretchScores([heard('thrush', 3, 0.9), heard('sparrow', 4, 0.6), heard('wren', 13, 0.7)], truth.length, OPTIONS.stretchSeconds);
    // The wren heard at 13 s falls in the first stretch, where it is tolerated; in the second it was missed.
    expect(countStretches(truth, scores, 0.45, true)).toEqual({ tp: 1, fp: 1, fn: 1 });
    expect(countStretches(truth, scores, 0.8, true)).toEqual({ tp: 1, fp: 0, fn: 1 });
  });

  it('does not count false alarms in a recording that was not fully annotated', () => {
    const scores = stretchScores([heard('sparrow', 4, 0.9)], truth.length, OPTIONS.stretchSeconds);
    expect(countStretches(truth, scores, 0.45, false)).toEqual({ tp: 0, fp: 0, fn: 2 });
  });

  it('keeps the highest confidence of a species within a stretch', () => {
    const [first] = stretchScores([heard('thrush', 1, 0.5), heard('thrush', 9, 0.9), heard('thrush', 12, 0.6)], 1, 15);
    expect(first?.get('thrush')).toBe(0.9);
  });
});

describe('rates', () => {
  it('computes precision, recall and F1', () => {
    const result = rates({ tp: 6, fp: 2, fn: 4 });
    expect(result.precision).toBeCloseTo(0.75);
    expect(result.recall).toBeCloseTo(0.6);
    expect(result.f1).toBeCloseTo(2 / 3);
  });

  it('leaves undefined ratios as null', () => {
    expect(rates({ tp: 0, fp: 0, fn: 0 })).toEqual({ precision: null, recall: null, f1: null });
  });
});

describe('averagePrecision', () => {
  it('is 1 when every stretch with the species outranks the rest', () => {
    expect(averagePrecision([{ score: 0.9, positive: true }, { score: 0.8, positive: true }, { score: 0.3, positive: false }])).toBe(1);
  });

  it('charges false alarms ranked above a hit, misses and ties', () => {
    const samples: RankedSample[] = [
      { score: 0.9, positive: false }, { score: 0.8, positive: true }, { score: 0.5, positive: true }, { score: 0.5, positive: false }, { score: 0, positive: true },
    ];
    // Hits at ranks 2 and 4 (the tie goes against the detector); the third positive was never scored.
    expect(averagePrecision(samples)).toBeCloseTo((1 / 2 + 2 / 4) / 3);
  });

  it('is null for a species that never sang', () => {
    expect(averagePrecision([{ score: 0.9, positive: false }])).toBeNull();
  });
});

describe('collectSamples', () => {
  it('gathers one sample per stretch and species, leaving tolerated stretches out', () => {
    const truth = stretchTruth([sound('wren', 14.5, 20)], 30, OPTIONS);
    const scores = stretchScores([heard('wren', 13, 0.7), heard('sparrow', 20, 0.6)], truth.length, OPTIONS.stretchSeconds);
    const samples = new Map<string, RankedSample[]>();
    collectSamples(samples, truth, scores, true);
    expect(samples.get('wren')).toEqual([{ score: 0, positive: true }]);
    expect(samples.get('sparrow')).toEqual([{ score: 0.6, positive: false }]);
  });
});

describe('recordingSpecies', () => {
  it('splits the species of a recording into found, missed and invented', () => {
    const annotations = [sound('thrush', 1, 2), sound('wren', 3, 4), sound('dove', 5, 6, true)];
    const decisions = [heard('thrush', 1, 0.9), heard('dove', 5, 0.9), heard('sparrow', 7, 0.5), heard('wren', 3, 0.3)];
    expect(recordingSpecies(annotations, decisions, 0.45, true)).toEqual({ found: 1, missed: 1, invented: 1 });
    expect(recordingSpecies(annotations, decisions, 0.45, false)).toEqual({ found: 1, missed: 1, invented: 0 });
  });
});
