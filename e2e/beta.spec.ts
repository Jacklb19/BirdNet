import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { API_PROXY_PREFIX, E2E_SUPABASE, OFFLINE_CHECK_BUNDLE } from '../build.config.mjs';
import { journalMessages } from '../src/features/journal/i18n';
import { assistantMessages } from '../src/features/assistant/i18n';
import { buildHasAccounts } from './builds';
import { storeSession, testSession, testUser, type TestSession } from './session';

test.skip(!buildHasAccounts, 'Build the account fixture first.');
const bridge = readFileSync(OFFLINE_CHECK_BUNDLE, 'utf8');
const t = journalMessages.es; const a = assistantMessages.es;
const consentVersion = 'assistant-text-v1';
async function signedIn(page: Page): Promise<TestSession> {
  const session = await testSession(page); const user = testUser(session);
  await page.route(`${E2E_SUPABASE.url}/auth/v1/**`, (route) => route.fulfill({ json: route.request().url().endsWith('/factors') ? { totp: [], phone: [], all: [] } : user }));
  await storeSession(page, session); return session;
}
async function checks(page: Page, session: TestSession): Promise<void> {
  const errors: string[] = []; page.on('pageerror', (error) => { errors.push(error.message); });
  await page.addScriptTag({ content: bridge, type: 'module' });
  await page.waitForFunction(() => Boolean(window.offlineChecks), undefined, { timeout: 5000 }).catch(() => { throw new Error(`Browser bridge failed: ${errors.join(' | ')}`); });
  await page.evaluate((session) => window.offlineChecks.bindJournal(session), session);
}
const bearer = (session: TestSession): Record<string, string> => ({ Authorization: `Bearer ${session.accessToken}` });

