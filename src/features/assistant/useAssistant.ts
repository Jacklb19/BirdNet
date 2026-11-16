import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../../i18n';
import { registerAccountActivity } from '../account/sessionActivity';
import { ASSISTANT_LIMITS, CONSENT_EVENT, CONSENT_VERSION } from './assistant.config';
import { AssistantError, askPublicQuestion, failureOf, fetchTextPolicy, interpretText, publicTutor, queryJournal } from './assistantApi';
import { clearAssistantConsent, consentKey, hasAssistantConsent, saveAssistantConsent } from './consent';
import { validUnicode } from './parsers';
import { browserTimeZone, mergePage, nextQuestion } from './queryPlan';
import type { Failure, Interpretation, Question, QueryAnswer, TextPolicy, TutorResponse, TutorTopic } from './types';

type Action = 'interpret' | 'query' | 'more' | 'tutor';

/** Every request belongs to this mounted owner; no text or result enters a persistent store. */
export function useAssistant(ownerId: string, token: string | null, locale: Locale) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [policy, setPolicy] = useState<TextPolicy | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [text, setText] = useState('');
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<QueryAnswer | null>(null);
  const [tutor, setTutor] = useState<TutorResponse | null>(null);
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const acceptedNow = useRef(false);
  const policyNow = useRef<TextPolicy | null>(null);

  const cancel = useCallback(() => { active.current?.abort(); active.current = null; setBusy(null); }, []);
  const clearText = useCallback(() => { setText(''); setInterpretation(null); setTutor(null); }, []);
  const withdraw = useCallback(() => {
    acceptedNow.current = false; setAccepted(false); cancel(); clearText(); clearAssistantConsent(ownerId);
  }, [ownerId, cancel, clearText]);

  const rememberPolicy = useCallback((next: TextPolicy) => {
    policyNow.current = next; setPolicy(next);
    const valid = next.version === CONSENT_VERSION && hasAssistantConsent(ownerId, next.version);
    acceptedNow.current = valid; setAccepted(valid);
    if (next.version !== CONSENT_VERSION) { clearAssistantConsent(ownerId); setError('policyChanged'); }
    return valid;
  }, [ownerId]);

  useEffect(() => {
    alive.current = true;
    const stop = () => { cancel(); clearText(); setQuestion(null); setAnswer(null); return Promise.resolve(); };
    const unregister = registerAccountActivity(stop);
    const onOffline = () => { setOnline(false); cancel(); clearText(); };
    const onOnline = () => { setOnline(true); };
    const onConsent = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== null && event.key !== consentKey(ownerId)) return;
      const current = policyNow.current;
      if (current && !hasAssistantConsent(ownerId, current.version)) {
        acceptedNow.current = false; setAccepted(false); cancel(); clearText();
      }
    };
    window.addEventListener('offline', onOffline); window.addEventListener('online', onOnline);
    window.addEventListener('storage', onConsent); window.addEventListener(CONSENT_EVENT, onConsent);
    return () => {
      alive.current = false; active.current?.abort(); active.current = null; unregister();
      window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onConsent); window.removeEventListener(CONSENT_EVENT, onConsent);
    };
  }, [ownerId, cancel, clearText]);

  useEffect(() => {
    if (!token || !online) return;
    const controller = new AbortController();
    void fetchTextPolicy(token, controller.signal).then((next) => {
      if (!controller.signal.aborted && alive.current) rememberPolicy(next);
    }).catch((failure: unknown) => { if (!controller.signal.aborted && alive.current) setError(failureOf(failure)); });
    return () => { controller.abort(); };
  }, [token, online, rememberPolicy]);

  const approve = useCallback(() => {
    const current = policyNow.current;
    if (!current || current.version !== CONSENT_VERSION) return;
    if (!saveAssistantConsent(ownerId, current.version)) { setError('storage'); return; }
    acceptedNow.current = true; setAccepted(true); setError(null);
  }, [ownerId]);

  const requestIsLive = (signal: AbortSignal): boolean => !signal.aborted && alive.current;
  const consentIsAccepted = (): boolean => acceptedNow.current;
  const run = useCallback(async (action: Action, execute: (signal: AbortSignal, freshToken: string) => Promise<void>) => {
    if (active.current) return;
    if (!token || !navigator.onLine) { setError(token ? 'network' : 'auth'); return; }
    const controller = new AbortController(); active.current = controller; setBusy(action); setError(null);
    try { await execute(controller.signal, token); }
    catch (failure: unknown) {
      if (!controller.signal.aborted && alive.current) {
        const kind = failureOf(failure); setError(kind);
        if (kind === 'policyChanged' || kind === 'consent') {
          acceptedNow.current = false; setAccepted(false); clearAssistantConsent(ownerId); clearText();
          try { const next = await fetchTextPolicy(token, controller.signal); if (requestIsLive(controller.signal)) rememberPolicy(next); }
          catch { /* The original actionable failure remains; no model request is retried. */ }
        }
      }
    } finally {
      if (alive.current && active.current === controller) { active.current = null; setBusy(null); }
    }
  }, [token, ownerId, rememberPolicy, clearText]);

  const optedInPolicy = useCallback(async (signal: AbortSignal, freshToken: string) => {
    if (!consentIsAccepted()) throw new AssistantError('consent');
    const fresh = await fetchTextPolicy(freshToken, signal);
    if (signal.aborted || !alive.current) throw new DOMException('Cancelled', 'AbortError');
    if (fresh.version !== CONSENT_VERSION || fresh.version !== policyNow.current?.version) {
      rememberPolicy(fresh); throw new AssistantError('policyChanged');
    }
    if (!consentIsAccepted() || !hasAssistantConsent(ownerId, fresh.version)) throw new AssistantError('consent');
    const input = text.trim();
    if (!input || Array.from(input).length > fresh.max_text_characters || !validUnicode(input)) throw new AssistantError('invalid');
    return { input, consent: { version: fresh.version, accepted: true as const } };
  }, [ownerId, text, rememberPolicy]);

  const interpret = useCallback(() => run('interpret', async (signal, freshToken) => {
    const input = await optedInPolicy(signal, freshToken);
    const result = await interpretText(freshToken, input.input, locale, browserTimeZone(), input.consent, signal);
    if (signal.aborted || !alive.current) return;
    setInterpretation(result); setAnswer(null); setQuestion(null); setText(''); setTutor(null);
  }), [run, optedInPolicy, locale]);

  const query = useCallback((next: Question) => run('query', async (signal, freshToken) => {
    const result = await queryJournal(freshToken, next, signal);
    if (signal.aborted || !alive.current) return;
    setQuestion(next); setAnswer(result); setInterpretation(null);
  }), [run]);

  const more = useCallback(() => run('more', async (signal, freshToken) => {
    if (!question || !answer) return;
    const next = nextQuestion(question, answer); const page = await queryJournal(freshToken, next, signal);
    if (signal.aborted || !alive.current) return;
    setQuestion(next); setAnswer(mergePage(answer, page));
  }), [run, question, answer]);

  const explain = useCallback((topic: TutorTopic, scientific: string | null, freeText: boolean) => run('tutor', async (signal, freshToken) => {
    const result: TutorResponse = freeText
      ? await (async () => { const input = await optedInPolicy(signal, freshToken); return askPublicQuestion(freshToken, topic, scientific, input.input, locale, input.consent, signal); })()
      : { status: 'answered', answer: await publicTutor(freshToken, topic, scientific, locale, signal) };
    if (signal.aborted || !alive.current) return;
    setTutor(result); setText(''); setInterpretation(null);
  }), [run, optedInPolicy, locale]);

  const usable = Boolean(token) && online;
  const canSendText = usable && accepted && policy?.version === CONSENT_VERSION && Boolean(text.trim()) && Array.from(text.trim()).length <= ASSISTANT_LIMITS.text && validUnicode(text);
  return { online, policy, accepted, error, busy, text, setText, interpretation, question, answer, tutor, usable, canSendText,
    approve, withdraw, cancel, clearText, interpret, query, more, explain, clearError: () => { setError(null); } };
}
export type AssistantState = ReturnType<typeof useAssistant>;
