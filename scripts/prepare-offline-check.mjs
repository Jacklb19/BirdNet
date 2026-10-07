import { build } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ASSETS_DIR,
  HASHED_OUTPUT_NAMES,
  INFERENCE_WORKER_CHUNK,
  OFFLINE_CHECK_BUNDLE,
  OFFLINE_CHECK_DIR,
  OFFLINE_CHECK_ENTRY,
  OFFLINE_CHECK_NAME,
  OUT_DIR,
  hashedAssetRegExp,
} from '../build.config.mjs';

const WORKER_EXTENSION = 'js';
const workerAsset = { name: INFERENCE_WORKER_CHUNK, extension: WORKER_EXTENSION };

// Generate the test bridge after precaching so no test-only code ships in the installed app.
const productionWorker = (await readdir(join(OUT_DIR, ASSETS_DIR))).find((file) =>
  file.endsWith(`.${WORKER_EXTENSION}`) && hashedAssetRegExp(workerAsset).test(`${ASSETS_DIR}/${file}`));
if (!productionWorker) throw new Error('Build the production worker before preparing offline checks.');
await build({
  configFile: false,
  // The same worker naming as the app build, so hashedAssetRegExp() finds the bundled worker below.
  worker: { rolldownOptions: { output: { ...HASHED_OUTPUT_NAMES } } },
  build: {
    outDir: OFFLINE_CHECK_DIR, assetsDir: ASSETS_DIR, emptyOutDir: true,
    lib: { entry: OFFLINE_CHECK_ENTRY, formats: ['es'], fileName: OFFLINE_CHECK_NAME },
    minify: false,
  },
});
// The bridge was bundled with its own worker copy; point it at the precached production worker instead.
const bundled = await readFile(OFFLINE_CHECK_BUNDLE, 'utf8');
if (!hashedAssetRegExp(workerAsset).test(bundled)) {
  throw new Error(`${OFFLINE_CHECK_BUNDLE} does not reference the ${INFERENCE_WORKER_CHUNK} bundle.`);
}
await writeFile(OFFLINE_CHECK_BUNDLE, bundled.replace(hashedAssetRegExp({ ...workerAsset, flags: 'g' }), `${ASSETS_DIR}/${productionWorker}`));
