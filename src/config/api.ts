import { config } from './env';

/** API paths relative to `config.apiBaseUrl`; the version segment lives only here. */
const VERSION = '/v1';

export const API_ROUTES = {
  health: `${VERSION}/health`,
  modelLatest: `${VERSION}/model/latest`,
  detections: `${VERSION}/detections`,
  detectionsBatch: `${VERSION}/detections/batch`,
  /** Review of one detection (confirm, correct, discard). */
  detection: (detectionId: string): string => `${VERSION}/detections/${encodeURIComponent(detectionId)}`,
  detectionRecordingUrl: (detectionId: string): string => `${VERSION}/detections/${encodeURIComponent(detectionId)}/recording-url`,
  detectionRecording: (detectionId: string): string => `${VERSION}/detections/${encodeURIComponent(detectionId)}/recording`,
  sites: `${VERSION}/sites`,
  siteStats: (siteId: string): string => `${VERSION}/sites/${encodeURIComponent(siteId)}/stats`,
  /** Report of a site written by the language model, only when the person asks (RF-15). */
  siteReport: (siteId: string): string => `${VERSION}/sites/${encodeURIComponent(siteId)}/report`,
  /** Card of a species written by the language model from public sources (RF-14). */
  speciesCard: (scientificName: string): string => `${VERSION}/species/${encodeURIComponent(scientificName)}/card`,
  export: `${VERSION}/export`,
  me: `${VERSION}/me`,
  meAvatarUrl: `${VERSION}/me/avatar-url`,
  meSummary: `${VERSION}/me/summary`,
  meSpecies: `${VERSION}/me/species`,
  meSharing: `${VERSION}/me/sharing`,
  meRecordings: `${VERSION}/me/recordings`,
  /** Walks saved in the account (ADR-35): the list, and one walk by the id the phone gave it. */
  walks: `${VERSION}/walks`,
  walk: (walkId: string): string => `${VERSION}/walks/${encodeURIComponent(walkId)}`,
  meWalks: `${VERSION}/me/walks`,
  meSpeciesRecord: (species: string): string => `${VERSION}/me/species/${encodeURIComponent(species)}`,
} as const;

/**
 * Wait for a text the language model writes: the API gathers its sources and may ask the model twice, within the 60 s
 * its function is allowed to run (`maxDuration` in the API's vercel.json).
 */
export const WRITING_TIMEOUT_MS = 60_000;

/** Response header set by the export endpoint when the row cap was reached. */
export const TRUNCATED_HEADER = 'X-Truncated';

export function apiUrl(path: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return `${config.apiBaseUrl}${path}${query ? `?${query}` : ''}`;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${String(status)}.`);
    this.name = 'ApiError';
  }
}

export interface ApiRequest extends Omit<RequestInit, 'signal'> {
  readonly token?: string;
  readonly params?: URLSearchParams;
  /** Caller cancellation; the configured timeout always applies as well. */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Authenticated request with the shared timeout; non-2xx answers become `ApiError`. */
export async function apiFetch(path: string, request: ApiRequest = {}): Promise<Response> {
  const { token, params, signal, timeoutMs = config.apiTimeoutMs, headers, ...init } = request;
  const timeout = AbortSignal.timeout(timeoutMs);
  const merged = new Headers(headers);
  if (token) merged.set('Authorization', `Bearer ${token}`);
  const response = await fetch(apiUrl(path, params), {
    ...init,
    headers: merged,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}
