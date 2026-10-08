// Types of build.config.mjs for the TypeScript configs and tests that import it. Values and their
// documentation live only in build.config.mjs.

export declare const PUBLIC_DIR: string;
export declare const OUT_DIR: string;
export declare const ASSETS_DIR: string;
export declare const TMP_DIR: string;
export declare const E2E_DIR: string;
export declare const COVERAGE_DIR: string;
export declare const IGNORED_DIRS: readonly string[];

export declare const APP_SHELL_HTML: string;
export declare const WEB_MANIFEST: string;
export declare const ICONS_DIR: string;
export declare const MODEL_ASSETS_DIR: string;
export declare const MODEL_FILES: Readonly<{ manifest: string; labels: string; speciesNames: string }>;

export declare const SW_ENTRY: string;
export declare const SW_SOURCE: string;
export declare const SW_FILENAME: string;

export declare const ASSET_FILE_PATTERN: string;
export declare const HASHED_OUTPUT_NAMES: Readonly<{ entryFileNames: string; chunkFileNames: string; assetFileNames: string }>;
export declare const INFERENCE_WORKER_CHUNK: string;
export declare function hashedAssetRegExp(options?: {
  readonly name?: string;
  readonly extension?: string;
  readonly flags?: string;
}): RegExp;

export declare const PRECACHE_GLOB_PATTERNS: readonly string[];
export declare const PRECACHE_MAX_BYTES: number;

export declare const CROSS_ORIGIN_ISOLATION_HEADERS: Readonly<{
  'Cross-Origin-Opener-Policy': string;
  'Cross-Origin-Embedder-Policy': string;
}>;

export declare const API_PROXY_PREFIX: string;
export declare const LOCAL_HOST: string;
export declare const LOCAL_API_PORT: number;
export declare const E2E_API_READINESS_PATH: string;
export declare const BUILD_ENV: Readonly<{ apiProxyTarget: string; devPort: string; previewPort: string }>;
export declare const BUILD_ENV_DEFAULTS: Readonly<{ apiProxyTarget: string; devPort: number; previewPort: number }>;

export declare const OFFLINE_CHECK_ENTRY: string;
export declare const OFFLINE_CHECK_NAME: string;
export declare const OFFLINE_CHECK_DIR: string;
export declare const OFFLINE_CHECK_BUNDLE: string;
