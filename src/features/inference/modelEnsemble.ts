/**
 * Several acoustic models deciding together (ADR-31). Each has its own label list; a species is the same in two
 * of them when its scientific name is, so the models are brought to one shared list before their confidences meet.
 */
import { parseLabel } from './inferenceResults';

export interface SharedLabels {
  /** Labels of every species any of the models knows: those of the first model, then what the others add. */
  readonly labels: readonly string[];
  /** For each model, the place of each of its classes in `labels`. */
  readonly positions: readonly Int32Array[];
}

/** One label list for all the models. The first keeps its own order, so alone it is left exactly as it was. */
export function shareLabels(labelLists: readonly (readonly string[])[]): SharedLabels {
  const [first = [], ...others] = labelLists;
  const labels = [...first];
  const bySpecies = new Map(labels.map((label, index) => [parseLabel(label).scientificName, index]));
  const positions = [Int32Array.from(labels.keys())];
  for (const list of others) {
    positions.push(Int32Array.from(list, (label) => {
      const species = parseLabel(label).scientificName;
      const known = bySpecies.get(species);
      if (known !== undefined) return known;
      bySpecies.set(species, labels.length);
      return labels.push(label) - 1;
    }));
  }
  return { labels, positions };
}

/**
 * Confidence of each shared class: the mean of what the models gave it. A model that did not score a species, or
 * does not know it, counts as zero, so a call needs the models to agree or one of them to be very sure; that is the
 * combination measured in docs/evaluacion.md.
 */
export function averageScores(
  perModel: readonly ReadonlyMap<number, number>[], positions: readonly Int32Array[], floor: number,
): Map<number, number> {
  const sums = new Map<number, number>();
  perModel.forEach((scores, model) => {
    const places = positions[model];
    if (!places) throw new Error('A model has no place in the shared labels.');
    for (const [classIndex, confidence] of scores) {
      const place = places[classIndex];
      if (place === undefined) throw new Error('A score does not belong to its model.');
      sums.set(place, (sums.get(place) ?? 0) + confidence);
    }
  });
  const mean = new Map<number, number>();
  for (const [place, sum] of sums) {
    const confidence = sum / perModel.length;
    if (confidence >= floor) mean.set(place, confidence);
  }
  return mean;
}
