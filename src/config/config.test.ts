// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';
import viteConfig from '../../vite.config';
import {
  API_PROXY_PREFIX,
  APP_SHELL_HTML,
  CROSS_ORIGIN_ISOLATION_HEADERS,
  E2E_API_READINESS_PATH,
  ICONS_DIR,
  MODEL_ASSETS_DIR,
  MODEL_FILES,
  PUBLIC_DIR,
  SW_FILENAME,
  WEB_MANIFEST,
} from '../../build.config.mjs';
import { APP_SHELL_URL, SERVICE_WORKER_URL } from '../features/offline/offline.constants';
import { STATIC_MANIFEST_URL } from '../features/inference/modelManifest';
import { API_ROUTES } from './api';
import { readConfig, type AppConfig } from './env';

// Read from disk: Vitest replaces CSS modules with empty strings, even with `?raw`.
const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const tokensCss = readSource('../styles/tokens.css');
const indexHtml = readSource(`../../${APP_SHELL_HTML}`);
const webManifest = JSON.parse(readSource(`../../${PUBLIC_DIR}/${WEB_MANIFEST}`)) as {
  readonly theme_color?: string;
  readonly background_color?: string;
  readonly icons?: readonly { readonly src: string }[];
};
const iconPath = webManifest.icons?.[0]?.src ?? '';
const appIcon = readSource(`../../${PUBLIC_DIR}${iconPath}`);

/** Vercel's catch-all route pattern, where the page-wide headers are declared. */
const ALL_ROUTES = '/(.*)';
const SUPABASE_SOURCE = 'https://*.supabase.co';

function headersFor(source: string): Map<string, string> {
  const rule = vercel.headers.find((candidate) => candidate.source === source);
  return new Map(rule?.headers.map(({ key, value }): [string, string] => [key, value]));
}

function cspDirectives(): Map<string, readonly string[]> {
  const policy = headersFor(ALL_ROUTES).get('Content-Security-Policy') ?? '';
  return new Map(policy.split(';').map((directive) => directive.trim()).filter(Boolean).map((directive): [string, string[]] => {
    const [name = '', ...sources] = directive.split(/\s+/);
    return [name, sources];
  }));
}

/** CSP host-source matching for the forms vercel.json uses: an exact origin or `scheme://*.domain`. */
function allows(sources: readonly string[] | undefined, url: string): boolean {
  const { origin, protocol, hostname } = new URL(url);
  return (sources ?? []).some((source) => {
    if (source === origin) return true;
    const wildcard = /^(https?:)\/\/\*\.(.+)$/.exec(source);
    if (!wildcard) return false;
    const [, scheme = '', domain = ''] = wildcard;
    return scheme === protocol && hostname.endsWith(`.${domain}`);
  });
}

/** Light-theme value of a design token: the first `:root` block of tokens.css (the dark theme comes later). */
function lightToken(name: string): string {
  const lightBlock = /:root\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? '';
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(lightBlock)?.[1]?.trim();
  if (!value) throw new Error(`Token ${name} not found in tokens.css.`);
  return value.toUpperCase();
}

function attribute(source: string, pattern: RegExp): string {
  return pattern.exec(source)?.[1]?.toUpperCase() ?? '';
}

function externalUrls(config: AppConfig): string[] {
  return [config.map.styleLightUrl, config.map.styleDarkUrl, config.photos.lookupApiUrl, config.photos.metadataApiUrl];
}

