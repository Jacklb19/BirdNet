import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { API_PROXY_PREFIX, E2E_SUPABASE } from '../build.config.mjs';
import { routeHash } from '../src/app/routes';
import { STORAGE_KEYS } from '../src/config/storage';
import { DEFAULT_LOCALE } from '../src/i18n/locales';
import { dictionaries } from '../src/i18n/allMessages';
import { buildHasAccounts } from './builds';

/** Labels come from the interface dictionaries, so copy changes do not break the suite. */
const texts = dictionaries[DEFAULT_LOCALE];

test.skip(!buildHasAccounts, 'Build with `npm run build:e2e` to run the account checks.');
// The Auth double answers the page's own requests; a service worker in between would hide them from the routes.
test.use({ serviceWorkers: 'block' });

/** Where Supabase Auth keeps the session of this project (as `sessionStorageKey` in the app, which reads Vite's env). */
const SESSION_KEY = `sb-${new URL(E2E_SUPABASE.url).hostname.split('.')[0] ?? ''}-auth-token`;

interface TestSession { readonly userId: string; readonly accessToken: string; readonly expiresAt: number }

/**
 * Signs the page in without Supabase: the local API signs a session it accepts, the page finds it where Supabase Auth
 * keeps it, and the few Auth calls the app makes are answered here.
 */
async function signIn(page: Page): Promise<TestSession> {
  const session = await (await page.request.get(`${API_PROXY_PREFIX}/test/session`)).json() as TestSession;
  const user = { id: session.userId, aud: 'authenticated', role: 'authenticated', email: 'sprint4@example.invalid', app_metadata: { provider: 'email' },
    user_metadata: {}, factors: [], created_at: '2026-10-01T00:00:00Z' };
  await page.route(`${E2E_SUPABASE.url}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) await route.fulfill({ json: user });
    else if (url.pathname.endsWith('/factors')) await route.fulfill({ json: { totp: [], phone: [], all: [] } });
    else await route.fulfill({ status: 404, json: { message: 'Not part of the e2e double' } });
  });
  const stored = { access_token: session.accessToken, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: session.expiresAt, user };
  await page.addInitScript(([sessionKey, value, preferencesKey, preferences]) => {
    localStorage.setItem(sessionKey, value);
    localStorage.setItem(preferencesKey, preferences);
  }, [SESSION_KEY, JSON.stringify(stored), STORAGE_KEYS.preferences, JSON.stringify({ welcomed: true })] as const);
  return session;
}

const bearer = (session: TestSession): Record<string, string> => ({ Authorization: `Bearer ${session.accessToken}` });

test('a song kept only in the account is reviewed and annotated from the log (ADR-44)', async ({ page }) => {
  const session = await signIn(page);
  const id = randomUUID();
  // Recorded on "another phone": straight to the account, never in this browser's queue.
  const created = await page.request.post(`${API_PROXY_PREFIX}/v1/detections/batch`, {
    headers: bearer(session),
    data: { detections: [{ id, species: 'Vultur gryphus', confidence: 0.6, status: 'provisional', recorded_at: new Date().toISOString(),
      location: { latitude: 4.679, longitude: -74.123 }, model_version: 'birdnet-v2.4:arm', shared: false }] },
  });
  expect(created.ok()).toBe(true);
  await page.goto(`/${routeHash({ name: 'log' })}`);
  await expect(page.getByRole('heading', { name: texts.log.account.title })).toBeVisible();
  await page.locator(`a[href="${routeHash({ name: 'detection', id })}"]`).click();
  await expect(page.getByText(texts.log.detail.account.source)).toBeVisible();

  const reviewed = page.waitForResponse((response) => response.url().endsWith(`/v1/detections/${id}`) && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: texts.log.detail.review.confirm }).click();
  expect((await reviewed).ok()).toBe(true);
  await expect(page.getByRole('button', { name: texts.log.detail.review.confirm })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('textbox', { name: texts.log.detail.note.text, exact: true }).fill('Planeando sobre el valle');
  const noted = page.waitForResponse((response) => response.url().endsWith(`/v1/detections/${id}/note`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: texts.log.detail.note.save }).click();
  expect((await noted).ok()).toBe(true);

  const stored = await (await page.request.get(`${API_PROXY_PREFIX}/v1/me/detections/${id}`, { headers: bearer(session) })).json() as Record<string, unknown>;
  expect(stored).toMatchObject({ status: 'verified', reviewed_by: 'person', note: 'Planeando sobre el valle' });
});

test('a place is renamed and deleted from its panel, with the focus following each step (ADR-44)', async ({ page }) => {
  const session = await signIn(page);
  const site = await (await page.request.post(`${API_PROXY_PREFIX}/v1/sites`, {
    headers: bearer(session), data: { name: 'Finca e2e', location: { latitude: 4.679, longitude: -74.123 } },
  })).json() as { id: string };
  const manage = texts.sites.manage;
  await page.goto(`/${routeHash({ name: 'site', id: site.id })}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Finca e2e' })).toBeVisible();

  await page.getByRole('button', { name: manage.rename }).click();
  const field = page.getByLabel(texts.sites.nameLabel);
  await expect(field).toBeFocused();
  await field.fill('  Finca   El Roble ');
  await page.getByRole('button', { name: manage.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finca El Roble' })).toBeVisible();
  await expect(page.getByRole('button', { name: manage.rename })).toBeFocused();

  await page.getByRole('button', { name: manage.remove }).click();
  await expect(page.getByText(manage.removeAsk)).toBeFocused();
  await page.getByRole('button', { name: dictionaries[DEFAULT_LOCALE].common.actions.cancel }).click();
  await expect(page.getByRole('button', { name: manage.rename })).toBeFocused();
  await page.getByRole('button', { name: manage.remove }).click();
  await page.getByRole('button', { name: manage.removeConfirm, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${routeHash({ name: 'sites' })}$`));

  const left = await (await page.request.get(`${API_PROXY_PREFIX}/v1/sites`, { headers: bearer(session) })).json() as { sites: { id: string }[] };
  expect(left.sites.some((entry) => entry.id === site.id)).toBe(false);
});
