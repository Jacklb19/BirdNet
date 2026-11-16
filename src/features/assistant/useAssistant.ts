import { useCallback, useEffect, useRef, useState } from 'react';
import { navigateTo, type Route } from '../../app/routes';
import type { Locale } from '../../i18n';
import { registerAccountActivity } from '../account/sessionActivity';
import { useSpeciesNames } from '../species/speciesNames';
import { ASSISTANT_LIMITS, CONSENT_EVENT, CONSENT_VERSION, THREAD_MAX_MESSAGES } from './assistant.config';
import { AssistantError, askPublicQuestion, failureOf, fetchTextPolicy, interpretText, publicTutor, queryJournal } from './assistantApi';
import { clearAssistantConsent, consentKey, hasAssistantConsent, saveAssistantConsent } from './consent';
import { followUp } from './followUp';
import { validUnicode } from './parsers';
import { planQuestion, type ReadPlan } from './plan';
import { browserTimeZone, mergePage, nextQuestion } from './queryPlan';
import { tutorQuestion } from './tutorQuestion';
import type { Failure, JournalAnswer, Question, ReasonCode, ResultRow, TextPolicy, TutorAnswer, TutorTopic } from './types';

export type Message =
  | { readonly kind: 'user'; readonly id: number; readonly text: string }
  | { readonly kind: 'answer'; readonly id: number; readonly plan: ReadPlan; readonly question: Question; readonly answer: JournalAnswer }
  | { readonly kind: 'reason'; readonly id: number; readonly reason: ReasonCode }
  | { readonly kind: 'tutor'; readonly id: number; readonly answer: TutorAnswer }
  | { readonly kind: 'consent'; readonly id: number; readonly text: string }
  | { readonly kind: 'failure'; readonly id: number; readonly failure: Failure }
  | { readonly kind: 'noMore'; readonly id: number }
  | { readonly kind: 'notOnScreen'; readonly id: number };

type Action = 'query' | 'interpret' | 'more' | 'tutor';

interface Thread { readonly messages: readonly Message[]; readonly next: number }
const EMPTY: Thread = { messages: [], next: 1 };

/**
 * The thread of the tab's session, by account (ADR-47): it survives opening a record and coming back, never a reload,
 * and is never persisted or attached as a conversation to provider requests. Signing out, changing account, "New query" and
 * withdrawing consent clear it.
 */
const threads = new Map<string, Thread>();

// Account cleanup must also forget conversations whose page has already been unmounted.
registerAccountActivity(() => { threads.clear(); return Promise.resolve(); });
const forgetRevokedThreads = (event: Event): void => {
  for (const owner of threads.keys()) {
    if (event instanceof StorageEvent && event.key !== null && event.key !== consentKey(owner)) continue;
    if (!hasAssistantConsent(owner, CONSENT_VERSION)) threads.delete(owner);
  }
};
window.addEventListener('storage', forgetRevokedThreads);
window.addEventListener(CONSENT_EVENT, forgetRevokedThreads);

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type MessageInput = WithoutId<Message>;
type AnswerMessage = Extract<Message, { kind: 'answer' }>;

/** The answer follow-ups refer to: the latest one of the thread, whose filters show above the composer. */
function activeAnswer(messages: readonly Message[]): AnswerMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.kind === 'answer') return message;
  }
  return null;
}

export function rowRoute(row: ResultRow): Route {
  switch (row.kind) {
    case 'detection': return { name: 'detection', id: row.id };
    case 'observation': return { name: 'observations', id: row.id };
    case 'outing': return { name: 'outing', id: row.id };
    case 'collection': return { name: 'collection', id: row.id };
    case 'species': case 'wish': return { name: 'species', species: row.species };
  }
}

