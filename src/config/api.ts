import { config } from './env';

/** API paths relative to `config.apiBaseUrl`; the version segment lives only here. */
const VERSION = '/v1';

export const API_ROUTES = {
  health: `${VERSION}/health`,
  modelLatest: `${VERSION}/model/latest`,
  detections: `${VERSION}/detections`,
  detectionsBatch: `${VERSION}/detections/batch`,
  detectionAudioUrl: (detectionId: string): string => `${VERSION}/detections/${encodeURIComponent(detectionId)}/audio-url`,
  sites: `${VERSION}/sites`,
  siteStats: (siteId: string): string => `${VERSION}/sites/${encodeURIComponent(siteId)}/stats`,
  export: `${VERSION}/export`,
} as const;

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
