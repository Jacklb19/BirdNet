// Builds public/models/species-names.json: Spanish and English common names for every label of the models the
// manifest offers (the one every installation has and, when published, the second one a person may add).
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
// Model labels whose species eBird now files under another name: label name -> eBird name.
const EBIRD_SYNONYMS = new Map([
  ['Brachycope anomala', 'Euplectes anomalus'],
  ['Bubulcus ibis', 'Ardea ibis'],
  ['Emberiza affinis', 'Fringillaria affinis'],
  ['Emberiza aureola', 'Schoeniclus aureolus'],
  ['Emberiza bruniceps', 'Melophus bruniceps'],
  ['Emberiza cabanisi', 'Fringillaria cabanisi'],
  ['Emberiza capensis', 'Fringillaria capensis'],
  ['Emberiza chrysophrys', 'Schoeniclus chrysophrys'],
  ['Emberiza elegans', 'Schoeniclus elegans'],
  ['Emberiza flaviventris', 'Fringillaria flaviventris'],
  ['Emberiza goslingi', 'Fringillaria goslingi'],
  ['Emberiza impetuani', 'Fringillaria impetuani'],
  ['Emberiza lathami', 'Melophus lathami'],
  ['Emberiza melanocephala', 'Melophus melanocephalus'],
  ['Emberiza pallasi', 'Schoeniclus pallasi'],
  ['Emberiza personata', 'Schoeniclus personatus'],
  ['Emberiza poliopleura', 'Fringillaria poliopleura'],
  ['Emberiza pusilla', 'Schoeniclus pusillus'],
  ['Emberiza rustica', 'Schoeniclus rusticus'],
  ['Emberiza rutila', 'Schoeniclus rutilus'],
  ['Emberiza sahari', 'Fringillaria sahari'],
  ['Emberiza schoeniclus', 'Schoeniclus schoeniclus'],
  ['Emberiza siemsseni', 'Schoeniclus siemsseni'],
  ['Emberiza spodocephala', 'Schoeniclus spodocephalus'],
  ['Emberiza striolata', 'Fringillaria striolata'],
  ['Emberiza sulphurata', 'Schoeniclus sulphuratus'],
  ['Emberiza tahapisi', 'Fringillaria tahapisi'],
  ['Emberiza tristrami', 'Schoeniclus tristrami'],
  ['Emberiza variabilis', 'Schoeniclus variabilis'],
  ['Emberiza yessoensis', 'Schoeniclus yessoensis'],
  ['Ptilinopus holosericea', 'Ptilinopus holosericeus'],
  ['Pycnopygius cinereus', 'Pinarostola cinerea'],
  ['Thryorchilus browni', 'Troglodytes browni'],
  ['Troglodytes hiemalis', 'Nannus hiemalis'],
  ['Troglodytes pacificus', 'Nannus pacificus'],
  ['Troglodytes troglodytes', 'Nannus troglodytes'],
]);
const SOURCE_NOTE = 'Spanish: eBird/Clements taxonomy, Cornell Lab of Ornithology. English: BirdNET labels.';

const MODELS_PATH = join(PUBLIC_DIR, MODEL_ASSETS_DIR);
const OUTPUT_PATH = join(MODELS_PATH, MODEL_FILES.speciesNames);

const taxonomyUrl = new URL(EBIRD_TAXONOMY_URL);
taxonomyUrl.search = new URLSearchParams({ fmt: 'json', locale: TAXONOMY_LOCALE, cat: TAXONOMY_CATEGORY }).toString();

const manifest = JSON.parse(await readFile(join(MODELS_PATH, MODEL_FILES.manifest), 'utf8'));
const labelFiles = [manifest.labels_file, manifest.alternate?.labels_file].filter((file) => typeof file === 'string');
// A species two models know keeps the English name of the first, the model every installation has.
const english = new Map();
for (const file of labelFiles) {
  const labels = (await readFile(join(MODELS_PATH, file), 'utf8')).split('\n').map((line) => line.trim()).filter(Boolean);
  for (const label of labels) {
    const [sci, ...rest] = label.split(LABEL_SEPARATOR);
    if (!english.has(sci)) english.set(sci, rest.join(LABEL_SEPARATOR));
  }
}

const response = await fetch(taxonomyUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
if (!response.ok) throw new Error(`eBird taxonomy unavailable: ${String(response.status)}`);
const taxonomy = await response.json();
if (!Array.isArray(taxonomy)) throw new Error('Unexpected eBird taxonomy format.');

const labelOf = new Map([...EBIRD_SYNONYMS].map(([label, ebird]) => [ebird, label]));
const spanish = new Map();
for (const entry of taxonomy) {
  if (typeof entry?.sciName !== 'string' || typeof entry.comName !== 'string') continue;
  const label = english.has(entry.sciName) ? entry.sciName : labelOf.get(entry.sciName);
  if (label && !spanish.has(label)) spanish.set(label, entry.comName);
}
// eBird drops species it lumps into another one (e.g. Apus nipalensis); their labels keep the Spanish name the
// previous build gave them instead of falling back to English.
const previous = new Map();
try {
  const { names: previousNames } = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  for (const [sci, tuple] of Object.entries(previousNames ?? {})) {
    if (Array.isArray(tuple) && typeof tuple[0] === 'string' && tuple[0]) previous.set(sci, tuple[0]);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const kept = [...english.keys()].filter((sci) => !spanish.has(sci) && previous.has(sci));
for (const sci of kept) spanish.set(sci, previous.get(sci));

// Compact tuples [es, en]; an empty Spanish name means no Spanish name is known and the English label is used.
const names = {};
for (const [sci, en] of english) names[sci] = [spanish.get(sci) ?? '', en];
const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUTPUT_PATH, `${JSON.stringify({ source: SOURCE_NOTE, names: sorted })}\n`);
process.stdout.write(`Spanish names: ${String(spanish.size)} of ${String(english.size)} model labels.\n`);
if (kept.length > 0) process.stdout.write(`Kept from the previous build (not in eBird): ${kept.join(', ')}.\n`);
