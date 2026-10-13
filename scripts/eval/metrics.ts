/**
 * Scoring of a detector against annotated recordings. A recording is cut into stretches of fixed length and the
 * question asked of each is the one a person asks of the log: did the app note this species around the time it
 * sang? Scoring per stretch, rather than per analysis window, compares on equal terms detectors that look at
 * windows of different length or combine several of them.
 */
import type { Annotation } from './annotations';

/** A species the detector reported at one moment of a recording, with the confidence it would show. */
export interface Decision {
  readonly species: string;
  /** Seconds from the start of the recording (centre of the analysis window). */
  readonly time: number;
  readonly confidence: number;
}

export interface StretchOptions {
  /** Length of a stretch in seconds. */
  readonly stretchSeconds: number;
  /**
   * A detection of a species annotated within this many seconds outside the stretch is neither right nor wrong:
   * a window centred near the edge legitimately hears the neighbouring stretch.
   */
  readonly marginSeconds: number;
  /** An annotation must reach this far into a stretch (or lie whole inside it) to be demanded from the detector. */
  readonly minOverlapSeconds: number;
}

/** What the annotations say about one stretch. */
export interface StretchTruth {
  /** Species the detector should report. */
  readonly present: ReadonlySet<string>;
  /** Species whose report is not counted either way: sung at the edge, or annotated as uncertain. */
  readonly tolerated: ReadonlySet<string>;
}

export interface Counts { tp: number; fp: number; fn: number }

export interface Rates { readonly precision: number | null; readonly recall: number | null; readonly f1: number | null }

/** One stretch as a ranking sample of a species: the confidence it got there and whether it was really singing. */
export interface RankedSample { readonly score: number; readonly positive: boolean }

function assertOptions(options: StretchOptions): void {
  if (!(options.stretchSeconds > 0) || !(options.marginSeconds >= 0) || !(options.minOverlapSeconds >= 0)) throw new Error('Invalid stretch options.');
}

export function stretchCount(durationSeconds: number, stretchSeconds: number): number {
  if (!(durationSeconds > 0) || !(stretchSeconds > 0)) throw new Error('Invalid recording duration.');
  return Math.ceil(durationSeconds / stretchSeconds);
}

/** Truth of every stretch of a recording, in order. */
export function stretchTruth(annotations: readonly Annotation[], durationSeconds: number, options: StretchOptions): StretchTruth[] {
  assertOptions(options);
  return Array.from({ length: stretchCount(durationSeconds, options.stretchSeconds) }, (_, index) => {
    const from = index * options.stretchSeconds;
    const to = Math.min(from + options.stretchSeconds, durationSeconds);
    const present = new Set<string>();
    const tolerated = new Set<string>();
    for (const annotation of annotations) {
      const overlap = Math.min(annotation.end, to) - Math.max(annotation.start, from);
      const inside = annotation.start >= from && annotation.start < to;
      const demanded = overlap >= Math.min(options.minOverlapSeconds, annotation.end - annotation.start) && (overlap > 0 || inside);
      if (demanded && !annotation.uncertain) present.add(annotation.species);
      else if (annotation.end >= from - options.marginSeconds && annotation.start <= to + options.marginSeconds) tolerated.add(annotation.species);
    }
    for (const species of present) tolerated.delete(species);
    return { present, tolerated };
  });
}

/** Highest confidence each species reached in every stretch; a decision past the end counts for the last one. */
export function stretchScores(decisions: readonly Decision[], stretches: number, stretchSeconds: number): Map<string, number>[] {
  const scores = Array.from({ length: stretches }, () => new Map<string, number>());
  for (const decision of decisions) {
    const stretch = scores[Math.min(Math.max(Math.floor(decision.time / stretchSeconds), 0), stretches - 1)];
    if (stretch && decision.confidence > (stretch.get(decision.species) ?? 0)) stretch.set(decision.species, decision.confidence);
  }
  return scores;
}

