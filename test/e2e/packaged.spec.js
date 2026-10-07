'use strict';
// Smoke test of the packaged app (files inside app.asar). Opt-in:
//   npm run dist:deb && OPAL_PACKAGED=dist/linux-unpacked/opal npm run test:e2e -- test/e2e/packaged.spec.js
const { test, expect } = require('@playwright/test');
const path = require('path');
const { launch, startServer, win, waitFor, snapshot } = require('./helpers');

test.skip(!process.env.OPAL_PACKAGED, 'needs OPAL_PACKAGED');

test('packaged Opal: UI, fonts, icon, about logo, reader mode, extensions, settings', async () => {
  const server = await startServer();
  const { app, ui } = await launch({ env: { OPAL_NO_EXT_UPDATE: '1' } });
  expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
  expect(await app.evaluate(({ app: a }) => a.getName())).toBe('Opal');
  await expect(ui.locator('#space-name')).toHaveText('Personal');
  expect(await ui.evaluate(() => document.fonts.ready.then(() => document.fonts.check('13px "Bricolage Grotesque"')))).toBe(true);
  expect(await app.evaluate(() => !!global.__opal.iconPath)).toBe(true);
  // About page shows the logo from inside the package.
  await win(app, (w) => w.navigate('opal://about'));
  const about = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://about')));
  await expect(about.locator('img').first()).toBeVisible();
  expect(await about.locator('img').first().evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  // Reader mode reads Readability from the package.
  await win(app, (w, u) => w.navigate(u), `${server.url}/article`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Long read');
  await win(app, (w, _a, opal) => opal.runCommand(w, 'reader-mode', {}));
  await waitFor(async () => (await snapshot(app)).active.url.startsWith('opal://reader'));
  // Extensions: the library's preload loads from the package.
  const id = await app.evaluate(async (_e, dir) => { const w = [...global.__opal.windows][0]; return (await global.__opal.extensions.loadUnpacked(w.profile, dir)).id; }, path.join(__dirname, '../fixtures/hello-ext'));
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Ext`);
  await waitFor(() => win(app, (w) => w.activePane.view.webContents.executeJavaScript('document.documentElement.dataset.opalTestExt')).then((v) => v === 'on'));
  await win(app, (w, x, opal) => opal.extensions.activate(w, x, { x: 1200, y: 60 }), id);
  await waitFor(() => app.windows().some((p) => p.url().startsWith(`chrome-extension://${id}/popup.html`)));
  const popup = app.windows().find((p) => p.url().startsWith(`chrome-extension://${id}/popup.html`));
  await expect(popup.locator('#n')).toHaveText('1 tab');
  // Settings page.
  await win(app, (w) => w.navigate('opal://settings'));
  const settings = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://settings')));
  await expect(settings.locator('#searchEngine option')).toHaveCount(4);
  await app.close();
  server.close();
});
