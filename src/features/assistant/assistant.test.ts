import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_VERSION } from './assistant.config';
import { interpretText, queryJournal } from './assistantApi';
import { clearAssistantConsent, hasAssistantConsent, saveAssistantConsent } from './consent';
import { parseQuestion, parseQueryAnswer, timestamp } from './parsers';
import { plan, planQuestion } from './plan';
import { mergePage, nextQuestion } from './queryPlan';
import type { Consent } from './types';

const id = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const at = '2026-11-15T10:00:00.123456Z';
const consent = { version: CONSENT_VERSION, accepted: true } as const;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('private assistant boundaries', () => {
  it('keeps consent specific to the current account and notice, with explicit withdrawal', () => {
    expect(hasAssistantConsent(owner, CONSENT_VERSION)).toBe(false);
    expect(saveAssistantConsent(owner, CONSENT_VERSION)).toBe(true);
    expect(hasAssistantConsent(owner, CONSENT_VERSION)).toBe(true);
    expect(hasAssistantConsent(id, CONSENT_VERSION)).toBe(false);
    expect(hasAssistantConsent(owner, 'changed')).toBe(false);
    clearAssistantConsent(owner);
    expect(hasAssistantConsent(owner, CONSENT_VERSION)).toBe(false);
  });
  it('rejects missing consent and invalid text before making any HTTP request', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(() => interpretText('token', 'Show birds', null, 'es', 'UTC', { version: CONSENT_VERSION, accepted: false } as unknown as Consent, new AbortController().signal)).toThrow();
    expect(() => interpretText('token', '\ud800', null, 'es', 'UTC', consent, new AbortController().signal)).toThrow();
    expect(() => interpretText('token', 'x'.repeat(901), null, 'es', 'UTC', consent, new AbortController().signal)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only the explicitly written text and declared interpretation fields', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'clarification', reason_code: 'ambiguous_species', model: 'test', generated_at: at, usage: { input_tokens: null, output_tokens: null, total_tokens: null } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await interpretText('token', '  Show birds  ', null, 'es', 'UTC', consent, new AbortController().signal);
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    if (typeof options.body !== 'string') throw new Error('Missing request body.');
    expect(JSON.parse(options.body)).toEqual({ text: 'Show birds', locale: 'es', tz: 'UTC', limit: 5, consent });
  });
  it('sends with a follow-up only the descriptors of the active plan', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'clarification', reason_code: 'ambiguous_period', model: 'test', generated_at: at, usage: { input_tokens: null, output_tokens: null, total_tokens: null } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const context = plan('detections', { species: 'Turdus fuscater', period: { kind: 'relative', value: 'this_week' }, review: 'pending' });
    await interpretText('token', '¿Y ayer?', context, 'es', 'UTC', consent, new AbortController().signal);
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    if (typeof options.body !== 'string') throw new Error('Missing request body.');
    expect(JSON.parse(options.body)).toEqual({ text: '¿Y ayer?', locale: 'es', tz: 'UTC', limit: 5, consent, context });
    // Anything beyond the plan's descriptors is refused before a request is made.
    const leaky = { ...context, notes: 'private', outing_id: id } as unknown as typeof context;
    expect(() => interpretText('token', '¿Y ayer?', leaky, 'es', 'UTC', consent, new AbortController().signal)).toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not accept a private attachment or unknown query filter', () => {
    const base = planQuestion(plan('species'), 'es', 'UTC', new Date());
    expect(() => parseQuestion({ ...base, notes: 'private-note' })).toThrow();
    expect(() => parseQuestion({ ...base, sql: 'SELECT private' })).toThrow();
    expect(() => timestamp('2026-02-30T12:00:00Z')).toThrow();
  });
  it('retains a timestamp and identifier cursor without rounding microseconds or asking Gemini again', async () => {
    const question = planQuestion(plan('detections'), 'es', 'UTC', new Date()); if (!question) throw new Error('No question.');
    const answer = parseQueryAnswer({ intent: 'detections', filters: { species: null, since: null, until: null, review: 'all' }, totals: { detections: 2, species: 1 },
      detections: [{ id, species: 'Turdus fuscater', confidence: 0.9, status: 'confirmed', recorded_at: at, has_recording: false }], has_more: true, usage: null });
    const next = nextQuestion(question, answer);
    expect(next).toMatchObject({ before: at, after_id: id });
    const page = { ...answer, hasMore: false };
    expect(mergePage(answer, page).rows).toHaveLength(1);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ intent: 'detections', filters: answer.filters, totals: answer.totals, detections: [], has_more: false, usage: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await queryJournal('token', next, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/assistant/query');
  });
});
