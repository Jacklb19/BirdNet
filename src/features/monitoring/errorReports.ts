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
const ROUTE_PREFIX = '#/';
/** A session token, signed (header.payload.signature) or named in an address; never part of a report. */
const TOKEN = /eyJ[\w-]+\.[\w-]+\.[\w-]+|\b((?:access|refresh)_token=)[^&\s#]+/g;
const TOKEN_PLACEHOLDER = '{token}';

/** Text of a report without identifiers or tokens: a message may quote the address or the header it failed on. */
function withoutSecrets(text: string): string {
  return text.replace(TOKEN, (_, name: string | undefined) => `${name ?? ''}${TOKEN_PLACEHOLDER}`).replace(IDENTIFIER, IDENTIFIER_PLACEHOLDER);
}

type Reporter = (error: unknown) => void;
let report: Reporter | null = null;

/** The address of an event without query, identifiers or species: just the screen. */
export function cleanUrl(address: string): string {
  try {
    const parsed = new URL(address);
    // Only app routes start with "#/". A sign-in or recovery link returns with "#access_token=…&refresh_token=…",
    // which must never leave the phone (audit of 2026-11-02).
    const route = parsed.hash.startsWith(ROUTE_PREFIX) ? parsed.hash.split('?')[0]?.split('/').slice(0, 2).join('/') ?? '' : '';
    return `${parsed.origin}${parsed.pathname}${route}`.replace(IDENTIFIER, IDENTIFIER_PLACEHOLDER);
  } catch {
    return '';
  }
}

export function withoutPersonalData(event: ErrorEvent): ErrorEvent {
  const cleaned: ErrorEvent = { ...event, user: undefined, breadcrumbs: undefined };
  if (event.request) cleaned.request = { url: event.request.url ? cleanUrl(event.request.url) : undefined };
  if (event.message) cleaned.message = withoutSecrets(event.message);
  if (event.exception?.values) {
    cleaned.exception = { ...event.exception, values: event.exception.values.map((value) => ({ ...value, value: value.value === undefined ? undefined : withoutSecrets(value.value) })) };
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
