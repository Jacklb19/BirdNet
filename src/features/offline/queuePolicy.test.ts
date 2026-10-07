import { describe, expect, it } from 'vitest';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { AUDIO_UPLOAD_MIME_TYPE } from '../../config/contract';
import { MIN_QUEUE_BYTES } from './offline.constants';
import { acknowledgedIds, approximateLocation, assertQueueCapacity, encodeAudio } from './queuePolicy';

/** Canonical PCM WAV header size and field offsets, from the RIFF/WAVE format specification. */
const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE_OFFSET = 24;
const BYTE_RATE_OFFSET = 28;
const PCM16_BYTES = 2;

describe('persistent queue policy', () => {
  it('checks capacity and acknowledgement membership across 1000 scenarios', () => {
    for (let i = 0; i < 1000; i++) {
      const maximum = MIN_QUEUE_BYTES + i;
      expect(() => { assertQueueCapacity(maximum - i, i, maximum); }).not.toThrow();
      expect(() => { assertQueueCapacity(maximum - i, i + 1, maximum); }).toThrow();
      const ids = [`a-${String(i)}`, `b-${String(i)}`];
      expect(acknowledgedIds({ accepted_ids: [ids[0]], existing_ids: [ids[0], ids[1]] }, ids)).toEqual(ids);
      expect(() => acknowledgedIds({ accepted_ids: ['foreign'], existing_ids: [] }, ids)).toThrow();
    }
    expect(() => { assertQueueCapacity(0, 0, MIN_QUEUE_BYTES - 1); }).toThrow();
  });
  it('rounds device coordinates before storing them', () => {
    expect(approximateLocation(4.678912, -74.123456)).toEqual({ latitude: 4.679, longitude: -74.123 });
    expect(() => approximateLocation(NaN, 0)).toThrow();
    expect(() => approximateLocation(91, 0)).toThrow();
  });
  it.each([null, {}, { accepted_ids: [], existing_ids: [42] }, { accepted_ids: null, existing_ids: [] }])('rejects malformed acknowledgements %j', (response) => {
    expect(() => acknowledgedIds(response, [])).toThrow();
  });
  it('encodes exactly one window with a header that follows the capture sample rate', async () => {
    const blob = encodeAudio(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES).fill(0.5));
    expect(blob.size).toBe(WAV_HEADER_BYTES + AUDIO_CONSTANTS.WINDOW_SAMPLES * PCM16_BYTES);
    expect(blob.type).toBe(AUDIO_UPLOAD_MIME_TYPE);
    const header = new DataView(await blob.slice(0, WAV_HEADER_BYTES).arrayBuffer());
    expect(header.getUint32(SAMPLE_RATE_OFFSET, true)).toBe(AUDIO_CONSTANTS.TARGET_SAMPLE_RATE);
    expect(header.getUint32(BYTE_RATE_OFFSET, true)).toBe(AUDIO_CONSTANTS.TARGET_SAMPLE_RATE * PCM16_BYTES);
    expect(() => encodeAudio(new Float32Array(2))).toThrow();
    expect(() => encodeAudio(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES).fill(Infinity))).toThrow();
  });
});
