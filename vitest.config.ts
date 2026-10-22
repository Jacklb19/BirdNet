import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { COVERAGE_DIR, E2E_DIR, IGNORED_DIRS } from './build.config.mjs';

/** Project policy: minimum share of the domain logic covered by unit tests, applied to every coverage metric. */
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
      /*
       * Unit tests cover the domain logic: algorithms, policies, parsers and API contracts (AGENTS.md). Screens are not
       * unit-tested by design, and code that only binds to a browser API is exercised by the e2e suite in a real
       * browser (IndexedDB stores, service worker, workers, MapLibre layers, WebCodecs), so neither counts here.
       */
      include: ['src/**/*.ts'],
      exclude: [
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.ts',
        // Texts and constants hold no logic.
        '**/i18n.ts',
        '**/*.config.ts',
        // React glue: hooks and contexts that wire the logic below into the screens.
        '**/use*.ts',
        '**/*Context.ts',
        // Browser bindings checked end to end.
        '**/*Store.ts',
        '**/*.worker.ts',
        'src/features/offline/service-worker.ts',
        'src/features/audio/worklet/**',
        'src/features/map/map{Layers,Markers,Popup,WalkLayers}.ts',
        'src/features/map/ownMap.ts',
        'src/features/recordings/encodeClip.ts',
      ],
    },
  },
});
