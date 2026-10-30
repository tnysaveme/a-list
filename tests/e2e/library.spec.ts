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
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Saved to library/ })).toBeVisible();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'restored' })).toBeVisible();
});
test('inline search keeps focus, navigates results by keyboard and returns focus after details close', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search films' });
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await search.fill('Fixture Film 29');
  const result = page.getByRole('option', { name: /Fixture Film 29/ });
  await expect(result).toBeVisible();
  await search.press('ArrowUp');
  await expect(result).toHaveAttribute('aria-selected', 'true');
  await expect(search).toBeFocused();
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'Fixture Film 29', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  await search.fill('Fixture Film 29');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await search.press('Escape');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox', { name: 'Film results' })).toHaveCount(0);
  await search.click();
  await page.getByRole('heading', { name: 'Your library', exact: true }).click();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
});

test('save feedback precedes confirmation and does not wait for listing reconciliation', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save Fixture Film 00', exact: true });
  await expect(save).toBeVisible();
  let releaseMembership!: () => void;
  let releaseListing!: () => void;
  const membershipGate = new Promise<void>((resolve) => {
    releaseMembership = resolve;
  });
  const listingGate = new Promise<void>((resolve) => {
    releaseListing = resolve;
  });
  await page.route('**/api/library/membership?**', async (route) => {
    await membershipGate;
    await route.continue();
  });
  await page.route('**/api/library?**', async (route) => {
    await listingGate;
    await route.continue();
  });
  await page.evaluate(() => {
    document.addEventListener('click', () => performance.mark('save-click'), {
      once: true,
      capture: true,
    });
    const observer = new MutationObserver(() => {
      if (document.querySelector('.save-button[aria-busy="true"]')) {
        performance.mark('save-feedback');
        performance.measure('save-feedback-latency', 'save-click', 'save-feedback');
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-busy'],
    });
  });
  try {
    await save.click();
    const cardSave = page.locator('[data-movie-id="1"] .save-button');
    await expect(cardSave).toHaveAttribute('aria-busy', 'true');
    await expect(cardSave).toHaveAttribute('aria-pressed', 'false');
    await expect(cardSave).toHaveAccessibleName('Saving Fixture Film 00…');
    const latency = await page.evaluate(
      () => performance.getEntriesByName('save-feedback-latency')[0].duration,
    );
    console.log(JSON.stringify({ metric: 'save-click-to-pending-dom-ms', value: latency }));
    await testInfo.attach('feedback-latency.json', {
      body: JSON.stringify({ eventToPendingDOMMs: latency }),
      contentType: 'application/json',
    });
    expect(latency).toBeLessThan(200);
    releaseMembership();
    await expect(cardSave).toHaveAttribute('aria-pressed', 'true');
    await expect(cardSave).toHaveAttribute('aria-busy', 'false');
  } finally {
    releaseMembership();
    releaseListing();
  }
});

test('populated filters expose pending state and retain films after a failed request', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('filter') !== 'unknown')
      return route.continue();
    await gate;
    await route.fulfill({ status: 503, json: { error: 'Fixture filter unavailable' } });
  });
  try {
    await page.getByRole('button', { name: 'TBA', exact: true }).click();
    await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Updating films…' })).toBeVisible();
    await expect(page.locator('.movie-card')).toHaveCount(25);
  } finally {
    release();
  }
  await expect(
    page.getByRole('alert').filter({ hasText: 'Fixture filter unavailable' }),
  ).toBeVisible();
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(25);
});