describe('readConfig', () => {
  it('describes the public deployment when no variable is set', () => {
    const defaults = readConfig({});
    expect(defaults.apiBaseUrl).toBe(API_PROXY_PREFIX);
    expect(defaults.modelAssetsBaseUrl).toBe(`/${MODEL_ASSETS_DIR}`);
    expect(defaults.supabase).toBeNull();
    expect(defaults.authRedirectUrl).toBeNull();
    for (const url of externalUrls(defaults)) expect(new URL(url).protocol).toBe('https:');
    for (const timeout of [defaults.apiTimeoutMs, defaults.photos.requestTimeoutMs]) expect(Number.isSafeInteger(timeout) && timeout > 0).toBe(true);
    expect(defaults.photos.allowedImageHosts.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat('en', { timeZone: defaults.defaultTimeZone })).not.toThrow();
  });

  it('parses and normalizes overrides', () => {
    const custom = readConfig({
      VITE_API_BASE_URL: 'https://api.example.org/',
      VITE_API_TIMEOUT_MS: ' 5000 ',
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_MAP_INITIAL_CENTER: '-75.5, 6.25',
      VITE_PHOTO_IMAGE_HOSTS: 'Images.Example.org, ,cdn.example.org',
    });
    expect(custom.apiBaseUrl).toBe('https://api.example.org');
    expect(custom.apiTimeoutMs).toBe(5000);
    expect(custom.supabase).toEqual({ url: 'https://project.supabase.co', anonKey: 'public-anon-key' });
    expect(custom.map.initialCenter).toEqual([-75.5, 6.25]);
    expect(custom.photos.allowedImageHosts).toEqual(['images.example.org', 'cdn.example.org']);
    // Plain http is accepted only for a local API.
    expect(readConfig({ VITE_API_BASE_URL: 'http://localhost:8000' }).apiBaseUrl).toBe('http://localhost:8000');
    // A blank value is unset, and Supabase needs both variables.
    expect(readConfig({ VITE_API_TIMEOUT_MS: '  ', VITE_SUPABASE_URL: 'https://project.supabase.co' })).toMatchObject({
      apiTimeoutMs: readConfig({}).apiTimeoutMs,
      supabase: null,
    });
  });

  it.each([
    ['VITE_API_BASE_URL', 'not a url'],
    ['VITE_MAP_STYLE_LIGHT_URL', 'http://tiles.example.org/style.json'],
    ['VITE_MAP_INITIAL_CENTER', '200,0'],
    ['VITE_MAP_INITIAL_CENTER', '-74.08'],
    ['VITE_MAP_INITIAL_ZOOM', '23'],
    ['VITE_DEFAULT_TIME_ZONE', 'Mars/Olympus_Mons'],
    ['VITE_API_TIMEOUT_MS', '1.5'],
    ['VITE_PHOTO_TIMEOUT_MS', '0'],
  ])('rejects %s=%s naming the variable', (key, value) => {
    expect(() => readConfig({ [key]: value })).toThrow(key);
  });
});

describe('deployment configuration', () => {
  it('lets the CSP reach every external origin of the default configuration', () => {
    const csp = cspDirectives();
    const defaults = readConfig({});
    for (const url of externalUrls(defaults)) expect(allows(csp.get('connect-src'), url), url).toBe(true);
    for (const host of defaults.photos.allowedImageHosts) {
      // <img> loads them, and the service worker's photo cache re-fetches them (Chromium checks connect-src).
      for (const directive of ['img-src', 'connect-src']) expect(allows(csp.get(directive), `https://${host}/`), `${directive} ${host}`).toBe(true);
    }
    expect(csp.get('connect-src')).toContain(SUPABASE_SOURCE);
  });

  it('sends the same cross-origin isolation headers from Vite and Vercel', () => {
    const resolved = viteConfig({ command: 'serve', mode: 'test' });
    const production = headersFor(ALL_ROUTES);
    for (const headers of [resolved.server?.headers, resolved.preview?.headers]) {
      expect(headers).toEqual(CROSS_ORIGIN_ISOLATION_HEADERS);
      for (const [key, value] of Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)) expect(production.get(key)).toBe(value);
    }
  });

  it('agrees with the runtime on build file names', () => {
    expect(SERVICE_WORKER_URL).toBe(`/${SW_FILENAME}`);
    expect(APP_SHELL_URL).toBe(`/${APP_SHELL_HTML}`);
    expect(headersFor(SERVICE_WORKER_URL).get('Cache-Control')).toBe('no-cache');
    expect(STATIC_MANIFEST_URL.endsWith(`/${MODEL_FILES.manifest}`)).toBe(true);
    expect(vercel.rewrites.some(({ source }) => source.startsWith(`${API_PROXY_PREFIX}/`))).toBe(true);
    expect(vercel.rewrites.find(({ source }) => source === ALL_ROUTES)?.destination).toBe(APP_SHELL_URL);
    expect(E2E_API_READINESS_PATH).toBe(API_ROUTES.modelLatest);
    expect(indexHtml).toContain(`href="/${WEB_MANIFEST}"`);
    // The precache takes every icon from ICONS_DIR.
    expect(iconPath.startsWith(`/${ICONS_DIR}/`)).toBe(true);
  });

  it('paints the shell with the light brand tokens', () => {
    expect(webManifest.theme_color?.toUpperCase()).toBe(lightToken('--color-brand'));
    expect(webManifest.background_color?.toUpperCase()).toBe(lightToken('--color-bg-canvas'));
    expect(attribute(indexHtml, /<meta name="theme-color" content="([^"]+)"/)).toBe(lightToken('--color-brand'));
    expect(attribute(appIcon, /<rect[^>]*fill="([^"]+)"/)).toBe(lightToken('--color-brand'));
    expect(attribute(appIcon, /<path[^>]*fill="([^"]+)"/)).toBe(lightToken('--color-on-brand'));
  });
});
