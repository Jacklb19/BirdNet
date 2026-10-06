import type { Detection } from './inference.types';

/** Stable conversion of a model logit to probability. */
export function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

/** Split the model's scientific_common label without changing its taxonomy. */
export function parseLabel(label: string): { scientificName: string; commonName: string } {
  const separator = label.indexOf('_');
  return separator < 0 ? { scientificName: label, commonName: label } : {
    scientificName: label.substring(0, separator), commonName: label.substring(separator + 1),
  };
}

/** Rank real output probabilities, preserving their values for the threshold policy. */
export function extractTopDetections(
  logits: Float32Array, topK: number, minConfidence: number, labels: readonly string[],
): Detection[] {
  if (logits.length !== labels.length || !Number.isInteger(topK) || topK < 1 ||
      !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error('Invalid classifier output or ranking options.');
  }
  return Array.from(logits, (logit, classIndex) => {
    if (!Number.isFinite(logit)) throw new Error('Non-finite classifier output.');
    const label = labels[classIndex] ?? '';
    return { classIndex, label, ...parseLabel(label), confidence: sigmoid(logit) };
  }).filter((candidate) => candidate.confidence >= minConfidence)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, topK);
}
