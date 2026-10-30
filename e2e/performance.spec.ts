import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../src/config/storage';
import { routeHash } from '../src/app/routes';
import { DEFAULT_LOCALE } from '../src/i18n/locales';
import { dictionaries } from '../src/i18n/allMessages';

/**
 * Evidence for RNF-03 (no main-thread task over 50 ms while listening) and RNF-01 (time per window), measured with the
 * production build: Chrome's fake microphone feeds the real capture, worklet, workers and model for a minute, the Long
 * Tasks API records the page's main thread, and the app's own session summary gives the windows. The figures are
 * printed for docs/evaluacion.md; the test only fails when listening does not work at all, because a desktop under a
 * test runner is not the phone the requirements speak of.
 */
const texts = dictionaries[DEFAULT_LOCALE];
/** The first model download takes most of a minute on the local preview. */
const MODEL_READY_TIMEOUT_MS = 120_000;
/** About forty windows of 1.5 s. */
const LISTENING_MS = 60_000;

interface Summary { readonly analysed: number; readonly dropped: number; readonly medianMs: number; readonly p90Ms: number; readonly maxMs: number }

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['microphone'] });
test.setTimeout(MODEL_READY_TIMEOUT_MS + LISTENING_MS + 60_000);

test('a minute of listening reports its main-thread long tasks and time per window (RNF-01, RNF-03)', async ({ page }) => {
  await page.addInitScript(([key, value]) => { localStorage.setItem(key, value); }, [STORAGE_KEYS.preferences, JSON.stringify({ welcomed: true })] as const);
  await page.goto(`/${routeHash({ name: 'listen' })}`);
  const start = page.getByRole('button', { name: texts.listen.record.start });
  await expect(start).toBeEnabled({ timeout: MODEL_READY_TIMEOUT_MS });
  // Only the tasks from the start of listening count: loading the page is RNF-05's business, not RNF-03's.
  await page.evaluate(() => {
    const tasks: { at: number; duration: number }[] = [];
    const startedAt = performance.now();
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push({ at: Math.round(entry.startTime - startedAt), duration: Math.round(entry.duration) });
    }).observe({ type: 'longtask' });
    (window as unknown as { longTasks: typeof tasks }).longTasks = tasks;
  });
  await start.click();
  await page.waitForTimeout(LISTENING_MS);
  // The page and the live player both offer to stop.
  await page.getByRole('button', { name: texts.listen.record.stopName }).first().click();
  const tasks = await page.evaluate(() => (window as unknown as { longTasks: { at: number; duration: number }[] }).longTasks);
  const [session] = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.performance) ?? '[]') as Summary[];
  if (!session) throw new Error('The session left no summary.');
  const measurement = `long tasks over 50 ms: ${tasks.map((task) => `${String(task.duration)} ms at ${String(task.at)} ms`).join(', ') || 'none'}; `
    + `windows analysed ${String(session.analysed)}, dropped ${String(session.dropped)}; per window median ${String(Math.round(session.medianMs))} ms, `
    + `p90 ${String(Math.round(session.p90Ms))} ms, max ${String(Math.round(session.maxMs))} ms`;
  console.log(measurement);
  test.info().annotations.push({ type: 'measurement', description: measurement });
  expect(session.analysed).toBeGreaterThan(0);
});
