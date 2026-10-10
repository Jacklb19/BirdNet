/**
 * Deployment configuration. This is the only module that reads `import.meta.env`; every other module
 * imports the validated values from here. Defaults describe the public production deployment and are
 * documented in `.env.example`. External origins must also be allowed by the CSP in `vercel.json`
 * (checked by `config.test.ts`).
 */

type RawEnv = Readonly<Record<string, unknown>>;

function text(env: RawEnv, key: string): string | null {
  const value = env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Absolute https URL, or a same-origin path starting with "/". */
function url(env: RawEnv, key: string, fallback: string): string {
  const value = text(env, key) ?? fallback;
  if (value.startsWith('/')) return withoutTrailingSlash(value) || '/';
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${key} must be an absolute URL or a path starting with "/".`); }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(`${key} must use https.`);
  }
  return withoutTrailingSlash(parsed.href);
}

function positiveInteger(env: RawEnv, key: string, fallback: number): number {
  const raw = text(env, key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
  return value;
}

function coordinates(env: RawEnv, key: string, fallback: readonly [number, number]): readonly [number, number] {
  const raw = text(env, key);
  if (raw === null) return fallback;
  const [longitude, latitude] = raw.split(',').map((part) => Number(part.trim()));
  if (longitude === undefined || latitude === undefined || !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
    throw new Error(`${key} must be "longitude,latitude".`);
  }
  return [longitude, latitude];
}

function zoom(env: RawEnv, key: string, fallback: number): number {
  const raw = text(env, key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 22) throw new Error(`${key} must be a zoom level between 0 and 22.`);
  return value;
}

function timeZone(env: RawEnv, key: string, fallback: string): string {
  const value = text(env, key) ?? fallback;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { throw new Error(`${key} must be an IANA time zone.`); }
  return value;
}

function hostList(env: RawEnv, key: string, fallback: readonly string[]): readonly string[] {
  const raw = text(env, key);
  if (raw === null) return fallback;
  return raw.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
}

export interface AppConfig {
  /** Base of the Trino API; "/api" is proxied to the API deployment by vercel.json and by Vite in development. */
  readonly apiBaseUrl: string;
  readonly apiTimeoutMs: number;
  /** Null when the build has no cloud account configuration; the app then works fully on the device. */
  readonly supabase: { readonly url: string; readonly anonKey: string } | null;
  /** Where e-mail confirmation links return; null means the origin the person signed up from. */
  readonly authRedirectUrl: string | null;
  /**
   * OAuth client ID of "Sign in with Google" (public by design). With it the browser's own account chooser is used
   * where available; null keeps the redirect through Supabase for everyone.
   */
  readonly googleClientId: string | null;
  /** Versioned model resources served with the app (manifest, labels, species names). */
  readonly modelAssetsBaseUrl: string;
  readonly map: {
    readonly styleLightUrl: string;
    readonly styleDarkUrl: string;
    readonly initialCenter: readonly [number, number];
    readonly initialZoom: number;
  };
  /** Fallback when the device does not report its own time zone. */
  readonly defaultTimeZone: string;
  /**
   * Service worker, verified model cache and background sync. Only production builds register them, so the
   * development server keeps Vite's module graph and loads the model straight from `modelAssetsBaseUrl`.
   */
  readonly offlineEnabled: boolean;
  readonly photos: {
    readonly lookupApiUrl: string;
    readonly metadataApiUrl: string;
    readonly allowedImageHosts: readonly string[];
    readonly requestTimeoutMs: number;
  };
  /** Wikipedia page summaries (REST API) for species cards, per interface language; English is the fallback. */
  readonly summaries: {
    readonly es: string;
    readonly en: string;
  };
}

/** Pure so it can be tested with any environment; throws with the variable name on invalid input. */
export function readConfig(env: RawEnv): AppConfig {
  const supabaseUrl = text(env, 'VITE_SUPABASE_URL');
  const supabaseAnonKey = text(env, 'VITE_SUPABASE_ANON_KEY');
  return Object.freeze({
    apiBaseUrl: url(env, 'VITE_API_BASE_URL', '/api'),
    apiTimeoutMs: positiveInteger(env, 'VITE_API_TIMEOUT_MS', 20_000),
    supabase: supabaseUrl && supabaseAnonKey ? { url: url(env, 'VITE_SUPABASE_URL', supabaseUrl), anonKey: supabaseAnonKey } : null,
    authRedirectUrl: text(env, 'VITE_AUTH_REDIRECT_URL') ? url(env, 'VITE_AUTH_REDIRECT_URL', '/') : null,
    googleClientId: text(env, 'VITE_GOOGLE_CLIENT_ID'),
    modelAssetsBaseUrl: url(env, 'VITE_MODEL_ASSETS_BASE_URL', '/models'),
    map: {
      styleLightUrl: url(env, 'VITE_MAP_STYLE_LIGHT_URL', 'https://tiles.openfreemap.org/styles/liberty'),
      styleDarkUrl: url(env, 'VITE_MAP_STYLE_DARK_URL', 'https://tiles.openfreemap.org/styles/dark'),
      initialCenter: coordinates(env, 'VITE_MAP_INITIAL_CENTER', [-74.08, 4.65]),
      initialZoom: zoom(env, 'VITE_MAP_INITIAL_ZOOM', 10),
    },
    defaultTimeZone: timeZone(env, 'VITE_DEFAULT_TIME_ZONE', 'America/Bogota'),
    offlineEnabled: env.PROD === true,
    photos: {
      lookupApiUrl: url(env, 'VITE_PHOTO_LOOKUP_API_URL', 'https://en.wikipedia.org/w/api.php'),
      metadataApiUrl: url(env, 'VITE_PHOTO_METADATA_API_URL', 'https://commons.wikimedia.org/w/api.php'),
      // Commons serves thumbnails from thumb.wikimedia.org and originals from upload.wikimedia.org.
      allowedImageHosts: hostList(env, 'VITE_PHOTO_IMAGE_HOSTS', ['thumb.wikimedia.org', 'upload.wikimedia.org']),
      requestTimeoutMs: positiveInteger(env, 'VITE_PHOTO_TIMEOUT_MS', 10_000),
    },
    summaries: {
      es: url(env, 'VITE_SUMMARY_API_URL_ES', 'https://es.wikipedia.org/api/rest_v1/page/summary'),
      en: url(env, 'VITE_SUMMARY_API_URL_EN', 'https://en.wikipedia.org/api/rest_v1/page/summary'),
    },
  });
}

export const config: AppConfig = readConfig(import.meta.env);
