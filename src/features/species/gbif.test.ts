// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { config } from '../../config/env';
import { isTaxonUrl } from '../offline/photoCache';
import { IUCN_CODES, IUCN_SCALE, parseIucnCode, parseRangeExtent, parseTaxon, rangeTileUrl, taxonMatchUrl } from './gbif';

/** Answer of `GET /v1/species/match?name=Turdus fuscater`, as GBIF returned it on 2026-10-10. */
const MATCH = {
  usageKey: 2490717, scientificName: 'Turdus fuscater Orbigny & Lafresnaye, 1837', canonicalName: 'Turdus fuscater', rank: 'SPECIES',
  status: 'ACCEPTED', confidence: 99, matchType: 'EXACT', kingdom: 'Animalia', phylum: 'Chordata', order: 'Passeriformes', family: 'Turdidae',
  genus: 'Turdus', species: 'Turdus fuscater', kingdomKey: 1, phylumKey: 44, classKey: 212, orderKey: 729, familyKey: 5290, genusKey: 2490714,
  speciesKey: 2490717, class: 'Aves',
};

describe('GBIF name match', () => {
  it('accepts an exact bird species and reads its classification', () => {
    expect(parseTaxon(MATCH)).toEqual({ key: 2490717, order: 'Passeriformes', family: 'Turdidae', genus: 'Turdus', canonicalName: 'Turdus fuscater' });
  });
  it('follows a synonym to the accepted species, where the records are', () => {
    // "Dendroica fusca" (BirdNET's checklist) is a synonym of Setophaga fusca in GBIF.
    const synonym = { ...MATCH, usageKey: 2489913, acceptedUsageKey: 6093199, status: 'SYNONYM', canonicalName: 'Dendroica fusca', family: 'Parulidae', genus: 'Setophaga' };
    expect(parseTaxon(synonym)?.key).toBe(6093199);
    expect(parseTaxon({ ...synonym, acceptedUsageKey: 'x' })).toBeNull();
  });
  it.each([
    ['a fuzzy match', { matchType: 'FUZZY' }],
    // "Turdus" alone answers with a species-rank placeholder of the genus, flagged HIGHERRANK.
    ['a higher-rank match', { matchType: 'HIGHERRANK', canonicalName: 'Turdus' }],
    ['a genus', { rank: 'GENUS' }],
    ['a plant', { kingdom: 'Plantae', class: 'Magnoliopsida' }],
    ['an animal that is not a bird', { class: 'Insecta' }],
  ])('rejects %s', (_case, changes) => {
    expect(parseTaxon({ ...MATCH, ...changes })).toBeNull();
  });
  it('rejects a body without a match or with malformed fields', () => {
    expect(parseTaxon({ confidence: 100, matchType: 'NONE', synonym: false })).toBeNull();
    for (const body of [null, 'Turdus fuscater', [], { ...MATCH, usageKey: '2490717' }, { ...MATCH, usageKey: -1 }, { ...MATCH, usageKey: 1.5 },
      { ...MATCH, order: '' }, { ...MATCH, family: 7 }, { ...MATCH, genus: undefined }, { ...MATCH, canonicalName: ' ' }]) {
      expect(parseTaxon(body), JSON.stringify(body)).toBeNull();
    }
  });
  it('asks for the name as a bird', () => {
    const url = new URL(taxonMatchUrl('  Turdus fuscater '));
    expect(url.href.startsWith(`${config.gbif.apiUrl}/species/match?`)).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'Turdus fuscater', kingdom: 'Animalia', class: 'Aves' });
  });
});

