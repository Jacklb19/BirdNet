import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { BUILD_ENV, E2E_API_READINESS_PATH, E2E_DIR, LOCAL_API_PORT, LOCAL_HOST } from './build.config.mjs';

// Offline e2e run: the production build served by `vite preview`, plus the local API fixture from the
// backend repository (tests/local_server.py). Every value can be overridden through the environment.

function integerFromEnv(key, fallback) {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
  return value;
}

const E2E_HOST = process.env.E2E_HOST?.trim() || LOCAL_HOST;
const E2E_PORT = integerFromEnv('E2E_PORT', 9014);
const E2E_API_PORT = integerFromEnv('E2E_API_PORT', LOCAL_API_PORT);
const APP_ORIGIN = `http://${E2E_HOST}:${String(E2E_PORT)}`;
const API_ORIGIN = `http://${E2E_HOST}:${String(E2E_API_PORT)}`;

// Unset means Playwright's bundled Chromium (`npx playwright install chromium`); e.g. "msedge" or "chrome".
const PW_CHANNEL = process.env.PW_CHANNEL?.trim() || undefined;
const PW_HEADLESS = process.env.PW_HEADLESS !== 'false';
// The model download and offline inference make single tests slow; CI machines may need more.
const TEST_TIMEOUT_MS = integerFromEnv('E2E_TIMEOUT_MS', 120_000);
const SERVER_START_TIMEOUT_MS = integerFromEnv('E2E_SERVER_TIMEOUT_MS', 30_000);

// The backend repository checked out next to this one, with its virtual environment.
const BACKEND_DIR = process.env.BACKEND_DIR?.trim() || join('..', 'backend');
const VENV_PYTHON = process.platform === 'win32' ? join('Scripts', 'python.exe') : join('bin', 'python');
const BACKEND_PYTHON = process.env.BACKEND_PYTHON?.trim() || join(BACKEND_DIR, '.venv', VENV_PYTHON);

export default defineConfig({
  testDir: `./${E2E_DIR}`, timeout: TEST_TIMEOUT_MS, workers: 1, fullyParallel: false,
  use: { baseURL: APP_ORIGIN, channel: PW_CHANNEL, headless: PW_HEADLESS },
  webServer: [
    {
      command: `"${BACKEND_PYTHON}" -m uvicorn tests.local_server:app --app-dir "${BACKEND_DIR}" --host ${E2E_HOST} --port ${String(E2E_API_PORT)} --no-access-log`,
      url: `${API_ORIGIN}${E2E_API_READINESS_PATH}`, reuseExistingServer: false, timeout: SERVER_START_TIMEOUT_MS,
    },
    {
      command: `node node_modules/vite/bin/vite.js preview --host ${E2E_HOST} --port ${String(E2E_PORT)} --strictPort`,
      url: APP_ORIGIN, reuseExistingServer: false, timeout: SERVER_START_TIMEOUT_MS,
      // The preview proxy must reach the API started above, whatever API_PROXY_TARGET says locally.
      // Playwright passes only these variables when env is set, so the current environment (PATH) is kept.
      env: { ...process.env, [BUILD_ENV.apiProxyTarget]: API_ORIGIN },
    },
  ],
});
