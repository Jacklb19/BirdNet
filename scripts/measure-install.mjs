import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { getManifest } from 'workbox-build';
import { OUT_DIR, PRECACHE_GLOB_PATTERNS, PRECACHE_MAX_BYTES } from '../build.config.mjs';

const result = await getManifest({ globDirectory: OUT_DIR, globPatterns: [...PRECACHE_GLOB_PATTERNS], maximumFileSizeToCacheInBytes: PRECACHE_MAX_BYTES });
if (result.warnings.length) throw new Error(result.warnings.join('\n'));
const manifest = JSON.parse(await readFile(join(OUT_DIR, 'models/manifest.json'), 'utf8'));
let gzipBytes = 0;
for (const entry of result.manifestEntries) gzipBytes += gzipSync(await readFile(join(OUT_DIR, entry.url))).byteLength;
const primary = manifest.size_bytes + manifest.geo_size_bytes;
const alternate = manifest.alternate.size_bytes + manifest.alternate.geo_size_bytes;
process.stdout.write(`${JSON.stringify({ shell: { resources: result.count, raw_bytes: result.size, gzip_estimate_bytes: gzipBytes },
  models: { primary_bytes: primary, alternate_bytes: alternate, total_bytes: primary + alternate },
  total_raw_bytes: result.size + primary + alternate }, null, 2)}\n`);
