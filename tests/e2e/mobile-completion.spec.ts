import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'allow', locale: 'en-US', timezoneId: 'Pacific/Kiritimati' });

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'fixture@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: {},
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp: 4102444800, iat: 1792972800, role: 'authenticated' })}.fixture-signature`;

test.beforeEach(async ({ context, request }) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { reset: true } });
  await context.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value:
        'base64-' +
        encode({
          access_token: token,
          refresh_token: 'fixture-refresh',
          token_type: 'bearer',
          expires_at: 4102444800,
          user,
        }),
      url: 'http://127.0.0.1:4317',
    },
  ]);
});

test('Back dismisses sheets before changing the collection and handoffs do not leave stale history', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/section=library/);
  const start = page.url();
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!history.state?.alistDialog)).toBe(true);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).toBe(start);
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: 'Close film details', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!history.state?.alistDialog)).toBe(false);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
});

test('phone actions remain reachable at the bottom and Select is visible with a live count', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const select = page.getByRole('button', { name: 'Select Films', exact: true });
  await expect(select.locator('span')).toBeVisible();
  await select.click();
  await page.locator('.movie-card').first().locator('.poster-button').click();
  await expect(page.locator('.batch-bar')).toContainText('1 selected');
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.locator('.movie-card').first().locator('.poster-button').click();
  const dialog = page.getByRole('dialog');
  const actions = dialog.locator('.dialog-mobile-actions');
  await expect(
    actions.getByRole('button', { name: 'Mark as Watched', exact: true }),
  ).toBeInViewport();
  await dialog.locator('.dialog-inner').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(
    actions.getByRole('button', { name: 'Remove from Library', exact: true }),
  ).toBeInViewport();
  await actions.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
  await expect(
    actions.getByRole('button', { name: 'Mark as Unwatched', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await import(String('/offline-store.js'))).readOfflineLibrary())?.movies?.find(
            (film: { id: string }) => film.id === '1',
          )?.watchedAt,
      ),
    )
    .toBeTruthy();
  await page.screenshot({ path: test.info().outputPath('phone-film-actions.png') });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.setViewportSize({ width: 320, height: 950 });
  await expect
    .poll(() => actions.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
    .toBe(true);
  await expect(
    actions.getByRole('button', { name: 'Mark as Unwatched', exact: true }),
  ).toBeInViewport();
});

test('touch search sizes to a shortened viewport and does not restore input focus after details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Search films', exact: true });
  await input.fill('Fixture');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 460 });
  await expect
    .poll(async () => {
      const rect = await page.locator('.app-search-panel').boundingBox();
      return rect ? rect.y + rect.height : 10000;
    })
    .toBeLessThanOrEqual(461);
  await page.locator('[data-search-result]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(input).not.toBeFocused();
});

test('offline snapshots contain the whole private library without credentials and cannot be restored by a late sync', async ({
  page,
}) => {
  await page.goto('/');
  const response = await page.request.get('/api/library/offline');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  const data = await response.json();
  expect(data.movies.length).toBe(27);
  expect(JSON.stringify(data)).not.toMatch(
    /feedPath|feed_token|email|refresh_token|access_token|source/,
  );
  const outcome = await page.evaluate(async (data) => {
    const store = await import(String('/offline-store.js'));
    const epoch = await store.beginOfflineSession(data.owner);
    await store.saveOfflineLibrary(data, epoch);
    await store.clearOfflineLibrary();
    await store.saveOfflineLibrary(data, epoch);
    const afterLogout = await store.readOfflineLibrary();
    const nextEpoch = await store.beginOfflineSession('another-account');
    await store.saveOfflineLibrary(data, epoch);
    return { afterLogout, next: await store.readOfflineLibrary(), nextEpoch };
  }, data);
  expect(outcome.afterLogout.owner).toBeNull();
  expect(outcome.afterLogout.movies).toBeUndefined();
  expect(outcome.next.owner).toBe('another-account');
  expect(outcome.next.movies).toBeUndefined();
});

test('installed shell opens the last synced library offline, labels it stale, and never caches authenticated responses', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await import(String('/offline-store.js'))).readOfflineLibrary())?.movies?.length,
      ),
    )
    .toBe(27);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status()).toBe(200);
  await context.setOffline(true);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your Offline Library', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#status')).toContainText('27 saved films');
  await expect(page.locator('#notice')).toContainText('Read-only');
  await expect(page.locator('#films article').first()).toContainText('Nov 1, 2099');
  await page.screenshot({ path: test.info().outputPath('phone-offline-library.png') });
  await page.getByRole('searchbox').fill('Fixture Film 26');
  await expect(page.locator('#films article')).toHaveCount(1);
  const urls = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname),
        ),
      )
    ).flat(),
  );
  expect(urls).toContain('/offline.html');
  expect(urls).not.toContain('/');
  expect(urls.some((url) => url.startsWith('/api/') || url.startsWith('/auth/'))).toBe(false);
  await page.addStyleTag({ content: 'html:root { font-size: 200%; }' });
  await page.setViewportSize({ width: 320, height: 950 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Remove offline copy', exact: true }).click();
  await expect(page.locator('#status')).toContainText('No offline library');
  await expect(page.locator('#films article')).toHaveCount(0);
});

test('sign-out clears the offline library across tabs before navigating to login', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await import(String('/offline-store.js'))).readOfflineLibrary())?.movies?.length,
      ),
    )
    .toBe(27);
  const reader = await context.newPage();
  await reader.goto('/offline.html');
  await expect(reader.locator('#films article')).toHaveCount(27);
  await page.getByRole('button', { name: 'Open A-List menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(reader.locator('#films article')).toHaveCount(0);
  const stored = await page.evaluate(async () =>
    (await import(String('/offline-store.js'))).readOfflineLibrary(),
  );
  expect(stored.owner).toBeNull();
  expect(stored.movies).toBeUndefined();
});

test('offline reading is optional when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('Storage disabled');
      },
    });
  });
  await page.goto('/');
  await page.locator('.movie-card .poster-button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select Films', exact: true })).toBeEnabled();
});

test.describe('shared phone sheets', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test('Calendar and Account use the same swipe-down dismissal and focus return', async ({
    page,
  }) => {
    await page.goto('/');
    const touch = await page.context().newCDPSession(page);
    for (const sheet of ['calendar', 'account']) {
      const trigger = page.getByRole('button', {
        name: sheet === 'calendar' ? 'Calendar Settings' : 'Open A-List menu',
        exact: true,
      });
      await trigger.click();
      if (sheet === 'account')
        await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const handle = dialog.locator('.dialog-drag-handle');
      await expect(handle).toBeVisible();
      // Allow Vaul's initial 500ms accidental-drag guard to settle.
      await page.waitForTimeout(550);
      const box = (await handle.boundingBox())!;
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (const offset of [40, 80, 160, 260]) {
        await page.waitForTimeout(30);
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x, y: start.y + offset }],
        });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
});
