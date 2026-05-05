import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['html', { outputFolder: 'test-results/playwright' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: {
        // Electron-specific launch is handled inside the test via _electron
        browserName: 'chromium',
      },
    },
  ],
  // Build must exist before E2E runs
  globalSetup: path.resolve('test/e2e/global-setup.ts'),
});
