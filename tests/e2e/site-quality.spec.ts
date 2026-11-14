import { test, expect } from '@playwright/test';
import { releaseDay } from '../../lib/release-day';

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

test('phone browsing starts with a compact agenda that expands without losing its releases', async ({
  page,
  request,
}) => {
  const day = releaseDay();
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      movieReleases: {
        '1': [
          {
            kind: 'Digital',
            date: day,
            confidence: 'rumored',
            source: 'https://example.invalid/release',
            sourceName: 'Fixture',
          },
        ],
      },
    },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Show This Week', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.week-content')).toBeHidden();
  expect((await page.locator('.movie-card').first().boundingBox())!.y).toBeLessThan(550);
  await expect(page.getByRole('group', { name: 'Library Sections', exact: true })).toBeVisible();
  await expect(page.locator('.collection-market')).toHaveText('US release dates');
  await toggle.focus();
  await toggle.press('Enter');
  await expect(page.locator('.week-content')).toBeVisible();
  await expect(page.locator('.week-content')).toContainText('Unconfirmed');
  await toggle.press('Enter');
  await expect(page.locator('.week-content')).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect(page.locator('.week-content')).toBeVisible();
  await expect(toggle).toBeHidden();
});

test('film title and metadata open details while removal keeps an explicit action and Undo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  const card = page.locator('.movie-card[data-movie-id="1"]');
  await card
    .getByRole('button', { name: 'Open details for Fixture Film 00', exact: true })
    .press('Enter');
  const details = page.getByRole('dialog');
  await expect(details.locator('.film-library-note')).toContainText('Saved to Library');
  await expect(details.getByRole('button', { name: 'Saved to Library', exact: true })).toHaveCount(
    0,
  );
  await expect(
    details.getByRole('button', { name: 'Remove from Library', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await card.locator('.movie-meta').scrollIntoViewIfNeeded();
  const meta = (await card.locator('.movie-meta').boundingBox())!;
  await page.mouse.click(meta.x + meta.width / 2, meta.y + meta.height / 2);
  await expect(details).toBeVisible();
  await details.getByRole('button', { name: 'Remove from Library', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(card).toBeVisible();
});

test('calendar previews retain identity, tentative status and reminder disclosure through a film handoff', async ({
  page,
  request,
}) => {
  const release = {
    kind: 'Digital',
    date: '2099-11-01',
    confidence: 'rumored',
    source: 'https://example.invalid/release',
    sourceName: 'Fixture',
  };
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      libraryIds: ['1', '2'],
      movieMetadata: {
        '1': { title: 'A Shared Title', year: '1978' },
        '2': { title: 'A Shared Title', year: '2001' },
      },
      movieReleases: { '1': [release], '2': [{ ...release, confidence: 'listed' }] },
    },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Your Movie Calendar' });
  await expect(calendar.locator('.calendar-reminder-note')).toContainText('1pm GMT');
  await expect(calendar.locator('.calendar-reminder-note')).toBeVisible();
  const first = calendar.getByRole('button', { name: /A Shared Title \(1978\)/ });
  await expect(first).toContainText('Unconfirmed');
  await expect(calendar.getByRole('button', { name: /A Shared Title \(2001\)/ })).not.toContainText(
    'Unconfirmed',
  );
  await first.click();
  await expect(
    page
      .getByRole('dialog')
      .filter({ has: page.locator('.film-details') })
      .getByRole('heading', { name: 'A Shared Title', exact: true }),
  ).toBeVisible();
  await expect(calendar).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Calendar Settings', exact: true })).toBeFocused();
});

test('enlarged long film identities use the full reading width and retain reachable controls', async ({
  page,
  request,
}) => {
  const title =
    'Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan';
  await request.post('http://127.0.0.1:4318/_control', {
    data: { movieMetadata: { '1': { title } } },
  });
  await page.setViewportSize({ width: 375, height: 950 });
  await page.goto('/');
  await page.getByRole('button', { name: `View ${title}`, exact: true }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.evaluate(() => document.fonts.ready);
  const dialog = page.locator('.movie-dialog');
  const geometry = await dialog.evaluate((el) => {
    const titleNode = el.querySelector('.film-title')!;
    const title = titleNode.getBoundingClientRect();
    const inner = el.querySelector('.film-details')!.getBoundingClientRect();
    return {
      titleWidth: title.width,
      contentWidth: inner.width,
      titleClipped: titleNode.scrollHeight > titleNode.clientHeight + 1,
      overflow:
        el.querySelector('.dialog-inner')!.scrollWidth >
        el.querySelector('.dialog-inner')!.clientWidth,
    };
  });
  expect(geometry.titleWidth).toBeGreaterThan(geometry.contentWidth * 0.8);
  expect(geometry.titleClipped).toBe(false);
  expect(geometry.overflow).toBe(false);
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
  await dialog
    .getByRole('button', { name: 'Remove from Library', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole('button', { name: 'Remove from Library', exact: true }),
  ).toBeInViewport();
});

test('inline privacy links stay distinguished in both themes and singular calendar summaries read correctly', async ({
  page,
  request,
}) => {
  await page.goto('/privacy');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const link of await page.locator('.privacy-page p a').all())
      await expect(link).toHaveCSS('text-decoration-line', 'underline');
  }
  await request.post('http://127.0.0.1:4318/_control', { data: { libraryIds: ['1'] } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  await expect(page.locator('.calendar-summary')).toContainText('film in your feed');
  await expect(page.locator('.calendar-summary')).not.toContainText('films in your feed');
  await expect(page.locator('.calendar-summary')).not.toContainText('calendar events');
});

test('release status and year remain unclipped on narrow screens with enlarged text', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 950 });
    for (const layout of ['Grid View', 'List View']) {
      await page.getByRole('button', { name: layout, exact: true }).click();
      const clipped = await page
        .locator('.release-timing')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth + 1)
            .map((node) => node.textContent),
        );
      expect(clipped, `${width}px ${layout}`).toEqual([]);
    }
  }
});

