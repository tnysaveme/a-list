import { releaseDay } from '../../lib/release-day';
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
  await page.getByRole('menuitem', { name: 'Account Settings' }).click();
  return page.getByRole('dialog', { name: 'Your Account', exact: true });
}

for (const entry of ['menu', 'account'] as const) {
  for (const keyboard of [false, true]) {
    test(`sign-out from ${entry} clears the session using ${keyboard ? 'keyboard' : 'pointer'}`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: keyboard ? 1280 : 390, height: 900 });
      await page.goto('/');
      let control;
      if (entry === 'account') {
        const account = await openAccount(page);
        control = account.getByRole('button', { name: 'Sign Out', exact: true });
      } else {
        await page.getByRole('button', { name: 'Open A-List menu' }).click();
        control = page.getByRole('menuitem', { name: 'Sign Out', exact: true });
      }
      const submitted = page.waitForRequest((request) => request.url().endsWith('/auth/signout'));
      if (keyboard) {
        await control.focus();
        await control.press('Enter');
      } else await control.click();
      const request = await submitted;
      expect(request.method()).toBe('POST');
      expect(request.headers().origin).toBe('http://127.0.0.1:4317');
      await expect(page).toHaveURL(/\/login$/);
      expect(
        (await context.cookies()).filter((cookie) => cookie.name.startsWith('sb-')),
      ).toHaveLength(0);
      expect((await page.request.get('/api/library')).status()).toBe(401);
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);
    });
  }
}

