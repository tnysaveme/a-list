import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

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

async function openAppearance(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open A-List menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Account Settings', exact: true }).click();
  await page.locator('.account-dialog').evaluate(async (node) => {
    await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
  });
}
// Pause native color animations so both directions can be inspected without timing races.
function inspectFade(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ duration: number; progress: number; spatial: boolean }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('No appearance fade was created')), 3000);
        const inspect = () => {
          const animations = document
            .getAnimations()
            .filter(
              (animation) =>
                animation.id === 'appearance-palette' && animation.playState === 'running',
            );
          if (!animations.length) {
            requestAnimationFrame(inspect);
            return;
          }
          clearTimeout(timeout);
          const duration = Number(animations[0].effect!.getTiming().duration);
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = duration / 2;
          }
          resolve({
            duration,
            progress: Number(animations[0].effect!.getComputedTiming().progress),
            spatial: animations.some((animation) =>
              (animation.effect as KeyframeEffect)
                .getKeyframes()
                .some((frame) =>
                  ['transform', 'width', 'height', 'filter'].some((property) => property in frame),
                ),
            ),
          });
        };
        inspect();
      }),
  );
}
async function finishFade(page: Page) {
  await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.id === 'appearance-palette')
      .forEach((animation) => animation.finish()),
  );
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-transition');
}

test('pointer theme changes use a coordinated color fade in both directions without moving the page', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await openAppearance(page);
    const before = await page.locator('.account-dialog').boundingBox();
    for (const theme of ['Dark', 'Light']) {
      const inspecting = inspectFade(page);
      await page.getByRole('radio', { name: theme, exact: true }).check();
      const fade = await inspecting;
      expect(fade.duration).toBe(180);
      expect(fade.progress).toBeGreaterThan(0);
      expect(fade.progress).toBeLessThan(1);
      expect(fade.spatial).toBe(false);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
      expect(await page.locator('.account-dialog').boundingBox()).toEqual(before);
      await page.screenshot({
        path: test.info().outputPath(`appearance-${width}-to-${theme.toLowerCase()}-midpoint.png`),
      });
      await finishFade(page);
    }
  }
});

test('rapid reversal stays interactive and keyboard or reduced-motion changes remain immediate', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await openAppearance(page);
  const inspecting = inspectFade(page);
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await inspecting;
  const reversing = inspectFade(page);
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await reversing;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Light', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-transition');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-transition');
  expect(errors).toEqual([]);
});

test('system changes share the fade and enabling reduced motion finishes the current palette', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await openAppearance(page);
  const inspecting = inspectFade(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await inspecting;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-transition');
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('missing or rejected animation support keeps theme choice and persistence usable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await openAppearance(page);
  await page.evaluate(() =>
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined }),
  );
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-transition');
  await page.evaluate(() =>
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: () => {
        throw new Error('Animation unavailable');
      },
    }),
  );
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-transition');
  expect(await page.evaluate(() => localStorage.getItem('a-list:appearance:v1'))).toBe('light');
  expect(errors).toEqual([]);
});