test('focus and timer refresh retain appended pages and the visible film position', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'More films' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(27);
  const anchor = page.locator('[data-movie-id="27"]');
  await anchor.scrollIntoViewIfNeeded();
  const before = (await anchor.boundingBox())!.y;
  await page.clock.fastForward(59_000);
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/library?') &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await page.clock.fastForward(2_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(27);
  expect(Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(2);
  const timerRefresh = page.waitForResponse(
    (response) =>
      response.url().includes('/api/library?') &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await request.post('http://127.0.0.1:4318/_control', { data: { revision: 1 } });
  await page.clock.fastForward(60_000);
  await timerRefresh;
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(27);
});

test('minute revision checks skip unchanged lists, pause hidden/offline and coalesce resume events', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let revisions = 0,
    lists = 0;
  page.on('request', (req) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/revision') revisions++;
    if (path === '/api/library') lists++;
  });
  await page.clock.fastForward(60_000);
  await expect.poll(() => lists).toBe(1);
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await page.clock.fastForward(60_000);
  await expect.poll(() => revisions).toBe(2);
  expect(lists).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(180_000);
  expect(revisions).toBe(2);
  await request.post('http://127.0.0.1:4318/_control', { data: { revision: 1 } });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(() => lists).toBe(2);
  expect(revisions).toBe(3);
  await expect(page.locator('.movie-card')).toHaveCount(25);
});

test('a failed revision probe keeps the collection and retries on the next minute', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let probes = 0,
    lists = 0;
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/library') lists++;
  });
  await page.route('**/api/revision', async (route) => {
    probes++;
    if (probes === 1)
      return route.fulfill({ status: 503, json: { error: 'Revision fixture unavailable' } });
    await route.continue();
  });
  await page.clock.fastForward(60_000);
  await expect.poll(() => probes).toBe(1);
  expect(lists).toBe(0);
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.clock.fastForward(60_000);
  await expect.poll(() => lists).toBe(1);
  await expect(page.locator('.movie-card')).toHaveCount(25);
});

test('a changed revision bypasses a warmed Discover cache after a missed invalidation', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await request.post('http://127.0.0.1:4318/_control', {
    data: { keepCache: true, revision: 1, releaseDate: '2099-10-01' },
  });
  const updated = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/catalogue' &&
      new URL(r.url()).searchParams.get('offset') === '0',
  );
  await page.clock.fastForward(61_000);
  const response = await updated;
  const body = await response.json();
  expect(body.movies.find((m: { id: string }) => m.id === '2').releases[0].date).toBe('2099-10-01');
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-movie-id="2"]')).toBeVisible();
});

test('a partially failed refresh preserves the coherent loaded collection', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'More films' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(27);
  await page.route('**/api/library?**', (route) =>
    new URL(route.request().url()).searchParams.get('offset') === '25'
      ? route.fulfill({ status: 503, json: { error: 'Second page unavailable' } })
      : route.continue(),
  );
  await page.clock.fastForward(61_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('alert').filter({ hasText: 'Second page unavailable' }),
  ).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(27);
});