test('sign-out rejects foreign and opaque origins without clearing the session', async ({
  page,
  context,
}) => {
  for (const origin of ['https://example.invalid', 'null']) {
    const response = await page.request.post('/auth/signout', {
      headers: { origin },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
    expect((await context.cookies()).some((cookie) => cookie.name === 'sb-127-auth-token')).toBe(
      true,
    );
  }
});

test('This week includes saved films beyond the visible page and opens their details', async ({
  page,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const date = (days: number) => {
    const value = new Date(`${today}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const release = (days: number, confidence = 'listed') => [
    {
      kind: 'Digital',
      date: date(days),
      confidence,
      source: 'https://example.invalid/fixture',
      sourceName: 'Fixture',
    },
  ];
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      movieReleases: {
        '25': release(0),
        '26': release(1, 'rumored'),
        '27': release(6),
        '23': release(3),
        '24': release(4),
        '28': release(0),
      },
    },
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Sort Films', exact: true }).selectOption('title');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  const summary = page.getByRole('region', { name: 'This Week', exact: true });
  await expect(summary.locator('.week-release')).toHaveCount(3);
  await expect(summary).toContainText('Fixture Film 25');
  await expect(summary).not.toContainText('Fixture Film 27');
  await expect(summary).toContainText('Today');
  await expect(summary.getByText('Unconfirmed', { exact: true })).toBeVisible();
  await expect(page.locator('.movie-card[data-movie-id="26"]')).toHaveCount(0);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 950 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `outputs/review/weekly-summary-${width}-${colorScheme}.png` });
    }
  }
  const expand = summary.getByRole('button', { name: 'Show all 5 releases', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.focus();
  await expand.press('Enter');
  await expect(summary.locator('.week-release')).toHaveCount(5);
  await expect(summary).toContainText('Fixture Film 26');
  await summary.getByRole('button', { name: /Fixture Film 26/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Fixture Film 26', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await summary.getByRole('button', { name: 'Show fewer releases', exact: true }).click();
  await expect(summary.locator('.week-release')).toHaveCount(3);
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  for (const item of await summary.locator('.week-releases > li').all()) {
    await expect(item).toHaveCSS('border-inline-start-width', '0px');
    await expect(item).toHaveCSS('border-top-width', '0px');
  }
  const row = summary.getByRole('button', { name: /Fixture Film 25/ });
  const artwork = row.locator('.week-artwork');
  const arrow = row.locator('.week-open');
  await row.hover();
  await expect(artwork).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
  await expect(arrow).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 2, -2)');
  await page.screenshot({ path: 'outputs/review/weekly-hover-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: 'outputs/review/weekly-hover-light.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(artwork).toHaveCSS('transform', 'none');
  await expect(arrow).toHaveCSS('transform', 'none');
  await page.keyboard.press('Tab');
  await row.focus();
  await expect(row).toBeFocused();
  await expect(row).not.toHaveCSS('outline-style', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await summary.getByRole('button', { name: /Fixture Film 25/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Fixture Film 25', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(summary.getByRole('button', { name: 'View Upcoming', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(summary).toHaveCount(0);
});

test('mobile collection controls preserve filters across resize and retain usable targets', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/');
  const filter = page.getByRole('combobox', { name: 'Filter Films', exact: true });
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 812 });
    await expect(filter).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unconfirmed', exact: true })).toHaveCount(0);
    await filter.selectOption('rumored');
    await expect(page).toHaveURL(/filter=rumored/);
    await expect(page.locator('.movie-card').first()).toBeVisible();
    await filter.selectOption('all');
    for (const name of ['Grid View', 'List View', 'Select Films']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await filter.selectOption('unknown');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(filter).toBeHidden();
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'All Films', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(filter).toHaveValue('all');
  await filter.focus();
  await expect(filter).toBeFocused();
  await expect(page.locator('.sort-control').filter({ has: filter })).toHaveCSS(
    'outline-style',
    'solid',
  );
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await expect(page.locator('.movie-grid.movie-list')).toBeVisible();
  await page.getByRole('button', { name: 'Select Films', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Fixture Film 00', exact: true }).check();
  await expect(page.locator('.batch-bar')).toContainText('1 selected');
  expect(errors).toEqual([]);
});

test('calendar setup follows the first confirmed save, stays optional, and remembers dismissal', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await request.post('http://127.0.0.1:4318/_control', { data: { libraryIds: [] } });
  await page.goto('/');
  const reminder = page.getByRole('complementary', { name: 'Calendar setup reminder' });
  await expect(reminder).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Save Fixture Film 00', exact: true });
  await page.route('**/api/library', (route) =>
    route.fulfill({ status: 503, json: { error: 'Save unavailable' } }),
  );
  await save.click();
  await expect(save).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'Save unavailable' })).toBeVisible();
  await expect(reminder).toHaveCount(0);
  await page.unroute('**/api/library');
  await save.click();
  await expect(reminder).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await reminder.getByRole('button', { name: 'Connect Your Calendar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Your Movie Calendar' });
  await expect(dialog.getByRole('link', { name: 'Subscribe in Apple Calendar' })).toBeInViewport();
  await expect(dialog.getByText('Release-day reminders · 1pm GMT')).not.toBeVisible();
  await dialog.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByText('Release-day reminders · 1pm GMT')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'outputs/review/calendar-setup-375-light.png' });
  await page.getByRole('button', { name: 'Close calendar settings' }).click();
  // Opening setup is not proof that an external subscription succeeded.
  await expect(reminder).toBeVisible();
  await reminder.getByRole('button', { name: 'Dismiss calendar setup reminder' }).click();
  await expect(reminder).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Calendar Settings', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Calendar Settings', exact: true })).toBeEnabled();
  await expect(reminder).toHaveCount(0);
  await request.post('http://127.0.0.1:4318/_control', { data: { libraryIds: [] } });
  await page.reload();
  await page.getByRole('button', { name: 'Save Fixture Film 00', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Fixture Film 00 is saved', exact: true }),
  ).toBeVisible();
  await expect(reminder).toHaveCount(0);
});

test('upcoming releases disclose tentative dates and subscription type without claiming calendar connection', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      movieReleases: {
        '1': [
          {
            kind: 'Subscription',
            date: '2099-10-01',
            confidence: 'rumored',
            source: 'https://example.invalid/fixture',
            sourceName: 'Fixture',
          },
        ],
      },
    },
  });
  await page.goto('/');
  const upcoming = page.locator('.next-up');
  await expect(upcoming.getByText('Unconfirmed', { exact: true })).toBeVisible();
  await expect(upcoming.getByText('Included with a subscription', { exact: true })).toBeVisible();
  await expect(upcoming.getByText('Included in Your Feed', { exact: true })).toBeVisible();
  await expect(page.getByText('On your calendar', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'outputs/review/calendar-upcoming-desktop.png' });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Show This Week', exact: true }).click();
  await expect(upcoming.getByText('Unconfirmed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'outputs/review/calendar-upcoming-320-dark.png' });
});

test('Available uses newest-first releases in both sections while Coming Soon keeps nearest-first order', async ({
  page,
  request,
}) => {
  const release = (date: string) => [
    {
      kind: 'Digital',
      date,
      confidence: 'listed',
      source: 'https://example.invalid/fixture',
      sourceName: 'Fixture',
    },
  ];
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      libraryIds: ['1', '2', '3', '4', '5'],
      movieReleases: {
        '1': release('2020-01-01'),
        '2': release('2025-01-01'),
        '3': release('2024-01-01'),
        '4': release('2099-01-01'),
        '5': release('2099-02-01'),
      },
    },
  });
  await page.goto('/');
  for (const section of ['My Library', 'Discover']) {
    await page.getByRole('button', { name: new RegExp(`^${section}`) }).click();
    await page.getByRole('button', { name: 'Available', exact: true }).click();
    await expect(page.locator('.movie-card h3')).toHaveText([
      'Fixture Film 01',
      'Fixture Film 02',
      'Fixture Film 00',
    ]);
    await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
    await expect(page.locator('.movie-card h3').nth(0)).toHaveText('Fixture Film 03');
    await expect(page.locator('.movie-card h3').nth(1)).toHaveText('Fixture Film 04');
  }
});

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
    await dialog.getByRole('button', { name: 'Export Library', exact: true }).click();
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
  await dialog.getByRole('button', { name: 'Reset Calendar Link', exact: true }).click();
  await dialog.getByLabel('Type RESET to confirm').fill('RESET');
  await dialog.getByRole('button', { name: 'Reset Link', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('may still complete');
  await expect(dialog.getByRole('button', { name: 'Check Outcome' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Reset Link', exact: true })).toBeDisabled();
  await page.route('**/api/init', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), feedPath: '/api/feed/reconciled.ics' },
    });
  });
  await dialog.getByRole('button', { name: 'Check Outcome' }).click();
  await expect(dialog.getByRole('button', { name: 'Open Calendar Settings' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your Movie Calendar' });
  await expect(dialog.getByRole('alert')).toContainText('Calendar unavailable');
  await expect(page.locator('.toast')).toHaveCount(0);
  fail = false;
  await dialog.getByRole('button', { name: 'Try Again' }).click();
  await expect(dialog.locator('.tracked-list')).toContainText('Fixture Film 00');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.route('**/api/settings', (route) =>
    route.fulfill({ status: 400, json: { error: 'Preference not saved' } }),
  );
  const preference = dialog.getByRole('switch', { name: /Include Unconfirmed/ });
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
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your Movie Calendar' });
  const button = dialog.getByRole('button', { name: 'Copy Feed Link', exact: true });
  await button.click();
  await expect(dialog.getByRole('alert')).toContainText('Could not copy');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  await button.click();
  await expect(dialog.getByRole('button', { name: 'Link Copied', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Show All Films', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All Films', exact: true })).toHaveAttribute(
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
  await page.getByRole('button', { name: /^My Library/ }).click();
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
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'List View', exact: true })).toHaveAttribute(
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
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
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
  await page.getByLabel('Your Email Address').fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Continue with Email' }).click();
  await expect(page.locator('#email-error')).toContainText('temporarily unavailable');
  await page.unroute('**/auth/login');
  await page.route('**/auth/login', (route) => route.fulfill({ json: { ok: true } }));
  await page.getByLabel('Your Email Address').press('Enter');
  await expect(page.getByRole('heading', { name: 'Check Your Inbox.' })).toBeVisible();
  expect(await page.locator('.login-success').evaluate((node) => node.getAnimations().length)).toBe(
    0,
  );
  await expect(page.locator('.login-success')).toBeFocused();
  await expect(page.locator('.login-success')).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  const useAnotherEmail = page.getByRole('button', { name: 'Use Another Email' });
  await expect(useAnotherEmail).toBeFocused();
  await expect(useAnotherEmail).toHaveCSS('outline-style', 'solid');
  await page.getByRole('button', { name: 'Use Another Email' }).click();
  await expect(page.getByLabel('Your Email Address')).toBeFocused();
});

test('new state motion uses opacity-only alternatives and pointer confirmation exits cleanly', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const dialog = await openAccount(page);
  await dialog.getByRole('button', { name: 'Reset Calendar Link', exact: true }).click();
  await expect(dialog.getByLabel('Type RESET to confirm')).toBeFocused();
  await expect(dialog.locator('.account-confirm-presence')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'outputs/review/ux-account-confirm-375-dark.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.locator('.account-confirm-presence')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Reset Calendar Link', exact: true }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Close account settings' }).click();
  await context.clearCookies();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/login');
  await page.route('**/auth/login', (route) => route.fulfill({ json: { ok: true } }));
  await page.getByLabel('Your Email Address').fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Continue with Email' }).click();
  await expect(page.getByRole('heading', { name: 'Check Your Inbox.' })).toBeVisible();
  const frames = await page
    .locator('.login-success')
    .evaluate((node) =>
      node
        .getAnimations()
        .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
    );
  expect(frames.every((frame) => !frame.transform || frame.transform === 'none')).toBe(true);
  await expect(page.locator('.login-success')).toHaveCSS('opacity', '1');
  await expect(page.locator('.login-success')).toBeFocused();
  await expect(page.locator('.login-success')).toHaveCSS('outline-style', 'none');
  await page.screenshot({ path: 'outputs/review/ux-login-success-375-light.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('cached search badges follow confirmed membership changes', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close film details' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await search.fill('Fixture Film 29');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).toContainText(
    'Saved to your library',
  );
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: /Remove from Library/ }).click();
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

test('initial loading reserves poster geometry in grid and list without focusable placeholders', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await request.post('http://127.0.0.1:4318/_control', { data: { databaseUnavailable: true } });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/init', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/');
    const skeleton = page.locator('.collection-skeleton');
    await expect(skeleton).toBeVisible();
    await expect(skeleton.getByRole('status')).toHaveText('Opening your library…');
    await expect(skeleton.locator('button, input, a')).toHaveCount(0);
    await expect(skeleton.locator('.skeleton-poster')).toHaveCount(10);
    const poster = await skeleton.locator('.skeleton-poster').first().boundingBox();
    expect(poster!.height / poster!.width).toBeCloseTo(1.5, 1);
    await page.screenshot({ path: 'outputs/review/ui-skeleton-grid-375.png' });
    await page.getByRole('button', { name: 'List View', exact: true }).click();
    await expect(skeleton.locator('.movie-list')).toBeVisible();
    await page.screenshot({ path: 'outputs/review/ui-skeleton-list-375.png' });
    await request.post('http://127.0.0.1:4318/_control', { data: { databaseUnavailable: false } });
  } finally {
    release();
  }
  await expect(page.locator('.collection-skeleton')).toHaveCount(0);
  await expect(page.locator('.movie-card')).toHaveCount(25);
});

test('mobile sheets keep Done reachable while content scrolls and restore trigger focus', async ({
  page,
}) => {
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 740 });
    await page.emulateMedia({ colorScheme: width === 320 ? 'dark' : 'light' });
    await page.goto('/');
    // Exercise a reserved scrollbar gutter on both macOS and Linux.
    await page.addStyleTag({ content: '::-webkit-scrollbar { width: 15px; height: 15px; }' });
    const trigger = page.getByRole('button', { name: 'View Fixture Film 00', exact: true });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: 'Fixture Film 00 details' });
    await expect(sheet).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const bounds = await sheet.boundingBox();
    // Classic scrollbars reserve a gutter; overlay scrollbars do not.
    const usableWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
    expect(bounds!.x).toBeCloseTo(0, 0);
    expect(bounds!.width).toBeCloseTo(usableWidth, 0);
    expect(bounds!.y + bounds!.height).toBeCloseTo(740, 0);
    await sheet.locator('.dialog-inner').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const done = sheet.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `outputs/review/ui-sheet-${width}.png` });
    await done.click();
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('sheets honor reduced motion and keyboard entry and desktop dialogs stay centered', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.addStyleTag({ content: '::-webkit-scrollbar { width: 15px; height: 15px; }' });
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your Movie Calendar' });
  await expect(dialog).toHaveCSS('transition-property', 'opacity');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeHidden();
  const box = await dialog.boundingBox();
  const usableWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);
  expect(box!.x + box!.width / 2).toBeCloseTo(usableWidth / 2, 0);
  expect(box!.y + box!.height / 2).toBeCloseTo(500, 0);
});

test('long collections retain selection, offscreen focus and card controls across mode changes', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { renderCount: 500 } });
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(500);
  await page.getByRole('button', { name: 'Select Films', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Select Render sample 499', exact: true });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await expect(checkbox).toBeChecked();
  await checkbox.focus();
  await expect(checkbox).toBeFocused();
  await expect(checkbox).toBeInViewport();
  await page.getByRole('button', { name: 'Cancel Selection', exact: true }).click();
  await expect(checkbox).toBeHidden();
  const card = page.locator('[data-movie-id="render-sample-499"]');
  await expect(
    card.getByRole('button', { name: 'View Render sample 499', exact: true }),
  ).toBeVisible();
  await expect(card.locator('.save-button')).toBeVisible();
});

for (const outcome of ['success', 'rejected', 'lost response', 'unconfirmed'] as const) {
  test(`calendar preference updates optimistically and handles ${outcome}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Your Movie Calendar' });
    const preference = dialog.getByRole('switch', { name: /Include Unconfirmed/ });
    const previous = await preference.isChecked();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    await page.route('**/api/settings', async (route) => {
      writes++;
      await gate;
      if (outcome === 'rejected')
        return route.fulfill({ status: 400, json: { error: 'Fixture preference rejected' } });
      if (outcome === 'unconfirmed')
        return route.fulfill({ status: 502, json: { error: 'Fixture outcome unknown' } });
      const response = await route.fetch();
      if (outcome === 'lost response')
        return route.fulfill({ status: 502, json: { error: 'Fixture response lost' } });
      await route.fulfill({ response });
    });
    if (outcome === 'unconfirmed')
      await page.route('**/api/init', (route) =>
        route.fulfill({ status: 503, json: { error: 'Fixture reconciliation unavailable' } }),
      );
    try {
      await preference.click();
      await expect(preference).toBeChecked({ checked: !previous });
      await expect(preference).toHaveAttribute('aria-busy', 'true');
      await expect(preference).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Download .ics' })).toBeDisabled();
      release();
      await expect(preference).toBeEnabled();
      await expect(preference).toHaveAttribute('aria-busy', 'false');
      await expect(preference).toBeChecked({
        checked: outcome === 'rejected' || outcome === 'unconfirmed' ? previous : !previous,
      });
      if (outcome === 'rejected')
        await expect(dialog.getByRole('alert')).toContainText('previous setting has been restored');
      else if (outcome === 'unconfirmed')
        await expect(dialog.getByRole('alert')).toContainText('Could not confirm this change');
      else await expect(dialog.getByRole('alert')).toHaveCount(0);
      expect(writes).toBe(1);
      if (outcome === 'success' || outcome === 'lost response') {
        await page.reload();
        await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
        await expect(preference).toBeChecked({ checked: !previous });
      }
    } finally {
      release();
    }
  });
}

test('listed releases today are Available in both sections and retain their calendar reminder', async ({
  page,
  request,
}) => {
  const today = releaseDay();
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      libraryIds: ['1'],
      movieReleases: {
        '1': [
          {
            kind: 'Digital',
            date: today,
            confidence: 'listed',
            source: 'https://example.invalid',
            sourceName: 'Fixture',
          },
        ],
      },
    },
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'This Week', exact: true })).toContainText(
    'Fixture Film 00',
  );
  for (const section of ['My Library', 'Discover']) {
    await page.getByRole('button', { name: new RegExp(`^${section}`) }).click();
    await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
    await expect(page.locator('[data-movie-id="1"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Available', exact: true }).click();
    await expect(page.locator('[data-movie-id="1"]')).toBeVisible();
  }
});

test('an open Coming Soon list refreshes across release-market midnight', async ({
  page,
  request,
}) => {
  const today = releaseDay();
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDay = tomorrow.toISOString().slice(0, 10);
  let midnight = new Date(`${nextDay}T04:00:00Z`);
  if (releaseDay(midnight) !== nextDay) midnight = new Date(`${nextDay}T05:00:00Z`);
  await page.clock.install({ time: new Date(midnight.getTime() - 10_000) });
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      libraryIds: ['1'],
      movieReleases: {
        '1': [
          {
            kind: 'Digital',
            date: nextDay,
            confidence: 'listed',
            source: 'https://example.invalid',
            sourceName: 'Fixture',
          },
        ],
      },
    },
  });
  await page.goto('/');
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/library' && url.searchParams.get('filter') === 'soon';
  });
  await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
  await filtered;
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Coming Soon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-movie-id="1"]')).toBeVisible();
  await request.post('http://127.0.0.1:4318/_control', { data: { releaseDay: nextDay } });
  await page.clock.fastForward(31_000);
  await expect(page.locator('[data-movie-id="1"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Available', exact: true }).click();
  await expect(page.locator('[data-movie-id="1"]')).toBeVisible();
});
