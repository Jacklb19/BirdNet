import { describe, expect, it } from 'vitest';
import { MIN_QUEUE_BYTES } from './offline.constants';
import { acknowledgedIds, approximateLocation, assertQueueCapacity, recordingLocation, recordingSite, sharesMap, unlocatedAssignment } from './queuePolicy';
import type { CachedSite, StoredDetection } from './types';

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
  it('files a song under the place chosen by hand, else under the nearest saved place within reach', () => {
    const far: CachedSite = { ...site, id: '00000000-0000-4000-8000-000000000007', latitude: 4.9, longitude: -74.3 };
    const nearSite = { latitude: site.latitude + 0.001, longitude: site.longitude };
    expect(recordingSite({ activeSiteId: far.id, sites: [site, far] }, nearSite)).toBe(far.id);
    expect(recordingSite({ activeSiteId: null, sites: [far, site] }, nearSite)).toBe(site.id);
    // About 1.1 km from the place: outside its reach, so the song belongs to no place.
    expect(recordingSite({ sites: [site] }, { latitude: site.latitude + 0.01, longitude: site.longitude })).toBeNull();
    expect(recordingSite({ sites: [site] }, null)).toBeNull();
    expect(recordingSite({}, nearSite)).toBeNull();
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
