import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4387',
    viewport: { width: 393, height: 744 },
    deviceScaleFactor: 2.75,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: '4387' },
    url: 'http://127.0.0.1:4387',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
