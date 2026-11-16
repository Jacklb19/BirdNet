import { afterEach, expect, it, vi } from 'vitest';
import { INTENTS, TOPICS } from './assistant.config';
import { askPublicQuestion, failureOf, fetchTextPolicy, publicTutor, queryJournal } from './assistantApi';
import { parseInterpretation, parsePolicy, parseQueryAnswer, parseQuestion, parseTutor, parseTutorResponse, parseUsage } from './parsers';
import { mergePage, nextQuestion, rowKey, structuredQuestion } from './queryPlan';
import type { Intent } from './types';

const id = '00000000-0000-4000-8000-000000000001'; const at = '2026-11-15T12:00:00.123456Z'; const species = 'Turdus fuscater';
const usage = { input_tokens: 100, output_tokens: 50, total_tokens: 150 };
const measure = { model: 'test', generated_at: at, usage };
const policy = { version: 'assistant-text-v1', provider: 'Google Gemini', terms_url: 'https://aistudio.google.com/docs/terms', max_text_characters: 900, max_output_tokens: 1200 };
const fixtures: Record<Intent, { filters: object; totals: object; row: object }> = {
  detections: { filters: { species, since: null, until: null, review: 'pending' }, totals: { detections: 1, species: 1 }, row: { id, species, confidence: 0.6, status: 'provisional', recorded_at: at, has_recording: true } },
  species: { filters: { species, since: at, until: null }, totals: { detections: 1, species: 1 }, row: { species, detections: 1, best_confidence: 0.9, first_recorded_at: at, last_recorded_at: at } },
  outings: { filters: { since: null, until: null }, totals: { outings: 1 }, row: { id, version: 1, title: 'Dawn', kind: 'walk', started_at: at, ended_at: at, detections: 1, observations: 1, species: 1 } },
  observations: { filters: { species, since: null, until: null, outing_id: id }, totals: { observations: 1, species: 1 }, row: { id, version: 1, source: 'manual', species, observed_at: at, individuals: 2, outing_id: id } },
  collections: { filters: {}, totals: { collections: 1 }, row: { id, version: 1, name: 'Garden', created_at: at, updated_at: at, items: 1 } },
  wishlist: { filters: { species }, totals: { species: 1 }, row: { species, created_at: at } },
};
const tutor = { ...measure, topic: 'confidence', species: null, locale: 'es', paragraphs: ['A model score is not verification.'], sources: [{ name: 'Guide', url: 'https://example.org/guide', license: null }, { name: 'Public rules', url: null, license: 'CC BY' }] };
afterEach(() => { vi.unstubAllGlobals(); });
it.each(INTENTS)('validates and paginates the %s contract without adding filters or model usage', (intent) => {
  const fixture = fixtures[intent]; const question = structuredQuestion(intent, 'en', species, 'week', true, Date.parse(at));
  expect(parseQuestion(question)).toEqual(question);
  const body = { intent, filters: fixture.filters, totals: fixture.totals, [intent]: [fixture.row], has_more: true, usage: null };
  const answer = parseQueryAnswer(body); expect(answer.rows.map(rowKey)).toHaveLength(1);
  const next = nextQuestion(question, answer); expect(next.intent).toBe(intent);
  expect(mergePage(answer, { ...answer, hasMore: false }).rows).toHaveLength(1);
  expect(() => nextQuestion(next, answer)).toThrow(); expect(() => parseQueryAnswer({ ...body, usage })).toThrow(); expect(() => parseQueryAnswer({ ...body, [intent]: [] })).toThrow();
  expect(() => nextQuestion(question, { ...answer, hasMore: false })).toThrow();
});
it.each([
  { limit: 0 }, { limit: 51 }, { locale: 'fr' }, { tz: 'Invalid/Zone' }, { before: at }, { after_id: id },
  { species: 'mirlo' }, { since: at, until: at }, { since: '2026-02-30T00:00:00Z' }, { review: 'verified' }, { since: '2026-01-01T00:00:00' }, { limit: 1.2 },
])('rejects an invalid deterministic query boundary: %j', (change) => {
  expect(() => parseQuestion({ ...structuredQuestion('detections', 'es', '', 'all', false), ...change })).toThrow();
});
it('validates policy versions, truthful usage and public tutor sources without accepting unsafe links', () => {
  expect(parsePolicy(policy)).toEqual(policy); expect(() => parsePolicy({ ...policy, max_text_characters: 1000 })).toThrow();
  expect(parseUsage(usage)).toEqual(usage); expect(() => parseUsage({ ...usage, total_tokens: -1 })).toThrow();
  expect(parseTutor(tutor).sources).toHaveLength(2);
  for (const url of ['http://example.org', 'javascript:alert(1)', 'https://user:pass@example.org']) expect(() => parseTutor({ ...tutor, sources: [{ name: 'Bad', url, license: null }] })).toThrow();
  expect(() => parseTutor({ ...tutor, species })).toThrow(); expect(() => parseTutor({ ...tutor, sources: [] })).toThrow(); expect(() => parseTutor({ ...tutor, paragraphs: [] })).toThrow();
  expect(parseTutorResponse({ status: 'answered', answer: tutor }).status).toBe('answered');
  expect(parseTutorResponse({ ...measure, status: 'rejected', topic: 'species_facts', species, locale: 'en', reason_code: 'insufficient_public_facts' }).status).toBe('rejected');
  expect(() => parseTutorResponse({ ...measure, status: 'rejected', topic: 'confidence', species, locale: 'en', reason_code: 'identification_request' })).toThrow();
});
it('accepts clarification and rejection but never a private reference or cursor in an initial interpreted plan', () => {
  expect(parseInterpretation({ ...measure, status: 'clarification', reason_code: 'ambiguous_species' }).status).toBe('clarification');
  expect(parseInterpretation({ ...measure, status: 'rejected', reason_code: 'outside_scope' }).status).toBe('rejected');
  const question = structuredQuestion('observations', 'es', '', 'all', false);
  expect(parseInterpretation({ ...measure, status: 'ready', query: question }).status).toBe('ready');
  expect(() => parseInterpretation({ ...measure, status: 'ready', query: { ...question, outing_id: id } })).toThrow();
  expect(() => parseInterpretation({ ...measure, status: 'ready', query: { ...question, before: at, after_id: id } })).toThrow();
  expect(() => mergePage(parseQueryAnswer({ intent: 'collections', ...fixtures.collections, collections: [], has_more: false, usage: null }), {} as never)).toThrow();
});
it.each(TOPICS)('restricts tutor requests to the %s public context', async (topic) => {
  const answer = { ...tutor, topic, species: topic === 'species_facts' ? species : null };
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(answer))).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'answered', answer })));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  expect((await publicTutor('token', topic, answer.species, 'es', controller.signal)).topic).toBe(topic);
  expect((await askPublicQuestion('token', topic, answer.species, 'Explain this topic', 'es', { version: policy.version, accepted: true }, controller.signal)).status).toBe('answered');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 413, 422, 429, 502, 503])('maps an HTTP %s failure without reflecting submitted text', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'PRIVATE INPUT' }), { status })));
  await expect(fetchTextPolicy('token', new AbortController().signal)).rejects.not.toThrow('PRIVATE INPUT');
  expect(failureOf(new Error('PRIVATE INPUT'))).toBe('invalid');
  expect(failureOf(new TypeError('Fetch failed'))).toBe('network');
});
it('rejects a response for a different intent and leaves missing-token requests local', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ intent: 'collections', filters: {}, totals: { collections: 0 }, collections: [], has_more: false, usage: null })));
  vi.stubGlobal('fetch', fetch);
  await expect(queryJournal('token', structuredQuestion('outings', 'es', '', 'all', false), new AbortController().signal)).rejects.toThrow();
  await expect(fetchTextPolicy('', new AbortController().signal)).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
});
