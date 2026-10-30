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

async function openAccount(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open A-List menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  return page.getByRole('dialog', { name: 'Your account', exact: true });
}

test('export can be dismissed while stalled, cancels the read, and never downloads late', async ({
  page,
}) => {
  await page.goto('/');
  const dialog = await openAccount(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/account/export', async (route) => {
    await gate;
    await route
      .fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      .catch(() => {});
  });
  let downloads = 0;
  page.on('download', () => {
    downloads++;
  });
  try {
    await dialog.getByRole('button', { name: 'Export library', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Exporting…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(dialog.getByRole('button', { name: 'Close account settings' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } finally {
    release();
  }
  await page.waitForTimeout(150);
  expect(downloads).toBe(0);
});

test('an uncertain reset is checked without sending the mutation twice', async ({ page }) => {
  await page.goto('/');
  const dialog = await openAccount(page);
  let writes = 0;
  await page.route('**/api/account/reset-calendar', async (route) => {
    writes++;
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html>Lost response</html>',
    });
  });
  await dialog.getByRole('button', { name: 'Reset calendar link', exact: true }).click();
  await dialog.getByLabel('Type RESET to confirm').fill('RESET');
  await dialog.getByRole('button', { name: 'Reset link', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('may still complete');
  await expect(dialog.getByRole('button', { name: 'Check outcome' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Reset link', exact: true })).toBeDisabled();
  await page.route('**/api/init', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), feedPath: '/api/feed/reconciled.ics' },
    });
  });
  await dialog.getByRole('button', { name: 'Check outcome' }).click();
  await expect(dialog.getByRole('button', { name: 'Open calendar settings' })).toBeVisible();
  expect(writes).toBe(1);
});

test('calendar failures stay within the modal and tracked films can be retried', async ({
  page,
}) => {
  await page.goto('/');
  let fail = true;
  await page.route('**/api/library?*', async (route) => {
    if (fail && new URL(route.request().url()).searchParams.get('tracked') === 'true')
      await route.fulfill({ status: 503, json: { error: 'Calendar unavailable in fixture' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Calendar settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your movie calendar' });
  await expect(dialog.getByRole('alert')).toContainText('Calendar unavailable');
  await expect(page.locator('.toast')).toHaveCount(0);
  fail = false;
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.locator('.tracked-list')).toContainText('Fixture Film 00');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.route('**/api/settings', (route) =>
    route.fulfill({ status: 400, json: { error: 'Preference not saved' } }),
  );
  const preference = dialog.getByRole('switch', { name: /Include unconfirmed/ });
  const initial = await preference.isChecked();
  await preference.click();
  await expect(dialog.getByRole('alert')).toContainText('Preference not saved');
  expect(await preference.isChecked()).toBe(initial);
});

test('clipboard failure and confirmed success are announced inside Calendar settings', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Calendar settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your movie calendar' });
  const button = dialog.getByRole('button', { name: 'Copy feed link', exact: true });
  await button.click();
  await expect(dialog.getByRole('alert')).toContainText('Could not copy');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  await button.click();
  await expect(dialog.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Calendar link copied' }),
  ).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('empty Discover with no saved films clears its filter', async ({ page, request }) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { libraryIds: [] } });
  await page.goto('/');
  await page.getByRole('button', { name: 'TBA', exact: true }).click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.getByRole('button', { name: 'Show all films', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All films', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.movie-card').first()).toBeVisible();
});

test('sections remember their filters, history restores queries, and reload remembers layout', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'TBA', exact: true }).click();
  await expect(page).toHaveURL(/section=library&filter=unknown/);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
  await page.getByRole('button', { name: /^My library/ }).click();
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coming Soon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'List view', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.loading-state')).toHaveCount(0);
});

test('search reuses a recent normalized query and retries an error explicitly', async ({
  page,
}) => {
  await page.goto('/');
  const calls: string[] = [];
  let fail = false;
  await page.route('**/api/search?*', async (route) => {
    calls.push(new URL(route.request().url()).searchParams.get('q')!);
    if (fail)
      await route.fulfill({ status: 503, json: { error: 'Search temporarily unavailable' } });
    else await route.continue();
  });
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Fixture Film 29');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).toBeVisible();
  await expect.poll(() => calls.length).toBe(1);
  await search.fill('Fixture Film 28');
  await expect(page.getByRole('option', { name: /Fixture Film 28/ })).toBeVisible();
  await expect.poll(() => calls.length).toBe(2);
  await search.fill('  FIXTURE FILM 29  ');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).toBeVisible();
  await page.waitForTimeout(400);
  expect(calls.length).toBe(2);
  fail = true;
  await search.fill('Missing film');
  await expect(page.locator('.search-error')).toContainText('No catalogue matches');
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.search-error')).toHaveCount(0);
  await expect.poll(() => calls.length).toBe(4);
});

