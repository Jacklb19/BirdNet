import { injectManifest } from 'workbox-build';
import { join } from 'node:path';
import { OUT_DIR, PRECACHE_GLOB_PATTERNS, PRECACHE_MAX_BYTES, SW_FILENAME, hashedAssetRegExp } from '../build.config.mjs';

// Cache only application resources. The model has a separate explicit, verified download.
const serviceWorker = join(OUT_DIR, SW_FILENAME);
const result = await injectManifest({
  swSrc: serviceWorker, swDest: serviceWorker, globDirectory: OUT_DIR,
  globPatterns: [...PRECACHE_GLOB_PATTERNS],
  maximumFileSizeToCacheInBytes: PRECACHE_MAX_BYTES,
  dontCacheBustURLsMatching: hashedAssetRegExp(),
});
// Any warning (an oversized file, a pattern without matches) means the offline shell would be incomplete.
if (result.warnings.length) throw new Error(result.warnings.join('\n'));
process.stdout.write(`Offline shell: ${String(result.count)} resources, ${String(result.size)} bytes. Model excluded.\n`);
