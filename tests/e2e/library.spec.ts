import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('an empty To Watch shelf stays coherent while Watched loads', async ({ page }) => {
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: Array.from({ length: 27 }, (_, i) => String(i + 1)) },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No Films to Watch', exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Browse Watched', exact: true }).click();
  await expect(page.locator('.shelf-pending-icon')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No Films to Watch', exact: true })).toBeVisible();
  await expect(page.locator('.collection-skeleton')).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: /Watched Films.*27/ })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await expect(page.locator('.legend')).toHaveCount(0);
  await page.getByRole('button', { name: 'To Watch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No Films to Watch', exact: true })).toBeVisible();
});

test('shelf controls stay in place across phone and desktop widths in both themes', async ({
  page,
}) => {
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: ['1'] },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  await page.goto('/');
  const tabsTop = () =>
    page.locator('.library-sections').evaluate((el) => el.getBoundingClientRect().top);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const before = await tabsTop();
      await page.getByRole('button', { name: 'Watched', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Watched Films.*1/ })).toBeVisible();
      expect(Math.abs((await tabsTop()) - before), `${width}px ${colorScheme}`).toBeLessThan(1);
      await page.locator('.library-content').evaluate(async (el) => {
        await Promise.allSettled(el.getAnimations().map((a) => a.finished));
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `outputs/review/shelf-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: 'To Watch', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Saved Films.*26/ })).toBeVisible();
    }
  }
});

test('shelf switches commit their heading, summary and films together and reuse fresh pages', async ({
  page,
}) => {
  const headers = { origin: 'http://127.0.0.1:4317' };
  await page.request.post('/api/library', {
    data: { action: 'add', ids: Array.from({ length: 32 }, (_, i) => String(i + 1)) },
    headers,
  });
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: ['1', '2', '3'] },
    headers,
  });
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'More Films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(29);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const geometry = () =>
    page.evaluate(() => ({
      grid: document.querySelector('.movie-grid')!.getBoundingClientRect().top,
      tabs: document.querySelector('.library-sections')!.getBoundingClientRect().top,
      first: document.querySelector('.movie-card')!.getAttribute('data-movie-id'),
    }));
  const before = await geometry();
  let release!: () => void,
    reads = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?*', async (route) => {
    reads++;
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get('filter') === 'watched') await gate;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Watched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Watched', exact: true })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Saved Films', exact: false })).toBeVisible();
  expect(await geometry()).toEqual(before);
  await expect(page.locator('.movie-card')).toHaveCount(29);
  release();
  await expect(page.getByRole('heading', { name: 'Watched Films', exact: false })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(3);
  expect((await geometry()).tabs).toBe(before.tabs);
  await expect(page.locator('.library-content')).toHaveCSS('transform', 'none');
  await page.getByRole('button', { name: 'To Watch', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(29);
  await page.getByRole('button', { name: 'Watched', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(3);
  expect(reads).toBe(1);
  // A personal write invalidates both cached destinations.
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as Unwatched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Watched', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.movie-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'To Watch', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Saved Films.*30/ })).toBeVisible();
  await expect(page.locator('.movie-grid [data-movie-id="1"]')).toHaveCount(1);
});

test('reversing a pending shelf switch retains the displayed view without another read', async ({
  page,
}) => {
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: ['1'] },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  await page.goto('/');
  let release!: () => void,
    reads = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?*', async (route) => {
    reads++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Watched', exact: true }).click();
  await expect(page.locator('.shelf-pending-icon')).toBeVisible();
  await page.getByRole('button', { name: 'To Watch', exact: true }).click();
  await expect(page.locator('.shelf-pending-icon')).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Saved Films', exact: false })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  expect(reads).toBe(1);
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
});

test('a known empty Watched shelf opens immediately without fetching', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let reads = 0;
  await page.route('**/api/library?*', (route) => {
    reads++;
    return route.abort();
  });
  await page.getByRole('button', { name: 'Watched', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No Watched Films Yet' })).toBeVisible();
  expect(reads).toBe(0);
});

test('details focus starts on the title and dragging text onto the backdrop does not dismiss', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  const title = page
    .getByRole('dialog')
    .getByRole('heading', { name: 'Fixture Film 00', exact: true });
  await expect(title).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(title).toHaveCSS('outline-style', 'none');
  expect(
    (await (await page.request.get('/api/library/membership?ids=1')).json()).membership['1'],
  ).toBe(true);
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('closing Calendar after an Account handoff returns focus to the persistent menu trigger', async ({
  page,
}) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open A-List menu', exact: true });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your Account' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Calendar Link', exact: true }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await page.getByRole('button', { name: 'Reset Link', exact: true }).click();
  await page.getByRole('button', { name: 'Open Calendar Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your Movie Calendar' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Your Account' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test('calendar pagination merges overlapping pages without duplicate films', async ({ page }) => {
  await page.goto('/');
  let firstMovie: unknown;
  await page.route('**/api/library?tracked=true&sort=title&offset=*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (new URL(route.request().url()).searchParams.get('offset') === '0')
      firstMovie = data.movies[0];
    else data.movies.unshift(firstMovie);
    await route.fulfill({ response, json: data });
  });
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
  await expect(page.locator('.tracked-list > div')).toHaveCount(25);
  await page.getByRole('dialog').getByRole('button', { name: 'More Films', exact: true }).click();
  await expect(page.locator('.tracked-list > div')).toHaveCount(27);
  const titles = await page.locator('.tracked-list > div > span').allTextContents();
  expect(new Set(titles).size).toBe(titles.length);
});

test('changing filters does not postpone the scheduled revision refresh', async ({ page }) => {
  await page.clock.install();
  let revisions = 0;
  await page.route('**/api/revision', (route) => {
    revisions++;
    return route.continue();
  });
  await page.goto('/');
  // Server-rendered controls can appear before hydration installs the refresh timer.
  await expect(page.locator('html')).toHaveAttribute('data-motion-input', 'keyboard');
  await page.clock.fastForward(30_000);
  expect(revisions).toBe(0);
  await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Coming Soon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.clock.fastForward(30_001);
  await expect.poll(() => revisions).toBe(1);
});

test('watched films persist in their section and leave the calendar until marked unwatched', async ({
  page,
}) => {
  await page.goto('/');
  const init = await (
    await page.request.post('/api/init', { data: {}, headers: { origin: 'http://127.0.0.1:4317' } })
  ).json();
  const feedBefore = await (await page.request.get(init.feedPath)).text();
  expect(feedBefore).toContain('UID:movie-1-digital@afterlight');
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Unwatched', exact: true })).toBeEnabled();
  await expect(page.locator('.film-library-note')).toContainText('Kept out of your calendar feed.');
  const membership = await (await page.request.get('/api/library/membership?ids=1')).json();
  expect(membership.membership['1']).toBe(true);
  expect(membership.watched['1']).toBeTruthy();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Watched', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Watched Films', exact: false })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(1);
  expect(await (await page.request.get(init.feedPath)).text()).not.toContain(
    'UID:movie-1-digital@afterlight',
  );
  await page.reload();
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Watched', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as Unwatched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Watched', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'No Watched Films Yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse To Watch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'To Watch', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.movie-card')).toHaveCount(25);
  expect(await (await page.request.get(init.feedPath)).text()).toContain(
    'UID:movie-1-digital@afterlight',
  );
});

test('watch status survives a lost response and a delayed old detail response without replaying writes', async ({
  page,
}) => {
  await page.goto('/');
  let releaseDetails!: () => void;
  const detailGate = new Promise<void>((resolve) => {
    releaseDetails = resolve;
  });
  await page.route('**/api/movie/1', async (route) => {
    const response = await route.fetch();
    await detailGate;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  let writes = 0,
    reject = true;
  await page.route('**/api/library', async (route) => {
    if (route.request().postDataJSON().action !== 'watch') return route.continue();
    writes++;
    if (reject) return route.fulfill({ status: 503, json: { error: 'Fixture watch failure' } });
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Couldn’t update watched status' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as Watched', exact: true })).toBeEnabled();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('status')
      .filter({ hasText: 'Couldn’t update watched status' }),
  ).toBeVisible();
  reject = false;
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Unwatched', exact: true })).toBeEnabled();
  releaseDetails();
  await expect(page.getByText('Checking sources…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark as Unwatched', exact: true })).toBeEnabled();
  expect(writes).toBe(2);
  expect(
    (await (await page.request.get('/api/library/membership?ids=1')).json()).watched['1'],
  ).toBeTruthy();
});

test('removing a watched film and Undo preserve its original watched date', async ({ page }) => {
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: ['1'] },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  const before = await (await page.request.get('/api/library/membership?ids=1')).json();
  await page.goto('/?section=library&filter=watched&sort=added');
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Remove from Library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.movie-grid > .movie-card')).toHaveCount(1);
  const after = await (await page.request.get('/api/library/membership?ids=1')).json();
  expect(after.watched['1']).toBe(before.watched['1']);
  expect(after.membership['1']).toBe(true);
});

test('watched pagination and library section controls remain usable across themes and sizes', async ({
  page,
}) => {
  const headers = { origin: 'http://127.0.0.1:4317' };
  await page.request.post('/api/library', {
    data: { action: 'add', ids: Array.from({ length: 32 }, (_, i) => String(i + 1)) },
    headers,
  });
  await page.request.post('/api/library', {
    data: { action: 'watch', ids: Array.from({ length: 30 }, (_, i) => String(i + 1)) },
    headers,
  });
  await page.goto('/?section=library&filter=watched&sort=added');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'More Films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(30);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      for (const name of ['To Watch', 'Watched']) {
        const target = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(target!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: `outputs/review/watched-${width}-${colorScheme}.png` });
    }
  }
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('.movie-dialog').evaluate(async (el) => {
    await Promise.allSettled(el.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: 'outputs/review/watched-details-mobile.png' });
});

test('an old background library response cannot restore a film after it is marked watched', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let captured = false,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/library?**', async (route) => {
    if (captured) return route.continue();
    const response = await route.fetch();
    captured = true;
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.clock.fastForward(61000);
    await expect.poll(() => captured).toBe(true);
    await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
    await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Mark as Unwatched', exact: true }),
    ).toBeEnabled();
    release();
    await page.keyboard.press('Escape');
    await expect(page.locator('.movie-grid [data-movie-id="1"]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Watched', exact: true }).locator('.count'),
    ).toHaveText('1');
  } finally {
    release();
  }
});

test('cold posters reveal only after decoding and failed artwork keeps its fallback', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 950 });
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      moviePosters: {
        '1': 'https://image.tmdb.org/t/p/w500/fixture-cold.jpg',
        '2': 'https://image.tmdb.org/t/p/w500/fixture-failed.jpg',
      },
    },
  });
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    const state = window as unknown as { releasePosterDecode?: () => void };
    HTMLImageElement.prototype.decode = function () {
      const decoded = decode.call(this);
      return this.src.includes('fixture-cold')
        ? decoded.then(
            () =>
              new Promise<void>((resolve) => {
                state.releasePosterDecode = resolve;
              }),
          )
        : decoded;
    };
  });
  const photo = await readFile(new URL('../../public/link-preview.jpg', import.meta.url));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_next/image?**', async (route) => {
    if (route.request().url().includes('fixture-failed'))
      return route.fulfill({ status: 404, body: '' });
    await gate;
    await route.fulfill({ contentType: 'image/jpeg', body: photo });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Grid View', exact: true }).click();
  const card = page.locator('[data-movie-id="1"] .movie-card-poster');
  const image = card.locator('img');
  await expect(card).toHaveAttribute('data-artwork', 'loading');
  await expect(image).toHaveCSS('opacity', '0');
  const geometry = await card.boundingBox();
  release();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { releasePosterDecode?: () => void }).releasePosterDecode,
      ),
    )
    .toBe('function');
  await expect(image).toHaveCSS('opacity', '0');
  await page.evaluate(() =>
    (window as unknown as { releasePosterDecode: () => void }).releasePosterDecode(),
  );
  await expect(card).toHaveAttribute('data-artwork', 'ready');
  await expect(image).toHaveCSS('opacity', '1');
  expect(await card.boundingBox()).toEqual(geometry);
  await expect(page.locator('[data-movie-id="2"] .movie-card-poster')).toHaveAttribute(
    'data-artwork',
    'error',
  );
  await expect(page.locator('[data-movie-id="2"] .card-artwork-note')).toHaveText(
    'Artwork unavailable',
  );
  await page.screenshot({ path: 'outputs/review/poster-decoded-mobile.png' });
});

test('cached posters remount without replaying placeholders or fades', async ({
  page,
  context,
  request,
}) => {
  // Let Chromium use its real HTTP cache; this test only requests loopback services.
  await context.unrouteAll();
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      moviePosters: {
        '1': 'http://127.0.0.1:4318/poster.jpg?cached',
      },
    },
  });
  await page.goto('/');
  const card = page.locator('[data-movie-id="1"] .movie-card-poster');
  await expect(card).toHaveAttribute('data-artwork', 'ready');
  await page.getByRole('button', { name: 'TBA', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'All Films', exact: true }).click();
  await expect(card).toHaveAttribute('data-artwork', 'ready');
  await expect(card).toHaveAttribute('data-artwork-instant', 'true');
  await expect(card.locator('img')).toHaveCSS('transition-duration', '0s');
  await expect(card.locator('.card-artwork-placeholder')).toHaveCSS('opacity', '0');
});

test('section switches show pending content from the first frame and images decode during live motion', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      moviePosters: {
        '1': 'https://image.tmdb.org/t/p/w500/fixture-live.jpg',
      },
    },
  });
  await page.addInitScript(() => {
    const state = window as unknown as { snapshotCalls: number; emptyFrames: number };
    state.snapshotCalls = 0;
    state.emptyFrames = 0;
    const start = document.startViewTransition?.bind(document);
    if (start)
      document.startViewTransition = (...args: Parameters<typeof start>) => {
        state.snapshotCalls++;
        return start(...args);
      };
    new MutationObserver(() => {
      if (
        document.querySelector('.intro h1')?.textContent === 'Discover' &&
        document.querySelector('.empty-state')
      )
        state.emptyFrames++;
    }).observe(document, { childList: true, subtree: true });
  });
  const photo = await readFile(new URL('../../public/link-preview.jpg', import.meta.url));
  let releaseImage!: () => void;
  const imageGate = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  await page.route('**/_next/image?**', async (route) => {
    await imageGate;
    await route.fulfill({ contentType: 'image/jpeg', body: photo });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: ':root { --dur-view: 2500ms; }' });
  let releaseCatalogue!: () => void;
  const catalogueGate = new Promise<void>((resolve) => {
    releaseCatalogue = resolve;
  });
  await page.route('**/api/catalogue?**', async (route) => {
    await catalogueGate;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Discover', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
    await expect(page.locator('.collection-skeleton')).toBeVisible();
    await expect(page.locator('.empty-state')).toHaveCount(0);
    releaseCatalogue();
    await expect(page.locator('.movie-card')).toHaveCount(25);
    await expect(page.locator('html')).toHaveAttribute('data-content-motion', 'forward');
    releaseImage();
    await expect(page.locator('[data-movie-id="1"] .movie-card-poster')).toHaveAttribute(
      'data-artwork',
      'ready',
    );
    await expect(page.locator('[data-movie-id="1"] img')).toHaveCSS('opacity', '1');
    await expect(page.locator('html')).toHaveAttribute('data-content-motion', 'forward');
    expect(
      await page.evaluate(() => ({
        snapshots: (window as unknown as { snapshotCalls: number }).snapshotCalls,
        emptyFrames: (window as unknown as { emptyFrames: number }).emptyFrames,
      })),
    ).toEqual({ snapshots: 0, emptyFrames: 0 });
    await page.screenshot({ path: 'outputs/review/poster-during-section-motion.png' });
  } finally {
    releaseCatalogue();
    releaseImage();
  }
});

test('pending filters keep the collection stationary across responsive layouts', async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.movie-card')).toHaveCount(25);
    const top = () =>
      page.locator('.movie-grid').evaluate((grid) => grid.getBoundingClientRect().top);
    const before = await top();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/library?**', async (route) => {
      await gate;
      await route.continue();
    });
    try {
      if (width < 640)
        await page.getByRole('combobox', { name: 'Filter Films' }).selectOption('soon');
      else await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
      await expect(page.locator('.collection-status')).toHaveText('Updating films…');
      await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'true');
      if (width < 640) await expect(page.locator('.collection-pending-icon')).toBeVisible();
      expect(
        Math.abs((await top()) - before),
        `Pending filter moved films at ${width}px`,
      ).toBeLessThan(1);
    } finally {
      release();
    }
    await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('html')).not.toHaveAttribute('data-content-motion');
    expect(
      Math.abs((await top()) - before),
      `Completed filter moved films at ${width}px`,
    ).toBeLessThan(1);
    await page.unroute('**/api/library?**');
  }
});

test('list rows stay compact at every breakpoint and choosing the active layout does not replay motion', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'Grid View', exact: true }).click();
  expect(
    await page
      .locator('.movie-grid')
      .evaluate((grid) => grid.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await expect(page.locator('.movie-grid')).not.toHaveAttribute('data-layout-animating');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const gap = await page.locator('.movie-grid').evaluate((grid) => {
      const cards = grid.querySelectorAll('.movie-card');
      return cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom;
    });
    expect(Math.abs(gap), `List inherited grid spacing at ${width}px`).toBeLessThan(1);
  }
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  expect(
    await page
      .locator('.movie-grid')
      .evaluate((grid) => grid.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test('keyboard input and a changed reduced-motion preference settle in-flight layout and tab motion', async ({
  page,
}) => {
  // Layout motion only runs for posters visible in both arrangements.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-layout: 2000ms; --dur-view: 2000ms; }' });
  const grid = page.locator('.movie-grid');
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await expect(grid).toHaveAttribute('data-layout-animating', 'true');
  await page.keyboard.press('Tab');
  await expect(grid).not.toHaveAttribute('data-layout-animating');
  await expect(page.locator('.poster-button').first()).toHaveCSS('transform', 'none');
  await page.getByRole('button', { name: 'Grid View', exact: true }).click();
  await expect(grid).toHaveAttribute('data-layout-animating', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(grid).not.toHaveAttribute('data-layout-animating');
  await expect(page.locator('.poster-button').first()).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Coming Soon', exact: true }).click();
  const marker = page.locator('.filter-list > .moving-tab-indicator');
  await expect.poll(() => marker.evaluate((el) => el.getAnimations().length)).toBe(1);
  await page.keyboard.press('Tab');
  await expect.poll(() => marker.evaluate((el) => el.getAnimations().length)).toBe(0);
});

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
test('poster hover previews stay local, dismiss with Escape and hand off to film details', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  let detailReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/movie/')) detailReads++;
  });
  const poster = page.getByRole('button', { name: 'View Fixture Film 00', exact: true });
  await poster.hover();
  const preview = page.locator('.film-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Fixture Film 00');
  await expect(preview).toContainText('Unconfirmed');
  expect(detailReads).toBe(0);
  const bounds = (await preview.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await page.mouse.move(0, 0);
  await poster.focus();
  await expect(preview).toBeVisible();
  await poster.click();
  await expect(page.locator('.movie-dialog')).toBeVisible();
  await page.waitForTimeout(450);
  await expect(preview).toHaveCount(0);
});

test('touch opens film details directly without a hover preview', async ({ browser, context }) => {
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await touch.addCookies(await context.cookies());
  const page = await touch.newPage();
  await page.goto('http://127.0.0.1:4317/');
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).tap();
  await expect(page.locator('.movie-dialog')).toBeVisible();
  await expect(page.locator('.film-preview')).toHaveCount(0);
  await touch.close();
});

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
  await expect(page.getByRole('heading', { name: 'Your Library', exact: false })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'More Films' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(27);
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeVisible();
  await page.getByRole('button', { name: /Remove from Library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'restored' })).toBeVisible();
});
test('inline search keeps focus, navigates results by keyboard and returns focus after details close', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
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
  await page.getByRole('heading', { name: 'Your Library', exact: true }).click();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
});

test('save feedback precedes confirmation and does not wait for listing reconciliation', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: /Remove from Library/ }).click();
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
    await expect(cardSave).toHaveAttribute('aria-pressed', 'true');
    await expect(cardSave.locator('.membership-icon')).toHaveAttribute('data-membership', 'saved');
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
  await page.getByRole('button', { name: 'More Films' }).click();
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
  const firstPage = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/catalogue');
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  expect((await firstPage).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await expect(page.locator('[data-movie-id="2"]')).toBeVisible();
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
  await page.getByRole('button', { name: 'More Films' }).click();
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
  await page.getByRole('button', { name: 'More Films' }).click();
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
  await poster.hover();
  await expect(poster).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -4)');
  const before = (await poster.boundingBox())!;
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
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
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
      page.getByRole('button', { name: 'Calendar Settings', exact: true }),
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
  await expect(page.getByRole('button', { name: 'Calendar Settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Calendar Settings', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Try Again', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'All Films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'All Films', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('account export, calendar reset and deletion affect disposable fixture data only', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Calendar Settings', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Open A-List menu' }).click();
  await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Library', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/a-list-library/);
  await page.getByRole('button', { name: 'Reset Calendar Link', exact: true }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await page.getByRole('button', { name: 'Reset Link', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'old calendar link no longer works' }),
  ).toBeVisible();
  const old = '11111111-1111-4111-8111-111111111111' + 'a'.repeat(32);
  expect((await request.get('/api/feed/' + old + '.ics')).status()).toBe(404);
  await page.getByRole('button', { name: 'Delete Account', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete Account Permanently', exact: true }).click();
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
  await page.getByRole('button', { name: /Remove from Library/ }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  // Exercise browser recovery even when the server's last-good catalogue cache could mask
  // a provider outage. Other cases cover the real API/provider failure boundary.
  await page.route('**/api/catalogue?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Catalogue temporarily unavailable' } }),
  );
  await page
    .locator('.nav-tabs')
    .getByRole('button', { name: /^My Library/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
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
    await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
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
  const pill = page.getByRole('group', { name: 'Color Theme', exact: true });
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
  await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
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
  await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('section navigation animates content and the active tab, and rapid reversals preserve the last choice', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
  await page.addStyleTag({ content: ':root { --dur-view: 1500ms; }' });
  const discover = page.getByRole('button', { name: 'Discover', exact: true });
  await discover.click();
  await expect(page.locator('html')).toHaveAttribute('data-content-motion', 'forward');
  await expect
    .poll(() => page.locator('.section-content').evaluate((el) => el.getAnimations().length))
    .toBe(1);
  const motion = await page
    .locator('.section-content')
    .evaluate((el) => el.getAnimations().map((a) => (a.effect as KeyframeEffect).getKeyframes()));
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
  // Keep the film grid visible below the weekly summary and shelf controls.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.addStyleTag({ content: ':root { --dur-layout: 1500ms; }' });
  await page.getByRole('button', { name: 'List View', exact: true }).click();
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
  await page.getByRole('button', { name: 'Grid View', exact: true }).click();
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
    .poll(() => page.locator('.collection-results').evaluate((el) => el.getAnimations().length))
    .toBe(1);
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
  const animations = await page
    .locator('.intro, .section-content')
    .evaluateAll((nodes) =>
      nodes.flatMap((node) =>
        node.getAnimations().map((a) => (a.effect as KeyframeEffect).getKeyframes()),
      ),
    );
  expect(animations.length).toBeGreaterThan(0);
  expect(animations.every((frames) => Number(frames[0].opacity) === 0)).toBe(true);
  expect(
    animations.every((frames) =>
      frames.every((frame) => !frame.transform || frame.transform === 'none'),
    ),
  ).toBe(true);
  const library = page.getByRole('button', { name: /library/i });
  await library.focus();
  await library.press('Enter');
  await expect(library).toHaveAttribute('aria-pressed', 'true');
  await expect(library).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-content-motion');
  await page.getByRole('button', { name: 'List View', exact: true }).focus();
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
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
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
      await page.getByRole('button', { name: 'List View', exact: true }).click();
      await expect(page.locator('.movie-grid')).not.toHaveAttribute(
        'data-layout-animating',
        'true',
      );
      await page.screenshot({ path: `outputs/review/section-list-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: /library/i }).click();
      await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Grid View', exact: true }).click();
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
  await page.getByRole('button', { name: 'List View', exact: true }).click();
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
  expect(await response!.text()).toContain('<h1>Your Library</h1>');
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
  await expect(page.getByRole('button', { name: 'All Films', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.collection-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.movie-card')).toHaveCount(25);
  fail = false;
  await page.locator('.inline-error').getByRole('button', { name: 'Try Again' }).click();
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.movie-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'All Films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  fail = true;
  await page.getByRole('combobox', { name: 'Sort Films' }).selectOption('title');
  await expect(page.getByRole('combobox', { name: 'Sort Films' })).toHaveValue('release');
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
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'All Films', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.movie-card')).toHaveCount(25);
    await expect(
      page.locator('.inline-error').getByRole('button', { name: 'Try Again' }),
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
  await page.locator('.inline-error').getByRole('button', { name: 'Try Again' }).click();
  await initialized;
  await expect(page.getByRole('button', { name: 'Calendar Settings', exact: true })).toBeEnabled();
  await expect(page.getByText('Your library couldn’t open.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'TBA', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(requests).toEqual([]);
});

test('saving draws the check immediately and rejected saves restore the add state', async ({
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
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.locator('.film-control .membership-icon')).toHaveAttribute(
    'data-membership',
    'saved',
  );
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.locator('.film-control .membership-icon').evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true })) animation.finish();
  });
  await page.screenshot({ path: 'outputs/review/optimistic-save-pending.png' });
  release();
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
  await expect(page.locator('.film-control .membership-icon')).toHaveAttribute(
    'data-membership',
    'unsaved',
  );
  await expect(
    page.getByRole('dialog').getByText('Fixture save failed', { exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
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
  await page.getByRole('button', { name: /Remove from Library/ }).click();
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
  await page.getByRole('button', { name: 'List View', exact: true }).click();
  await expect(page.locator('.movie-grid')).not.toHaveAttribute('data-layout-animating', 'true');
  await page.addStyleTag({ content: ':root { --dur-view: 1200ms; --dur-medium: 900ms; }' });
  await page.getByRole('button', { name: 'Select Films', exact: true }).click();
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
  await page.getByRole('button', { name: /Remove from Library/ }).press('Enter');
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
  await page.getByRole('button', { name: /Remove from Library/ }).click();
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

test('real proxy refreshes expired sessions and preserves private security headers', async ({
  page,
  context,
  request,
}) => {
  const expired = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp: 1, iat: 0, role: 'authenticated' })}.expired-signature`;
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value:
        'base64-' +
        encode({
          access_token: expired,
          refresh_token: 'fixture-refresh',
          token_type: 'bearer',
          expires_at: 1,
          user,
        }),
      url: 'http://127.0.0.1:4317',
    },
  ]);
  const response = await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
  expect(response!.headers()['cache-control']).toContain('no-store');
  expect(response!.headers()['x-frame-options']).toBe('DENY');
  expect(response!.headers()['x-content-type-options']).toBe('nosniff');
  expect(response!.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  const cookies = await context.cookies();
  const session = JSON.parse(
    Buffer.from(
      cookies.find((cookie) => cookie.name === 'sb-127-auth-token')!.value.slice(7),
      'base64url',
    ).toString(),
  );
  expect(session.refresh_token).toBe('fixture-refreshed');
  const observed = await (await request.get('http://127.0.0.1:4318/_auth-observation')).json();
  expect(observed.sessionRefreshes).toBeGreaterThan(0);
});

test('a delayed detail read cannot undo a confirmed optimistic save', async ({ page }) => {
  await page.goto('/');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured = false;
  await page.route('**/api/movie/30', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    captured = true;
    await gate;
    await route.fulfill({
      response,
      json: { movie: { ...data.movie, overview: 'Delayed detail response arrived.' } },
    });
  });
  // Keep the list refresh from masking stale detail membership.
  await page.route('**/api/library?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Fixture refresh unavailable' } }),
  );
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await expect.poll(() => captured).toBe(true);
  try {
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
    release();
    await expect(page.getByText('Delayed detail response arrived.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  } finally {
    release();
  }
});

test('a committed save with a lost response stays saved after reconciliation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  let writes = 0;
  await page.route('**/api/library', async (route) => {
    writes++;
    await route.fetch();
    await route.fulfill({ status: 502, json: { error: 'Fixture response lost after commit' } });
  });
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'response lost' })).toHaveCount(0);
  expect(writes).toBe(1);
  await page.reload();
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).toContainText(
    'Saved to your library',
  );
});

test('optimistic search badges roll back when the preflight membership read fails', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/library')) writes++;
  });
  await page.route('**/api/library/membership?*', async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { error: 'Fixture preflight unavailable' } });
  });
  try {
    await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
    await expect(page.locator('.film-control .membership-icon')).toHaveAttribute(
      'data-membership',
      'saved',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
    await page.getByRole('combobox', { name: 'Search films' }).click();
    const option = page.getByRole('option', { name: /Fixture Film 29/ });
    await expect(option).toContainText('Saving to your library');
    await expect(option).toHaveAttribute('aria-busy', 'true');
    release();
    await expect(
      page.getByRole('alert').filter({ hasText: 'No changes were requested' }),
    ).toBeVisible();
    await expect(option).not.toContainText('Saved to your library');
    await expect(option).not.toContainText('Saving to your library');
    await expect(option).not.toHaveAttribute('aria-busy', 'true');
    expect(writes).toBe(0);
  } finally {
    release();
  }
});

test('saving commits confirmed membership before the optimistic label is released', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const host = document.querySelector('.film-library')!;
    const observed = window as unknown as { saveRegressions: string[] };
    observed.saveRegressions = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.textContent?.trim() === 'Save to Library')
            observed.saveRegressions.push('unsaved label reinserted');
        }
      }
    }).observe(host, { subtree: true, childList: true });
  });
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  expect(
    await page.evaluate(() => (window as unknown as { saveRegressions: string[] }).saveRegressions),
  ).toEqual([]);
});

test('post-save metadata polling cannot replace confirmed membership with a stale snapshot', async ({
  page,
}) => {
  await page.goto('/');
  await page.route('**/api/movie/30*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const polling = new URL(route.request().url()).searchParams.has('cached');
    await route.fulfill({
      response,
      json: {
        movie: {
          ...data.movie,
          saved: false,
          tracked: false,
          refreshPending: !polling,
          ...(polling ? { overview: 'Updated synopsis with older membership.' } : {}),
        },
      },
    });
  });
  await page.route('**/api/library?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Fixture list refresh unavailable' } }),
  );
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await expect(
    page.getByText('Updated synopsis with older membership.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
});

test('a fresh externally removed membership overrides a retained saved-library row', async ({
  page,
}) => {
  await page.goto('/');
  await page.request.post('/api/library', {
    data: { action: 'remove', ids: ['1'] },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.movie-card[data-movie-id="1"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Saved Films.*26/ })).toBeVisible();
});

test('a library read started before a fresh membership correction cannot restore the removed row', async ({
  page,
}) => {
  await page.goto('/');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured = false,
    reads = 0;
  await page.route('**/api/library?*', async (route) => {
    if (++reads !== 1) return route.continue();
    const response = await route.fetch();
    captured = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('combobox', { name: 'Sort Films', exact: true }).selectOption('title');
    await expect.poll(() => captured).toBe(true);
    await page.request.post('/api/library', {
      data: { action: 'remove', ids: ['1'] },
      headers: { origin: 'http://127.0.0.1:4317' },
    });
    await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('.movie-card[data-movie-id="1"]')).toHaveCount(0);
    release();
    await expect(page.getByRole('heading', { name: /Saved Films.*26/ })).toBeVisible();
    await expect(page.locator('.movie-card[data-movie-id="1"]')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Sort Films', exact: true })).toHaveValue(
      'title',
    );
    expect(reads).toBeGreaterThan(1);
  } finally {
    release();
  }
});

test('removed films stay removed when reopened against older metadata', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await page.getByRole('button', { name: /Remove from Library/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.route('**/api/movie/30*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        movie: {
          ...data.movie,
          saved: true,
          tracked: true,
          refreshPending: false,
          overview: 'Older metadata after removal.',
        },
      },
    });
  });
  await search.fill('Fixture Film 29');
  const option = page.getByRole('option', { name: /Fixture Film 29/ });
  await expect(option).not.toContainText('Saved to your library');
  await option.click();
  await expect(page.getByText('Older metadata after removal.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
});

test('post-watch metadata polling cannot reset confirmed watched status', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/movie/1?*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        movie: {
          ...data.movie,
          saved: true,
          watchedAt: null,
          tracked: true,
          refreshPending: false,
          overview: 'Older watch state with a refreshed synopsis.',
        },
      },
    });
  });
  await page.route('**/api/movie/1', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { movie: { ...data.movie, refreshPending: true } } });
  });
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Unwatched', exact: true })).toBeEnabled();
  await expect(
    page.getByText('Older watch state with a refreshed synopsis.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as Unwatched', exact: true })).toBeEnabled();
  const membership = await (await page.request.get('/api/library/membership?ids=1')).json();
  expect(membership.watched['1']).toBeTruthy();
});

test('unavailable conflict verification preserves the last confirmed save with recovery feedback', async ({
  page,
}) => {
  await page.goto('/');
  await page.route('**/api/movie/30*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const polling = new URL(route.request().url()).searchParams.has('cached');
    await route.fulfill({
      response,
      json: {
        movie: {
          ...data.movie,
          saved: false,
          tracked: false,
          refreshPending: !polling,
          ...(polling ? { overview: 'New synopsis during membership outage.' } : {}),
        },
      },
    });
  });
  await page.route('**/api/library?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Fixture list refresh unavailable' } }),
  );
  await page.getByRole('combobox', { name: 'Search films' }).fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await page.route('**/api/library/membership?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Fixture verification unavailable' } }),
  );
  await expect(
    page.getByText('New synopsis during membership outage.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await expect(
    page.getByText('Could not refresh saved status. Showing your last confirmed state.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('fresh external changes after a local save update the dialog and retained search badge together', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search films' });
  await search.fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await page.getByRole('button', { name: 'Save to Library', exact: true }).click();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.request.post('/api/library', {
    data: { action: 'remove', ids: ['30'] },
    headers: { origin: 'http://127.0.0.1:4317' },
  });
  await search.fill('Fixture Film 29');
  await page.getByRole('option', { name: /Fixture Film 29/ }).click();
  await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await search.fill('Fixture Film 29');
  await expect(page.getByRole('option', { name: /Fixture Film 29/ })).not.toContainText(
    'Saved to your library',
  );
});

test('a removal crossing pagination rebuilds the range without skipping a film', async ({
  page,
}) => {
  await page.goto('/');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured = false;
  await page.route('**/api/library?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('offset') !== '25' || captured)
      return route.continue();
    const response = await route.fetch();
    captured = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'More Films', exact: true }).click();
    await expect.poll(() => captured).toBe(true);
    await page.request.post('/api/library', {
      data: { action: 'remove', ids: ['1'] },
      headers: { origin: 'http://127.0.0.1:4317' },
    });
    await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save to Library', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    release();
    await expect(page.locator('.movie-card')).toHaveCount(26);
    const ids = await page
      .locator('.movie-card')
      .evaluateAll((cards) =>
        cards.map((card) => Number(card.getAttribute('data-movie-id'))).sort((a, b) => a - b),
      );
    expect(ids).toEqual(Array.from({ length: 26 }, (_, i) => i + 2));
    await expect(page.getByRole('heading', { name: /Saved Films.*26/ })).toBeVisible();
  } finally {
    release();
  }
});

for (const [layout, width] of [
  ['grid', 1280],
  ['list', 375],
] as const) {
  test(`Discover removal feedback stays in the viewport and Undo restores the saved card in ${layout}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width < 900 ? 'dark' : 'light' });
    await page.addInitScript((layout) => localStorage.setItem('a-list-layout', layout), layout);
    await page.goto('/?section=discover');
    await expect(page.locator('.movie-card')).toHaveCount(25);
    await page.getByRole('button', { name: 'More Films', exact: true }).click();
    const card = page.locator('.movie-card[data-movie-id="26"]');
    await card.getByRole('button', { name: 'Fixture Film 25 is saved', exact: true }).click();
    await page.getByRole('button', { name: /Remove from Library/ }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const toast = page
      .getByRole('status')
      .filter({ hasText: 'Fixture Film 25 removed from your library.' });
    await expect(toast).toBeInViewport();
    await expect(
      card.getByRole('button', { name: 'Save Fixture Film 25', exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: `outputs/review/discover-removal-${layout}.png` });
    await toast.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
      card.getByRole('button', { name: 'Fixture Film 25 is saved', exact: true }),
    ).toBeEnabled();
    expect(
      (await (await page.request.get('/api/library/membership?ids=26')).json()).membership['26'],
    ).toBe(true);
  });
}

