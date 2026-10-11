import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18091';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'ANKI_BACKEND=mock PORT=18091 LOG_LEVEL=warn npx tsx src/index.ts',
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
