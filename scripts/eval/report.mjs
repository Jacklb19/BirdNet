/**
 * Compares detectors on an annotated evaluation set (docs/evaluacion.md): every model scored by
 * `score-models.py`, with and without the geographic filter, deciding on one window or on several.
 *
 *   node scripts/eval/report.mjs --dataset <directory with recordings.csv> --scores <output of score-models.py>
 *
 * The decision rules, the thresholds and the metrics are the app's own TypeScript modules, loaded through Vite,
 * so the numbers describe what the app would do and not a reimplementation of it.
 */
import { createReadStream } from 'node:fs';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const RECORDINGS_FILE = 'recordings.csv';
const SCORES_DIR = 'scores';
const GEO_FILE = 'geo.json';
const LABELS_EXTENSION = '.txt';
const REPORT_FILE = 'report.md';
const RESULTS_FILE = 'report.json';

/** Stretch scoring (see metrics.ts): fifteen seconds, with three of tolerance at the edges. */
const STRETCH_OPTIONS = Object.freeze({ stretchSeconds: 15, marginSeconds: 3, minOverlapSeconds: 1 });
/**
 * Thresholds swept to find the best F1 a detector could reach if the app's thresholds were moved. The low end is
 * finer because a model whose confidences are shared among all classes (softmax) rarely gives one a high value.
 */
const SWEEP = [0.01, 0.02, 0.03, ...Array.from({ length: 19 }, (_, index) => (index + 1) / 20)];
const SECONDS_PER_HOUR = 3600;
const BYTES_PER_MB = 1024 * 1024;

const { values: options } = parseArgs({ options: { dataset: { type: 'string' }, scores: { type: 'string' } } });
if (!options.dataset || !options.scores) throw new Error('Usage: node scripts/eval/report.mjs --dataset <dir> --scores <dir>');

const server = await createServer({ configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true } });
const { poolWindows, SINGLE_WINDOW } = await server.ssrLoadModule('/src/features/inference/windowPooling.ts');
const { CONFIDENCE_THRESHOLDS } = await server.ssrLoadModule('/src/config/contract.ts');
const { parseAudacityLabels } = await server.ssrLoadModule('/scripts/eval/annotations.ts');
const metrics = await server.ssrLoadModule('/scripts/eval/metrics.ts');
await server.close();

const RULES = [
  { name: 'single window', rule: SINGLE_WINDOW },
  { name: 'mean of 2', rule: { kind: 'mean', windows: 2 } },
  { name: 'mean of 3', rule: { kind: 'mean', windows: 3 } },
  { name: 'mean of 2, sure stands', rule: { kind: 'mean', windows: 2, standsFrom: CONFIDENCE_THRESHOLDS.confirmedFrom } },
  { name: '2 of 3', rule: { kind: 'rank', windows: 3, rank: 2 } },
];
const KEPT = CONFIDENCE_THRESHOLDS.discardBelow;
const CONFIRMED = CONFIDENCE_THRESHOLDS.confirmedFrom;

/** Minimal CSV reader for recordings.csv: comma-separated, no quoted commas (file names and plain values only). */
function parseCsv(text) {
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const columns = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [columns[index], value.trim()])));
}

const isYes = (value) => ['yes', 'si', 'sí', 'true', '1'].includes((value ?? '').toLowerCase());

async function readRecordings(dataset) {
  const recordings = new Map();
  for (const row of parseCsv(await readFile(join(dataset, RECORDINGS_FILE), 'utf8'))) {
    const labelsPath = join(dataset, row.file.slice(0, -extname(row.file).length) + LABELS_EXTENSION);
    recordings.set(row.file, { annotations: parseAudacityLabels(await readFile(labelsPath, 'utf8')), fullyAnnotated: isYes(row.fully_annotated) });
  }
  return recordings;
}

function newTotals() {
  return {
    kept: { tp: 0, fp: 0, fn: 0 }, confirmed: { tp: 0, fp: 0, fn: 0 }, sweep: SWEEP.map(() => ({ tp: 0, fp: 0, fn: 0 })),
    samples: new Map(), species: { found: 0, missed: 0, invented: 0 }, keptDecisions: 0, provisionalDecisions: 0, annotatedSeconds: 0,
  };
}

