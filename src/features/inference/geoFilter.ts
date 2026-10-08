/**
 * BirdNET's geographic model as a species filter (ADR-18). The model answers, for a place and a week, how likely each
 * of the 6522 labels is to occur there; species under the threshold are dropped before the acoustic results are
 * ranked, which removes confusions with birds that do not live in the area.
 */
import type { ApproximateLocation } from '../offline/types';

/** BirdNET-Analyzer's default location-filter threshold (`LOCATION_FILTER_THRESHOLD`, `--sf_thresh`). */
export const GEO_THRESHOLD = 0.03;

/** Week value BirdNET uses for a prediction over the whole year. */
export const YEAR_ROUND_WEEK = -1;

/** BirdNET splits the year into 48 weeks: four per month. */
const WEEKS_PER_MONTH = 4;
const DAYS_PER_WEEK = 7;

/** Input features of one prediction: latitude, longitude and BirdNET week, as the model expects them. */
export const GEO_INPUT_FEATURES = 3;

/**
 * BirdNET week (1–48) of a local date: four weeks per month, days 29–31 counted in the fourth (same rule as
 * BirdNET-Go's range filter, since BirdNET-Analyzer takes the week as input and does not derive it).
 */
export function birdnetWeek(date: Date): number {
  const weekInMonth = Math.min(Math.floor((date.getDate() - 1) / DAYS_PER_WEEK) + 1, WEEKS_PER_MONTH);
  return date.getMonth() * WEEKS_PER_MONTH + weekInMonth;
}

export function geoInput(location: ApproximateLocation, week: number): Float32Array {
  return new Float32Array([location.latitude, location.longitude, week]);
}

/**
 * The model's scores are float32, and BirdNET-Analyzer compares them with the threshold in float32 too (NumPy casts
 * the Python scalar to the array's type); comparing with the double 0.03 would drop species sitting exactly on it.
 */
function passes(probability: number | undefined, threshold: number): boolean {
  return (probability ?? 0) >= Math.fround(threshold);
}

/** Which labels pass the threshold (1) or not (0), in label order. */
export function regionMask(probabilities: Float32Array, threshold = GEO_THRESHOLD): Uint8Array {
  const mask = new Uint8Array(probabilities.length);
  for (let index = 0; index < probabilities.length; index++) mask[index] = passes(probabilities[index], threshold) ? 1 : 0;
  return mask;
}

/**
 * Logit given to a species the place rules out. The classifier outputs logits (the sigmoid comes later), so zero
 * would mean a confidence of 0.5; this value maps to a probability of 0 while staying finite, as the ranking requires.
 */
export const EXCLUDED_LOGIT = -1e4;

/** Rules out, in place, the acoustic logits of species unlikely at the place; the mask must have one entry per label. */
export function applyRegionMask(logits: Float32Array, mask: Uint8Array): void {
  if (mask.length !== logits.length) throw new Error('Geographic mask does not match the labels.');
  for (let index = 0; index < logits.length; index++) if (mask[index] === 0) logits[index] = EXCLUDED_LOGIT;
}

export function countLikely(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

/** Label indexes over the threshold, most likely first, at most `limit` (the regional guide and the album). */
export function rankRegion(probabilities: Float32Array, limit: number, threshold = GEO_THRESHOLD): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < probabilities.length; index++) if (passes(probabilities[index], threshold)) indexes.push(index);
  return indexes.sort((a, b) => (probabilities[b] ?? 0) - (probabilities[a] ?? 0) || a - b).slice(0, limit);
}
