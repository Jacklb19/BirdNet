import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import {
  API_PROXY_PREFIX,
  APP_SHELL_HTML,
  ASSETS_DIR,
  BUILD_ENV,
  BUILD_ENV_DEFAULTS,
  CROSS_ORIGIN_ISOLATION_HEADERS,
  HASHED_OUTPUT_NAMES,
  OUT_DIR,
  PUBLIC_DIR,
  SW_ENTRY,
  SW_FILENAME,
  SW_SOURCE,
} from './build.config.mjs';

const MAX_TCP_PORT = 65_535;
const PROXY_PROTOCOLS = new Set(['http:', 'https:']);

type BuildEnv = Partial<Record<string, string>>;

function tcpPort(env: BuildEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TCP_PORT) {
    throw new Error(`${key} must be a TCP port between 1 and ${String(MAX_TCP_PORT)}.`);
  }
  return value;
}

function proxyTarget(env: BuildEnv, key: string, fallback: string): string {
  const value = env[key]?.trim() || fallback;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${key} must be an absolute http(s) URL.`); }
  if (!PROXY_PROTOCOLS.has(parsed.protocol)) throw new Error(`${key} must be an absolute http(s) URL.`);
  return value.replace(/\/+$/, '');
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads .env files and the process environment; only the BUILD_ENV names, which never reach the client.
  const env: BuildEnv = loadEnv(mode, process.cwd(), Object.values(BUILD_ENV));
  // Same-origin API in development and preview, as vercel.json does in production.
  const apiProxy: Record<string, ProxyOptions> = {
    [API_PROXY_PREFIX]: {
      target: proxyTarget(env, BUILD_ENV.apiProxyTarget, BUILD_ENV_DEFAULTS.apiProxyTarget),
      // A deployed API routes by Host, so the forwarded request must carry the target's host.
      changeOrigin: true,
      rewrite: (path) => path.slice(API_PROXY_PREFIX.length),
    },
  };
  const headers = { ...CROSS_ORIGIN_ISOLATION_HEADERS };

  return {
    plugins: [react()],
    publicDir: PUBLIC_DIR,
    build: {
      outDir: OUT_DIR,
      assetsDir: ASSETS_DIR,
      rolldownOptions: {
        input: { app: resolve(APP_SHELL_HTML), [SW_ENTRY]: resolve(SW_SOURCE) },
        output: {
          ...HASHED_OUTPUT_NAMES,
          // The service worker keeps a stable URL; every other bundle is content-hashed.
          entryFileNames: (chunk) => chunk.name === SW_ENTRY ? SW_FILENAME : HASHED_OUTPUT_NAMES.entryFileNames,
        },
      },
    },
    worker: {
      rolldownOptions: { output: { ...HASHED_OUTPUT_NAMES } },
    },
    server: {
      port: tcpPort(env, BUILD_ENV.devPort, BUILD_ENV_DEFAULTS.devPort),
      proxy: apiProxy,
      headers,
    },
    preview: {
      port: tcpPort(env, BUILD_ENV.previewPort, BUILD_ENV_DEFAULTS.previewPort),
      proxy: apiProxy,
      headers,
    },
  };
});
