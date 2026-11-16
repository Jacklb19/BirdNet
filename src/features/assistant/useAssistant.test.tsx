import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stopAccountActivity } from '../account/sessionActivity';
import { CONSENT_VERSION } from './assistant.config';
import { askPublicQuestion, fetchTextPolicy, interpretText, queryJournal } from './assistantApi';
import { clearAssistantConsent, hasAssistantConsent } from './consent';
import { plan, planQuestion } from './plan';
import type { Interpretation, JournalAnswer, TextPolicy } from './types';
import { useAssistant } from './useAssistant';

vi.mock('./assistantApi', async (original) => ({ ...await original<typeof import('./assistantApi')>(), askPublicQuestion: vi.fn(), fetchTextPolicy: vi.fn(), interpretText: vi.fn(), queryJournal: vi.fn() }));
vi.mock('../species/speciesNames', async (original) => ({ ...await original<typeof import('../species/speciesNames')>(), useSpeciesNames: () => ({ 'Turdus fuscater': ['Mirlo grande', 'Great Thrush'] }) }));

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const policy: TextPolicy = { version: CONSENT_VERSION, provider: 'Google Gemini', terms_url: 'https://aistudio.google.com/docs/terms', max_text_characters: 900, max_output_tokens: 1200 };
const usage = { input_tokens: null, output_tokens: null, total_tokens: null };
const collections = plan('collections');
const ready: Interpretation = { status: 'ready', query: planQuestion(collections, 'es', 'UTC', new Date()) ?? (() => { throw new Error('No question.'); })(), plan: collections, model: 'test', generatedAt: '2026-11-15T12:00:00Z', usage };
const answer: JournalAnswer = { intent: 'detections', filters: {}, totals: { detections: 1, species: 1 }, hasMore: false,
  rows: [{ kind: 'detection', id, species: 'Turdus fuscater', at: '2026-11-15T10:00:00Z', confidence: 0.9, status: 'confirmed', hasRecording: false }] };

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(fetchTextPolicy).mockResolvedValue(policy); vi.mocked(queryJournal).mockResolvedValue(answer); });
// Leaving the account forgets the thread kept in memory for the tab, so every test starts with an empty one.
afterEach(async () => { await stopAccountActivity(); cleanup(); });

async function mounted(account = owner) {
  const hook = renderHook(() => useAssistant(account, 'token', 'es'));
  await waitFor(() => { expect(hook.result.current.policy).toEqual(policy); });
  return hook;
}

it('answers the brief’s follow-ups on the phone: no text leaves it and no consent is needed', async () => {
  const { result } = await mounted();
  await act(async () => { result.current.send('Muéstrame mis registros de esta semana'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.active?.plan.period).toEqual({ kind: 'relative', value: 'this_week' }); });
  await act(async () => { result.current.send('¿Y ayer?'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.active?.plan.period).toEqual({ kind: 'relative', value: 'yesterday' }); });
  await act(async () => { result.current.send('Solo los provisionales'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.active?.plan.review).toBe('pending'); });
  expect(queryJournal).toHaveBeenCalledTimes(3);
  expect(interpretText).not.toHaveBeenCalled();
  const last = vi.mocked(queryJournal).mock.calls.at(-1)?.[1];
  expect(last).toMatchObject({ intent: 'detections', review: 'pending', limit: 5 });
  window.location.hash = '#/assistant';
  act(() => { result.current.send('Abre el primero'); });
  expect(window.location.hash).toBe(`#/log/${id}`);
});

it('asks for consent before sending text, then makes one provider call and runs the clear plan directly', async () => {
  vi.mocked(interpretText).mockResolvedValue(ready);
  const { result } = await mounted();
  await act(async () => { result.current.send('Mis cuadernos favoritos'); await Promise.resolve(); });
  expect(interpretText).not.toHaveBeenCalled();
  expect(result.current.messages.at(-1)).toMatchObject({ kind: 'consent', text: 'Mis cuadernos favoritos' });
  act(() => { result.current.approveAndSend('Mis cuadernos favoritos'); });
  await waitFor(() => { expect(result.current.active?.plan).toEqual(collections); });
  expect(interpretText).toHaveBeenCalledTimes(1);
  expect(vi.mocked(interpretText).mock.calls[0]?.[2]).toBeNull();
  expect(queryJournal).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('Mis cuadernos favoritos')).toBeNull();
});

it('sends the active plan, and only it, as the context of a follow-up the phone cannot resolve', async () => {
  vi.mocked(interpretText).mockResolvedValue(ready);
  const { result } = await mounted();
  act(() => { result.current.approve(); });
  await act(async () => { result.current.send('Mis registros de esta semana'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.active).not.toBeNull(); });
  await act(async () => { result.current.send('¿y los del humedal?'); await Promise.resolve(); });
  await waitFor(() => { expect(interpretText).toHaveBeenCalledTimes(1); });
  expect(vi.mocked(interpretText).mock.calls[0]?.[2]).toEqual(plan('detections', { period: { kind: 'relative', value: 'this_week' } }));
});