test('sign-in handles an HTML outage and confirms success with keyboard motion disabled', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto('/login');
  await page.route('**/auth/login', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Gateway error</html>' }),
  );
  await page.getByLabel('Your email address').fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.locator('#email-error')).toContainText('temporarily unavailable');
  await page.unroute('**/auth/login');
  await page.route('**/auth/login', (route) => route.fulfill({ json: { ok: true } }));
  await page.getByLabel('Your email address').press('Enter');
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  expect(await page.locator('.login-success').evaluate((node) => node.getAnimations().length)).toBe(
    0,
  );
  await expect(page.locator('.login-success')).toBeFocused();
  await page.getByRole('button', { name: 'Use another email' }).click();
  await expect(page.getByLabel('Your email address')).toBeFocused();
});

test('new state motion uses opacity-only alternatives and pointer confirmation exits cleanly', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const dialog = await openAccount(page);
  await dialog.getByRole('button', { name: 'Reset calendar link', exact: true }).click();
  await expect(dialog.getByLabel('Type RESET to confirm')).toBeFocused();
  await expect(dialog.locator('.account-confirm-presence')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'outputs/review/ux-account-confirm-375-dark.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.locator('.account-confirm-presence')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Reset calendar link', exact: true }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Close account settings' }).click();
  await context.clearCookies();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/login');
  await page.route('**/auth/login', (route) => route.fulfill({ json: { ok: true } }));
  await page.getByLabel('Your email address').fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  const frames = await page
    .locator('.login-success')
    .evaluate((node) =>
      node
        .getAnimations()
        .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
    );
  expect(frames.every((frame) => !frame.transform || frame.transform === 'none')).toBe(true);
  await expect(page.locator('.login-success')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'outputs/review/ux-login-success-375-light.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('cached search badges follow confirmed membership changes', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Saved to library/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close film details' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await search.fill('Fixture Film 29');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).toContainText(
    'Saved to your library',
  );
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await search.fill('Fixture Film 29');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).not.toContainText(
    'Saved to your library',
  );
});

test('browser performance reporting redacts URL context before collection', async ({ page }) => {
  await page.goto('/?section=library&filter=unknown#main');
  await expect
    .poll(() => page.evaluate(() => (window.siq || []).some(([name]) => name === 'beforeSend')))
    .toBe(true);
  const result = await page.evaluate(() => {
    const handler = [...window.siq!]
      .reverse()
      .find(([name]) => name === 'beforeSend')![1] as (event: {
      type: 'vital';
      url: string;
      route: string;
    }) => unknown;
    return [
      handler({
        type: 'vital',
        url: 'https://example.invalid/?q=private#private',
        route: '/?q=private',
      }),
      handler({
        type: 'vital',
        url: 'https://example.invalid/api/feed/private.ics',
        route: '/api/feed/private.ics',
      }),
    ];
  });
  expect(result).toEqual([{ type: 'vital', url: 'https://example.invalid/', route: '/' }, null]);
});
