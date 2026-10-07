'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');
const { launch, startServer, win, overlayPage, waitFor, snapshot } = require('./helpers');

const EXT = path.join(__dirname, '../fixtures/hello-ext');
let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => server.close());

const loadExt = (app) => app.evaluate(async (_e, dir) => {
  const w = [...global.__opal.windows][0];
  const x = await global.__opal.extensions.loadUnpacked(w.profile, dir);
  return x.id;
}, EXT);

test('unpacked extension: content script, toolbar menu with badge, popup, remembered after restart', async () => {
  const first = await launch({ env: { OPAL_NO_EXT_UPDATE: '1' } });
  const id = await loadExt(first.app);
  expect(id).toMatch(/^[a-p]{32}$/);
  await win(first.app, (w, u) => w.navigate(u), `${server.url}/page?title=Ext`);
  await expect(first.ui.locator('.tab.active .title')).toHaveText('Ext');
  await waitFor(() => win(first.app, (w) => w.activePane.view.webContents.executeJavaScript('document.documentElement.dataset.opalTestExt')).then((v) => v === 'on'));
  // Toolbar menu lists it with its badge.
  await first.ui.click('#extensions-btn');
  const ov = await overlayPage(first.app);
  await expect(ov.locator('.ext-item')).toContainText('Opal Test Extension');
  await ov.click('.ext-item');
  // The popup opens as its own window with the extension page.
  await waitFor(() => first.app.windows().some((p) => p.url().startsWith(`chrome-extension://${id}/popup.html`)), { timeout: 20000 });
  const popup = first.app.windows().find((p) => p.url().startsWith(`chrome-extension://${id}/popup.html`));
  await expect(popup.locator('#n')).toHaveText('1 tab');
  // The popup set a badge; the menu shows it.
  await popup.close();
  await first.ui.click('#extensions-btn');
  await expect(ov.locator('.ext-badge')).toHaveText('7');
  await ov.keyboard.press('Escape');
  await first.app.close();
  // Loaded again on the next start.
  const second = await launch({ userData: first.dir, env: { OPAL_NO_EXT_UPDATE: '1' } });
  await waitFor(() => second.app.evaluate(async () => {
    const w = [...global.__opal.windows][0];
    await global.__opal.extensions.ready(w.profile);
    return global.__opal.extensions.list(w.profile).some((x) => x.name === 'Opal Test Extension');
  }));
  await second.app.close();
});

test('extensions page: turn off, turn on, remove', async () => {
  const { app, ui } = await launch({ env: { OPAL_NO_EXT_UPDATE: '1' } });
  await loadExt(app);
  await win(app, (w) => w.navigate('opal://extensions'));
  await waitFor(async () => (await snapshot(app)).active.url.startsWith('opal://extensions'));
  const page = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://extensions')));
  await expect(page.locator('.ext-card')).toHaveCount(1);
  await expect(page.locator('.ext-card .name')).toContainText('Opal Test Extension');
  await page.click('.ext-card .switch input');
  await expect(page.locator('.ext-card')).toHaveClass(/off/);
  expect(await app.evaluate(() => { const w = [...global.__opal.windows][0]; return w.profile.ses.extensions.getAllExtensions().length; })).toBe(0);
  await page.click('.ext-card .switch input');
  await expect(page.locator('.ext-card')).not.toHaveClass(/off/);
  expect(await app.evaluate(() => { const w = [...global.__opal.windows][0]; return w.profile.ses.extensions.getAllExtensions().length; })).toBe(1);
  page.once('dialog', (d) => d.accept());
  await page.click('.ext-card [data-act=remove]');
  await expect(page.locator('.ext-card')).toHaveCount(0);
  await expect(ui.locator('.tab.active .title')).toContainText('Extensions');
  await app.close();
});

test('settings page: search engine, toggles, Opal AI, Onyx, remembered after restart', async () => {
  const first = await launch();
  await win(first.app, (w) => w.navigate('opal://settings'));
  const page = await waitFor(() => first.app.windows().find((p) => p.url().startsWith('opal://settings')));
  await expect(page.locator('#searchEngine option')).toHaveCount(4);
  await page.selectOption('#searchEngine', 'duckduckgo');
  await waitFor(async () => (await snapshot(first.app)).search.engine === 'duckduckgo');
  await page.click('#showBookmarksBar');
  await waitFor(async () => (await snapshot(first.app)).showBookmarksBar === false);
  await page.click('#oneColorDots');
  await page.click('#provider [data-v=both]');
  await page.click('#size [data-v=L]');
  await waitFor(async () => { const a = (await snapshot(first.app)).ai; return a.oneColorDots && a.provider === 'both' && a.width === 520; });
  await page.fill('#homePage', 'example.com');
  await page.press('#homePage', 'Enter');
  await waitFor(() => first.app.evaluate(() => global.__opal.settings.get('homePage') === 'https://example.com'));
  // A bad Onyx address is refused.
  await page.fill('#onyxUrl', 'http://example.com:7777');
  await page.press('#onyxUrl', 'Enter');
  await expect(page.locator('#saved')).toContainText("isn't allowed");
  expect(await first.app.evaluate(() => global.__opal.settings.get('onyxUrl'))).toBe('http://127.0.0.1:7777');
  await expect(page.locator('#onyxState')).not.toHaveText('Checking…');
  await expect(page.locator('#profileList .set')).toHaveCount(1);
  await first.app.close();
  const second = await launch({ userData: first.dir });
  const s = await snapshot(second.app);
  expect(s.search.engine).toBe('duckduckgo');
  expect(s.showBookmarksBar).toBe(false);
  expect(s.ai).toMatchObject({ provider: 'both', oneColorDots: true, width: 520 });
  await second.app.close();
});
