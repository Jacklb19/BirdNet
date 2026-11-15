import { apiUrl, WRITING_TIMEOUT_MS } from '../../config/api';
import type { Locale } from '../../i18n';
import { ASSISTANT_LIMITS, ASSISTANT_ROUTES, CONSENT_VERSION } from './assistant.config';
import { parseInterpretation, parsePolicy, parseQuestion, parseQueryAnswer, parseTutor, parseTutorResponse, record, text as validText } from './parsers';
import type { Consent, Failure, Interpretation, Question, QueryAnswer, TextPolicy, TutorAnswer, TutorResponse, TutorTopic } from './types';

export class AssistantError extends Error {
  constructor(readonly failure: Failure, readonly status: number | null = null) { super('Assistant action could not be completed.'); this.name = 'AssistantError'; }
}
export function failureOf(error: unknown): Failure {
  if (error instanceof AssistantError) return error.failure;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof TypeError) return 'network';
  return 'invalid';
}
async function request<T>(path: string, token: string, signal: AbortSignal, parse: (value: unknown) => T, body?: unknown): Promise<T> {
  if (!token) throw new AssistantError('auth');
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(WRITING_TIMEOUT_MS)]) });
  } catch (error: unknown) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'TimeoutError')) throw error;
    throw new AssistantError('network');
  }
  if (!response.ok) {
    let code: unknown;
    try { const payload: unknown = await response.json(); code = record(payload).code; } catch { /* Never retain diagnostic bodies. */ }
    const failure: Failure = response.status === 409 ? 'policyChanged' : code === 'consent_required' ? 'consent' :
      response.status === 401 ? 'auth' : response.status === 403 ? 'secondStep' : response.status === 429 ? 'quota' :
      response.status === 502 ? 'source' : response.status === 503 ? 'unavailable' : 'invalid';
    throw new AssistantError(failure, response.status);
  }
  try { const value: unknown = await response.json(); return parse(value); }
  catch { throw new AssistantError('invalid'); }
}
function explicitText(value: unknown, consent: unknown): { text: string; consent: Consent } {
  const accepted = record(consent);
  if (Object.keys(accepted).length !== 2 || accepted.accepted !== true || accepted.version !== CONSENT_VERSION) throw new AssistantError('consent');
  return { text: validText(value, ASSISTANT_LIMITS.text).trim(), consent: { accepted: true, version: CONSENT_VERSION } };
}
export function fetchTextPolicy(token: string, signal: AbortSignal): Promise<TextPolicy> {
  return request(ASSISTANT_ROUTES.policy, token, signal, parsePolicy);
}
export function queryJournal(token: string, question: Question, signal: AbortSignal): Promise<QueryAnswer> {
  return request(ASSISTANT_ROUTES.query, token, signal, (value) => {
    const answer = parseQueryAnswer(value); if (answer.intent !== question.intent) throw new Error('Mismatched query response.'); return answer;
  }, parseQuestion(question));
}
export function interpretText(token: string, text: string, locale: Locale, tz: string, consent: Consent, signal: AbortSignal): Promise<Interpretation> {
  const input = explicitText(text, consent);
  return request(ASSISTANT_ROUTES.interpret, token, signal, parseInterpretation, { ...input, locale, tz, limit: ASSISTANT_LIMITS.page });
}
export function publicTutor(token: string, topic: TutorTopic, species: string | null, locale: Locale, signal: AbortSignal): Promise<TutorAnswer> {
  return request(ASSISTANT_ROUTES.tutor, token, signal, (value) => {
    const answer = parseTutor(value); if (answer.topic !== topic || answer.species !== species || answer.locale !== locale) throw new Error('Mismatched tutor response.'); return answer;
  }, { topic, species, locale });
}
export function askPublicQuestion(token: string, topic: TutorTopic, species: string | null, text: string, locale: Locale, consent: Consent, signal: AbortSignal): Promise<TutorResponse> {
  const input = explicitText(text, consent);
  return request(ASSISTANT_ROUTES.question, token, signal, (value) => {
    const answer = parseTutorResponse(value); const context = answer.status === 'answered' ? answer.answer : answer;
    if (context.topic !== topic || context.species !== species || context.locale !== locale) throw new Error('Mismatched tutor context.');
    return answer;
  }, { topic, species, locale, ...input });
}