test.describe('private journal API integration', () => {
  test.use({ serviceWorkers: 'block' });
  test('lost creation responses retain the frozen request and later edit against the real API', async ({ page }) => {
    const session = await signedIn(page); await page.goto('/#/account'); await checks(page, session); const id = randomUUID();
    await page.evaluate(({ owner, id }) => window.offlineChecks.saveJournalEntity(owner, 'collection', { name: 'Before response loss', note: 'Private note' }, id), { owner: session.userId, id });
    await page.route(`**/v1/collections/${id}`, async (route) => { const response = await route.fetch(); expect(response.ok()).toBe(true); await route.fulfill({ status: 503, json: { detail: 'Simulated lost response' } }); });
    expect(await page.evaluate(async (owner) => { try { await window.offlineChecks.synchronizeJournal(owner); return false; } catch { return true; } }, session.userId)).toBe(true);
    await page.evaluate(({ owner, id }) => window.offlineChecks.saveJournalEntity(owner, 'collection', { name: 'After response loss', note: 'Edited note' }, id), { owner: session.userId, id });
    await page.unroute(`**/v1/collections/${id}`);
    await page.evaluate(async (owner) => { await window.offlineChecks.synchronizeJournal(owner); await window.offlineChecks.synchronizeJournal(owner); }, session.userId);
    const response = await page.request.get(`${API_PROXY_PREFIX}/v1/collections/${id}`, { headers: bearer(session) });
    expect(await response.json()).toMatchObject({ id, version: 2, name: 'After response loss', note: 'Edited note' });
    expect(await page.evaluate(async (owner) => (await window.offlineChecks.readJournal(owner)).entities.every((row) => !row.dirty), session.userId)).toBe(true);
  });
  test('a local visual observation joins a real outing and collection without becoming an acoustic detection', async ({ page }) => {
    const session = await signedIn(page); await page.goto('/#/journal'); await checks(page, session); const outing = randomUUID(); const observation = randomUUID(); const collection = randomUUID();
    await page.evaluate(async ({ owner, outing, observation, collection }) => {
      await window.offlineChecks.saveJournalEntity(owner, 'outing', { title: 'Dawn outing', kind: 'stationary', started_at: '2026-11-15T10:00:00Z', ended_at: null, note: null, site_id: null, walk_id: null }, outing);
      await window.offlineChecks.saveJournalEntity(owner, 'observation', { species: 'Turdus fuscater', observed_at: '2026-11-15T10:10:00Z', location: null, individuals: 2, note: 'Seen perched', outing_id: outing }, observation);
      await window.offlineChecks.saveJournalEntity(owner, 'collection', { name: 'Visual birds', note: null }, collection);
      await window.offlineChecks.setJournalRelation(owner, 'collectionItem', collection, observation, true, 'observation');
      await window.offlineChecks.synchronizeJournal(owner);
    }, { owner: session.userId, outing, observation, collection });
    await page.goto(`/#/journal/${outing}`); await expect(page.getByText(t.manual, { exact: true })).toBeVisible();
    const timeline = await (await page.request.get(`${API_PROXY_PREFIX}/v1/outings/${outing}/timeline`, { headers: bearer(session) })).json() as { events: Record<string, unknown>[] };
    expect(timeline.events).toEqual([{ id: observation, kind: 'observation', recorded_at: '2026-11-15T10:10:00Z', species: 'Turdus fuscater', individuals: 2 }]);
    await page.evaluate(async ({ owner, outing }) => { await window.offlineChecks.deleteJournalEntity(owner, 'outing', outing); await window.offlineChecks.synchronizeJournal(owner); await window.offlineChecks.refreshJournal(owner); }, { owner: session.userId, outing });
    const retained = await page.request.get(`${API_PROXY_PREFIX}/v1/observations/${observation}`, { headers: bearer(session) });
    expect(await retained.json()).toMatchObject({ source: 'manual', outing_id: null, note: 'Seen perched', version: 2 });
  });
  test('local account cleanup removes only that owner’s journal and photos', async ({ page }) => {
    const session = await signedIn(page); await page.goto('/#/account'); await checks(page, session); const other = randomUUID();
    const remaining = await page.evaluate(async ({ owner, other }) => {
      const observation = { species: 'Turdus fuscater', observed_at: '2026-11-15T12:00:00Z', location: null, individuals: null, note: null, outing_id: null };
      const own = await window.offlineChecks.saveJournalEntity(owner, 'observation', observation); const foreign = await window.offlineChecks.saveJournalEntity(other, 'observation', observation);
      await window.offlineChecks.saveJournalPhoto(owner, own, new Blob(['own'], { type: 'image/jpeg' })); await window.offlineChecks.saveJournalPhoto(other, foreign, new Blob(['other'], { type: 'image/jpeg' }));
      await window.offlineChecks.deleteJournalOf(owner);
      return { own: (await window.offlineChecks.readJournal(owner)).entities.length, other: (await window.offlineChecks.readJournal(other)).entities.length, ownPhoto: Boolean(await window.offlineChecks.getJournalPhoto(owner, own)), otherPhoto: Boolean(await window.offlineChecks.getJournalPhoto(other, foreign)) };
    }, { owner: session.userId, other });
    expect(remaining).toEqual({ own: 0, other: 1, ownPhoto: false, otherPhoto: true });
  });
  test('a visual photo is recoded locally while only its explicit metadata reaches the API', async ({ page }) => {
    const session = await signedIn(page); await page.goto('/#/observations'); await checks(page, session);
    await page.getByLabel(t.species, { exact: true }).fill('Turdus fuscater'); await page.getByLabel(t.note, { exact: true }).fill('Photo observation');
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16; canvas.getContext('2d')?.fillRect(0, 0, 16, 16); return canvas.toDataURL('image/png').split(',')[1] ?? ''; });
    await page.getByLabel(t.photo, { exact: true }).setInputFiles({ name: 'private-original.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('button', { name: t.save, exact: true }).click(); await expect(page).toHaveURL(/#\/observations\/[a-f0-9-]+$/);
    const id = new URL(page.url()).hash.split('/').at(-1) ?? '';
    const photo = await page.evaluate(async ({ owner, id }) => { const photo = await window.offlineChecks.getJournalPhoto(owner, id); return { type: photo?.type, size: photo?.size }; }, { owner: session.userId, id });
    expect(photo.type).toBe('image/jpeg'); expect(photo.size).toBeGreaterThan(0);
    await page.evaluate((owner) => window.offlineChecks.synchronizeJournal(owner), session.userId);
    const response = await (await page.request.get(`${API_PROXY_PREFIX}/v1/observations/${id}`, { headers: bearer(session) })).json() as Record<string, unknown>;
    expect(response).toMatchObject({ source: 'manual', note: 'Photo observation' }); expect(response).not.toHaveProperty('photo'); expect(response).not.toHaveProperty('confidence'); expect(response).not.toHaveProperty('filename');
  });
  test('text consent gates interpretation and a real private query waits for plan confirmation', async ({ page }) => {
    const session = await signedIn(page); const id = randomUUID();
    await page.request.put(`${API_PROXY_PREFIX}/v1/collections/${id}`, { headers: bearer(session), data: { expected_version: null, name: 'Confirmed plan collection', note: 'Never attach this note' } });
    let interpretations = 0; let queries = 0;
    page.on('request', (request) => { if (request.url().endsWith('/assistant/query')) queries++; });
    await page.route('**/assistant/interpret', async (route) => {
      interpretations++; expect(route.request().postDataJSON()).toMatchObject({ text: 'Mis colecciones', consent: { accepted: true, version: consentVersion } });
      expect(Object.keys(route.request().postDataJSON() as object).sort()).toEqual(['consent', 'limit', 'locale', 'text', 'tz']);
      await route.fulfill({ json: { status: 'ready', query: { intent: 'collections', locale: 'es', tz: 'UTC', limit: 20, before: null, after_id: null }, model: 'local-provider-double', generated_at: new Date().toISOString(), usage: { input_tokens: null, output_tokens: null, total_tokens: null } } });
    });
    await page.goto('/#/assistant'); await page.getByLabel(a.question, { exact: true }).fill('Mis colecciones');
    await expect(page.getByRole('button', { name: a.interpret, exact: true })).toBeDisabled();
    await page.getByLabel(a.consent, { exact: true }).check(); await page.getByRole('button', { name: a.interpret, exact: true }).click();
    await expect(page.getByRole('heading', { name: a.review })).toBeVisible(); expect(interpretations).toBe(1); expect(queries).toBe(0);
    await page.getByRole('button', { name: a.confirm, exact: true }).click(); await expect(page.locator(`a[href="#/collections/${id}"]`)).toBeVisible(); expect(queries).toBe(1);
    await page.getByRole('button', { name: a.withdraw, exact: true }).click(); await expect(page.getByLabel(a.consent, { exact: true })).not.toBeChecked();
  });
  for (const width of [360, 1280]) for (const locale of ['es', 'en'] as const) {
    test(`beta screens fit ${String(width)}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' }); const session = await signedIn(page);
      const outing = randomUUID(); const observation = randomUUID(); const collection = randomUUID(); const detection = randomUUID(); const headers = bearer(session);
      expect((await page.request.put(`${API_PROXY_PREFIX}/v1/outings/${outing}`, { headers, data: { expected_version: null, title: 'Dawn at the wetland', kind: 'stationary', started_at: '2026-11-15T10:00:00Z', ended_at: '2026-11-15T11:00:00Z', note: 'Quiet morning', site_id: null, walk_id: null } })).ok()).toBe(true);
      expect((await page.request.put(`${API_PROXY_PREFIX}/v1/observations/${observation}`, { headers, data: { expected_version: null, species: 'Turdus fuscater', observed_at: '2026-11-15T10:10:00Z', location: null, individuals: 2, note: 'Seen perched', outing_id: outing } })).ok()).toBe(true);
      expect((await page.request.put(`${API_PROXY_PREFIX}/v1/collections/${collection}`, { headers, data: { expected_version: null, name: 'Wetland birds', note: null } })).ok()).toBe(true);
      expect((await page.request.post(`${API_PROXY_PREFIX}/v1/detections/batch`, { headers, data: { detections: [{ id: detection, species: 'Turdus fuscater', confidence: 0.91, status: 'confirmed', recorded_at: '2026-11-15T10:15:00Z', location: { latitude: 4.679, longitude: -74.123 }, model_version: 'birdnet-v2.4:arm', shared: false }] } })).ok()).toBe(true);
      expect((await page.request.put(`${API_PROXY_PREFIX}/v1/outings/${outing}/detections/${detection}`, { headers })).ok()).toBe(true);
      expect((await page.request.put(`${API_PROXY_PREFIX}/v1/collections/${collection}/items/observation/${observation}`, { headers })).ok()).toBe(true);
      expect((await page.request.put(`${API_PROXY_PREFIX}/v1/collections/${collection}/items/detection/${detection}`, { headers })).ok()).toBe(true);
      await page.addInitScript(({ locale, theme }) => { localStorage.setItem('birdnet_settings', JSON.stringify({ locale, theme })); }, { locale, theme: locale === 'es' ? 'light' : 'dark' });
      const routes = ['journal', 'observations', 'collections', 'wishlist', 'import', 'assistant', `journal/${outing}`, `observations/${observation}`, `collections/${collection}`];
      for (const [index, route] of routes.entries()) {
        await page.goto(`/#/${route}`); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (['journal', 'observations', 'collections', 'wishlist'].includes(route.split('/')[0] ?? '')) await expect(page.getByText(journalMessages[locale].loading, { exact: true })).toHaveCount(0);
        if (route.includes(outing) || route.includes(collection)) await expect(page.getByText(journalMessages[locale].manual, { exact: true }).last()).toBeVisible();
        if (route.includes(observation)) await expect(page.getByLabel(journalMessages[locale].species, { exact: true })).toBeVisible();
        await page.screenshot({ path: `tmp/beta-ui/${String(index)}-${route.split('/')[0] ?? ''}-${String(width)}-${locale}.png`, fullPage: true, animations: 'disabled' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  }
});

test('the real browser decoder and ONNX model import offline without inventing a capture date', async ({ page, context }) => {
  const session = await signedIn(page); await page.goto('/#/import');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await checks(page, session); await expect.poll(() => page.evaluate(() => window.offlineChecks.cachedModel()), { timeout: 90000 }).not.toBeNull();
  const samples = await page.evaluate(() => window.offlineChecks.referenceSamples()); await context.setOffline(true);
  const result = await page.evaluate(({ samples, owner }) => window.offlineChecks.importReferenceFile(samples, owner, false, null), { samples, owner: session.userId });
  expect(result.windows).toBe(1); expect(result.species.map((row) => row.scientificName)).toContain('Turdus fuscater'); expect(result.outingId).toBeNull();
  expect(await page.evaluate(async (owner) => (await window.offlineChecks.readJournal(owner)).entities.length, session.userId)).toBe(0);
  const cancelled = await page.evaluate(({ samples, owner }) => window.offlineChecks.importReferenceFile([...samples, ...samples], owner, true, 1), { samples, owner: session.userId });
  expect(cancelled).toMatchObject({ windows: 1, cancelled: true });
  expect(await page.evaluate(async (owner) => (await window.offlineChecks.readJournal(owner)).entities[0], session.userId)).toMatchObject({ importState: 'cancelled', data: { started_at: '2025-03-04T10:06:00Z', ended_at: '2025-03-04T10:06:03.000Z' } });
});
