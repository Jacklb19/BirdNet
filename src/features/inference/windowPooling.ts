/**
 * Deciding with several neighbouring windows instead of one. Analysis windows overlap by half, so a song that
 * lasts falls in more than one, while a click or a passing noise usually excites a species in a single window:
 * combining the last few separates the two. The rules are pure so the same code decides in the app and in the
 * evaluation that compares them (`scripts/eval/report.mjs`).
 */

/** Confidence of each species heard in one window, between 0 and 1; a species that is absent scored nothing. */
export type WindowScores<Species> = ReadonlyMap<Species, number>;

/**
 * How the last `windows` windows are combined into one confidence per species:
 * - `mean`: their average. A lone spike is diluted; a sustained song keeps its level. With `standsFrom`, a
 *   species the newest window alone scores that high keeps that confidence: a clear, short call is not
 *   averaged away, and only the doubtful ones have to be heard twice.
 * - `rank`: the `rank`-th highest of them, so the result reaches a threshold exactly when at least `rank` windows
 *   do ("2 of 3" is `{ windows: 3, rank: 2 }`). `rank: 1` is the maximum.
 */
export type PoolingRule =
  | { readonly kind: 'mean'; readonly windows: number; readonly standsFrom?: number }
  | { readonly kind: 'rank'; readonly windows: number; readonly rank: number };

/** One window decides on its own: the behaviour before pooling existed. */
export const SINGLE_WINDOW: PoolingRule = Object.freeze({ kind: 'mean', windows: 1 });

function assertRule(rule: PoolingRule): void {
  if (!Number.isSafeInteger(rule.windows) || rule.windows < 1) throw new Error('Invalid pooling span.');
  if (rule.kind === 'mean' && rule.standsFrom !== undefined && !(rule.standsFrom >= 0 && rule.standsFrom <= 1)) throw new Error('Invalid pooling threshold.');
  if (rule.kind === 'rank' && (!Number.isSafeInteger(rule.rank) || rule.rank < 1 || rule.rank > rule.windows)) {
    throw new Error('Invalid pooling rank.');
  }
}

/**
 * Confidence per species after applying `rule` to the newest windows of `recent` (oldest first). While a session
 * has fewer windows than the rule spans, `mean` averages the ones there are, so the first window is not penalised
 * for having no past, and `rank` gives nothing to a species heard in fewer than `rank` windows.
 */
export function poolWindows<Species>(recent: readonly WindowScores<Species>[], rule: PoolingRule): Map<Species, number> {
  assertRule(rule);
  const span = recent.slice(-rule.windows);
  const heard = new Map<Species, number[]>();
  for (const window of span) {
    for (const [species, confidence] of window) {
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Invalid window confidence.');
      const values = heard.get(species);
      if (values) values.push(confidence);
      else heard.set(species, [confidence]);
    }
  }
  const newest = span.at(-1);
  const pooled = new Map<Species, number>();
  for (const [species, values] of heard) {
    if (rule.kind === 'mean') {
      const mean = values.reduce((sum, value) => sum + value, 0) / span.length;
      const alone = newest?.get(species) ?? 0;
      pooled.set(species, rule.standsFrom !== undefined && alone >= rule.standsFrom ? alone : mean);
    } else {
      const ranked = values.sort((left, right) => right - left)[rule.rank - 1];
      if (ranked !== undefined) pooled.set(species, ranked);
    }
  }
  return pooled;
}
