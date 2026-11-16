import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ASSETS_DIR, PUBLIC_DIR } from '../build.config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', PUBLIC_DIR, MODEL_ASSETS_DIR);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

function verify(name, files, expectedBytes, expectedHash) {
  const hash = createHash('sha256');
  let bytes = 0;
  for (const file of files) {
    const data = readFileSync(join(root, file));
    bytes += data.length;
    hash.update(data);
  }
  if (bytes !== expectedBytes || hash.digest('hex') !== expectedHash) throw new Error(`${name}: size or SHA-256 does not match the manifest.`);
  process.stdout.write(`${name}: verified (${String(bytes)} bytes).\n`);
}

verify(manifest.model_id, [manifest.model_file], manifest.size_bytes, manifest.sha256);
verify('Base geographic filter', [manifest.geo_model_file], manifest.geo_size_bytes, manifest.geo_sha256);
if (manifest.alternate) {
  const alternate = manifest.alternate;
  verify(alternate.model_id, alternate.model_files, alternate.size_bytes, alternate.sha256);
  verify('Alternate geographic filter', [alternate.geo_model_file], alternate.geo_size_bytes, alternate.geo_sha256);
}