/** Decisions the app would take over one recording: per window, the pooled confidence of each species. */
function decide(line, meta, rule, allowed) {
  const windows = line.windows.map((entries) => {
    const scores = new Map();
    for (const [index, score] of entries) {
      const species = line.species[index];
      if (!allowed || allowed.has(species)) scores.set(species, score);
    }
    return scores;
  });
  const decisions = [];
  windows.forEach((_, index) => {
    const time = index * meta.grid_hop_seconds + meta.grid_window_seconds / 2;
    for (const [species, confidence] of poolWindows(windows.slice(Math.max(0, index - rule.windows + 1), index + 1), rule)) {
      decisions.push({ species, time, confidence });
    }
  });
  return decisions;
}

function accumulate(totals, recording, duration, decisions) {
  // A recording scored only in part is judged only on the labels of that part.
  const annotations = recording.annotations.filter((annotation) => annotation.start < duration)
    .map((annotation) => ({ ...annotation, end: Math.min(annotation.end, duration) }));
  const truth = metrics.stretchTruth(annotations, duration, STRETCH_OPTIONS);
  const scores = metrics.stretchScores(decisions, truth.length, STRETCH_OPTIONS.stretchSeconds);
  metrics.addCounts(totals.kept, metrics.countStretches(truth, scores, KEPT, recording.fullyAnnotated));
  metrics.addCounts(totals.confirmed, metrics.countStretches(truth, scores, CONFIRMED, recording.fullyAnnotated));
  SWEEP.forEach((threshold, index) => { metrics.addCounts(totals.sweep[index], metrics.countStretches(truth, scores, threshold, recording.fullyAnnotated)); });
  metrics.collectSamples(totals.samples, truth, scores, recording.fullyAnnotated);
  const species = metrics.recordingSpecies(annotations, decisions, KEPT, recording.fullyAnnotated);
  totals.species.found += species.found;
  totals.species.missed += species.missed;
  totals.species.invented += species.invented;
  for (const decision of decisions) {
    if (decision.confidence < KEPT) continue;
    totals.keptDecisions++;
    if (decision.confidence < CONFIRMED) totals.provisionalDecisions++;
  }
  if (recording.fullyAnnotated) totals.annotatedSeconds += duration;
}

function summarize(totals) {
  const precisions = [...totals.samples.values()].map(metrics.averagePrecision).filter((value) => value !== null);
  const best = SWEEP.map((threshold, index) => ({ threshold, f1: metrics.rates(totals.sweep[index]).f1 ?? 0 })).reduce((top, entry) => (entry.f1 > top.f1 ? entry : top));
  const hours = totals.annotatedSeconds / SECONDS_PER_HOUR;
  return {
    kept: metrics.rates(totals.kept), confirmed: metrics.rates(totals.confirmed),
    falseAlarmsPerHour: { kept: hours ? totals.kept.fp / hours : null, confirmed: hours ? totals.confirmed.fp / hours : null },
    meanAveragePrecision: precisions.length ? precisions.reduce((sum, value) => sum + value, 0) / precisions.length : null,
    scoredSpecies: precisions.length, bestF1: best, species: totals.species,
    provisionalShare: totals.keptDecisions ? totals.provisionalDecisions / totals.keptDecisions : null,
  };
}

const percent = (value) => (value === null ? '–' : `${(value * 100).toFixed(1)}`);
const number = (value, digits = 1) => (value === null ? '–' : value.toFixed(digits));

