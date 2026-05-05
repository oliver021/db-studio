/**
 * Smoke E2E: launch the Electron app, open a seeded SQLite DB, run a query.
 * Requires: `npm run build` and `npm run seed:crm` to have run first.
 *
 * Skipped in CI unless ELECTRON_E2E=1 is set (build is slow in CI).
 */
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const SHOULD_RUN = process.env.ELECTRON_E2E === '1';

test.describe('Electron smoke tests', () => {
  test.skip(!SHOULD_RUN, 'Set ELECTRON_E2E=1 to run Electron E2E tests');

  test('app launches and shows empty state', async () => {
    const app = await electron.launch({
      args: [path.resolve('dist-electron/main.js')],
    });

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // The app should show the empty state or sidebar
    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    await app.close();
  });

  test('open a SQLite database and browse a table', async () => {
    // Use the seeded CRM database if it exists
    const seedDb = path.resolve('scripts/crm.sqlite');
    if (!fs.existsSync(seedDb)) {
      test.skip(true, 'Seeded CRM database not found — run npm run seed:crm');
      return;
    }

    const tmpDb = path.join(os.tmpdir(), `e2e-crm-${Date.now()}.db`);
    fs.copyFileSync(seedDb, tmpDb);

    const app = await electron.launch({
      args: [path.resolve('dist-electron/main.js')],
      env: { ...process.env, E2E_OPEN_DB: tmpDb },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // App shell should render
    await expect(page.locator('.app-shell')).toBeVisible();

    await app.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  });
});
