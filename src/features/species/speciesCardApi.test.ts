import { describe, expect, it } from 'vitest';
import { ApiError } from '../../config/api';
import { failureOf, parseWrittenCard } from './speciesCardApi';

const body = {
  species: 'Turdus fuscater', locale: 'es', paragraphs: ['La mirla patiamarilla es un ave de la familia Turdidae.'],
  sources: [{ name: 'GBIF', url: 'https://www.gbif.org/species/7', license: 'CC BY 4.0' }],
  model: 'gemini', generated_at: '2026-10-21T15:00:00Z', stale: false,
};

describe('a species card written by the language model', () => {
  it('keeps its text, its sources and when it was written', () => {
    expect(parseWrittenCard(body)).toEqual({ paragraphs: body.paragraphs, sources: body.sources, generatedAt: body.generated_at, stale: false });
  });

  it('is never drawn with a source link that is not https or without text', () => {
    expect(() => parseWrittenCard({ ...body, sources: [{ ...body.sources[0], url: 'javascript:alert(1)' }] })).toThrow();
    expect(() => parseWrittenCard({ ...body, paragraphs: [] })).toThrow();
    expect(() => parseWrittenCard({ ...body, generated_at: 'yesterday' })).toThrow();
  });

  it('tells apart the reasons a card could not be written', () => {
    expect(failureOf(new ApiError(422))).toBe('unknownSpecies');
    expect(failureOf(new ApiError(429))).toBe('quota');
    expect(failureOf(new ApiError(503))).toBe('unavailable');
    expect(failureOf(new TypeError('Failed to fetch'))).toBe('unavailable');
  });
});
