import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { API_PROXY_PREFIX, OFFLINE_CHECK_BUNDLE, OUT_DIR, TMP_DIR } from '../build.config.mjs';
import { MIN_QUEUE_BYTES, OFFLINE_OPERATIONS, SERVICE_WORKER_URL, type OfflineRequestMessage } from '../src/features/offline/offline.constants';
import { STORAGE_KEYS } from '../src/config/storage';
import { routeHash } from '../src/app/routes';
import { DEFAULT_LOCALE } from '../src/i18n/locales';
import { dictionaries } from '../src/i18n/allMessages';
import productionManifest from '../public/models/manifest.json' with { type: 'json' };

/** Labels come from the interface dictionaries, so copy changes do not break the suite. */
const texts = dictionaries[DEFAULT_LOCALE];

/** Widths every screen is reviewed at (phone and desktop). */
const REVIEW_WIDTHS = [360, 1280] as const;
const REVIEW_HEIGHT = 900;
const THEMES = ['light', 'dark'] as const;
/** The first model download fetches about 37 MiB, far beyond the default expectation timeout. */
const MODEL_DOWNLOAD_TIMEOUT_MS = 90_000;
/** A browser lets a new worker take over once the previous one has been idle, which can take about half a minute. */
const UPDATE_TAKEOVER_TIMEOUT_MS = 75_000;
/** Fault-injection routes of the backend fixture (tests/local_server.py), reached through the preview proxy. */
const FIXTURE_ROUTES = {
  counts: `${API_PROXY_PREFIX}/test/counts`,
  loseAck: `${API_PROXY_PREFIX}/test/lose-ack`,
  loseWalkAck: `${API_PROXY_PREFIX}/test/lose-walk-ack`,
  loseNoteAck: `${API_PROXY_PREFIX}/test/lose-note-ack`,
} as const;