/**
 * Hits, false alarms and misses of a recording when every species at or over `threshold` is reported. In a
 * recording where only some sounds were annotated, an unannotated species may well be singing, so false alarms
 * are counted only when it is `fullyAnnotated`.
 */
export function countStretches(truth: readonly StretchTruth[], scores: readonly ReadonlyMap<string, number>[], threshold: number, fullyAnnotated: boolean): Counts {
  const counts: Counts = { tp: 0, fp: 0, fn: 0 };
  truth.forEach((stretch, index) => {
    const reported = scores[index] ?? new Map<string, number>();
    for (const [species, score] of reported) {
      if (score < threshold) continue;
      if (stretch.present.has(species)) counts.tp++;
      else if (fullyAnnotated && !stretch.tolerated.has(species)) counts.fp++;
    }
    for (const species of stretch.present) if ((reported.get(species) ?? 0) < threshold) counts.fn++;
  });
  return counts;
}

export function addCounts(total: Counts, part: Counts): void {
  total.tp += part.tp;
  total.fp += part.fp;
  total.fn += part.fn;
}

/** Precision, recall and their harmonic mean; null where the ratio has no denominator. */
export function rates(counts: Counts): Rates {
  const precision = counts.tp + counts.fp > 0 ? counts.tp / (counts.tp + counts.fp) : null;
  const recall = counts.tp + counts.fn > 0 ? counts.tp / (counts.tp + counts.fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  return { precision, recall, f1 };
}

/** Ranking samples of every species in a recording, added to `into`; tolerated stretches are left out. */
export function collectSamples(into: Map<string, RankedSample[]>, truth: readonly StretchTruth[], scores: readonly ReadonlyMap<string, number>[], fullyAnnotated: boolean): void {
  truth.forEach((stretch, index) => {
    const reported = scores[index] ?? new Map<string, number>();
    const add = (species: string, sample: RankedSample): void => {
      const samples = into.get(species);
      if (samples) samples.push(sample);
      else into.set(species, [sample]);
    };
    for (const species of stretch.present) add(species, { score: reported.get(species) ?? 0, positive: true });
    if (!fullyAnnotated) return;
    for (const [species, score] of reported) {
      if (!stretch.present.has(species) && !stretch.tolerated.has(species)) add(species, { score, positive: false });
    }
  });
}

/**
 * Average precision of one species: the mean, over the stretches where it sang, of the precision at the rank
 * where each is found when stretches are sorted by confidence. A stretch where the species got no score at all
 * contributes zero, and ties are resolved against the detector. Null for a species that never sang.
 */
export function averagePrecision(samples: readonly RankedSample[]): number | null {
  const positives = samples.filter((sample) => sample.positive).length;
  if (positives === 0) return null;
  const ranked = samples.filter((sample) => sample.score > 0)
    .sort((left, right) => right.score - left.score || Number(left.positive) - Number(right.positive));
  let found = 0;
  let sum = 0;
  ranked.forEach((sample, index) => {
    if (!sample.positive) return;
    found++;
    sum += found / (index + 1);
  });
  return sum / positives;
}

/** Species of a whole recording: annotated and reported, annotated and never reported, reported and never annotated. */
export function recordingSpecies(annotations: readonly Annotation[], decisions: readonly Decision[], threshold: number, fullyAnnotated: boolean): { found: number; missed: number; invented: number } {
  const certain = new Set(annotations.filter((annotation) => !annotation.uncertain).map((annotation) => annotation.species));
  const mentioned = new Set(annotations.map((annotation) => annotation.species));
  const reported = new Set(decisions.filter((decision) => decision.confidence >= threshold).map((decision) => decision.species));
  let found = 0;
  let invented = 0;
  for (const species of reported) {
    if (certain.has(species)) found++;
    else if (fullyAnnotated && !mentioned.has(species)) invented++;
  }
  return { found, missed: certain.size - found, invented };
}