for (const section of ['discover', 'library'] as const) {
  test(`${section} acknowledges a removal already completed elsewhere without offering an incorrect Undo`, async ({
    page,
  }) => {
    await page.goto(`/?section=${section}`);
    await page
      .getByRole('button', {
        name: section === 'discover' ? 'Fixture Film 00 is saved' : 'View Fixture Film 00',
        exact: true,
      })
      .click();
    await expect(page.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
    let removed = false;
    await page.route('**/api/library/membership?*', async (route) => {
      if (!removed) {
        removed = true;
        await page.request.post('/api/library', {
          data: { action: 'remove', ids: ['1'] },
          headers: { origin: 'http://127.0.0.1:4317' },
        });
      }
      await route.continue();
    });
    await page.getByRole('button', { name: /Remove from Library/ }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Fixture Film 00 is no longer in your library.' }),
    ).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    if (section === 'discover') {
      await expect(
        page.getByRole('button', { name: 'Save Fixture Film 00', exact: true }),
      ).toBeEnabled();
    } else {
      await expect(page.locator('.movie-card[data-movie-id="1"]')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'View Fixture Film 01', exact: true }),
      ).toBeFocused();
    }
  });
}

test('a rejected Discover removal shows the error inside the still-open dialog', async ({
  page,
}) => {
  await page.goto('/?section=discover');
  await page.getByRole('button', { name: 'Fixture Film 00 is saved', exact: true }).click();
  await page.route('**/api/library', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Could not remove this film. Please try again.' },
    }),
  );
  await page.getByRole('button', { name: /Remove from Library/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Fixture Film 00 details', exact: true });
  await expect(dialog.locator('.film-warning')).toContainText(
    'Could not remove this film. Please try again.',
  );
  await expect(dialog.locator('.film-warning')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: /Remove from Library/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  expect(
    (await (await page.request.get('/api/library/membership?ids=1')).json()).membership['1'],
  ).toBe(true);
  await page.unroute('**/api/library');
  await dialog.getByRole('button', { name: /Remove from Library/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Fixture Film 00 removed from your library.' }),
  ).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

for (const scenario of [
  'long title and three release windows',
  'missing dates and source warning',
] as const) {
  test(`film detail composition handles ${scenario} across themes and responsive widths`, async ({
    page,
  }) => {
    await page.route('**/api/movie/1*', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({
        response,
        json: {
          movie: {
            ...data.movie,
            title: scenario.startsWith('long')
              ? 'The Extraordinary Journey of a Film With a Very Long and UnbrokenSubtitleForSmallScreens'
              : 'Fixture Film 00',
            overview:
              'A longer synopsis keeps its reading measure while film details adapt to the screen. '.repeat(
                9,
              ),
            overviewSource: 'https://example.invalid/synopsis',
            poster: '',
            refreshPending: false,
            ...(scenario.startsWith('long')
              ? {
                  releases: [
                    {
                      kind: 'Digital',
                      date: '2099-09-30',
                      confidence: 'listed',
                      platform: 'Apple TV and other digital retailers',
                      source: 'https://example.invalid/digital',
                      sourceName: 'A Long But Legitimate Release Source Name',
                    },
                    {
                      kind: 'PVOD',
                      date: '2099-08-22',
                      confidence: 'rumored',
                      source: 'https://example.invalid/premium',
                      sourceName: 'Release provider',
                    },
                    {
                      kind: 'Subscription',
                      date: '2099-11-01',
                      confidence: 'listed',
                      platform: 'Streaming service',
                      source: 'https://example.invalid/subscription',
                      sourceName: 'Streaming provider',
                    },
                  ],
                }
              : { releases: [], releaseLookupStatus: 'unavailable' }),
          },
        },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Read Full Synopsis', exact: true }),
    ).toBeVisible();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const width of [320, 375, 390, 414, 640, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        const layout = await page.locator('.movie-dialog').evaluate((el) => {
          const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
          const title = rect('.film-title'),
            actions = rect('.film-library'),
            synopsis = rect('.film-synopsis'),
            releases = rect('.film-releases');
          return {
            overflow:
              el.scrollWidth > el.clientWidth ||
              el.querySelector('.dialog-inner')!.scrollWidth > el.clientWidth,
            titleBeforeActions: title.bottom <= actions.top,
            synopsisBeforeReleases: synopsis.bottom <= releases.top,
            sourcesAfterContent: rect('.film-sources').top >= releases.bottom,
            allSourcesInFooter:
              el.querySelectorAll('a').length === el.querySelectorAll('.film-sources a').length,
            controls: [...el.querySelectorAll('button, a')].map((node) => ({
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
            })),
          };
        });
        expect(layout.overflow, `${width}px ${colorScheme}`).toBe(false);
        expect(layout.titleBeforeActions, `${width}px ${colorScheme}`).toBe(true);
        expect(layout.synopsisBeforeReleases, `${width}px ${colorScheme}`).toBe(true);
        expect(layout.sourcesAfterContent, `${width}px ${colorScheme} sources below content`).toBe(
          true,
        );
        expect(layout.allSourcesInFooter).toBe(true);
        for (const control of layout.controls)
          if (control.width > 0) expect(control.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.getByRole('button', { name: 'Read Full Synopsis', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show Less', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.getByRole('button', { name: 'Show Less', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Read Full Synopsis', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
}

test('empty film categories omit the decorative bookmark in both Library and Discover', async ({
  page,
}) => {
  await page.goto('/');
  for (const section of ['library', 'discover']) {
    if (section === 'discover')
      await page.getByRole('button', { name: 'Discover', exact: true }).click();
    await page.getByRole('button', { name: 'TBA', exact: true }).click();
    const empty = page.locator('.empty-state');
    await expect(
      empty.getByRole('heading', { name: 'No Films Match This Filter', exact: true }),
    ).toBeVisible();
    await expect(empty.locator(':scope > svg')).toHaveCount(0);
    await page.locator('.library-content').evaluate(async (el) => {
      await Promise.allSettled(
        el
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    await empty.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `outputs/film-details-review/sources-footer/empty-${section}.png`,
    });
    await expect(empty.getByRole('button', { name: 'Show All Films', exact: true })).toBeEnabled();
    await empty.getByRole('button', { name: 'Show All Films', exact: true }).click();
    await expect(page.locator('.movie-card').first()).toBeVisible();
  }
});

test('film source buttons live together at the bottom and retain every distinct evidence URL', async ({
  page,
}) => {
  await page.route('**/api/movie/1*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        movie: {
          ...data.movie,
          source: 'https://example.invalid/release',
          releaseCheckedAt: '2026-10-29T23:15:00Z',
          overview: 'A short film synopsis for source navigation.',
          overviewSource: 'https://example.invalid/synopsis',
          refreshPending: false,
          releases: [
            {
              kind: 'Digital',
              date: '2099-11-01',
              confidence: 'listed',
              sourceName: 'Release listing',
              source: 'https://example.invalid/release',
            },
            {
              kind: 'Subscription',
              date: '2099-11-05',
              confidence: 'rumored',
              platform: 'Streaming provider',
              sourceName: 'Streaming provider',
              source: 'https://example.invalid/streaming',
            },
          ],
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fixture Film 00 details', exact: true });
  const footer = dialog.getByRole('region', { name: 'Sources', exact: true });
  await expect(footer.getByRole('link')).toHaveCount(3);
  await expect(dialog.locator('.film-synopsis a, .film-releases a')).toHaveCount(0);
  const check = dialog.locator('.film-source-check');
  await expect(check).toHaveText('Sources checked on October 29, 2026');
  await expect(check.locator('time')).toHaveAttribute('datetime', '2026-10-29');
  await expect(dialog.locator('.film-details > :last-child')).toHaveClass('film-source-check');
  await expect(dialog.getByRole('heading', { name: 'Sources', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Release dates can change.', { exact: true })).toHaveCount(0);
  await footer.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'outputs/film-details-review/sources-footer/multiple-source-buttons.png',
  });
  const urls = await footer.getByRole('link').evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute('href'),
      target: link.getAttribute('target'),
      rel: link.getAttribute('rel'),
    })),
  );
  expect(urls.map((link) => link.href).sort()).toEqual([
    'https://example.invalid/release',
    'https://example.invalid/streaming',
    'https://example.invalid/synopsis',
  ]);
  for (const link of urls) {
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noreferrer');
  }
  await expect(
    footer.getByRole('link', {
      name: 'Release dates — Release listing (opens in a new tab)',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    footer.getByRole('link', {
      name: 'Synopsis — example.invalid (opens in a new tab)',
      exact: true,
    }),
  ).toBeVisible();
});

test('Library and Discover use identical local hover previews with stored bounded synopses', async ({
  page,
}) => {
  const overview = 'A film synopsis with the same opening in both collections. '.repeat(12);
  await page.request.post('http://127.0.0.1:4318/_control', {
    data: { movieMetadata: { '1': { overview } } },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  let detailReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/movie/')) detailReads++;
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    let libraryPreview = '';
    for (const section of ['library', 'discover'] as const) {
      await page.getByRole('button', { name: 'Discover', exact: true }).hover();
      await page
        .getByRole('button', {
          name: section === 'library' ? /^My Library/ : 'Discover',
          exact: section === 'discover',
        })
        .click();
      await expect(page.locator('.movie-card[data-movie-id="1"]')).toBeVisible();
      await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).hover();
      const preview = page.locator('.film-preview');
      await expect(preview).toBeVisible();
      await expect(preview.locator('h3')).toHaveText('Fixture Film 00');
      await expect(preview.locator('.film-preview-overview')).toHaveText(overview.slice(0, 320));
      await expect(preview.locator('.film-preview-release')).toContainText('Nov 1, 2099');
      const markup = await preview.innerHTML();
      if (section === 'library') libraryPreview = markup;
      else expect(markup).toBe(libraryPreview);
      await page.screenshot({
        path: `outputs/film-details-review/consistent-previews/${section}-${colorScheme}.png`,
      });
      await page.keyboard.press('Escape');
      await expect(preview).toHaveCount(0);
    }
  }
  expect(detailReads).toBe(0);
});

test('Discover remains usable when optional synopsis reads fail', async ({ page }) => {
  await page.request.post('http://127.0.0.1:4318/_control', {
    data: { synopsisUnavailable: true },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(25);
  await page.getByRole('button', { name: 'View Fixture Film 00', exact: true }).hover();
  const preview = page.locator('.film-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.film-preview-overview')).toHaveText(
    'A synopsis isn’t available from our sources yet.',
  );
  await expect(preview.locator('.film-preview-release')).toContainText('Nov 1, 2099');
});

test('release evidence shows separate check dates and provider disagreement without overflowing phone layouts', async ({
  page,
  request,
}) => {
  const primary = {
    kind: 'Digital',
    date: '2099-11-01',
    confidence: 'listed',
    source: 'https://www.dvdsreleasedates.com/movies/2/fixture',
    sourceName: 'DVDs Release Dates',
    checkedAt: '2026-11-12T12:00:00Z',
  };
  await request.post('http://127.0.0.1:4318/_control', {
    data: {
      movieReleases: {
        '2': [
          {
            ...primary,
            conflictingRelease: {
              ...primary,
              date: '2099-11-03',
              source: 'https://whentostream.com/fixture-2026/',
              sourceName: 'When To Stream',
              filmImdbId: 'tt7777777',
            },
          },
          {
            ...primary,
            kind: 'Subscription',
            date: '2099-12-01',
            checkedAt: '2026-11-10T12:00:00Z',
          },
        ],
      },
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'View Fixture Film 01', exact: true }).click();
  const dialog = page.locator('.movie-dialog');
  await expect(dialog.locator('.film-release-checked')).toHaveCount(2);
  await expect(dialog.locator('.film-release-checked').first()).toContainText('November 12, 2026');
  await expect(dialog.locator('.film-release-checked').last()).toContainText('November 10, 2026');
  await expect(dialog.locator('.film-release-conflict')).toContainText(
    'When To Stream lists November 3, 2099',
  );
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `outputs/review/wts-evidence-${width}.png` });
  }
});
