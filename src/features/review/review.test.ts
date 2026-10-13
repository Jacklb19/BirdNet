// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUEUE_BYTES } from '../offline/offline.constants';
import { getSettings, listHistory } from '../offline/queueStore';
import type { HistoryEntry, OfflineSettings } from '../offline/types';
import { applyReviews, correctionVerdict, isValidVerdict, reviewPayload, type ReviewIndex } from './reviewPolicy';
import { listReviews, markReview } from './reviewStore';
import { syncReviews } from './reviewSync';
import { searchSpecies } from './speciesSearch';
import type { StoredReview } from './types';

vi.mock('../offline/queueStore');
vi.mock('./reviewStore');

const userId = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-000000000002';
const second = '00000000-0000-4000-8000-000000000003';

describe('review policy', () => {
  it('accepts a species for a correction and only for a correction', () => {
    expect(isValidVerdict('correct', 'Zonotrichia capensis')).toBe(true);
    expect(isValidVerdict('confirm', null)).toBe(true);
    expect(isValidVerdict('discard', null)).toBe(true);
    for (const species of [null, '', ' Zonotrichia capensis', 'x'.repeat(201)]) expect(isValidVerdict('correct', species)).toBe(false);
    expect(isValidVerdict('confirm', 'Zonotrichia capensis')).toBe(false);
  });

  it('turns a correction to the species the model gave into a confirmation', () => {
    expect(correctionVerdict('Turdus fuscater', 'Turdus fuscater')).toEqual({ action: 'confirm', species: null });
    expect(correctionVerdict('Zonotrichia capensis', 'Turdus fuscater')).toEqual({ action: 'correct', species: 'Zonotrichia capensis' });
  });

  it('counts as presence only what was not discarded, under the species the person heard', () => {
    const records = [{ id: 'a', species: 'Turdus fuscater' }, { id: 'b', species: 'Turdus fuscater' }, { id: 'c', species: 'Turdus fuscater' }, { id: 'd', species: 'Turdus fuscater' }];
    const reviews: ReviewIndex = new Map([
      ['a', { action: 'discard', species: null }], ['b', { action: 'correct', species: 'Zonotrichia capensis' }], ['c', { action: 'confirm', species: null }],
    ]);
    expect(applyReviews(records, reviews)).toEqual([{ id: 'b', species: 'Zonotrichia capensis' }, { id: 'c', species: 'Turdus fuscater' }, { id: 'd', species: 'Turdus fuscater' }]);
    // The stored records are left as the model gave them.
    expect(records[1]?.species).toBe('Turdus fuscater');
  });

  it('sends the species only with a correction', () => {
    expect(reviewPayload({ action: 'correct', species: 'Zonotrichia capensis' })).toEqual({ action: 'correct', species: 'Zonotrichia capensis' });
    expect(reviewPayload({ action: 'discard', species: null })).toEqual({ action: 'discard' });
  });
});

