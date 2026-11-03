import { describe, expect, it } from 'vitest';
import { parseAccountDetection } from './accountDetection';

const answer = {
  id: '0a1b2c3d-0000-4000-8000-000000000001', species: 'Zonotrichia capensis', model_species: 'Turdus fuscater', confidence: 0.62,
  status: 'corrected', reviewed_by: 'person', recorded_at: '2026-10-12T23:30:00Z', latitude: 4.679, longitude: -74.123,
  site_id: null, site_name: null, note: 'dos machos', individuals: 2, has_recording: true,
};

describe('a song kept only in the account (ADR-44)', () => {
  it('reads as a record of the log, with the verdict apart from what the model said', () => {
    const found = parseAccountDetection(answer);
    expect(found?.record).toEqual({
      id: answer.id, species: 'Zonotrichia capensis', confidence: 0.62, status: 'provisional', recordedAt: Date.parse(answer.recorded_at),
      siteId: null, upload: 'cloud', located: true, review: 'correct', modelSpecies: 'Turdus fuscater',
    });
    expect(found?.note).toEqual({ note: 'dos machos', individuals: 2 });
    expect(found?.hasRecording).toBe(true);
  });

  it('keeps the state the model gave when nobody reviewed it, and marks a discarded one as such', () => {
    expect(parseAccountDetection({ ...answer, status: 'confirmed', model_species: null, reviewed_by: null })?.record)
      .toMatchObject({ status: 'confirmed', review: null });
    expect(parseAccountDetection({ ...answer, status: 'discarded', confidence: 0.9 })?.record).toMatchObject({ status: 'confirmed', review: 'discard' });
  });

  it('refuses an answer that breaks the contract', () => {
    expect(parseAccountDetection(null)).toBeNull();
    expect(parseAccountDetection({ ...answer, status: 'approved' })).toBeNull();
    expect(parseAccountDetection({ ...answer, recorded_at: 'yesterday' })).toBeNull();
    expect(parseAccountDetection({ ...answer, individuals: 1.5 })).toBeNull();
    expect(parseAccountDetection({ ...answer, has_recording: 'yes' })).toBeNull();
  });
});
