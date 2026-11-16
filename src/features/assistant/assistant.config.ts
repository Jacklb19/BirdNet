import { API_ROUTES } from '../../config/api';

const base = API_ROUTES.health.replace(/\/health$/u, '/assistant');
export const ASSISTANT_ROUTES = Object.freeze({
  policy: `${base}/text-policy`, interpret: `${base}/interpret`, query: `${base}/query`,
  tutor: `${base}/tutor`, question: `${base}/tutor-question`,
});
export const CONSENT_VERSION = 'assistant-text-v1';
export const CONSENT_PREFIX = 'trino:assistant:consent:';
export const CONSENT_EVENT = 'trino:assistant-consent-changed';
export const ASSISTANT_LIMITS = Object.freeze({ text: 900, paragraphs: 4, page: 20, maxPage: 50, species: 200, name: 80, note: 500 });
export const INTENTS = ['detections', 'species', 'outings', 'observations', 'collections', 'wishlist'] as const;
export const TOPICS = ['confidence', 'detection_status', 'recording_privacy', 'approximate_location', 'species_facts'] as const;
export const STATUSES = ['confirmed', 'provisional', 'verified', 'corrected', 'discarded'] as const;
export const REASON_CODES = ['ambiguous_request', 'ambiguous_species', 'ambiguous_period', 'private_reference', 'outside_scope',
  'unsupported_filter', 'unsupported_operation', 'identification_request', 'outside_topic', 'private_statistics_request', 'insufficient_public_facts'] as const;
