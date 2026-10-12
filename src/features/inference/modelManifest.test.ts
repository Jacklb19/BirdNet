import { describe, expect, it } from 'vitest';
import { formatCombinedVersion, formatModelVersion, resolveManifestResource, validateAlternate, validateManifest } from './modelManifest';
import { FIELD_LIMITS } from '../../config/contract';
import productionManifest from '../../../public/models/manifest.json';

describe('resolveManifestResource', () => {
  const origin = 'https://app.example.org';

  it('resolves relative paths against the manifest and root paths against its origin', () => {
    expect(resolveManifestResource('model.onnx', '/models/manifest.json', origin)).toBe(`${origin}/models/model.onnx`);
    expect(resolveManifestResource('/cache/model.onnx', '/models/manifest.json', origin)).toBe(`${origin}/cache/model.onnx`);
  });

  it.each(['data:text/plain,label', 'javascript:alert(1)', 'blob:https://app.example.org/id'])(
    'refuses a resource that is not fetched over http(s): %s',
    (path) => { expect(() => resolveManifestResource(path, '/models/manifest.json', origin)).toThrow('Invalid manifest resource'); },
  );
});

describe('second model of a manifest', () => {
  const alternate = {
    model_id: 'birdnet-plus', variant: 'birds', sample_rate: 32_000, window_samples: 96_000, window_seconds: 3,
    num_classes: 8923, sha256: 'b'.repeat(64), size_bytes: 10,
    model_files: ['plus.part1.onnx', 'plus.part2.onnx'], labels_file: 'plus-labels.txt',
    geo_model_file: 'plus-geo.onnx', geo_sha256: 'c'.repeat(64), geo_size_bytes: 5,
  };

  it('accepts a model at a lower rate that analyses the same seconds', () => {
    expect(validateAlternate(alternate)).toEqual(alternate);
    expect(validateManifest({ ...productionManifest, alternate }).alternate).toEqual(alternate);
  });

  it.each([
    { ...alternate, window_samples: 144_000 }, { ...alternate, window_seconds: 5, window_samples: 160_000 },
    { ...alternate, sample_rate: 96_000, window_samples: 288_000 }, { ...alternate, model_files: [] },
    { ...alternate, model_files: ['a.onnx', ''] }, { ...alternate, sha256: 'short' }, { ...alternate, geo_sha256: undefined },
    { ...alternate, num_classes: 0 }, null,
  ])('refuses a description it could not run: %j', (value) => {
    expect(() => validateAlternate(value)).toThrow();
    // The first model still installs: the second is left out, not a reason to refuse the manifest.
    expect(validateManifest({ ...productionManifest, alternate: value }).alternate).toBeUndefined();
  });

  it('names a detection of two models by both, within the length the API stores', () => {
    const version = formatCombinedVersion(productionManifest, alternate);
    expect(version).toContain(productionManifest.model_id);
    expect(version).toContain(alternate.model_id);
    expect(version).not.toBe(formatModelVersion(productionManifest));
    expect(version.length).toBeLessThanOrEqual(FIELD_LIMITS.modelVersion);
  });
});
