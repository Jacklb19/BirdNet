import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stopAccountActivity } from '../account/sessionActivity';
import { CONSENT_VERSION } from './assistant.config';
import { fetchTextPolicy, interpretText, queryJournal } from './assistantApi';
import { hasAssistantConsent } from './consent';
import { structuredQuestion } from './queryPlan';
import type { Interpretation, TextPolicy } from './types';
import { useAssistant } from './useAssistant';

vi.mock('./assistantApi', async (original) => ({ ...await original<typeof import('./assistantApi')>(), fetchTextPolicy: vi.fn(), interpretText: vi.fn(), queryJournal: vi.fn() }));
const owner = '00000000-0000-4000-8000-000000000001';
const policy: TextPolicy = { version: CONSENT_VERSION, provider: 'Google Gemini', terms_url: 'https://aistudio.google.com/docs/terms', max_text_characters: 900, max_output_tokens: 1200 };
const plan: Interpretation = { status: 'ready', query: structuredQuestion('detections', 'es', '', 'all', false), model: 'test', generatedAt: '2026-11-15T12:00:00Z', usage: { input_tokens: null, output_tokens: null, total_tokens: null } };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(fetchTextPolicy).mockResolvedValue(policy); });
afterEach(() => { cleanup(); });

it('requires consent and leaves an interpreted plan unexecuted until confirmation', async () => {
  vi.mocked(interpretText).mockResolvedValue(plan);
  const { result } = renderHook(() => useAssistant(owner, 'token', 'es'));
  await waitFor(() => { expect(result.current.policy).toEqual(policy); });
  act(() => { result.current.setText('Mis cantos'); });
  await act(async () => { await result.current.interpret(); });
  expect(interpretText).not.toHaveBeenCalled();
  act(() => { result.current.approve(); result.current.setText('Mis cantos'); });
  await act(async () => { await result.current.interpret(); });
  expect(result.current.interpretation).toEqual(plan);
  expect(result.current.text).toBe('');
  expect(queryJournal).not.toHaveBeenCalled();
  expect(localStorage.getItem('Mis cantos')).toBeNull();
});

it.each(['withdraw', 'logout'] as const)('ignores a late interpretation after %s', async (action) => {
  let deliver: (value: Interpretation) => void = () => undefined;
  vi.mocked(interpretText).mockImplementation(() => new Promise((resolve) => { deliver = resolve; }));
  const { result } = renderHook(() => useAssistant(owner, 'token', 'es'));
  await waitFor(() => { expect(result.current.policy).toEqual(policy); });
  act(() => { result.current.approve(); result.current.setText('Mis cantos'); });
  let pending: Promise<void> = Promise.resolve();
  act(() => { pending = result.current.interpret(); });
  await waitFor(() => { expect(interpretText).toHaveBeenCalledTimes(1); });
  await act(async () => { if (action === 'withdraw') result.current.withdraw(); else await stopAccountActivity(); });
  await act(async () => { deliver(plan); await pending; });
  expect(result.current.interpretation).toBeNull(); expect(result.current.answer).toBeNull(); expect(result.current.text).toBe('');
  if (action === 'withdraw') expect(hasAssistantConsent(owner, CONSENT_VERSION)).toBe(false);
  expect(queryJournal).not.toHaveBeenCalled();
});

it('withdraws stale consent without retrying text when the server notice changes', async () => {
  const { result } = renderHook(() => useAssistant(owner, 'token', 'es'));
  await waitFor(() => { expect(result.current.policy).toEqual(policy); });
  act(() => { result.current.approve(); result.current.setText('Mis cantos'); });
  vi.mocked(fetchTextPolicy).mockResolvedValue({ ...policy, version: 'future-version' });
  await act(async () => { await result.current.interpret(); });
  expect(result.current.accepted).toBe(false); expect(result.current.error).toBe('policyChanged');
  expect(interpretText).not.toHaveBeenCalled(); expect(queryJournal).not.toHaveBeenCalled();
});
