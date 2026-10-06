import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const bridge = fs.readFileSync('tmp/offline-check/offline-check.js', 'utf8');
async function ready(page: Page): Promise<void> {
  await page.goto('/');
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
  const before = await (await page.request.get('/api/test/counts')).json() as { detections: number };
  await page.request.post('/api/test/lose-ack');
  const failed = await page.evaluate(async () => {
    try { await window.offlineChecks.synchronizeQueue(); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(3);
  await page.evaluate(() => window.offlineChecks.synchronizeQueue());
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
  const after = await (await page.request.get('/api/test/counts')).json() as { detections: number };
  expect(after.detections - before.detections).toBe(3);
});

test('service worker finishes a synchronization after the initiating page closes', async ({ page, context }) => {
  await ready(page);
  const before = await (await page.request.get('/api/test/counts')).json() as { detections: number };
  await page.evaluate(async () => {
    await window.offlineChecks.bind(); await window.offlineChecks.seed(2);
    const channel = new MessageChannel();
    navigator.serviceWorker.controller?.postMessage({ type: 'SYNC' }, [channel.port2]);
  });
  await page.close();
  await expect.poll(async () => {
    const current = await (await context.request.get('/api/test/counts')).json() as { detections: number };
    return current.detections - before.detections;
  }).toBe(2);
  const reopened = await context.newPage();
  await ready(reopened);
  expect((await reopened.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
});

test('audio remains queued after metadata; revocation prevents uploads until permission returns', async ({ page }) => {
  await ready(page);
  const before = await (await page.request.get('/api/test/counts')).json() as { uploads: number; jobs: number };
  await page.evaluate(async () => {
    await window.offlineChecks.bind(); await window.offlineChecks.updateSettings({ audioConsent: true });
    await window.offlineChecks.seed(1, 0.6); await window.offlineChecks.updateSettings({ audioConsent: false });
    await window.offlineChecks.synchronizeQueue();
  });
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(1);
  const revoked = await (await page.request.get('/api/test/counts')).json() as { uploads: number };
  expect(revoked.uploads).toBe(before.uploads);
  await page.evaluate(async () => { await window.offlineChecks.updateSettings({ audioConsent: true }); await window.offlineChecks.synchronizeQueue(); });
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
  const delivered = await (await page.request.get('/api/test/counts')).json() as { uploads: number; jobs: number };
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
  await ready(page);
  await page.getByRole('button', { name: 'Configuración', exact: true }).click();
  await page.getByRole('button', { name: 'Descargar modelo para usar sin conexión' }).click();
  await expect(page.getByRole('button', { name: 'Comprobar y descargar versión del modelo' })).toBeVisible({ timeout: 90000 });
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

for (const width of [360, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`offline controls remain usable at ${String(width)}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await ready(page);
      await page.getByRole('button', { name: 'Configuración', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Autorizar el envío de fragmentos dudosos para verificación' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `tmp/sprint4-${String(width)}-${theme}.png`, fullPage: true });
    });
  }
}
