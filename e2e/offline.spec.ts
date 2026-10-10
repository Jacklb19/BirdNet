import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { API_PROXY_PREFIX, OFFLINE_CHECK_BUNDLE, TMP_DIR } from '../build.config.mjs';
import { OFFLINE_OPERATIONS, type OfflineRequestMessage } from '../src/features/offline/offline.constants';
import { STORAGE_KEYS } from '../src/config/storage';
import { routeHash } from '../src/app/routes';
import { DEFAULT_LOCALE } from '../src/i18n/locales';
import { dictionaries } from '../src/i18n/messages';

/** Labels come from the interface dictionaries, so copy changes do not break the suite. */
const texts = dictionaries[DEFAULT_LOCALE];

/** Widths every screen is reviewed at (phone and desktop). */
const REVIEW_WIDTHS = [360, 1280] as const;
const REVIEW_HEIGHT = 900;
const THEMES = ['light', 'dark'] as const;
/** The first model download fetches about 37 MiB, far beyond the default expectation timeout. */
const MODEL_DOWNLOAD_TIMEOUT_MS = 90_000;
/** Fault-injection routes of the backend fixture (tests/local_server.py), reached through the preview proxy. */
const FIXTURE_ROUTES = {
  counts: `${API_PROXY_PREFIX}/test/counts`,
  loseAck: `${API_PROXY_PREFIX}/test/lose-ack`,
} as const;

const bridge = fs.readFileSync(OFFLINE_CHECK_BUNDLE, 'utf8');
async function ready(page: Page, hash = ''): Promise<void> {
  // Skip the first-run introduction: these checks start from an already welcomed installation.
  await page.addInitScript(([key, value]) => { localStorage.setItem(key, value); }, [STORAGE_KEYS.preferences, JSON.stringify({ welcomed: true })] as const);
  await page.goto(`/${hash}`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.addScriptTag({ content: bridge, type: 'module' });
  await page.waitForFunction(() => Boolean(window.offlineChecks));
}

test('500 detections survive closing and offline reopening; quota rejects new writes atomically', async ({ context, page }) => {
  await ready(page);
  await page.evaluate(async () => { await window.offlineChecks.seed(500); });
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(500);
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await ready(reopened);
  expect((await reopened.evaluate(() => window.offlineChecks.queueStats())).count).toBe(500);
  await reopened.evaluate(async () => {
    await window.offlineChecks.updateSettings({ maxBytes: 1024 * 1024, audioConsent: true });
    await window.offlineChecks.seed(3, 0.6);
  });
  const before = await reopened.evaluate(() => window.offlineChecks.queueStats());
  const failed = await reopened.evaluate(async () => {
    try { await window.offlineChecks.seed(1, 0.6); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  expect(await reopened.evaluate(() => window.offlineChecks.queueStats())).toEqual(before);
});

test('response loss after commit retains queue; retry against PostgreSQL produces no duplicates', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => { await window.offlineChecks.bind(); await window.offlineChecks.seed(3); });
  const before = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { detections: number };
  await page.request.post(FIXTURE_ROUTES.loseAck);
  const failed = await page.evaluate(async () => {
    try { await window.offlineChecks.synchronizeQueue(); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(3);
  await page.evaluate(() => window.offlineChecks.synchronizeQueue());
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
  const after = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { detections: number };
  expect(after.detections - before.detections).toBe(3);
});

test('service worker finishes a synchronization after the initiating page closes', async ({ page, context }) => {
  await ready(page);
  const before = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { detections: number };
  const syncRequest: OfflineRequestMessage<typeof OFFLINE_OPERATIONS.sync> = { type: OFFLINE_OPERATIONS.sync };
  await page.evaluate(async (request) => {
    await window.offlineChecks.bind(); await window.offlineChecks.seed(2);
    const channel = new MessageChannel();
    navigator.serviceWorker.controller?.postMessage(request, [channel.port2]);
  }, syncRequest);
  await page.close();
  await expect.poll(async () => {
    const current = await (await context.request.get(FIXTURE_ROUTES.counts)).json() as { detections: number };
    return current.detections - before.detections;
  }).toBe(2);
  const reopened = await context.newPage();
  await ready(reopened);
  expect((await reopened.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
});

test('audio remains queued after metadata; revocation prevents uploads until permission returns', async ({ page }) => {
  await ready(page);
  const before = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { uploads: number; jobs: number };
  await page.evaluate(async () => {
    await window.offlineChecks.bind(); await window.offlineChecks.updateSettings({ audioConsent: true });
    await window.offlineChecks.seed(1, 0.6); await window.offlineChecks.updateSettings({ audioConsent: false });
    await window.offlineChecks.synchronizeQueue();
  });
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(1);
  const revoked = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { uploads: number };
  expect(revoked.uploads).toBe(before.uploads);
  await page.evaluate(async () => { await window.offlineChecks.updateSettings({ audioConsent: true }); await window.offlineChecks.synchronizeQueue(); });
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
  const delivered = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { uploads: number; jobs: number };
  expect(delivered.uploads - before.uploads).toBe(1);
  expect(delivered.jobs - before.jobs).toBe(1);
});

test('unassociated records and records without location stay local', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    await window.offlineChecks.seed(1); await window.offlineChecks.synchronizeQueue();
  });
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).waitingAccount).toBe(1);
  await page.evaluate(async () => { await window.offlineChecks.bind(false); await window.offlineChecks.seed(1, 0.9, false); await window.offlineChecks.synchronizeQueue(); });
  const result = await page.evaluate(() => window.offlineChecks.queueStats());
  expect(result.count).toBe(2);
  expect(result.waitingLocation).toBe(1);
});

test('real model survives closing, identifies recorded audio offline and detects corrupt cache', async ({ context, page }) => {
  await ready(page, routeHash({ name: 'settings' }));
  // Once the person has entered the app the model installs itself (ADR-19): no button has to be pressed. Its
  // details live under the technical options.
  await page.locator('details').evaluate((group: HTMLDetailsElement) => { group.open = true; });
  await expect(page.getByRole('button', { name: texts.settings.model.checkUpdate })).toBeVisible({ timeout: MODEL_DOWNLOAD_TIMEOUT_MS });
  const failedUpdate = await page.evaluate(async () => {
    try { await window.offlineChecks.invalidUpdate(); return false; } catch { return true; }
  });
  expect(failedUpdate).toBe(true);
  expect(await page.evaluate(() => window.offlineChecks.cachedModel())).not.toBeNull();
  await page.evaluate(() => window.offlineChecks.loadReference());
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await ready(reopened);
  expect(await reopened.evaluate(() => window.offlineChecks.inferReference())).toContain('Turdus fuscater');
  expect((await reopened.evaluate(() => window.offlineChecks.queueStats())).count).toBeGreaterThan(0);
  await reopened.evaluate(() => window.offlineChecks.corruptModel());
  expect(await reopened.evaluate(() => window.offlineChecks.cachedModel())).toBeNull();
});

for (const width of REVIEW_WIDTHS) {
  for (const theme of THEMES) {
    test(`offline controls remain usable at ${String(width)}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: REVIEW_HEIGHT });
      await page.emulateMedia({ colorScheme: theme });
      await ready(page, routeHash({ name: 'settings' }));
      await expect(page.getByRole('switch', { name: texts.settings.permissions.audio })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${TMP_DIR}/offline-${String(width)}-${theme}.png`, fullPage: true });
    });
  }
}
