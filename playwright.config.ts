import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 30000,
  // Mocked outage/race requests must reach Playwright's routing layer.
  // Dedicated offline tests opt into the real worker separately.
  use: {
    baseURL: 'http://127.0.0.1:4317',
    browserName: 'chromium',
    trace: 'off',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node scripts/run-e2e.mjs',
    url: 'http://127.0.0.1:4317/privacy',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
