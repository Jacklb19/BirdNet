import { build } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';

// Generate the test bridge after precaching so no test-only code ships in the installed app.
const productionWorker = (await readdir('dist/assets')).find((file) => file.startsWith('inference.worker-') && file.endsWith('.js'));
if (!productionWorker) throw new Error('Build the production worker before preparing offline checks.');
await build({ configFile: false, build: {
  outDir: 'tmp/offline-check', emptyOutDir: true,
  lib: { entry: 'src/test/browser/offline.ts', formats: ['es'], fileName: 'offline-check' },
  minify: false,
} });
const bridge = (await readFile('tmp/offline-check/offline-check.js', 'utf8')).replace(/\/assets\/inference\.worker-[\w-]+\.js/g, `/assets/${productionWorker}`);
await writeFile('tmp/offline-check/offline-check.js', bridge);