describe('searchSpecies', () => {
  const names = {
    'Turdus fuscater': ['Mirlo Grande', 'Great Thrush'], 'Turdus ignobilis': ['Mirlo Piquinegro', 'Black-billed Thrush'],
    'Cinclus leucocephalus': ['Mirlo-acuático Coroniblanco', 'White-capped Dipper'], 'Colibri coruscans': ['Colibrí Rutilante', 'Sparkling Violetear'],
    'Chamaepetes goudotii': ['Pava Falcialar', 'Sickle-winged Guan'], 'Acanthis cabaret': ['', 'Lesser Redpoll'],
  };

  it('finds by common or scientific name, ignoring case and accents', () => {
    expect(searchSpecies(names, 'COLIBRI', 'es', 8).map((match) => match.scientificName)).toEqual(['Colibri coruscans']);
    expect(searchSpecies(names, 'turdus ig', 'es', 8)).toEqual([{ scientificName: 'Turdus ignobilis', name: 'Mirlo Piquinegro' }]);
    // Without a name in the language, the fallback name is searched and shown.
    expect(searchSpecies(names, 'redpoll', 'es', 8)).toEqual([{ scientificName: 'Acanthis cabaret', name: 'Lesser Redpoll' }]);
  });

  it('lists the names that start with the text first, and respects the limit', () => {
    expect(searchSpecies(names, 'mirlo', 'es', 8).map((match) => match.name)).toEqual(['Mirlo Grande', 'Mirlo Piquinegro', 'Mirlo-acuático Coroniblanco']);
    expect(searchSpecies(names, 'co', 'es', 8).map((match) => match.name)).toEqual(['Colibrí Rutilante', 'Mirlo-acuático Coroniblanco']);
    expect(searchSpecies(names, 'mirlo', 'es', 2)).toHaveLength(2);
  });

  it('puts the birds likely at the place before the rest of the catalogue', () => {
    const likely = new Set(['Turdus ignobilis', 'Cinclus leucocephalus']);
    // A likely bird that only contains the text still comes before an unlikely one that starts with it.
    expect(searchSpecies(names, 'mirlo', 'es', 8, likely).map((match) => match.name)).toEqual(['Mirlo Piquinegro', 'Mirlo-acuático Coroniblanco', 'Mirlo Grande']);
    expect(searchSpecies(names, 'mirlo', 'es', 1, likely)).toEqual([{ scientificName: 'Turdus ignobilis', name: 'Mirlo Piquinegro' }]);
  });

  it('waits for enough characters', () => {
    expect(searchSpecies(names, 'm', 'es', 8)).toEqual([]);
    expect(searchSpecies(names, '  ', 'es', 8)).toEqual([]);
  });
});

describe('syncReviews', () => {
  const review = (id: string, changes: Partial<StoredReview> = {}): StoredReview => ({ id, action: 'correct', species: 'Zonotrichia capensis', reviewedAt: '2026-10-11T12:05:00.000Z', sync: 'pending', ...changes });
  const synced = (id: string): HistoryEntry => ({ id, species: 'Turdus fuscater', confidence: 0.9, status: 'confirmed', recorded_at: '2026-10-11T12:00:00.000Z', siteId: null, syncedAt: '2026-10-11T12:01:00.000Z' });
  let settings: OfflineSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    settings = { maxBytes: DEFAULT_QUEUE_BYTES, locationEnabled: true, session: { userId, accessToken: 'test-token', expiresAt: Date.now() / 1000 + 3600 } };
    vi.mocked(getSettings).mockImplementation(() => Promise.resolve(structuredClone(settings)));
    vi.mocked(listHistory).mockResolvedValue([synced(first), synced(second)]);
    vi.mocked(markReview).mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({}))));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends each pending verdict whose detection the server has, and marks it done', async () => {
    vi.mocked(listReviews).mockResolvedValue([review(first), review(second, { action: 'discard', species: null }), review('00000000-0000-4000-8000-000000000009')]);
    await syncReviews(userId);
    const sent = vi.mocked(fetch).mock.calls.map(([url, init]) => [(url as string).split('/').pop(), init?.method, JSON.parse(init?.body as string) as unknown]);
    expect(sent).toEqual([[first, 'PATCH', { action: 'correct', species: 'Zonotrichia capensis' }], [second, 'PATCH', { action: 'discard' }]]);
    expect(vi.mocked(markReview).mock.calls.map(([sentReview, state]) => [sentReview.id, state])).toEqual([[first, 'done'], [second, 'done']]);
  });

  it.each(['signed-out', 'expired', 'other-account', 'already-sent'])('sends nothing when it must not: %s', async (reason) => {
    vi.mocked(listReviews).mockResolvedValue([review(first, reason === 'already-sent' ? { sync: 'done' } : {})]);
    if (reason === 'signed-out') settings.session = null;
    if (reason === 'expired' && settings.session) settings.session.expiresAt = 0;
    await syncReviews(reason === 'other-account' ? second : userId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops asking about a detection that belongs to another account, and keeps the rest for a retry on failure', async () => {
    vi.mocked(listReviews).mockResolvedValue([review(first), review(second)]);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(syncReviews(userId)).rejects.toThrow();
    expect(vi.mocked(markReview).mock.calls.map(([sentReview, state]) => [sentReview.id, state])).toEqual([[first, 'rejected']]);
  });
});
