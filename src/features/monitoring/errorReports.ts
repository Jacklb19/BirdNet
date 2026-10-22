/**
 * Errors of the deployed app sent to Sentry (ADR-43), only when the build names a project (`VITE_SENTRY_DSN`). The SDK
 * loads apart from the first screen. Nothing that identifies a person goes with an error: no user, IP address,
 * breadcrumbs (they would carry the map's area and the screens visited), query strings or identifiers in addresses.
 */
import type { ErrorEvent } from '@sentry/browser';
import { config } from '../../config/env';

/** Detections, walks and sites are named by UUID in hash routes; the route keeps its shape without them. */
const IDENTIFIER = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const IDENTIFIER_PLACEHOLDER = '{id}';

type Reporter = (error: unknown) => void;
let report: Reporter | null = null;

/** The address of an event without query, identifiers or species: just the screen. */
export function cleanUrl(address: string): string {
  try {
    const parsed = new URL(address);
    const route = parsed.hash.split('?')[0]?.split('/').slice(0, 2).join('/') ?? '';
    return `${parsed.origin}${parsed.pathname}${route}`.replace(IDENTIFIER, IDENTIFIER_PLACEHOLDER);
  } catch {
    return '';
  }
}

export function withoutPersonalData(event: ErrorEvent): ErrorEvent {
  const cleaned: ErrorEvent = { ...event, user: undefined, breadcrumbs: undefined };
  if (event.request) cleaned.request = { url: event.request.url ? cleanUrl(event.request.url) : undefined };
  // A message may quote an address it failed on.
  if (event.exception?.values) {
    cleaned.exception = { ...event.exception, values: event.exception.values.map((value) => ({ ...value, value: value.value?.replace(IDENTIFIER, IDENTIFIER_PLACEHOLDER) })) };
  }
  return cleaned;
}

export function startErrorReports(): void {
  const dsn = config.sentryDsn;
  if (!dsn) return;
  void import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn, environment: config.sentryEnvironment ?? undefined, maxBreadcrumbs: 0, tracesSampleRate: 0,
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      // Without the breadcrumbs integration nothing records clicks, requests or navigation between errors.
      integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Breadcrumbs'),
      beforeSend: withoutPersonalData,
    });
    report = (error) => { Sentry.captureException(error); };
  }).catch(() => undefined);
}

/** Errors the app catches itself (a screen that failed to draw); dropped when reports are off or not loaded yet. */
export function reportError(error: unknown): void {
  report?.(error);
}