/** Every request belongs to this mounted owner; the thread lives in memory only. */
export function useAssistant(ownerId: string, token: string | null, locale: Locale) {
  const names = useSpeciesNames();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [policy, setPolicy] = useState<TextPolicy | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<Thread>(() => threads.get(ownerId) ?? EMPTY);
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const acceptedNow = useRef(false);
  const policyNow = useRef<TextPolicy | null>(null);
  const threadNow = useRef(thread);

  const write = useCallback((change: (current: Thread) => Thread) => {
    const next = change(threadNow.current);
    const kept = next.messages.length > THREAD_MAX_MESSAGES ? { ...next, messages: next.messages.slice(-THREAD_MAX_MESSAGES) } : next;
    threadNow.current = kept; threads.set(ownerId, kept); setThread(kept);
  }, [ownerId]);
  const say = useCallback((message: MessageInput) => {
    write((current) => ({ messages: [...current.messages, { ...message, id: current.next }], next: current.next + 1 }));
  }, [write]);

  const cancel = useCallback(() => { active.current?.abort(); active.current = null; setBusy(null); }, []);
  const reset = useCallback(() => { cancel(); threads.delete(ownerId); threadNow.current = EMPTY; setThread(EMPTY); setDraft(''); setError(null); }, [cancel, ownerId]);
  const withdraw = useCallback(() => {
    acceptedNow.current = false; setAccepted(false); clearAssistantConsent(ownerId); reset();
  }, [ownerId, reset]);

  const rememberPolicy = useCallback((next: TextPolicy) => {
    policyNow.current = next; setPolicy(next);
    const valid = next.version === CONSENT_VERSION && hasAssistantConsent(ownerId, next.version);
    acceptedNow.current = valid; setAccepted(valid);
    if (next.version !== CONSENT_VERSION) { clearAssistantConsent(ownerId); setError('policyChanged'); }
    return valid;
  }, [ownerId]);

  useEffect(() => {
    alive.current = true;
    // Leaving the account stops what runs and forgets the thread, so the next account never sees it.
    const stop = () => { reset(); return Promise.resolve(); };
    const unregister = registerAccountActivity(stop);
    const onOffline = () => { setOnline(false); cancel(); };
    const onOnline = () => { setOnline(true); };
    const onConsent = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== null && event.key !== consentKey(ownerId)) return;
      const current = policyNow.current;
      if (current && !hasAssistantConsent(ownerId, current.version)) { acceptedNow.current = false; setAccepted(false); reset(); }
    };
    window.addEventListener('offline', onOffline); window.addEventListener('online', onOnline);
    window.addEventListener('storage', onConsent); window.addEventListener(CONSENT_EVENT, onConsent);
    return () => {
      alive.current = false; active.current?.abort(); active.current = null; unregister();
      window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onConsent); window.removeEventListener(CONSENT_EVENT, onConsent);
    };
  }, [ownerId, cancel, reset]);

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
    if (!current || current.version !== CONSENT_VERSION) return false;
    if (!saveAssistantConsent(ownerId, current.version)) { setError('storage'); return false; }
    acceptedNow.current = true; setAccepted(true); setError(null);
    return true;
  }, [ownerId]);

  // Read through functions: both refs change while a request is awaited.
  const live = (signal: AbortSignal): boolean => !signal.aborted && alive.current;
  const consentGiven = (): boolean => acceptedNow.current;

  /** One action at a time; cancelled and superseded responses never update the conversation. */
  const run = useCallback(async (action: Action, execute: (signal: AbortSignal, freshToken: string) => Promise<void>) => {
    if (active.current) return;
    if (!token || !navigator.onLine) { say({ kind: 'failure', failure: token ? 'network' : 'auth' }); return; }
    const controller = new AbortController(); active.current = controller; setBusy(action); setError(null);
    try { await execute(controller.signal, token); }
    catch (failure: unknown) {
      if (!controller.signal.aborted && alive.current) {
        const kind = failureOf(failure);
        if (kind === 'policyChanged' || kind === 'consent') {
          acceptedNow.current = false; setAccepted(false); clearAssistantConsent(ownerId);
          try { const next = await fetchTextPolicy(token, controller.signal); if (live(controller.signal)) rememberPolicy(next); }
          catch { /* The actionable failure below remains; no text is ever sent again on its own. */ }
        }
        say({ kind: 'failure', failure: kind });
      }
    } finally {
      if (alive.current && active.current === controller) { active.current = null; setBusy(null); }
    }
  }, [token, ownerId, rememberPolicy, say]);

  /** Runs a plan against the API: deterministic figures, no model, no quota (ADR-46). */
  const ask = useCallback((source: ReadPlan) => run('query', async (signal, freshToken) => {
    const question = planQuestion(source, locale, browserTimeZone(), new Date());
    if (!question) { say({ kind: 'reason', reason: 'ambiguous_period' }); return; }
    const answer = await queryJournal(freshToken, question, signal);
    if (live(signal)) say({ kind: 'answer', plan: source, question, answer });
  }), [run, locale, say]);

  const more = useCallback(() => run('more', async (signal, freshToken) => {
    const current = activeAnswer(threadNow.current.messages);
    if (!current || current.answer.intent === 'compare' || current.question.intent === 'compare' || !current.answer.hasMore) {
      say({ kind: 'noMore' }); return;
    }
    const next = nextQuestion(current.question, current.answer);
    const page = await queryJournal(freshToken, next, signal);
    if (!live(signal) || page.intent === 'compare') return;
    const merged = mergePage(current.answer, page);
    write((thread) => ({ ...thread, messages: thread.messages.map((message) => message.id === current.id ? { ...current, question: next, answer: merged } : message) }));
  }), [run, write, say]);

  /** The text and, for a follow-up, the active plan's descriptors: one provider call, then the API answers. */
  const interpret = useCallback((text: string) => run('interpret', async (signal, freshToken) => {
    if (!consentGiven()) throw new AssistantError('consent');
    const fresh = await fetchTextPolicy(freshToken, signal);
    if (!live(signal)) return;
    if (fresh.version !== CONSENT_VERSION || fresh.version !== policyNow.current?.version) { rememberPolicy(fresh); throw new AssistantError('policyChanged'); }
    if (!consentGiven() || !hasAssistantConsent(ownerId, fresh.version)) throw new AssistantError('consent');
    const topic = tutorQuestion(text, names);
    if (topic) {
      // Topic routing is local. Public explanations need one generation, never an interpretation followed by one.
      const result = await askPublicQuestion(freshToken, topic.topic, topic.species, text, locale, { version: fresh.version, accepted: true }, signal);
      if (live(signal)) {
        if (result.status === 'answered') say({ kind: 'tutor', answer: result.answer });
        else say({ kind: 'reason', reason: result.reasonCode });
      }
      return;
    }
    const context = activeAnswer(threadNow.current.messages)?.plan ?? null;
    const result = await interpretText(freshToken, text, context, locale, browserTimeZone(), { version: fresh.version, accepted: true }, signal);
    if (!live(signal)) return;
    if (result.status !== 'ready') { say({ kind: 'reason', reason: result.reasonCode }); return; }
    // A clear read-only plan is run at once and shown with its filters to adjust (ADR-47).
    const answer = await queryJournal(freshToken, result.query, signal);
    if (live(signal)) say({ kind: 'answer', plan: result.plan, question: result.query, answer });
  }), [run, ownerId, locale, names, rememberPolicy, say]);

  const explain = useCallback((topic: Exclude<TutorTopic, 'species_facts'>, label: string) => {
    if (active.current) return Promise.resolve();
    say({ kind: 'user', text: label });
    return run('tutor', async (signal, freshToken) => {
      const answer = await publicTutor(freshToken, topic, null, locale, signal);
      if (live(signal)) say({ kind: 'tutor', answer });
    });
  }, [run, locale, say]);

  const open = useCallback((index: number) => {
    const current = activeAnswer(threadNow.current.messages);
    const rows = current && current.answer.intent !== 'compare' ? current.answer.rows : [];
    const row = index < 0 ? rows.at(-1) : rows[index];
    // Only what is on screen can be opened; an older reference is asked about instead of guessed.
    if (!row) { say({ kind: 'notOnScreen' }); return; }
    navigateTo(rowRoute(row));
  }, [say]);

  /** A written message: resolved on the phone when it can be, otherwise interpreted with consent. */
  const send = useCallback((raw: string = draft) => {
    const text = raw.trim();
    if (!text || busy || Array.from(text).length > (policyNow.current?.max_text_characters ?? ASSISTANT_LIMITS.text) || !validUnicode(text)) return;
    setDraft('');
    const context = activeAnswer(threadNow.current.messages)?.plan ?? null;
    const local = followUp(text, context, names);
    if (local.kind === 'reset') { reset(); return; }
    say({ kind: 'user', text });
    if (local.kind === 'open') { open(local.index); return; }
    if (local.kind === 'more') { void more(); return; }
    if (local.kind === 'plan') { void ask(local.plan); return; }
    if (!acceptedNow.current) { say({ kind: 'consent', text }); return; }
    void interpret(text);
  }, [draft, busy, names, reset, say, open, more, ask, interpret]);

  /** "Accept and send" on the consent card: the explicit acceptance, then the text that waited for it. */
  const approveAndSend = useCallback((text: string) => {
    if (approve()) void interpret(text);
  }, [approve, interpret]);

  const current = activeAnswer(thread.messages);
  return {
    online, policy, accepted, error, busy, draft, setDraft, messages: thread.messages, active: current,
    usable: Boolean(token) && online, send, ask, more, explain, approve, approveAndSend, withdraw, cancel, reset,
  };
}
export type AssistantState = ReturnType<typeof useAssistant>;
