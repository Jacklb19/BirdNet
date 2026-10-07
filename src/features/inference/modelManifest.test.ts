import { describe, expect, it } from 'vitest';
import { resolveManifestResource } from './modelManifest';

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
