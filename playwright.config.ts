import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5183',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5183',
    env: { INITIO_PIOS_VERIFY: process.env.INITIO_PIOS_VERIFY ?? '1' },
    url: 'http://127.0.0.1:5183',
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