test('email receipts show the destination and resend obeys cooldown and server Retry-After', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.clock.install();
  let requests = 0;
  await page.route('**/auth/login', (route) => {
    requests++;
    return requests === 2
      ? route.fulfill({
          status: 429,
          headers: { 'Retry-After': '120' },
          json: { error: 'Wait before requesting another link.' },
        })
      : route.continue();
  });
  await page.goto('/login');
  await page.getByLabel('Your Email Address').fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Continue with Email', exact: true }).click();
  await expect(page.locator('.login-email')).toHaveText('fixture@example.invalid');
  const resend = page.getByRole('button', { name: 'Resend Link', exact: true });
  await expect(resend).toBeDisabled();
  await page.clock.fastForward(61000);
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.locator('.login-success').getByRole('alert')).toContainText(
    'Wait before requesting another link.',
  );
  await expect(resend).toBeDisabled();
  await expect(page.locator('.login-email')).toHaveText('fixture@example.invalid');
  await page.clock.fastForward(119000);
  await expect(resend).toBeDisabled();
  await page.clock.fastForward(2000);
  await resend.click();
  await expect(page.getByRole('status')).toContainText('a new sign-in link');
  expect(requests).toBe(3);
  await page.getByRole('button', { name: 'Use Another Email', exact: true }).click();
  await expect(page.getByLabel('Your Email Address')).toBeFocused();
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
  await page.getByRole('button', { name: /Remove from Library/ }).click();
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

test.describe('touch film browsing', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test('pressing a poster never flashes the mouse View Film cue', async ({ page }) => {
    await page.goto('/');
    const poster = page.locator('.movie-card .poster-button').first();
    await poster.scrollIntoViewIfNeeded();
    const box = (await poster.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(poster.locator('.card-view-cue')).toHaveCSS('opacity', '0');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.movie-dialog')).toBeVisible();
    await expect(page.locator('.film-preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('.movie-dialog')).toHaveCount(0);
    await expect(poster).toBeFocused();
    await expect(poster.locator('.card-view-cue')).toHaveCSS('opacity', '0');
  });

  test('release dates have their own reading row on phone cards and details', async ({ page }) => {
    await page.goto('/');
    for (const width of [320, 375, 414]) {
      await page.setViewportSize({ width, height: 812 });
      const card = page.locator('.movie-card').first();
      const date = (await card.locator('.release-date').boundingBox())!;
      const status = (await card.locator('.release-status').boundingBox())!;
      expect(status.y).toBeGreaterThanOrEqual(date.y + date.height - 1);
      await card.locator('.poster-button').click();
      const dialog = page.locator('.movie-dialog');
      await expect(dialog).toBeVisible();
      const rows = await dialog.locator('.film-release').evaluateAll((rows) =>
        rows.map((row) => {
          const description = row
            .querySelector('.film-release-description')!
            .getBoundingClientRect();
          const date = row.querySelector('.film-release-date')!.getBoundingClientRect();
          const value = row.querySelector('.film-release-date > time')!;
          return {
            below: date.top >= description.bottom - 1,
            aligned: Math.abs(date.left - description.left) < 1,
            clipped: value.scrollWidth > value.clientWidth + 1,
          };
        }),
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row).toEqual({ below: true, aligned: true, clipped: false });
      if (width === 375) {
        await dialog.locator('.film-release-list').scrollIntoViewIfNeeded();
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme });
          await dialog.screenshot({
            path: test.info().outputPath(`phone-releases-${colorScheme}.png`),
          });
        }
      }
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  });

  test('the film sheet tracks a drag, snaps back, scrolls, and swipes closed with focus restored', async ({
    page,
  }) => {
    await page.goto('/');
    const poster = page.locator('.movie-card .poster-button').first();
    await poster.click();
    const dialog = page.locator('.movie-dialog');
    const handle = dialog.locator('.dialog-drag-handle');
    await expect(handle).toBeVisible();
    await expect(dialog.locator('.film-title')).toBeFocused();
    const touch = await page.context().newCDPSession(page);
    const drag = async (distance: number, duration: number) => {
      // Vaul guards the first 500ms of an opening sheet against accidental drags.
      await page.waitForTimeout(550);
      const box = (await handle.boundingBox())!;
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let step = 1; step <= 10; step++) {
        await page.waitForTimeout(duration / 10);
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x, y: start.y + (distance * step) / 10 }],
        });
      }
      const offset = await dialog.evaluate(
        (node) => new DOMMatrix(getComputedStyle(node).transform).m42,
      );
      expect(offset).toBeGreaterThan(distance * 0.8);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await drag(35, 400);
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((node) => Math.abs(new DOMMatrix(getComputedStyle(node).transform).m42)),
      )
      .toBeLessThan(1);
    const scroll = dialog.locator('.dialog-inner');
    await scroll.evaluate((node) => {
      node.scrollTop = 150;
    });
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(dialog).toBeVisible();
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      await drag(260, 180);
      await expect(dialog).toHaveCount(0);
      await expect(poster).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('clip');
      if (reducedMotion === 'no-preference') await poster.click();
    }
  });
});
