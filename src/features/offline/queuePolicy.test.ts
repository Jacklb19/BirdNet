import { describe, expect, it } from 'vitest';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { AUDIO_UPLOAD_MIME_TYPE } from '../../config/contract';
import { MIN_QUEUE_BYTES } from './offline.constants';
import { acknowledgedIds, approximateLocation, assertQueueCapacity, encodeAudio, recordingLocation, sharesMap, unlocatedAssignment } from './queuePolicy';
import type { CachedSite, StoredDetection } from './types';

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
    expect(approximateLocation(4.678912, -74.123456)).toEqual({ latitude: 4.6789, longitude: -74.1235 });
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

// Regression (S6 field test): records stayed "without location" while a site was active and never synchronized.
describe('location of a recording (ADR-16)', () => {
  const site: CachedSite = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Humedal', latitude: 4.735, longitude: -74.101 };
  const device = { latitude: 4.61234, longitude: -74.07116 };
  const account = '00000000-0000-4000-8000-000000000001';

  it('pins records to the device position and falls back to the active place without one', () => {
    // Walking with a place chosen: the song stays where it was heard, not at the place's centre (ADR-22).
    expect(recordingLocation({ activeSiteId: site.id, sites: [site] }, device)).toEqual({ latitude: 4.6123, longitude: -74.0712 });
    expect(recordingLocation({ activeSiteId: null, sites: [site] }, device)).toEqual({ latitude: 4.6123, longitude: -74.0712 });
    // Without a position (indoors, GPS off) the active place still gives a location, so the record can synchronize.
    expect(recordingLocation({ activeSiteId: site.id, sites: [site] }, null)).toEqual({ latitude: 4.735, longitude: -74.101 });
    expect(recordingLocation({ activeSiteId: site.id, sites: [] }, null)).toBeNull();
    expect(recordingLocation({ activeSiteId: null }, null)).toBeNull();
  });
  it('shares nothing until the person has chosen to', () => {
    expect(sharesMap({})).toBe(false);
    expect(sharesMap({ shareMap: false })).toBe(false);
    expect(sharesMap({ shareMap: true })).toBe(true);
  });
  it('assigns a site only to unlocated records of the account or of nobody', () => {
    type Row = Pick<StoredDetection, 'location' | 'owner' | 'siteId'> & { readonly id: string };
    const located: Row = { id: 'gps', location: { latitude: 1, longitude: 2 }, owner: account, siteId: null };
    const mine: Row = { id: 'mine', location: null, owner: account, siteId: null };
    const unclaimed: Row = { id: 'unclaimed', location: null, owner: null, siteId: null };
    const foreign: Row = { id: 'foreign', location: null, owner: '00000000-0000-4000-8000-000000000009', siteId: null };
    const assigned = unlocatedAssignment([located, mine, unclaimed, foreign], site, account);
    expect(assigned.map((record) => record.id)).toEqual(['mine', 'unclaimed']);
    expect(assigned.every((record) => record.siteId === site.id && record.location.latitude === site.latitude)).toBe(true);
  });
});