it.each(['withdraw', 'logout'] as const)('ignores a late interpretation after %s and forgets the thread', async (action) => {
  let deliver: (value: Interpretation) => void = () => undefined;
  vi.mocked(interpretText).mockImplementation(() => new Promise((resolve) => { deliver = resolve; }));
  const { result } = await mounted();
  act(() => { result.current.approve(); });
  act(() => { result.current.send('Mis cuadernos favoritos'); });
  await waitFor(() => { expect(interpretText).toHaveBeenCalledTimes(1); });
  await act(async () => { if (action === 'withdraw') result.current.withdraw(); else await stopAccountActivity(); });
  await act(async () => { deliver(ready); await Promise.resolve(); });
  expect(queryJournal).not.toHaveBeenCalled();
  expect(result.current.active).toBeNull();
  if (action === 'withdraw') { expect(hasAssistantConsent(owner, CONSENT_VERSION)).toBe(false); expect(result.current.messages).toEqual([]); }
});

it('keeps each account’s thread to itself', async () => {
  const first = await mounted();
  await act(async () => { first.result.current.send('Mis registros de hoy'); await Promise.resolve(); });
  await waitFor(() => { expect(first.result.current.messages.length).toBeGreaterThan(1); });
  first.unmount();
  const second = await mounted(other);
  expect(second.result.current.messages).toEqual([]);
});

it('withdraws stale consent without sending text when the server notice changes', async () => {
  const { result } = await mounted();
  act(() => { result.current.approve(); });
  vi.mocked(fetchTextPolicy).mockResolvedValue({ ...policy, version: 'future-version' });
  await act(async () => { result.current.send('Mis cuadernos favoritos'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.accepted).toBe(false); });
  expect(interpretText).not.toHaveBeenCalled(); expect(queryJournal).not.toHaveBeenCalled();
});

it('forgets an unmounted conversation when leaving the account', async () => {
  const first = await mounted();
  await act(async () => { first.result.current.send('Mis registros'); await Promise.resolve(); });
  await waitFor(() => { expect(first.result.current.active).not.toBeNull(); });
  first.unmount();
  const back = await mounted();
  expect(back.result.current.active).not.toBeNull();
  back.unmount();
  await stopAccountActivity();
  const signedInAgain = await mounted();
  expect(signedInAgain.result.current.messages).toEqual([]);
});

it('forgets a conversation and cancels late work when consent is withdrawn elsewhere', async () => {
  let deliver: (value: JournalAnswer) => void = () => undefined;
  const { result } = await mounted();
  act(() => { result.current.approve(); });
  vi.mocked(queryJournal).mockImplementation(() => new Promise((resolve) => { deliver = resolve; }));
  act(() => { result.current.send('Mis registros'); });
  await waitFor(() => { expect(queryJournal).toHaveBeenCalledTimes(1); });
  act(() => { clearAssistantConsent(owner); });
  await act(async () => { deliver(answer); await Promise.resolve(); });
  expect(result.current.messages).toEqual([]);
  expect(result.current.active).toBeNull();
});

it('explains public species facts with one consented call and no private query context', async () => {
  vi.mocked(askPublicQuestion).mockResolvedValue({ status: 'answered', answer: {
    topic: 'species_facts', species: 'Turdus fuscater', locale: 'es', paragraphs: ['Hechos públicos.'], sources: [],
    model: 'test', generatedAt: '2026-11-16T12:00:00Z', usage,
  } });
  const { result } = await mounted();
  await act(async () => { result.current.send('Mis registros'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.active).not.toBeNull(); });
  act(() => { result.current.send('Cuéntame sobre el mirlo grande'); });
  expect(askPublicQuestion).not.toHaveBeenCalled();
  act(() => { result.current.approveAndSend('Cuéntame sobre el mirlo grande'); });
  await waitFor(() => { expect(result.current.messages.at(-1)?.kind).toBe('tutor'); });
  expect(askPublicQuestion).toHaveBeenCalledTimes(1);
  expect(vi.mocked(askPublicQuestion).mock.calls[0]?.slice(0, 6)).toEqual([
    'token', 'species_facts', 'Turdus fuscater', 'Cuéntame sobre el mirlo grande', 'es', { version: CONSENT_VERSION, accepted: true },
  ]);
  expect(interpretText).not.toHaveBeenCalled();
  expect(queryJournal).toHaveBeenCalledTimes(1);
});

it('does not repeat a completed query when asked for more', async () => {
  const { result } = await mounted();
  await act(async () => { result.current.send('Mis registros'); await Promise.resolve(); });
  await waitFor(() => { expect(result.current.active).not.toBeNull(); });
  await act(async () => { result.current.send('Más'); await Promise.resolve(); });
  expect(queryJournal).toHaveBeenCalledTimes(1);
  expect(result.current.messages.at(-1)?.kind).toBe('noMore');
});
