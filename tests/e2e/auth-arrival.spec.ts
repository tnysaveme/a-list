import { test, expect, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const arrival = '11111111-2222-4333-8444-555555555555';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'fixture@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: {},
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function authenticate(context: BrowserContext) {
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', exp: 4102444800, iat: 1792972800, role: 'authenticated' })}.fixture-signature`;
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
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4318/_control', { data: { reset: true } });
});

for (const variant of ['sign-in', 'confirmation'] as const) {
  test(`${variant} keeps a soft preview and usable form until cold artwork decodes`, async ({
    page,
  }) => {
    const photo = await readFile(
      new URL(
        `../../public/${variant === 'sign-in' ? 'sign-in' : 'confirmation'}-cinema.webp`,
        import.meta.url,
      ),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/_next/image?*', async (route) => {
      await gate;
      await route.fulfill({ body: photo, contentType: 'image/webp' });
    });
    await page.goto(
      variant === 'sign-in' ? '/login' : '/auth/confirm?token_hash=' + 'a'.repeat(64),
      { waitUntil: 'domcontentloaded' },
    );
    const artwork = page.locator('.auth-artwork');
    const image = artwork.locator('img');
    await expect(artwork).toHaveAttribute('data-artwork', 'loading');
    await expect(artwork).not.toHaveCSS('background-image', 'none');
    await expect(image).toHaveCSS('opacity', '0');
    await expect(page.locator('.login-cinema-copy')).toBeVisible();
    if (variant === 'sign-in') {
      await page.getByLabel('Your Email Address').fill('fixture@example.invalid');
      await expect(page.getByRole('button', { name: 'Continue with Email' })).toBeEnabled();
    } else await expect(page.getByRole('button', { name: 'Confirm & sign in' })).toBeEnabled();
    const bounds = await artwork.boundingBox();
    release();
    await expect(artwork).toHaveAttribute('data-artwork', 'ready');
    await expect(image).toHaveCSS('animation-duration', '1.2s');
    const midpoint = await image.evaluate((node) => {
      const animation = node
        .getAnimations()
        .find(
          (entry) => entry instanceof CSSAnimation && entry.animationName === 'auth-artwork-reveal',
        )!;
      animation.pause();
      animation.currentTime = 600;
      const opacity = Number(getComputedStyle(node).opacity);
      animation.play();
      return opacity;
    });
    expect(midpoint).toBeGreaterThan(0.45);
    expect(midpoint).toBeLessThan(0.55);
    await expect(image).toHaveCSS('opacity', '1');
    expect(await artwork.boundingBox()).toEqual(bounds);
    expect(await image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(
      0,
    );
  });
}

test('cached auth images still receive a perceptible reveal after reload', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.auth-artwork img')).toHaveCSS('opacity', '1');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.auth-artwork')).toHaveAttribute('data-artwork', 'ready');
  const midpoint = await page.locator('.auth-artwork img').evaluate((node) => {
    const animation = node
      .getAnimations()
      .find(
        (entry) => entry instanceof CSSAnimation && entry.animationName === 'auth-artwork-reveal',
      )!;
    animation.pause();
    animation.currentTime = 600;
    const opacity = Number(getComputedStyle(node).opacity);
    animation.play();
    return opacity;
  });
  expect(midpoint).toBeGreaterThan(0.45);
  expect(midpoint).toBeLessThan(0.55);
});

test('welcome remains readable beyond the old timeout before gently revealing the site', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/?welcome=' + arrival, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.welcome-splash')).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.locator('.welcome-splash')).toBeVisible();
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
});

test('failed decorative artwork retains the preview while sign-in stays usable', async ({
  page,
}) => {
  await page.route('**/_next/image?*', (route) => route.abort());
  await page.goto('/login');
  await expect(page.locator('.auth-artwork')).toHaveAttribute('data-artwork', 'error');
  await expect(page.locator('.auth-artwork')).not.toHaveCSS('background-image', 'none');
  await expect(page.locator('.auth-artwork img')).toHaveCSS('visibility', 'hidden');
  await page.getByLabel('Your Email Address').fill('fixture@example.invalid');
  await expect(page.getByRole('button', { name: 'Continue with Email' })).toBeEnabled();
});

test('successful confirmation welcomes once, reveals live content, and clears the arrival URL', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { arrivalEvents: string[] }).arrivalEvents = [];
    document.addEventListener('animationstart', (event) => {
      (window as unknown as { arrivalEvents: string[] }).arrivalEvents.push(event.animationName);
    });
  });
  await page.goto('/auth/confirm?token_hash=' + 'a'.repeat(64));
  const response = page.waitForResponse((result) => result.url().endsWith('/auth/verify'));
  await page.getByRole('button', { name: 'Confirm & sign in' }).click();
  expect((await response).headers().location).toMatch(/\/?welcome=[a-f0-9-]{36}$/);
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/welcome=/);
  expect(
    await page.evaluate(() => (window as unknown as { arrivalEvents: string[] }).arrivalEvents),
  ).toContain('welcome-greeting-in');
  expect((await context.cookies()).some((cookie) => cookie.name.includes('auth-token'))).toBe(true);
  await page.reload();
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { arrivalEvents: string[] }).arrivalEvents),
  ).not.toContain('welcome-greeting-in');
});

test('arrival can be skipped by keyboard and does not replay the same marker', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/?welcome=' + arrival, { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  await expect(page.locator('.welcome-splash')).not.toBeVisible();
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: 'Open A-List menu' })).toBeVisible();
  await page.goto('/?welcome=' + arrival);
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
});

test('reduced motion bypasses the welcome hold and removes page movement', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?welcome=' + arrival);
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
  await expect(page.locator('.welcome-site')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
  await expect(page).not.toHaveURL(/welcome=/);
});

test('welcome completes with blocked storage and on normal authenticated reloads', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('Unavailable', 'SecurityError');
      },
    });
  });
  await page.goto('/?welcome=' + arrival);
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
  await page.reload();
  await expect(page.locator('.welcome-splash')).toHaveCount(0);
});

test('CSS reveals the site and auth artwork even when JavaScript is unavailable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await authenticate(context);
  const page = await context.newPage();
  await page.goto('/?welcome=' + arrival);
  await expect(page.locator('.welcome-splash')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.welcome-site')).toHaveCSS('opacity', '1');
  await context.clearCookies();
  await page.goto('/login');
  await expect(page.locator('.auth-artwork img')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: 'Continue with Email' })).toBeVisible();
  await context.close();
});

test('directional button feedback keeps hit targets still and keyboard feedback immediate', async ({
  page,
}) => {
  await page.goto('/login');
  const input = page.getByLabel('Your Email Address');
  await input.fill('fixture@example.invalid');
  const button = page.getByRole('button', { name: 'Continue with Email' });
  const arrow = button.locator('.lucide-arrow-right');
  const bounds = await button.boundingBox();
  await button.hover();
  await expect(arrow).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 2, 0)');
  expect(await button.boundingBox()).toEqual(bounds);
  await page.keyboard.press('Tab');
  await expect(arrow).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await input.click();
  await button.hover();
  await expect(arrow).toHaveCSS('transform', 'none');
});

test('account menus use anchored motion for pointers and immediate keyboard opening', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open A-List menu' });
  await trigger.click();
  const menu = page.locator('.app-header-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('transition-duration', '0.12s, 0.18s');
  await expect(menu).toHaveCSS('transform', 'none');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await trigger.focus();
  await trigger.press('Enter');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('transition-duration', '0s');
  await expect(menu).toHaveCSS('transform', 'none');
  expect(await menu.evaluate((node) => node.getAnimations().length)).toBe(0);
});
