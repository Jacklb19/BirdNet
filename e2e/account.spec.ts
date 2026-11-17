import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { API_PROXY_PREFIX, E2E_SUPABASE } from '../build.config.mjs';
import { routeHash } from '../src/app/routes';
import { DEFAULT_LOCALE } from '../src/i18n/locales';
import { formatDataSize } from '../src/i18n';
import { dictionaries } from '../src/i18n/allMessages';
import { buildHasAccounts } from './builds';
import { storeSession, testSession, testUser, type TestSession } from './session';

/** Labels come from the interface dictionaries, so copy changes do not break the suite. */
const texts = dictionaries[DEFAULT_LOCALE];

test.skip(!buildHasAccounts, 'Build with `npm run build:e2e` to run the account checks.');
// The Auth double answers the page's own requests; a service worker in between would hide them from the routes.
test.use({ serviceWorkers: 'block' });

for (const width of [360, 1280]) {
  test(`repeated calls appear as one encounter and retain their review links at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.route('https://tiles.openfreemap.org/styles/*', (route) => route.fulfill({ json: {
      version: 8, sources: {}, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1e8' } }],
    } }));
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: randomUUID(), species: 'Turdus fuscater', confidence: index === 2 ? 0.65 : 0.95,
      status: index === 2 ? 'provisional' : 'confirmed', recorded_at: `2026-11-16T12:0${String(index)}:00Z`,
      latitude: 4.679 + index * 0.0001, longitude: -74.123,
    }));
    await page.route(`**${API_PROXY_PREFIX}/v1/me/detections*`, (route) => route.fulfill({ json: { detections: rows, has_more: false } }));
    await page.route(`**${API_PROXY_PREFIX}/v1/walks/paths*`, (route) => route.fulfill({ json: { walks: [], has_more: false } }));
    await page.goto(`/${routeHash({ name: 'map' })}`);
    await expect(page.getByText('1 encuentro · 5 detecciones', { exact: true })).toBeVisible();
    await expect(page.locator('.bn-map-photo')).toHaveCount(1);
    await page.locator('.bn-map-photo').click();
    const popup = page.locator('.bn-map-popup');
    await expect(popup.getByText('Un encuentro · 5 detecciones', { exact: true })).toBeVisible();
    for (const row of rows) await expect(popup.locator(`a[href="${routeHash({ name: 'detection', id: row.id })}"]`)).toHaveCount(1);
    await expect(popup.getByText(/Por verificar/)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: texts.map.controls.closePopup, exact: true }).click();
    await page.route(`**${API_PROXY_PREFIX}/v1/detections?*`, (route) => route.fulfill({ json: {
      detections: rows.map((row) => ({ ...row, own: false, site_name: null, generalized_m: 11000, latitude: 4.679 })), truncated: false,
    } }));
    await page.getByRole('radio', { name: texts.map.scope.everyone, exact: true }).click();
    await expect(page.getByText('Encuentros sin estimar · 5 detecciones · 1 especie', { exact: true })).toBeVisible();
    await expect(page.locator('.bn-map-photo')).toHaveCount(1);
    await page.locator('.bn-map-photo').click();
    await expect(popup.getByText('Resumen · 5 detecciones · encuentros sin estimar', { exact: true })).toBeVisible();
    await expect(popup.locator('a[href^="#/log/"]')).toHaveCount(0);
  });

  test(`recording settings disclose temporary upload reservations at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.route(`**${API_PROXY_PREFIX}/v1/me/recordings`, (route) => route.fulfill({ json: {
      recordings: 1, bytes: 1000, allocated_bytes: 100000, limit_bytes: 100000,
    } }));
    await page.goto(`/${routeHash({ name: 'settings' })}`);
    await expect(page.getByText(texts.settings.recordings.accountFull, { exact: true })).toBeVisible();
    await expect(page.getByText(texts.settings.recordings.accountReserved(formatDataSize(99000, DEFAULT_LOCALE)), { exact: true })).toBeVisible();
    await page.screenshot({ path: `tmp/audit-ui/reservations-${String(width)}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`the own map explains and retries an account read failure at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    let fail = true;
    await page.route(`**${API_PROXY_PREFIX}/v1/me/detections*`, (route) => route.fulfill(fail
      ? { status: 502, json: { detail: 'Unavailable' } } : { json: { detections: [], has_more: false } }));
    await page.route(`**${API_PROXY_PREFIX}/v1/walks/paths*`, (route) => route.fulfill(fail
      ? { status: 502, json: { detail: 'Unavailable' } } : { json: { walks: [], has_more: false } }));
    await page.goto(`/${routeHash({ name: 'map' })}`);
    await expect(page.getByText(texts.common.accountData.error, { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: `tmp/audit-ui/map-error-${String(width)}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    fail = false;
    await page.getByRole('button', { name: texts.common.actions.retry, exact: true }).click();
    await expect(page.getByText(texts.common.accountData.error, { exact: true })).toHaveCount(0);
  });

  test(`an album account failure is visible and retryable at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let fail = true;
    await page.route(`**${API_PROXY_PREFIX}/v1/me/species`, async (route) => {
      await pending;
      await route.fulfill(fail ? { status: 502, json: { detail: 'Unavailable' } } : { json: { species: [] } });
    });
    await page.goto(`/${routeHash({ name: 'album' })}`);
    await expect(page.getByText(texts.common.accountData.loading, { exact: true })).toBeVisible();
    await expect(page.getByText(texts.species.album.empty.title, { exact: true })).toHaveCount(0);
    release();
    await expect(page.getByText(texts.common.accountData.error, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `tmp/audit-ui/album-error-${String(width)}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    fail = false;
    await page.getByRole('button', { name: texts.common.actions.retry, exact: true }).first().click();
    await expect(page.getByText(texts.species.album.empty.title, { exact: true })).toBeVisible();
    await expect(page.getByText(texts.common.accountData.error, { exact: true })).toHaveCount(0);
  });
}

/**
 * Signs the page in without Supabase: the local API signs a session it accepts, the page finds it where Supabase Auth
 * keeps it, and the few Auth calls the app makes are answered here.
 */
async function signIn(page: Page, signedInAgo = 0): Promise<TestSession> {
  const session = await testSession(page, signedInAgo);
  const user = testUser(session);
  await page.route(`${E2E_SUPABASE.url}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) await route.fulfill({ json: user });
    else if (url.pathname.endsWith('/token')) {
      // The password typed again: a session signed in just now.
      const renewed = await testSession(page);
      await route.fulfill({ json: { access_token: renewed.accessToken, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: renewed.expiresAt, user } });
    }
    else if (url.pathname.endsWith('/factors')) await route.fulfill({ json: { totp: [], phone: [], all: [] } });
    else await route.fulfill({ status: 404, json: { message: 'Not part of the e2e double' } });
  });
  await storeSession(page, session);
  return session;
}

const bearer = (session: TestSession): Record<string, string> => ({ Authorization: `Bearer ${session.accessToken}` });

test('a new account is activated with the code of its e-mail, after a wrong code and a resend', async ({ page }) => {
  const session = await testSession(page);
  const email = 'nueva@example.invalid';
  const code = '246810';
  const user = testUser(session, email);
  const resent: unknown[] = [];
  // Supabase with "Confirm email" on: the sign-up gives no session, and only the mailed code (here 246810) opens one.
  await page.route(`${E2E_SUPABASE.url}/auth/v1/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/signup')) await route.fulfill({ json: { ...user, email_confirmed_at: null } });
    else if (path.endsWith('/resend')) { resent.push(request.postDataJSON()); await route.fulfill({ json: {} }); }
    else if (path.endsWith('/verify')) {
      const body = request.postDataJSON() as { token?: string; email?: string; type?: string };
      await route.fulfill(body.token === code && body.email === email && body.type === 'email'
        ? { json: { access_token: session.accessToken, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: session.expiresAt, user } }
        : { status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } });
    } else if (path.endsWith('/user')) await route.fulfill({ json: user });
    else if (path.endsWith('/factors')) await route.fulfill({ json: { totp: [], phone: [], all: [] } });
    else await route.fulfill({ status: 404, json: { message: 'Not part of the e2e double' } });
  });
  const signIn = texts.account.signIn;
  await page.goto(`/${routeHash({ name: 'signUp' })}`);

  await page.getByLabel(signIn.email).fill(email);
  await page.getByLabel(signIn.password, { exact: true }).fill('canto-del-valle');
  await page.getByLabel(signIn.confirmPassword).fill('canto-del-valle');
  await page.locator('form').getByRole('button', { name: signIn.modes.signUp }).click();
  await expect(page.getByRole('heading', { name: signIn.code.title })).toBeFocused();

  const field = page.getByLabel(signIn.code.label);
  await field.fill('000 000');
  await page.getByRole('button', { name: signIn.code.submit }).click();
  await expect(page.getByText(texts.account.errors.wrongEmailCode)).toBeVisible();
  await expect(field).toHaveValue('');

  await page.getByRole('button', { name: signIn.code.resend }).click();
  await expect(page.getByText(signIn.code.resentTitle)).toBeVisible();
  expect(resent).toEqual([expect.objectContaining({ type: 'signup', email })]);

  await field.fill(code);
  await page.getByRole('button', { name: signIn.code.submit }).click();
  // Activated, the account is signed in and the way in leads to the app.
  await expect(page).toHaveURL(new RegExp(`${routeHash({ name: 'listen' })}$`));
});

test('without a session every screen of the app shows the way in, and signing in opens the one asked for (ADR-45)', async ({ page }) => {
  const session = await testSession(page);
  const user = testUser(session);
  const entrance = texts.account.entrance;
  await page.route(`${E2E_SUPABASE.url}/auth/v1/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/token')) {
      const body = request.postDataJSON() as { email?: string; password?: string };
      await route.fulfill(body.password === 'canto-del-valle'
        ? { json: { access_token: session.accessToken, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: session.expiresAt, user } }
        : { status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
    } else if (path.endsWith('/user')) await route.fulfill({ json: user });
    else if (path.endsWith('/factors')) await route.fulfill({ json: { totp: [], phone: [], all: [] } });
    else await route.fulfill({ status: 404, json: { message: 'Not part of the e2e double' } });
  });

  for (const route of [{ name: 'listen' }, { name: 'map' }, { name: 'log' }, { name: 'settings' }, { name: 'account' }, { name: 'assistant' }] as const) {
    await page.goto(`/${routeHash(route)}`);
    await expect(page.getByRole('heading', { level: 1, name: entrance.title })).toBeVisible();
    await expect(page.getByText(entrance.requested(texts.app.screens[route.name]))).toBeVisible();
    // Nothing of the app is offered: no tab bar, no settings, no live player.
    await expect(page.getByRole('link', { name: texts.app.nav.log })).toHaveCount(0);
  }
  await expect(page).toHaveTitle(texts.app.pageTitle(texts.app.screens.signIn));

  // The guide stays open to everyone, with nothing of anyone's records.
  await page.goto(`/${routeHash({ name: 'album' })}`);
  await expect(page.getByRole('heading', { level: 1, name: texts.species.publicGuide.title })).toBeVisible();

  await page.goto(`/${routeHash({ name: 'log' })}`);
  const form = texts.account.signIn;
  await page.getByLabel(form.email).fill('sprint4@example.invalid');
  await page.getByLabel(form.password, { exact: true }).fill('canto-del-valle');
  await page.locator('form').getByRole('button', { name: form.modes.signIn }).click();
  // Same address, now the log.
  await expect(page.getByRole('heading', { level: 1, name: texts.log.title })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${routeHash({ name: 'log' })}$`));
});

test('offline with an expired token, the person stays signed in and the app opens (ADR-45)', async ({ page }) => {
  const session = await testSession(page);
  // An hour offline: the token ran out and Auth cannot renew it.
  await page.route(`${E2E_SUPABASE.url}/auth/v1/**`, async (route) => { await route.abort('internetdisconnected'); });
  await storeSession(page, session, Math.floor(Date.now() / 1000) - 60);
  await page.goto(`/${routeHash({ name: 'log' })}`);
  await expect(page.getByRole('heading', { level: 1, name: texts.log.title })).toBeVisible();
  await page.goto(`/${routeHash({ name: 'account' })}`);
  await expect(page.getByText(texts.account.offline.title)).toBeVisible();
  await expect(page.getByRole('button', { name: texts.account.signOut })).toBeVisible();
});

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
  // This browser has never recorded a song. It can still export the account's log.
  await expect(page.getByRole('button', { name: texts.log.exportAll.action })).toBeEnabled();
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

test('songs recorded at the same instant remain reachable across account pages', async ({ page }) => {
  const session = await signIn(page);
  const ids = [randomUUID(), randomUUID()];
  const recordedAt = new Date().toISOString();
  const created = await page.request.post(`${API_PROXY_PREFIX}/v1/detections/batch`, {
    headers: bearer(session),
    data: { detections: ids.map((id) => ({ id, species: 'Turdus fuscater', confidence: 0.6, status: 'provisional',
      recorded_at: recordedAt, location: { latitude: 4.679, longitude: -74.123 }, model_version: 'birdnet-v2.4:arm', shared: false })) },
  });
  expect(created.ok()).toBe(true);
  // Force a page boundary between the tied rows while keeping the real cursor and source records.
  const seen = new Set<string>();
  await page.route(/\/api\/v1\/me\/detections(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('limit', '1');
    const response = await route.fetch({ url: url.href });
    const body = await response.json() as { detections: { id: string }[]; has_more: boolean };
    for (const row of body.detections) if (ids.some((id) => id === row.id)) seen.add(row.id);
    // Stop only after both real tied records arrive; older fixtures must not add hundreds of one-row requests.
    if (seen.size === ids.length) body.has_more = false;
    await route.fulfill({ response, json: body });
  });
  await page.goto(`/${routeHash({ name: 'log' })}`);
  for (const id of ids) await expect(page.locator(`a[href="${routeHash({ name: 'detection', id })}"]`)).toBeVisible();
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

test('deleting the account asks for the password again when the sign-in is old', async ({ page }) => {
  const stale = await signIn(page, 15 * 60);
  // The API refuses it on its own, whatever the phone shows.
  const refused = await page.request.delete(`${API_PROXY_PREFIX}/v1/me`, { headers: bearer(stale), data: { confirmation: 'DELETE' } });
  expect(refused.status()).toBe(403);
  const deletion = texts.account.deletion;
  await page.goto(`/${routeHash({ name: 'account' })}`);
  await page.getByRole('button', { name: deletion.open }).click();
  await expect(page.getByRole('heading', { name: deletion.identity.title })).toBeVisible();
  await expect(page.getByLabel(deletion.typeLabel(deletion.word))).toHaveCount(0);

  const renewed = page.waitForRequest((request) => request.url().includes('/auth/v1/token') && request.method() === 'POST');
  await page.getByLabel(deletion.identity.passwordLabel).fill('canto-del-valle');
  await page.getByRole('button', { name: deletion.identity.confirm }).click();
  expect((await renewed).postDataJSON()).toMatchObject({ email: 'sprint4@example.invalid', password: 'canto-del-valle' });
  // With the sign-in renewed, the step with the word to type appears in its place.
  await expect(page.getByLabel(deletion.typeLabel(deletion.word))).toBeVisible();
});
