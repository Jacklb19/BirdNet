// Builds public/models/species-names.json: Spanish and English common names for every model label.
// Source: eBird/Clements taxonomy (Cornell Lab of Ornithology), Spanish locale. Run when the model changes
// (`npm run data:species-names`).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MODEL_ASSETS_DIR, MODEL_FILES, PUBLIC_DIR } from '../build.config.mjs';

const EBIRD_TAXONOMY_URL = 'https://api.ebird.org/v2/ref/taxonomy/ebird';
// The file stores [es, en] tuples: English comes from the model labels, so only Spanish is fetched.
const TAXONOMY_LOCALE = 'es';
const TAXONOMY_CATEGORY = 'species';
const FETCH_TIMEOUT_MS = 60_000;
// Model labels are "<scientific name>_<English common name>".
const LABEL_SEPARATOR = '_';
const SOURCE_NOTE = 'Spanish: eBird/Clements taxonomy, Cornell Lab of Ornithology. English: BirdNET labels.';

const LABELS_PATH = join(PUBLIC_DIR, MODEL_ASSETS_DIR, MODEL_FILES.labels);
const OUTPUT_PATH = join(PUBLIC_DIR, MODEL_ASSETS_DIR, MODEL_FILES.speciesNames);

const taxonomyUrl = new URL(EBIRD_TAXONOMY_URL);
taxonomyUrl.search = new URLSearchParams({ fmt: 'json', locale: TAXONOMY_LOCALE, cat: TAXONOMY_CATEGORY }).toString();

const labels = (await readFile(LABELS_PATH, 'utf8')).split('\n').map((line) => line.trim()).filter(Boolean);
const english = new Map(labels.map((label) => {
  const [sci, ...rest] = label.split(LABEL_SEPARATOR);
  return [sci, rest.join(LABEL_SEPARATOR)];
}));

const response = await fetch(taxonomyUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
if (!response.ok) throw new Error(`eBird taxonomy unavailable: ${String(response.status)}`);
const taxonomy = await response.json();
if (!Array.isArray(taxonomy)) throw new Error('Unexpected eBird taxonomy format.');

const spanish = new Map();
for (const entry of taxonomy) {
  if (typeof entry?.sciName === 'string' && typeof entry.comName === 'string' && english.has(entry.sciName)) spanish.set(entry.sciName, entry.comName);
}
// Compact tuples [es, en]; an empty Spanish name means eBird has no match and the English label is used.
const names = {};
for (const [sci, en] of english) names[sci] = [spanish.get(sci) ?? '', en];
const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUTPUT_PATH, `${JSON.stringify({ source: SOURCE_NOTE, names: sorted })}\n`);
process.stdout.write(`Spanish names: ${String(spanish.size)} of ${String(english.size)} model labels.\n`);
