import { injectManifest } from 'workbox-build';

// Cache only application resources. The model has a separate explicit, verified download.
const result = await injectManifest({
  swSrc: 'dist/service-worker.js', swDest: 'dist/service-worker.js', globDirectory: 'dist',
  globPatterns: ['index.html', 'manifest.webmanifest', 'icons/*.svg', 'assets/**/*.{js,mjs,css,wasm}'],
  maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
  dontCacheBustURLsMatching: /assets\/.*-[\w-]+\./,
});
if (result.warnings.length) throw new Error(result.warnings.join('\n'));
process.stdout.write(`Offline shell: ${String(result.count)} resources, ${String(result.size)} bytes. Model excluded.\n`);
