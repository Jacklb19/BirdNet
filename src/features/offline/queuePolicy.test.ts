import { describe, expect, it } from 'vitest';
import { acknowledgedIds, approximateLocation, assertQueueCapacity, encodeAudio } from './queuePolicy';

describe('persistent queue policy', () => {
  it('checks capacity and acknowledgement membership across 1000 scenarios', () => {
    for (let i = 0; i < 1000; i++) {
      const maximum = 1024 * 1024 + i;
      expect(() => { assertQueueCapacity(maximum - i, i, maximum); }).not.toThrow();
      expect(() => { assertQueueCapacity(maximum - i, i + 1, maximum); }).toThrow();
      const ids = [`a-${String(i)}`, `b-${String(i)}`];
      expect(acknowledgedIds({ accepted_ids: [ids[0]], existing_ids: [ids[0], ids[1]] }, ids)).toEqual(ids);
      expect(() => acknowledgedIds({ accepted_ids: ['foreign'], existing_ids: [] }, ids)).toThrow();
    }
  });
  it('rounds device coordinates before storing them', () => {
    expect(approximateLocation(4.678912, -74.123456)).toEqual({ latitude: 4.679, longitude: -74.123 });
    expect(() => approximateLocation(NaN, 0)).toThrow();
    expect(() => approximateLocation(91, 0)).toThrow();
  });
  it.each([null, {}, { accepted_ids: [], existing_ids: [42] }, { accepted_ids: null, existing_ids: [] }])('rejects malformed acknowledgements %j', (response) => {
    expect(() => acknowledgedIds(response, [])).toThrow();
  });
  it('encodes exactly one three-second window and rejects invalid samples', () => {
    const blob = encodeAudio(new Float32Array(144000).fill(0.5));
    expect(blob.size).toBe(288044);
    expect(blob.type).toBe('audio/wav');
    expect(() => encodeAudio(new Float32Array(2))).toThrow();
    expect(() => encodeAudio(new Float32Array(144000).fill(Infinity))).toThrow();
  });
});