const bridge = fs.readFileSync(OFFLINE_CHECK_BUNDLE, 'utf8');
async function ready(page: Page, hash = ''): Promise<void> {
  // These checks start from an installation that has already opened the app, so the model manages itself.
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
  await reopened.evaluate(async (maxBytes) => { await window.offlineChecks.updateSettings({ maxBytes }); }, MIN_QUEUE_BYTES);
  // Every seeded record takes the same space, so the queue can be filled until exactly one more would fit.
  const seeded = await reopened.evaluate(() => window.offlineChecks.queueStats());
  const room = Math.floor((MIN_QUEUE_BYTES - seeded.bytes) / (seeded.bytes / seeded.count));
  await reopened.evaluate(async (size) => { await window.offlineChecks.seedWindow(size); }, room - 1);
  const before = await reopened.evaluate(() => window.offlineChecks.queueStats());
  expect(before.count).toBe(seeded.count + room - 1);
  // A window of two does not fit whole, so neither of its records is kept, although one alone still fits.
  const failed = await reopened.evaluate(async () => {
    try { await window.offlineChecks.seedWindow(2); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  expect(await reopened.evaluate(() => window.offlineChecks.queueStats())).toEqual(before);
  await reopened.evaluate(async () => { await window.offlineChecks.seed(1); });
  expect((await reopened.evaluate(() => window.offlineChecks.queueStats())).count).toBe(before.count + 1);
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

test('a walk goes to the account only with the permission, once, and is marked saved only with the answer', async ({ page }) => {
  await ready(page);
  const id = await page.evaluate(async () => { await window.offlineChecks.bind(); return window.offlineChecks.seedWalk(); });
  const walks = async (): Promise<number> => ((await (await page.request.get(FIXTURE_ROUTES.counts)).json()) as { walks: number }).walks;
  const before = await walks();
  const stateOf = (): Promise<string | undefined> => page.evaluate(async (walkId) => (await window.offlineChecks.listWalks()).find((walk) => walk.id === walkId)?.account, id);
  // Without the person's yes the path never leaves the phone.
  await page.evaluate(() => window.offlineChecks.synchronizeQueue());
  expect(await walks()).toBe(before);
  await page.evaluate(() => window.offlineChecks.updateSettings({ saveWalks: true }));
  await page.request.post(FIXTURE_ROUTES.loseWalkAck);
  const failed = await page.evaluate(async () => {
    try { await window.offlineChecks.synchronizeQueue(); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  expect(await stateOf()).toBeUndefined();
  await page.evaluate(() => window.offlineChecks.synchronizeQueue());
  expect(await stateOf()).toBe('saved');
  expect(await walks()).toBe(before + 1);
});

test('a note goes to the account after its detection, once, and is marked sent only with the answer', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => { await window.offlineChecks.bind(); await window.offlineChecks.seed(1); });
  const notes = async (): Promise<number> => ((await (await page.request.get(FIXTURE_ROUTES.counts)).json()) as { notes: number }).notes;
  const before = await notes();
  const [record] = await page.evaluate(() => window.offlineChecks.listDetections());
  if (!record) throw new Error('No seeded record.');
  await page.evaluate(async (id) => { await window.offlineChecks.saveNote(id, { note: 'Dos cantando', individuals: 2 }); }, record.id);
  const stateOf = (): Promise<string | undefined> => page.evaluate(async (id) => (await window.offlineChecks.listNotes()).find((note) => note.id === id)?.sync, record.id);
  await page.request.post(FIXTURE_ROUTES.loseNoteAck);
  // The detection goes first; the note's answer is lost after the database kept it.
  const failed = await page.evaluate(async () => {
    try { await window.offlineChecks.synchronizeQueue(); return false; } catch { return true; }
  });
  expect(failed).toBe(true);
  expect(await stateOf()).toBe('pending');
  await page.evaluate(() => window.offlineChecks.synchronizeQueue());
  expect(await stateOf()).toBe('done');
  expect(await notes()).toBe(before + 1);
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

// Regression: phones that had the removed doubtful-audio upload turned on keep WAV fragments nothing reads any more,
// and records marked as sent that used to wait for them.
test('fragments left by the removed doubtful-audio upload are deleted and their records synchronize', async ({ page }) => {
  await ready(page);
  const before = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { detections: number };
  await page.evaluate(async () => { await window.offlineChecks.bind(); await window.offlineChecks.seed(1, 0.6); });
  const queued = await page.evaluate(() => window.offlineChecks.queueStats());
  await page.evaluate(() => window.offlineChecks.leaveLegacyFragment());
  // The next time the app is opened.
  await ready(page);
  expect(await page.evaluate(() => window.offlineChecks.queueStats())).toEqual(queued);
  expect(await page.evaluate(() => window.offlineChecks.legacyFragments())).toBe(0);
  await page.evaluate(() => window.offlineChecks.synchronizeQueue());
  expect((await page.evaluate(() => window.offlineChecks.queueStats())).count).toBe(0);
  const after = await (await page.request.get(FIXTURE_ROUTES.counts)).json() as { detections: number };
  expect(after.detections - before.detections).toBe(1);
});

test('deleting an account forgets its records on the phone and keeps those of another account', async ({ page }) => {
  await ready(page);
  const other = '00000000-0000-4000-8000-0000000000ff';
  const foreign = await page.evaluate(async (owner) => {
    const kept = await window.offlineChecks.seedForeign(owner);
    // Records of the account, records that had none, and a walk without owner: all of them go.
    await window.offlineChecks.seed(1);
    await window.offlineChecks.bind(false);
    await window.offlineChecks.seed(2);
    await window.offlineChecks.seedWalk();
    await window.offlineChecks.updateSettings({ saveWalks: true, shareMap: true });
    return kept;
  }, other);
  const owner = (await page.evaluate(() => window.offlineChecks.getSettings())).session?.userId;
  expect(owner).toBeTruthy();
  await page.evaluate((userId) => window.offlineChecks.forgetAccountOnPhone(userId), owner ?? '');
  const left = await page.evaluate(async () => ({
    records: (await window.offlineChecks.listDetections()).map((row) => ({ id: row.id, owner: row.owner })),
    walks: (await window.offlineChecks.listWalks()).length,
    settings: await window.offlineChecks.getSettings(),
  }));
  expect(left.records).toEqual([{ id: foreign, owner: other }]);
  expect(left.walks).toBe(0);
  expect(left.settings.session).toBeNull();
  expect(left.settings.saveWalks).toBeUndefined();
  expect(left.settings.shareMap).toBeUndefined();
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

test('the preview model arrives by itself after the first, both listen by default, and removing it is a lasting choice', async ({ context, page }) => {
  const detection = texts.settings.detection;
  // The queue is read in the order of its random identifiers, so what a listen stored is told apart by what was there before.
  const versions = async (target: Page): Promise<Map<string, string>> =>
    new Map((await target.evaluate(() => window.offlineChecks.listDetections())).map((record) => [record.id, record.model_version]));
  await ready(page, routeHash({ name: 'settings' }));
  await page.locator('details').evaluate((group: HTMLDetailsElement) => { group.open = true; });
  await expect(page.getByRole('button', { name: texts.settings.model.checkUpdate })).toBeVisible({ timeout: MODEL_DOWNLOAD_TIMEOUT_MS });
  // Once the first model is in, the second downloads in the background without being asked (ADR-36), and both listen.
  await expect(page.getByRole('button', { name: detection.second.remove })).toBeVisible({ timeout: MODEL_DOWNLOAD_TIMEOUT_MS });
  await expect(page.getByRole('radio', { name: detection.models.combined.label })).toBeChecked();
  expect((await page.evaluate(() => window.offlineChecks.getSettings())).detectionModel).toBeUndefined();
  await page.getByText(detection.models.preview.label).click();
  await expect(page.getByRole('radio', { name: detection.models.preview.label })).toBeChecked();
  await page.evaluate(() => window.offlineChecks.loadReference());
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await ready(reopened, routeHash({ name: 'settings' }));
  // The preview model takes the window at its own rate and still hears the reference bird, without a connection.
  expect(await reopened.evaluate(() => window.offlineChecks.inferReference())).toContain('Turdus fuscater');
  const withPreview = await versions(reopened);
  expect(withPreview.size).toBeGreaterThan(0);
  for (const version of withPreview.values()) expect(version).toContain(productionManifest.alternate.model_id);
  await reopened.locator('details').evaluate((group: HTMLDetailsElement) => { group.open = true; });
  await reopened.getByRole('button', { name: detection.second.remove }).click();
  await expect.poll(() => reopened.evaluate(() => window.offlineChecks.cachedAlternate())).toBeNull();
  // Removing it chose the first model, so a later visit does not download it again by itself.
  expect((await reopened.evaluate(() => window.offlineChecks.getSettings())).detectionModel).toBe('standard');
  // The choice that needed it falls back to the model every installation has.
  expect(await reopened.evaluate(() => window.offlineChecks.inferReference())).toContain('Turdus fuscater');
  const afterRemoval = [...await versions(reopened)].filter(([id]) => !withPreview.has(id)).map(([, version]) => version);
  expect(afterRemoval.length).toBeGreaterThan(0);
  for (const version of afterRemoval) {
    expect(version).toContain(productionManifest.model_id);
    expect(version).not.toContain(productionManifest.alternate.model_id);
  }
});

// Regression: a new version stayed behind the old one for as long as any tab was open, however often it was reloaded.
test('a new version takes over while the app is open and is offered, not forced on the person', async ({ page }) => {
  test.setTimeout(3 * UPDATE_TAKEOVER_TIMEOUT_MS);
  const workerFile = path.join(OUT_DIR, SERVICE_WORKER_URL);
  const original = fs.readFileSync(workerFile, 'utf8');
  /** Publishes another version of the worker and makes the browser notice it, as a deployment would. */
  const publish = async (version: string): Promise<void> => {
    fs.writeFileSync(workerFile, [original, `// ${version}`, ''].join('\n'));
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  };
  const waiting = (): Promise<boolean> => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  const offer = page.getByRole('button', { name: texts.app.update.action });
  const loads: string[] = [];
  page.on('load', () => { loads.push(page.url()); });
  try {
    await ready(page, routeHash({ name: 'settings' }));
    await expect(offer).toHaveCount(0);
    const loadsBefore = loads.length;
    await publish('second version');
    await expect(offer).toBeVisible({ timeout: UPDATE_TAKEOVER_TIMEOUT_MS });
    // The new worker is in charge, and the page was not reloaded under the person.
    expect(await waiting()).toBe(false);
    expect(loads).toHaveLength(loadsBefore);
    await Promise.all([page.waitForEvent('load'), offer.click()]);
    await expect(page.getByRole('heading', { name: texts.settings.title })).toBeVisible();
    await expect(offer).toHaveCount(0);

    // Someone who ignores the offer gets the new version the next time they open the app.
    await publish('third version');
    await expect(offer).toBeVisible({ timeout: UPDATE_TAKEOVER_TIMEOUT_MS });
    await page.reload();
    await expect(page.getByRole('heading', { name: texts.settings.title })).toBeVisible();
    await expect(offer).toHaveCount(0);
    expect(await waiting()).toBe(false);
  } finally {
    fs.writeFileSync(workerFile, original);
  }
});

for (const width of REVIEW_WIDTHS) {
  for (const theme of THEMES) {
    test(`offline controls remain usable at ${String(width)}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: REVIEW_HEIGHT });
      await page.emulateMedia({ colorScheme: theme });
      await ready(page, routeHash({ name: 'settings' }));
      await expect(page.getByRole('switch', { name: texts.settings.permissions.location })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${TMP_DIR}/offline-${String(width)}-${theme}.png`, fullPage: true });
    });
  }
}