test('catalogue refresh retains loaded pages and a failed later page cannot collapse them', async ({
  page,
  request,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'More films' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(32);
  await page.clock.fastForward(59_000);
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/catalogue?') &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await page.clock.fastForward(2_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(32);
  await page.route('**/api/catalogue?**', (route) =>
    new URL(route.request().url()).searchParams.get('offset') === '25'
      ? route.fulfill({ status: 503, json: { error: 'Catalogue page unavailable' } })
      : route.continue(),
  );
  await request.post('http://127.0.0.1:4318/_control', { data: { revision: 1 } });
  await page.clock.fastForward(61_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('alert').filter({ hasText: 'Keeping the loaded films' }),
  ).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(32);
});

test('dialog exit retains its content and native modality until the fade completes', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'View Fixture Film 00', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Fixture Film 00 details' });
  await expect(dialog).toHaveCSS('opacity', '1');
  const exiting = await page.getByRole('button', { name: 'Close film details' }).evaluate(
    (button) =>
      new Promise<{ open: boolean; state: string | undefined; hasContent: boolean }>((resolve) => {
        (button as HTMLButtonElement).click();
        requestAnimationFrame(() => {
          const element = document.querySelector<HTMLDialogElement>('.movie-dialog');
          resolve({
            open: !!element?.open,
            state: element?.dataset.state,
            hasContent: !!element?.querySelector('.film-details'),
          });
        });
      }),
  );
  expect(exiting).toEqual({ open: true, state: 'closed', hasContent: true });
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expect(page.locator('.movie-dialog')).toHaveCSS('transition-duration', '0.12s');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('menu reversals clean up, keyboard search is immediate, and poster presses stay still', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  const menu = page.getByRole('button', { name: 'Open A-List menu' });
  for (let i = 0; i < 3; i++) {
    await menu.click();
    await expect(page.getByRole('menu', { name: 'A-List menu' })).toBeVisible();
    await menu.click();
    await menu.click();
    await expect(page.getByRole('menu', { name: 'A-List menu' })).toHaveAttribute(
      'data-state',
      'open',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-header-menu')).toHaveCount(0);
  }
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox', { name: 'Search films' })).toBeFocused();
  await expect(page.locator('.app-search-panel')).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-search-panel')).toHaveCount(0);
  const poster = page.getByRole('button', { name: 'View Fixture Film 00', exact: true });
  const before = (await poster.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  expect(await poster.boundingBox()).toEqual(before);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'outputs/review/motion-library-mobile.png' });
  await poster.click();
  await expect(page.locator('.movie-dialog')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'outputs/review/motion-dialog-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'outputs/review/motion-library-desktop.png' });
});

test('records a bounded motion sample with 100 synthetic cards and 4x CPU slowdown', async ({
  page,
  browser,
}, testInfo) => {
  await page.request.post('http://127.0.0.1:4318/_control', { data: { renderCount: 100 } });
  const response = await page.request.post('/api/init', {
    data: {},
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  expect(response.ok()).toBe(true);
  const sampleMovies = (await response.json()).movies;
  await page.route('**/api/movie/*', (route) =>
    route.fulfill({ json: { movie: { ...sampleMovies[0], refreshPending: true } } }),
  );
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(100);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    const sampling = page.evaluate(
      () =>
        new Promise<{
          frameCount: number;
          medianFrameGapMs: number;
          p95FrameGapMs: number;
          maxFrameGapMs: number;
          longTaskMs: number[];
        }>((resolve) => {
          const gaps: number[] = [];
          const longTaskMs: number[] = [];
          const observer = new PerformanceObserver((list) => {
            longTaskMs.push(...list.getEntries().map((entry) => entry.duration));
          });
          observer.observe({ type: 'longtask' });
          const start = performance.now();
          let previous = 0;
          function frame(now: number) {
            if (previous) gaps.push(now - previous);
            previous = now;
            if (now - start < 5000) requestAnimationFrame(frame);
            else {
              observer.disconnect();
              gaps.sort((a, b) => a - b);
              resolve({
                frameCount: gaps.length,
                medianFrameGapMs: gaps[Math.floor(gaps.length / 2)],
                p95FrameGapMs: gaps[Math.floor(gaps.length * 0.95)],
                maxFrameGapMs: gaps.at(-1)!,
                longTaskMs,
              });
            }
          }
          requestAnimationFrame(frame);
        }),
    );
    await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
    await expect(page.locator('.movie-dialog')).toHaveCSS('opacity', '1');
    const result = {
      browser: browser.version(),
      workload:
        '100 synthetic cards, details opening plus repeated 1.5s polling; headless; 4x CPU slowdown',
      ...(await sampling),
    };
    console.log(JSON.stringify({ metric: 'motion-frame-sample', ...result }));
    await testInfo.attach('motion-frame-sample.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    expect(result.frameCount).toBeGreaterThan(30);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  } finally {
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await session.detach();
  }
});

test('search focus, typing and clearing preserve navbar geometry at narrow breakpoints', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search films' });
  const geometry = () =>
    page.locator('.app-header-inner').evaluate((nav) =>
      ['.app-header-brand', '.app-header-search-field', '#film-search', '.app-header-actions'].map(
        (selector) => {
          const box = nav.querySelector(selector)!.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height];
        },
      ),
    );
  for (const width of [320, 375, 414, 600, 639, 640, 768]) {
    await page.setViewportSize({ width, height: 812 });
    const before = await geometry();
    await search.click();
    const focused = await geometry();
    await search.fill('Fixture Film 29');
    const typed = await geometry();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    const cleared = await geometry();
    await search.press('Escape');
    const closed = await geometry();
    for (const state of [focused, typed, cleared, closed]) {
      state.forEach((box, index) =>
        box.forEach((value, dimension) => {
          expect(
            Math.abs(value - before[index][dimension]),
            `Navbar moved at ${width}px`,
          ).toBeLessThan(1);
        }),
      );
    }
    await expect(
      page.getByRole('button', { name: 'Calendar settings', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open A-List menu', exact: true })).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await search.click();
  await expect(page.locator('.app-search-panel')).toHaveCSS('animation-name', 'none');
});

test('calendar preference excludes unconfirmed preview dates and updates the actual feed', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Calendar settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Calendar settings', exact: true }).click();
  await page.getByRole('switch').click();
  await expect(page.getByRole('switch')).not.toBeChecked();
  await expect(page.getByText('Unconfirmed dates excluded', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'outputs/review/calendar-preferences.png' });
  const init = await page.request.post('/api/init', {
    data: {},
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  const data = await init.json();
  const feed = await request.get(data.feedPath);
  expect(feed.status()).toBe(200);
  expect(await feed.text()).not.toContain('[Unconfirmed]');
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
  await page.getByRole('button', { name: 'Available', exact: true }).click();
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
  await page
    .locator('.nav-tabs')
    .getByRole('button', { name: /^My library/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.getByText(/Showing saved listings/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save Fixture Film 00', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(25);
});

test('email confirmation survives mobile cross-browser opens and link prefetch without a PKCE cookie', async ({
  browser,
  request,
}) => {
  const fresh = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await fresh.newPage();
  const url = 'http://127.0.0.1:4317/auth/confirm?token_hash=' + 'a'.repeat(64) + '&type=email';
  // A scanner GET and the recipient GET must both leave the token unused.
  const scan = await request.get(url);
  expect(scan.status()).toBe(200);
  expect(scan.headers()['cache-control']).toContain('no-store');
  await page.goto(url);
  expect(
    (await (await request.get('http://127.0.0.1:4318/_auth-observation')).json())
      .emailVerifications,
  ).toBe(0);
  expect((await fresh.cookies()).some((cookie) => cookie.name.includes('code-verifier'))).toBe(
    false,
  );
  await page.getByRole('button', { name: 'Confirm & sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  expect((await fresh.cookies()).some((cookie) => cookie.name.includes('auth-token'))).toBe(true);
  const replay = await request.post('/auth/verify', {
    form: { token_hash: 'a'.repeat(64) },
    headers: { origin: 'http://127.0.0.1:4317' },
    maxRedirects: 0,
  });
  expect(replay.headers()['location']).toContain('error=expired-link');
  const crossOrigin = await request.post('/auth/verify', {
    form: { token_hash: 'a'.repeat(64) },
    headers: { origin: 'https://example.invalid' },
  });
  expect(crossOrigin.status()).toBe(403);
  await request.post('http://127.0.0.1:4318/_control', { data: { authUnavailable: true } });
  const outage = await request.post('/auth/verify', {
    form: { token_hash: 'b'.repeat(64) },
    headers: { origin: 'http://127.0.0.1:4317' },
    maxRedirects: 0,
  });
  expect(outage.headers()['location']).toContain('error=service-unavailable');
  const deliveryOutage = await request.post('/auth/login', {
    data: { email: 'fixture@example.invalid' },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  expect(deliveryOutage.status()).toBe(503);
  await fresh.close();
});

test('appearance overrides the device, persists across routes and tabs, and follows live system changes', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const openSettings = async () => {
    await page.getByRole('button', { name: 'Open A-List menu' }).click();
    await page.getByRole('menuitem', { name: 'Account settings', exact: true }).click();
  };
  await openSettings();
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(html).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'oklch(1 0 0)');
  await page.reload();
  await openSettings();
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(html).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#161719');
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto('/privacy');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'System', exact: true }).check();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Close account settings' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 320, height: 812 });
  await openSettings();
  const pill = page.getByRole('group', { name: 'Color theme', exact: true });
  await expect(pill).toBeVisible();
  expect(await pill.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('radio', { name: 'System', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await expect(html).toHaveCSS('color-scheme', 'light');
  expect(errors).toEqual([]);
  await other.close();
});

test('saved appearance applies before hydration and restricted storage still allows theme changes', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open A-List menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  const beforeHydration = await context.newPage();
  await beforeHydration.emulateMedia({ colorScheme: 'light' });
  await beforeHydration.route('**/_next/**/*.js*', (route) => route.abort());
  await beforeHydration.goto('/login');
  await expect(beforeHydration.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(beforeHydration.locator('html')).toHaveCSS('color-scheme', 'dark');
  await beforeHydration.close();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await page.getByRole('button', { name: 'Open A-List menu' }).click();
  await page.getByRole('menuitem', { name: 'Account settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('section navigation animates content and the active tab, and rapid reversals preserve the last choice', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  await page.addStyleTag({ content: ':root { --dur-view: 1500ms; }' });
  const discover = page.getByRole('button', { name: 'Discover', exact: true });
  await discover.click();
  await expect(page.locator('html')).toHaveAttribute('data-content-motion', 'forward');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a instanceof CSSAnimation && a.animationName === 'section-forward')
            .length,
      ),
    )
    .toBe(1);
  const motion = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation && a.animationName === 'section-forward')
      .map((a) => (a.effect as KeyframeEffect).getKeyframes()),
  );
  expect(motion[0][0].transform).toMatch(/^translate(?:X)?\(24px\)$/);
  await expect
    .poll(() =>
      page.locator('.nav-tabs > .moving-tab-indicator').evaluate((el) => el.getAnimations().length),
    )
    .toBe(1);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = 400;
    }
  });
  await page.screenshot({ path: 'outputs/review/section-transition-desktop.png' });
  await page.getByRole('button', { name: /library/i }).click();
  await discover.click();
  await expect(discover).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /library/i })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
});

test('grid and list move poster artwork, can reverse mid-flight, and settle without leftover transforms', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-layout: 1500ms; }' });
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  const grid = page.locator('.movie-grid');
  await expect(grid).toHaveClass(/movie-list/);
  await expect(grid).toHaveAttribute('data-layout-animating', 'true');
  const frames = await page
    .locator('.poster-button')
    .first()
    .evaluate((el) => el.getAnimations().map((a) => (a.effect as KeyframeEffect).getKeyframes()));
  expect(frames.some((keyframes) => String(keyframes[0].transform).includes('scale('))).toBe(true);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = 400;
    }
  });
  await page.screenshot({ path: 'outputs/review/layout-transition-desktop.png' });
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await expect(grid).not.toHaveClass(/movie-list/);
  await expect(grid).not.toHaveAttribute('data-layout-animating', 'true');
  await expect(page.locator('.poster-button').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.movie-info').first()).toHaveCSS('opacity', '1');
});

test('successful filter replacement animates only after delayed results arrive', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-results: 1500ms; --dur-view: 1500ms; }' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('filter') !== 'unknown')
      return route.continue();
    await gate;
    await route.fulfill({ json: { movies: [], total: 27, filteredTotal: 0, nextOffset: null } });
  });
  await page.getByRole('button', { name: 'TBA', exact: true }).click();
  try {
    await expect(page.locator('.movie-card')).toHaveCount(25);
    await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('html')).not.toHaveAttribute('data-content-motion');
    await expect
      .poll(() =>
        page
          .locator('.filter-list > .moving-tab-indicator')
          .evaluate((el) => el.getAnimations().length),
      )
      .toBe(1);
  } finally {
    release();
  }
  await expect(page.locator('.movie-card')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .some((a) => a instanceof CSSAnimation && a.animationName === 'results-enter'),
      ),
    )
    .toBe(true);
});