const recordings = await readRecordings(options.dataset);
const geo = JSON.parse(await readFile(join(options.scores, GEO_FILE), 'utf8'));
const scoreFiles = (await readdir(join(options.scores, SCORES_DIR))).filter((file) => file.endsWith('.jsonl')).sort();
const results = [];
const models = [];
for (const file of scoreFiles) {
  const metaPath = join(options.scores, SCORES_DIR, file.replace(/\.jsonl$/, '.json'));
  // The description is written when a model has been scored on every recording; without it the scores are partial.
  if (!await access(metaPath).then(() => true, () => false)) {
    process.stderr.write(`Skipping ${file}: still being scored.
`);
    continue;
  }
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  models.push(meta);
  const configurations = [false, true].flatMap((filtered) => RULES.map((entry) => ({ ...entry, filtered, totals: newTotals() })));
  let seconds = 0;
  for await (const text of createInterface({ input: createReadStream(join(options.scores, SCORES_DIR, file)) })) {
    if (text.trim() === '') continue;
    const line = JSON.parse(text);
    const recording = recordings.get(line.recording);
    if (!recording) throw new Error(`Scores for a recording that is not in the dataset: ${line.recording}`);
    seconds += line.duration;
    for (const configuration of configurations) {
      // Without a known place the app filters nothing, and so does the evaluation.
      const allowed = configuration.filtered && geo[line.recording] ? new Set(geo[line.recording]) : null;
      accumulate(configuration.totals, recording, line.duration, decide(line, meta, configuration.rule, allowed));
    }
  }
  meta.hours = seconds / SECONDS_PER_HOUR;
  for (const configuration of configurations) {
    results.push({ model: meta.model, geoFilter: configuration.filtered, rule: configuration.name, ...summarize(configuration.totals) });
  }
}

const lines = [
  '# Detection evaluation', '',
  `Dataset: \`${options.dataset}\` (${String(recordings.size)} recordings). Stretches of ${String(STRETCH_OPTIONS.stretchSeconds)} s; thresholds ${String(KEPT)} (kept) and ${String(CONFIRMED)} (confirmed).`, '',
  '## Models', '',
  '| Model | File | Size (MB) | Labels | Confidence | Latency mean / p95 (ms, this CPU) | Hours scored |', '|---|---|---|---|---|---|---|',
  ...models.map((meta) => `| ${meta.model} | ${meta.file} | ${(meta.size_bytes / BYTES_PER_MB).toFixed(1)} | ${String(meta.labels)} | ${meta.activation ?? 'sigmoid'} | ${meta.latency ? `${String(meta.latency.mean_ms)} / ${String(meta.latency.p95_ms)}` : '–'} | ${meta.hours.toFixed(2)} |`),
  '', '## Results', '',
  'P, R, F1 in percent. FA/h: false alarms (species and stretch) per hour of fully annotated audio. mAP: mean over species of the average precision. Best F1: the highest over all thresholds, with the threshold that gives it. Species: found / missed / invented, summed over recordings, at the kept threshold. Prov.: share of kept decisions that are provisional.', '',
  '| Model | Geo | Rule | P kept | R kept | F1 kept | P conf. | R conf. | F1 conf. | FA/h kept | FA/h conf. | mAP | Best F1 (thr.) | Species | Prov. |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((row) => `| ${row.model} | ${row.geoFilter ? 'yes' : 'no'} | ${row.rule} | ${percent(row.kept.precision)} | ${percent(row.kept.recall)} | ${percent(row.kept.f1)} | ${percent(row.confirmed.precision)} | ${percent(row.confirmed.recall)} | ${percent(row.confirmed.f1)} | ${number(row.falseAlarmsPerHour.kept)} | ${number(row.falseAlarmsPerHour.confirmed)} | ${percent(row.meanAveragePrecision)} | ${percent(row.bestF1.f1)} (${row.bestF1.threshold.toFixed(2)}) | ${String(row.species.found)} / ${String(row.species.missed)} / ${String(row.species.invented)} | ${percent(row.provisionalShare)} |`),
  '',
];
await writeFile(join(options.scores, REPORT_FILE), lines.join('\n'), 'utf8');
await writeFile(join(options.scores, RESULTS_FILE), JSON.stringify({ stretch: STRETCH_OPTIONS, thresholds: { kept: KEPT, confirmed: CONFIRMED }, models, results }, null, 2), 'utf8');
process.stdout.write(`${lines.join('\n')}\n`);
