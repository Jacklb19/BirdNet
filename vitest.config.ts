import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { COVERAGE_DIR, E2E_DIR, IGNORED_DIRS } from './build.config.mjs';

/** Project policy: minimum share of source covered by unit tests, applied to every coverage metric. */
const COVERAGE_MIN_PERCENT = 70;

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Playwright owns the e2e specs; generated and third-party directories hold no unit tests.
    exclude: [...IGNORED_DIRS, E2E_DIR].map((dir) => `${dir}/**`),
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: COVERAGE_DIR,
      thresholds: {
        lines: COVERAGE_MIN_PERCENT,
        functions: COVERAGE_MIN_PERCENT,
        branches: COVERAGE_MIN_PERCENT,
        statements: COVERAGE_MIN_PERCENT,
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
      ],
    },
  },
});
