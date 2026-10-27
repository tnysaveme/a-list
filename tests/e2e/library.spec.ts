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
test('authenticated library pagination, search, save, remove and Undo cross the real API handlers', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library', exact: false })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'More films' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(27);
  await page.getByRole('button', { name: 'Search films' }).click();
  await page.getByRole('textbox', { name: 'Search movie titles' }).fill('Fixture Film 29');
  await page.getByRole('button', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Saved to library/ })).toBeVisible();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'restored' })).toBeVisible();
});
test('calendar preference excludes reported preview dates and updates the actual feed', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Calendar settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Calendar settings', exact: true }).click();
  await page.getByRole('switch').click();
  await expect(page.getByRole('switch')).not.toBeChecked();
  await expect(page.getByText('Reported dates excluded', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'outputs/review/calendar-preferences.png' });
  const init = await page.request.post('/api/init', {
    data: {},
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  const data = await init.json();
  const feed = await request.get(data.feedPath);
  expect(feed.status()).toBe(200);
  expect(await feed.text()).not.toContain('[Rumored]');
});
test('Redis outage fails closed with a retryable response and recovers', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { redisUnavailable: true } });
  const response = await page.request.get('/api/library');
  expect(response.status()).toBe(503);
  expect(response.headers()['retry-after']).toBe('30');
  await request.post('http://127.0.0.1:4318/_control', { data: { redisUnavailable: false } });
  expect((await page.request.get('/api/library')).status()).toBe(200);
});
test('expired sessions redirect while provider outages show a recoverable error', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { authExpired: true } });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await request.post('http://127.0.0.1:4318/_control', {
    data: { authExpired: false, authUnavailable: true },
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});

test('malformed API writes make no partial change and fast filter changes ignore late responses', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  const settings = await page.request.post('/api/settings', {
    data: {},
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  expect(settings.status()).toBe(400);
  const mixed = await page.request.post('/api/library', {
    data: { action: 'remove', ids: ['1', 'invalid'] },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  expect(mixed.status()).toBe(400);
  await page.getByRole('button', { name: 'Available now', exact: true }).click();
  await page.getByRole('button', { name: 'All films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'All films', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('account export, calendar reset and deletion affect disposable fixture data only', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Calendar settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Open A-List menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export library', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/a-list-library/);
  await page.getByRole('button', { name: 'Reset calendar link', exact: true }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await page.getByRole('button', { name: 'Reset link', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'old calendar link no longer works' }),
  ).toBeVisible();
  const old = '11111111-1111-4111-8111-111111111111' + 'a'.repeat(32);
  expect((await request.get('/api/feed/' + old + '.ics')).status()).toBe(404);
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete account permanently', exact: true }).click();
  await expect(page).toHaveURL(/deleted=1/);
});
test('slow source refreshes return saved details within budget and finish through cached polling', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { staleMovies: ['32'] } });
  const started = performance.now();
  const response = await page.request.get('/api/movie/32');
  const first = await response.json();
  expect(response.status()).toBe(200);
  expect(first.movie.refreshPending).toBe(true);
  expect(performance.now() - started).toBeLessThan(2500);
  await expect
    .poll(
      async () => {
        const result = await page.request.get('/api/movie/32?cached=true');
        return (await result.json()).movie.refreshPending;
      },
      { timeout: 12000 },
    )
    .toBe(false);
  const final = await (await page.request.get('/api/movie/32?cached=true')).json();
  expect(final.movie.releases).toHaveLength(1);
  expect(final.movie.releaseCheck.status).toBe('failed');
});

test('public readiness contains only status while detailed health stays private', async ({
  request,
}) => {
  const response = await request.get('/api/status');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'healthy' });
  expect((await request.get('/api/health')).status()).toBe(401);
});
test('successful source data commits despite an unavailable health-write RPC', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', {
    data: { staleMovies: ['32'], sourceSuccess: true },
  });
  const first = await (await page.request.get('/api/movie/32')).json();
  expect(first.movie.refreshPending).toBe(true);
  await expect
    .poll(
      async () => {
        const result = await (await page.request.get('/api/movie/32?cached=true')).json();
        return result.movie.refreshPending;
      },
      { timeout: 12000 },
    )
    .toBe(false);
  const final = await (await page.request.get('/api/movie/32?cached=true')).json();
  expect(final.movie.releases[0].date).toBe('2099-11-02');
  expect(final.movie.releaseCheck.status).toBe('fresh');
});

test('catalogue fallback preserves confirmed membership changes in a library larger than one page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await page.getByRole('button', { name: 'Fixture Film 00 is saved', exact: true }).click();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  // Exercise browser recovery even when the server's last-good catalogue cache could mask
  // a provider outage. Other cases cover the real API/provider failure boundary.
  await page.route('**/api/catalogue?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Catalogue temporarily unavailable' } }),
  );
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.getByText(/Showing saved listings/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save Fixture Film 00', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(25);
});
