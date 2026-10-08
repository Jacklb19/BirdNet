import { describe, expect, it } from 'vitest';
import { validateManifest } from '../inference/modelManifest';
import manifest from '../../../public/models/manifest.json';

describe('model compatibility boundary', () => {
  it('accepts the production manifest', () => { expect(validateManifest(manifest)).toEqual(manifest); });
  it.each([null, {}, { ...manifest, sha256: 'invalid' }, { ...manifest, sample_rate: 44100 }, { ...manifest, num_classes: 0 }, { ...manifest, labels_file: null }, { ...manifest, size_bytes: Infinity }])('rejects incompatible manifests %j', (value) => {
    expect(() => validateManifest(value)).toThrow();
  });
});