describe('IUCN Red List category', () => {
  it('reads every category the card can name', () => {
    // Shape of `GET /v1/species/2490717/iucnRedListCategory`.
    expect(parseIucnCode({ category: 'LEAST_CONCERN', usageKey: 176633823, taxonomicStatus: 'ACCEPTED', iucnTaxonID: '22708848', code: 'LC' })).toBe('LC');
    for (const code of IUCN_CODES) expect(parseIucnCode({ code })).toBe(code);
    // The dots of the threat scale are drawn from these, in this order.
    expect(IUCN_SCALE).toEqual(['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX']);
  });
  it('treats a code it cannot name or a malformed body as unknown', () => {
    for (const body of [{ code: 'RE' }, { code: 'lc' }, { code: 3 }, { category: 'VULNERABLE' }, {}, null, 'LC']) expect(parseIucnCode(body)).toBeNull();
  });
});

describe('range map', () => {
  it('builds the tile template MapLibre fills in, for the species and the screen density', () => {
    const template = rangeTileUrl(2490717);
    expect(template.startsWith(`${config.gbif.tilesUrl}/{z}/{x}/{y}@1x.png?`)).toBe(true);
    const params = new URL(template.replace('{z}/{x}/{y}', '0/0/0')).searchParams;
    expect(params.get('taxonKey')).toBe('2490717');
    expect(params.get('bin')).toBe('hex');
    expect(params.get('srs')).toBe('EPSG:3857');
    // Hexagon bins need a polygon style; a point style would draw nothing.
    expect(params.get('style')?.endsWith('.poly')).toBe(true);
    expect(Number(params.get('hexPerTile'))).toBeGreaterThan(0);
    expect(rangeTileUrl(5231103, 2)).toContain('/{z}/{x}/{y}@2x.png?taxonKey=5231103&');
  });
  it('reads the record count and the box of the records', () => {
    // Shape of `GET /v2/map/occurrence/density/capabilities.json?taxonKey=2490717`.
    const body = { minLat: -37, maxLat: 28, minLng: -82, maxLng: -62, minYear: 1878, maxYear: 2026, total: 315699, generated: '2026-10-10T02:00Z' };
    expect(parseRangeExtent(body)).toEqual({ records: 315699, bounds: [-82, -37, -62, 28] });
    // A taxon without records answers with the whole globe and a count of zero.
    expect(parseRangeExtent({ minLat: -90, maxLat: 90, minLng: -180, maxLng: 180, total: 0 })?.records).toBe(0);
  });
  it('keeps the count but frames the world when the box is not usable', () => {
    // Regression: GBIF answered minLng 116, maxLng 359 for Setophaga fusca (a box across the antimeridian).
    expect(parseRangeExtent({ minLat: -24, maxLat: 68, minLng: 116, maxLng: 359, total: 1243408 })).toEqual({ records: 1243408, bounds: null });
    expect(parseRangeExtent({ minLat: 10, maxLat: -10, minLng: 0, maxLng: 5, total: 3 })?.bounds).toBeNull();
    expect(parseRangeExtent({ total: 3 })?.bounds).toBeNull();
    for (const body of [{ total: -1 }, { total: '3' }, { total: 1.5 }, {}, null]) expect(parseRangeExtent(body)).toBeNull();
  });
});

describe('offline copy of the GBIF answers', () => {
  it('keeps the classification and the Red List category, never the map', () => {
    expect(isTaxonUrl(new URL(taxonMatchUrl('Turdus fuscater')))).toBe(true);
    expect(isTaxonUrl(new URL(`${config.gbif.apiUrl}/species/2490717/iucnRedListCategory`))).toBe(true);
    expect(isTaxonUrl(new URL(rangeTileUrl(2490717).replace('{z}/{x}/{y}', '3/2/3')))).toBe(false);
    expect(isTaxonUrl(new URL(`${config.gbif.tilesUrl}/capabilities.json?taxonKey=2490717`))).toBe(false);
    expect(isTaxonUrl(new URL(taxonMatchUrl('Turdus fuscater').replace('https:', 'http:')))).toBe(false);
    expect(isTaxonUrl(new URL('https://foreign.example/v1/species/match?name=Turdus'))).toBe(false);
  });
});
