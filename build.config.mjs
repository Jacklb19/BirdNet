/**
 * Build contract: names, paths and limits shared by vite.config.ts, the post-build scripts
 * (scripts/*.mjs), playwright.config.mjs, vitest.config.ts, eslint.config.js and e2e/. Plain ESM so the
 * Node scripts import it without a TypeScript step; the types live in build.config.d.mts.
 * Paths are relative to the repository root, the working directory of every npm script.
 * src/config/config.test.ts checks the values that are mirrored elsewhere (vercel.json, src/).
 */

/** Static files copied as-is into the build (Vite `publicDir`). */
export const PUBLIC_DIR = 'public';
/** Vite build output (`build.outDir`); the precache and the deployment read from it. */
export const OUT_DIR = 'dist';
/** Sub-directory of OUT_DIR for content-hashed bundles (`build.assetsDir`). */
export const ASSETS_DIR = 'assets';
/** Scratch output of local tooling (offline-check bundle, e2e screenshots, model preparation). */
export const TMP_DIR = 'tmp';
/** Playwright specs; Vitest must not collect them. */
export const E2E_DIR = 'e2e';
/** Vitest coverage reports. */
export const COVERAGE_DIR = 'coverage';

/**
 * Generated or third-party directories that lint and unit tests skip. Mirrors the build and tool
 * entries of .gitignore, which git cannot import.
 */
export const IGNORED_DIRS = Object.freeze([
  'node_modules',
  OUT_DIR,
  COVERAGE_DIR,
  TMP_DIR,
  '.venv',
  'venv',
  'playwright-report',
  'test-results',
]);

/** HTML entry and app shell: the service worker answers every navigation with it. */
export const APP_SHELL_HTML = 'index.html';
/** Web app manifest in PUBLIC_DIR, linked from index.html. */
export const WEB_MANIFEST = 'manifest.webmanifest';
/** App icons in PUBLIC_DIR, referenced by the web app manifest. */
export const ICONS_DIR = 'icons';
/**
 * Model resources in PUBLIC_DIR, served at `/${MODEL_ASSETS_DIR}`; mirrors the default of
 * VITE_MODEL_ASSETS_BASE_URL in src/config/env.ts.
 */
export const MODEL_ASSETS_DIR = 'models';
/** File names inside MODEL_ASSETS_DIR written by scripts/prepare-model.py and scripts/build-species-names.mjs. */
export const MODEL_FILES = Object.freeze({
  manifest: 'manifest.json',
  labels: 'labels.txt',
  speciesNames: 'species-names.json',
});

/** Rollup name of the service worker entry (src/features/offline/service-worker.ts). */
export const SW_ENTRY = 'service-worker';
export const SW_SOURCE = `src/features/offline/${SW_ENTRY}.ts`;
/**
 * Emitted at the root without a content hash: browsers update a service worker by fetching the same URL
 * (vercel.json serves it with `Cache-Control: no-cache`). Registered as SERVICE_WORKER_URL in
 * src/features/offline/offline.constants.ts.
 */
export const SW_FILENAME = `${SW_ENTRY}.js`;

/** Rollup file-name placeholders. */
const NAME_PLACEHOLDER = '[name]';
const HASH_PLACEHOLDER = '[hash]';
/**
 * Rollup file name of every bundle in ASSETS_DIR, without the extension. The content hash changes the
 * URL whenever the content changes, so these files never need cache-busting.
 */
export const ASSET_FILE_PATTERN = `${ASSETS_DIR}/${NAME_PLACEHOLDER}-${HASH_PLACEHOLDER}`;
/**
 * Rollup output names for every content-hashed bundle: the app build, its workers and the offline-check
 * library build all use them, so hashedAssetRegExp() matches what each of them emits.
 */
export const HASHED_OUTPUT_NAMES = Object.freeze({
  entryFileNames: `${ASSET_FILE_PATTERN}.js`,
  chunkFileNames: `${ASSET_FILE_PATTERN}.js`,
  assetFileNames: `${ASSET_FILE_PATTERN}[extname]`,
});
/** Rollup chunk name of src/features/inference/inference.worker.ts (the file name without extension). */
export const INFERENCE_WORKER_CHUNK = 'inference.worker';

/** Rollup hashes are base64url. */
const HASH_PATTERN = '[\\w-]+';
const ANY_NAME_PATTERN = '.*';

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Regular expression for files named with ASSET_FILE_PATTERN, derived from it so the scripts follow any
 * change of the naming. Without `name` it matches any chunk; the extension follows the hash.
 */
