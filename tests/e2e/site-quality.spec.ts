import { test, expect } from '@playwright/test';

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

test('editing only search capitalization or spacing preserves a failed search and its retry', async ({
  page,
}) => {
  await page.goto('/');
  let calls = 0;
  await page.route('**/api/search?*', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: 'Search temporarily unavailable' } });
  });
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Missing film');
  await expect(page.locator('.search-error')).toBeVisible();
  await search.fill('  MISSING FILM  ');
  await expect(page.locator('.search-results')).toHaveAttribute('aria-busy', 'false');
  const retry = page.getByRole('button', { name: 'Try Again', exact: true });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect.poll(() => calls).toBe(2);
});

test('editing an unchanged search after its cache expires does not leave a permanent spinner', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  let calls = 0;
  await page.route('**/api/search?*', (route) => {
    calls++;
    return route.fulfill({ json: { movies: [] } });
  });
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Missing film');
  await expect.poll(() => calls).toBe(1);
  await expect(page.locator('.search-results')).toHaveAttribute('aria-busy', 'false');
  await page.clock.fastForward(61_000);
  await search.fill('MISSING FILM ');
  await expect(page.locator('.search-results')).toHaveAttribute('aria-busy', 'false');
  expect(calls).toBe(1);
});

test('Undo stays available while another film is being saved', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?section=discover');
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Saved to Library/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close film details' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(undo).toBeDisabled();
    await page.clock.fastForward(11_000);
    await expect(undo).toBeVisible();
    release();
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'restored to your library' }),
    ).toBeVisible();
    const state = await page.request.get('/api/library/membership?ids=1,30');
    expect((await state.json()).membership).toEqual({ '1': true, '30': true });
  } finally {
    release();
  }
});

test('Library does not inherit an unchecked Discover freshness warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await expect(page.locator('.site-footer')).not.toContainText('Listings have not been verified');
  await expect(page.locator('.site-footer .source-dot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.site-footer')).toContainText('Listings checked');
  await expect(page.locator('.site-footer .source-dot')).toBeVisible();
});

test('Calendar explains watched exclusions and counts only films in the feed', async ({ page }) => {
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: Array.from({ length: 27 }, (_, index) => String(index + 1)) },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Your Movie Calendar' });
  await expect(calendar.locator('.calendar-summary')).toContainText('0films in your feed');
  await expect(calendar).toContainText('Mark a film as unwatched');
  await expect(calendar.locator('.calendar-intro')).toContainText('Watched films are excluded');
  await expect(calendar.getByRole('button', { name: 'Download .ics' })).toBeDisabled();
});

test('enlarged text keeps navigation, search and dialog actions reachable on narrow screens', async ({
  page,
}) => {
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 950 });
    await page.screenshot({ path: `outputs/review/site-quality-enlarged-${width}.png` });
    for (const control of [
      page.getByRole('button', { name: 'A-List home', exact: true }),
      page.getByRole('combobox', { name: 'Search films' }),
      page.getByRole('button', { name: 'Calendar Settings', exact: true }),
      page.getByRole('button', { name: 'Open A-List menu', exact: true }),
      page.getByRole('button', { name: 'Discover', exact: true }),
      page.getByRole('button', { name: 'To Watch', exact: true }),
      page.getByRole('button', { name: 'Watched', exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect
        .soft(box!.x, `${width}px ${await control.getAttribute('aria-label')}`)
        .toBeGreaterThanOrEqual(0);
      expect.soft(box!.x + box!.width, `${width}px control right edge`).toBeLessThanOrEqual(width);
      expect.soft(box!.width, `${width}px control width`).toBeGreaterThanOrEqual(24);
    }
    for (const group of await page.locator('.nav-tabs, .library-sections').all())
      expect.soft(await group.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Your Movie Calendar' });
    await expect(dialog).toHaveCSS('opacity', '1');
    const subscribe = dialog.getByRole('link', { name: 'Subscribe in Apple Calendar' });
    await subscribe.scrollIntoViewIfNeeded();
    const box = await subscribe.boundingBox();
    expect.soft(box!.x, `${width}px subscribe left`).toBeGreaterThanOrEqual(0);
    expect.soft(box!.x + box!.width, `${width}px subscribe right`).toBeLessThanOrEqual(width);
    expect
      .soft(await subscribe.evaluate((node) => node.scrollWidth <= node.clientWidth))
      .toBe(true);
    await page.screenshot({ path: `outputs/review/site-quality-calendar-enlarged-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