test('reduced motion fades sections while keyboard navigation stays immediate', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-short: 1500ms; }' });
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discover', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const animations = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation)
      .map((a) => ({
        name: (a as CSSAnimation).animationName,
        frames: (a.effect as KeyframeEffect).getKeyframes(),
      })),
  );
  expect(animations.some((a) => a.name === 'content-fade-in')).toBe(true);
  expect(
    animations.some((a) => a.frames.some((frame) => frame.transform && frame.transform !== 'none')),
  ).toBe(false);
  const library = page.getByRole('button', { name: /library/i });
  await library.focus();
  await library.press('Enter');
  await expect(library).toHaveAttribute('aria-pressed', 'true');
  await expect(library).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-content-motion');
  await page.getByRole('button', { name: 'List view', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.movie-grid')).toHaveClass(/movie-list/);
  await expect(page.locator('.movie-card').first()).toHaveCSS('transform', 'none');
});

test('section switching still animates when native view transitions are unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'startViewTransition', { value: undefined });
  });
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-view: 1500ms; }' });
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect
    .poll(() => page.locator('.section-content').evaluate((el) => el.getAnimations().length))
    .toBe(1);
  await page.getByRole('button', { name: /library/i }).click();
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
});

test('section and layout transitions keep mobile and tablet controls aligned in both themes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.getByRole('button', { name: 'Discover', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
      await expect(page.locator('html')).not.toHaveAttribute('data-content-motion');
      const aligned = await page.locator('.nav-tabs').evaluate((el) => {
        const selected = el.querySelector('[aria-pressed="true"]')!.getBoundingClientRect();
        const marker = el.querySelector('.moving-tab-indicator')!.getBoundingClientRect();
        return (
          Math.abs(selected.left - marker.left) < 1 && Math.abs(selected.width - marker.width) < 1
        );
      });
      expect(aligned).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole('button', { name: 'List view', exact: true }).click();
      await expect(page.locator('.movie-grid')).not.toHaveAttribute(
        'data-layout-animating',
        'true',
      );
      await page.screenshot({ path: `outputs/review/section-list-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: /library/i }).click();
      await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Grid view', exact: true }).click();
      await expect(page.locator('.movie-grid')).not.toHaveAttribute(
        'data-layout-animating',
        'true',
      );
    }
  }
});

test('compiled duration tokens retain real animation times after CSS minification', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  // No token overrides: exercise the production stylesheet's seconds/ms units.
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.nav-tabs > .moving-tab-indicator')
        .evaluate((el) => el.getAnimations()[0]?.effect?.getTiming().duration),
    )
    .toBe(260);
  await expect(page.locator('html')).not.toHaveAttribute('data-content-motion');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  const posterDuration = await page
    .locator('.poster-button')
    .first()
    .evaluate((el) => el.getAnimations()[0]?.effect?.getTiming().duration);
  expect(posterDuration).toBe(280);
});

test('saved library renders in the first HTML without a Discover flash or duplicate bootstrap fetches', async ({
  page,
}) => {
  const calls: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { bootstrapShifts: number[] }).bootstrapShifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!entry.hadRecentInput)
          (window as unknown as { bootstrapShifts: number[] }).bootstrapShifts.push(entry.value);
    }).observe({ type: 'layout-shift', buffered: true });
  });
  page.on('request', (request) => {
    if (/\/api\/(init|catalogue)/.test(request.url())) calls.push(request.url());
  });
  const response = await page.goto('/');
  expect(await response!.text()).toContain('<h1>Your library</h1>');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  expect(calls).toEqual([]);
  await page.screenshot({ path: 'outputs/review/optimized-library-startup.png' });
  const shift = await page.evaluate(() =>
    (window as unknown as { bootstrapShifts: number[] }).bootstrapShifts.reduce(
      (sum, value) => sum + value,
      0,
    ),
  );
  expect(shift).toBeLessThan(0.02);
});

test('a fallback initialization response cannot override explicit Discover navigation', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { databaseUnavailable: true } });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/api/init', async (route) => {
    started = true;
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await request.post('http://127.0.0.1:4318/_control', { data: { databaseUnavailable: false } });
  const initialized = page.waitForResponse('**/api/init');
  release();
  await initialized;
  await expect(page.getByRole('button', { name: /library/i })).toHaveText(/27/);
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
});

test('failed filters and sorting restore applied controls, and retry repeats the failed query', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let fail = true;
  await page.route('**/api/library?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    return fail && (query.get('filter') === 'unknown' || query.get('sort') === 'title')
      ? route.fulfill({ status: 502, body: '<html>Unavailable</html>', contentType: 'text/html' })
      : route.continue();
  });
  await page.getByRole('button', { name: 'TBA', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All films', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  fail = false;
  await page.locator('.inline-error').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.movie-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'All films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  fail = true;
  await page.getByRole('combobox', { name: 'Sort films' }).selectOption('title');
  await expect(page.getByRole('combobox', { name: 'Sort films' })).toHaveValue('release');
});

test('current-tab clicks and a recent section round trip reuse retained library data', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  const calls: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(library|catalogue)\?/.test(request.url()))
      calls.push(new URL(request.url()).pathname);
  });
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /library/i }).click();
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /library/i }).click();
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  expect(calls).toEqual(['/api/catalogue']);
});

test('details polling pauses while hidden or offline and resumes once after returning', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let count = 0;
  await page.route('**/api/movie/*', async (route) => {
    count++;
    await route.fulfill({
      json: {
        movie: {
          id: '1',
          title: 'Fixture Film 00',
          year: '2026',
          poster: '',
          source: 'https://example.invalid',
          checkedAt: new Date().toISOString(),
          releases: [],
          refreshPending: true,
        },
      },
    });
  });
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1800);
  expect(count).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  expect(count).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await expect.poll(() => count).toBe(2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1700);
  expect(count).toBe(2);
});

test('a stalled read leaves pending state at its deadline and preserves the applied filter', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('filter') !== 'unknown')
      return route.continue();
    await gate;
    await route.abort('failed').catch(() => {});
  });
  try {
    await page.getByRole('button', { name: 'TBA', exact: true }).click();
    await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'true');
    await expect(
      page.getByRole('alert').filter({ hasText: 'This request took too long' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('button', { name: 'All films', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.movie-card')).toHaveCount(25);
    await expect(
      page.locator('.inline-error').getByRole('button', { name: 'Try again' }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test('retrying initialization preserves a Discover filter chosen before the retry began', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { databaseUnavailable: true } });
  let retry = false;
  await page.route('**/api/init', (route) =>
    retry
      ? route.fulfill({
          json: {
            movies: [],
            total: 0,
            filteredTotal: 0,
            trackedCount: 0,
            knownCount: 0,
            listedEvents: 0,
            rumoredEvents: 0,
            upcoming: null,
            nextOffset: null,
            feedPath: '/api/feed/fixture.ics',
            feedPublic: true,
            includeRumors: true,
          },
        })
      : route.fulfill({ status: 503, json: { error: 'Fixture startup unavailable' } }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Fixture startup unavailable' }),
  ).toBeVisible();
  await request.post('http://127.0.0.1:4318/_control', { data: { databaseUnavailable: false } });
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'TBA', exact: true }).click();
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/catalogue?')) requests.push(r.url());
  });
  retry = true;
  const initialized = page.waitForResponse('**/api/init');
  await page.locator('.inline-error').getByRole('button', { name: 'Try again' }).click();
  await initialized;
  await expect(page.getByRole('button', { name: 'Calendar settings', exact: true })).toBeEnabled();
  await expect(page.getByText('Your library couldn’t open.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(requests).toEqual([]);
});

test('saving draws the check only after confirmed membership and failed saves keep the add state', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.addStyleTag({ content: ':root { --dur-medium: 1200ms; }' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route('**/api/library', async (route) => {
    await gate;
    if (fail) await route.fulfill({ status: 503, json: { error: 'Fixture save failed' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.locator('.film-control .membership-icon')).toHaveAttribute(
    'data-membership',
    'pending',
  );
  release();
  await expect(page.getByRole('button', { name: 'Save to library', exact: true })).toBeEnabled();
  await expect(page.locator('.film-control .membership-icon')).toHaveAttribute(
    'data-membership',
    'unsaved',
  );
  fail = false;
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Saved to library/ })).toBeEnabled();
  const check = page.locator('.film-control .membership-check path');
  await expect
    .poll(() =>
      check.evaluate((node) =>
        node
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSTransition &&
              animation.transitionProperty === 'stroke-dashoffset',
          ),
      ),
    )
    .toBe(true);
  await check.evaluate((node) => {
    for (const animation of node.getAnimations()) {
      animation.pause();
      animation.currentTime = 200;
    }
  });
  await page.screenshot({ path: 'outputs/review/membership-save-confirmation.png' });
});

test('confirmed removal moves neighbors and Undo reverses an unfinished exit without duplicate interactive cards', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-grid > .movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-view: 1200ms; --dur-medium: 900ms; }' });
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const root = page.locator('.collection-motion-root');
  const ghost = page.locator('[data-ghost-movie-id="1"]');
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveAttribute('inert', '');
  await expect(ghost).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.movie-grid [data-movie-id="1"]')).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'View Fixture Film 01', exact: true }),
  ).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator('.movie-grid [data-movie-id="2"]')
        .evaluate((node) => node.getAnimations().length),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'outputs/review/membership-removal-midpoint.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.movie-grid [data-movie-id="1"]')).toHaveCount(1);
  await expect(ghost).toHaveCount(0);
  await expect(root).toHaveAttribute('data-membership-animating', 'true');
  const entry = await page
    .locator('.movie-grid [data-movie-id="1"]')
    .evaluate((node) =>
      node.getAnimations().map((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
    );
  expect(entry.some((frames) => Number(frames[0].opacity) > 0)).toBe(true);
  await expect(root).not.toHaveAttribute('data-membership-animating', 'true');
  await expect(page.locator('.membership-ghost')).toHaveCount(0);
  await expect(page.locator('.movie-grid [data-movie-id="2"]')).toHaveCSS('transform', 'none');
});

test('partial batch removal in list layout animates only confirmed removals', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.locator('.movie-grid')).not.toHaveAttribute('data-layout-animating', 'true');
  await page.addStyleTag({ content: ':root { --dur-view: 1200ms; --dur-medium: 900ms; }' });
  await page.getByRole('button', { name: 'Select films', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Fixture Film 00', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select Fixture Film 01', exact: true }).check();
  await page.route('**/api/library', async (route) => {
    await route.fetch({ postData: { action: 'remove', ids: ['1'] } });
    await route.fulfill({ status: 502, json: { error: 'Fixture partial write' } });
  });
  await page.locator('.batch-bar').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Removed 1 of 2 films' })).toBeVisible();
  await expect(page.locator('[data-ghost-movie-id="1"]')).toHaveCount(1);
  await expect(page.locator('[data-ghost-movie-id="2"]')).toHaveCount(0);
  await expect(page.locator('.movie-grid [data-movie-id="2"]')).toHaveClass(/is-selected/);
  await expect(page.locator('.membership-ghost-layer')).toHaveClass(/movie-list/);
});

test('keyboard removal is immediate and reduced motion uses opacity-only membership feedback', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Saved to library/ }).press('Enter');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await expect(page.locator('.membership-ghost')).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({ content: ':root { --dur-short: 1000ms; }' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.movie-grid [data-movie-id="1"]')).toHaveCount(1);
  const entry = await page
    .locator('.movie-grid [data-movie-id="1"]')
    .evaluate((node) =>
      node
        .getAnimations()
        .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
    );
  expect(entry.length).toBeGreaterThan(0);
  expect(entry.every((frame) => !frame.transform || frame.transform === 'none')).toBe(true);
});

test('removing the last film reaches a usable empty state and Undo animates it back on a narrow dark screen', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { libraryIds: ['1'] } });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.movie-grid > .movie-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Saved to library/ }).click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#collection-heading')).toBeFocused();
  await expect(page.locator('.membership-ghost')).toHaveCount(0);
  await page.screenshot({ path: 'outputs/review/membership-empty-mobile-dark.png' });
  await page.addStyleTag({ content: ':root { --dur-view: 1200ms; }' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const film = page.locator('.movie-grid [data-movie-id="1"]');
  await expect(film).toHaveCount(1);
  await expect(page.locator('.collection-motion-root')).toHaveAttribute(
    'data-membership-animating',
    'true',
  );
  const animations = await film.evaluate((node) =>
    node
      .getAnimations()
      .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
  );
  expect(animations.some((frame) => frame.opacity === '0' || frame.opacity === 0)).toBe(true);
  await expect(page.locator('.collection-motion-root')).not.toHaveAttribute(
    'data-membership-animating',
    'true',
  );
  await expect(film).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