export function hashedAssetRegExp({ name, extension, flags } = {}) {
  const namePattern = name === undefined ? ANY_NAME_PATTERN : escapeRegExp(name);
  // Replacer functions: a replacement string would expand "$" sequences of the inserted pattern.
  const source = escapeRegExp(ASSET_FILE_PATTERN)
    .replace(escapeRegExp(NAME_PLACEHOLDER), () => namePattern)
    .replace(escapeRegExp(HASH_PLACEHOLDER), () => HASH_PATTERN);
  return new RegExp(`${source}\\.${extension === undefined ? '' : escapeRegExp(extension)}`, flags);
}

/** File types precached from ASSETS_DIR. Only woff2 fonts: every browser with service workers reads woff2. */
const PRECACHE_ASSET_EXTENSIONS = Object.freeze(['js', 'mjs', 'css', 'wasm', 'woff2']);

/**
 * Application shell precached by the service worker (relative to OUT_DIR). Each pattern must match at
 * least one file: scripts/prepare-offline.mjs fails the build on Workbox warnings. Fonts share the assets
 * pattern for that reason, so the build passes before and after the self-hosted fonts are imported.
 */
export const PRECACHE_GLOB_PATTERNS = Object.freeze([
  APP_SHELL_HTML,
  WEB_MANIFEST,
  `${MODEL_ASSETS_DIR}/${MODEL_FILES.manifest}`,
  `${MODEL_ASSETS_DIR}/${MODEL_FILES.speciesNames}`,
  `${ICONS_DIR}/*.svg`,
  `${ASSETS_DIR}/**/*.{${PRECACHE_ASSET_EXTENSIONS.join(',')}}`,
]);

const BYTES_PER_MIB = 1024 * 1024;
/**
 * Largest file Workbox may precache. It must fit the ONNX Runtime wasm (about 14 MiB with the
 * onnxruntime-web version pinned in package.json; re-check when upgrading it). The model weights (about
 * 37 MiB) are not precached: the app downloads them on request and verifies their SHA-256 before caching
 * them separately (src/features/offline/modelCache.ts).
 */
export const PRECACHE_MAX_BYTES = 32 * BYTES_PER_MIB;

/**
 * Cross-origin isolation enables SharedArrayBuffer, which the multi-threaded ONNX Runtime wasm needs.
 * Sent by Vite in development and preview, and by vercel.json in production (config.test.ts keeps both equal).
 */
export const CROSS_ORIGIN_ISOLATION_HEADERS = Object.freeze({
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
});

/**
 * Same-origin prefix of the API: Vite proxies it in development and preview, vercel.json rewrites it in
 * production. Mirrors the default of VITE_API_BASE_URL in src/config/env.ts.
 */
export const API_PROXY_PREFIX = '/api';
/** Loopback host of the local servers (Vite, the local API and the e2e run). */
export const LOCAL_HOST = '127.0.0.1';
/** Port of the local API (uvicorn's default in the backend repository). */
export const LOCAL_API_PORT = 8000;
/**
 * API route the e2e run polls until the local API is ready: the offline checks need the model manifest.
 * Mirrors API_ROUTES.modelLatest of src/config/api.ts, which Node cannot import (config.test.ts keeps them equal).
 */
export const E2E_API_READINESS_PATH = '/v1/model/latest';

/** Build-time variables. Without the VITE_ prefix, so Vite never exposes them to the client bundle. */
export const BUILD_ENV = Object.freeze({
  apiProxyTarget: 'API_PROXY_TARGET',
  devPort: 'DEV_PORT',
  previewPort: 'PREVIEW_PORT',
});
/** Defaults of BUILD_ENV, documented in .env.example. The ports are Vite's own defaults. */
export const BUILD_ENV_DEFAULTS = Object.freeze({
  apiProxyTarget: `http://${LOCAL_HOST}:${String(LOCAL_API_PORT)}`,
  devPort: 5173,
  previewPort: 4173,
});

/** Test bridge that `npm run test:offline` builds after the production build and e2e/ injects into pages. */
export const OFFLINE_CHECK_ENTRY = 'src/test/browser/offline.ts';
export const OFFLINE_CHECK_NAME = 'offline-check';
export const OFFLINE_CHECK_DIR = `${TMP_DIR}/${OFFLINE_CHECK_NAME}`;
/** Vite library build output: `<fileName>.js` because package.json declares `"type": "module"`. */
export const OFFLINE_CHECK_BUNDLE = `${OFFLINE_CHECK_DIR}/${OFFLINE_CHECK_NAME}.js`;
