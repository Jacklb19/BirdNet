import { API_ROUTES } from '../../config/api';

const base = API_ROUTES.health.replace(/\/health$/u, '/assistant');
export const ASSISTANT_ROUTES = Object.freeze({
  policy: `${base}/text-policy`, interpret: `${base}/interpret`, query: `${base}/query`,
  tutor: `${base}/tutor`, question: `${base}/tutor-question`,
});
/** v2 (ADR-47): an interpretation may also carry the active plan; an acceptance of v1 does not cover it. */
export const CONSENT_VERSION = 'assistant-text-v2';
export const CONSENT_PREFIX = 'trino:assistant:consent:';
export const CONSENT_EVENT = 'trino:assistant-consent-changed';
/** `page`: results each answer shows at first and adds with "more"; a short card beside its question (ADR-47). */
export const ASSISTANT_LIMITS = Object.freeze({ text: 900, paragraphs: 4, page: 5, maxPage: 50, species: 200, name: 80, note: 500 });
/** The lists a question can ask for. */
export const INTENTS = ['detections', 'species', 'outings', 'observations', 'collections', 'wishlist'] as const;
/** Everything a plan can ask: the lists, and two periods side by side. */
export const PLAN_INTENTS = [...INTENTS, 'compare'] as const;
export const RELATIVE_PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'last_7_days', 'last_30_days'] as const;
export const TOPICS = ['confidence', 'detection_status', 'recording_privacy', 'approximate_location', 'species_facts'] as const;
export const STATUSES = ['confirmed', 'provisional', 'verified', 'corrected', 'discarded'] as const;
export const REASON_CODES = ['ambiguous_request', 'ambiguous_species', 'ambiguous_period', 'private_reference', 'outside_scope',
  'unsupported_filter', 'unsupported_operation', 'identification_request', 'outside_topic', 'private_statistics_request', 'insufficient_public_facts'] as const;
/** The thread keeps the latest messages of the tab's session only; older ones leave memory, never stored anywhere. */
export const THREAD_MAX_MESSAGES = 40;
/** How close to the end of the thread, in CSS pixels, counts as "reading the latest", so new answers scroll into view. */
export const THREAD_FOLLOW_PX = 120;
