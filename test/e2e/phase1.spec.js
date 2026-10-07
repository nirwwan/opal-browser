'use strict';
const { test, expect } = require('@playwright/test');
const { launch, snapshot, waitFor, startServer } = require('./helpers');

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => server.close());

test('Studio layout: three spaces, one new tab, Opal title', async () => {
  const { app, ui } = await launch();
  await expect(ui.locator('.space-btn')).toHaveCount(3);
  await expect(ui.locator('#space-name')).toHaveText('Personal');
  await expect(ui.locator('.tab')).toHaveCount(1);
  await expect(ui.locator('.tab.active .title')).toHaveText('New tab');
  await expect(ui.locator('#profile-sub')).toHaveText('Saved on this computer');
  const geom = await ui.evaluate(() => {
    const w = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width);
    return { rail: w('#rail'), tabs: w('#tabs-col'), toolbar: Math.round(document.querySelector('#toolbar').getBoundingClientRect().height), bar: Math.round(document.querySelector('#bookmarks-bar').getBoundingClientRect().height), font: getComputedStyle(document.body).fontFamily, size: getComputedStyle(document.body).fontSize };
  });
  expect(geom).toMatchObject({ rail: 68, tabs: 236, toolbar: 46, bar: 32, size: '13px' });
  expect(geom.font).toContain('Bricolage Grotesque');
  const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
  expect(title).toContain('Opal');
  await app.close();
});

test('address bar: URLs load, other text searches the selected engine', async () => {
  const { app, ui } = await launch();
  await ui.click('#address');
  await ui.fill('#address', `${server.url}/page?title=Hello%20Opal`);
  await ui.press('#address', 'Enter');
  await expect(ui.locator('.tab.active .title')).toHaveText('Hello Opal');
  await ui.click('#address');
  await ui.fill('#address', 'linux kernel');
  await ui.press('#address', 'Enter');
  let s = await waitFor(async () => { const st = await snapshot(app); return st.active.url.startsWith('https://www.google.com/') && st; });
  expect(s.active.url).toBe('https://www.google.com/search?q=linux%20kernel');
  await expect(ui.locator('#address')).toHaveAttribute('placeholder', 'Search Google or type a URL');
  // Bangs work once DuckDuckGo is the engine.
  await app.evaluate(() => global.__opal.settings.set('searchEngine', 'duckduckgo'));
  await ui.click('#address');
  await ui.fill('#address', '!w Linux kernel');
  await ui.press('#address', 'Enter');
  s = await waitFor(async () => { const st = await snapshot(app); return st.active.url.startsWith('https://duckduckgo.com/') && st; });
  expect(s.active.url).toBe('https://duckduckgo.com/?q=!w%20Linux%20kernel');
  await app.close();
});

test('tabs: new, switch, close, Ctrl+T from a web page', async () => {
  const { app, ui } = await launch();
  await ui.click('#new-tab');
  await expect(ui.locator('.tab')).toHaveCount(2);
  await expect(ui.locator('#tab-count')).toHaveText('2 tabs');
  await app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), `${server.url}/page?title=Second`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Second');
  // Shortcut while the web page has focus: a native key event goes through before-input-event.
  await app.evaluate(() => {
    const wc = [...global.__opal.windows][0].activePane.view.webContents;
    wc.focus();
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: ['control'] });
  });
  await expect(ui.locator('.tab')).toHaveCount(3);
  await ui.locator('.tab').first().click();
  await expect(ui.locator('.tab').first()).toHaveClass(/active/);
  await ui.locator('.tab').first().hover();
  await ui.locator('.tab').first().locator('.close').click();
  await expect(ui.locator('.tab')).toHaveCount(2);
  await app.close();
});

test('links with target=_blank and window.open open as new tabs', async () => {
  const { app, ui } = await launch();
  await app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), `${server.url}/blank`);
  const web = await waitFor(() => app.windows().find((p) => p.url().endsWith('/blank')));
  await web.waitForSelector('#lnk');
  await web.click('#lnk');
  await expect(ui.locator('.tab')).toHaveCount(2);
  await expect(ui.locator('.tab.active .title')).toHaveText('Opened');
  await app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), `${server.url}/popup`);
  const pop = await waitFor(() => app.windows().find((p) => p.url().endsWith('/popup')));
  await pop.waitForSelector('#b');
  await pop.click('#b');
  await expect(ui.locator('.tab')).toHaveCount(3);
  await expect(ui.locator('.tab.active .title')).toHaveText('Popup');
  await app.close();
});

test('spaces: own tabs, accent colour, create a space', async () => {
  const { app, ui } = await launch();
  await ui.locator('.space-btn').nth(1).click();
  await expect(ui.locator('#space-name')).toHaveText('Work');
  const accent = await ui.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent).toBe('#b44f0c');
  await expect(ui.locator('.tab')).toHaveCount(1);
  await ui.click('#new-tab');
  await expect(ui.locator('.tab')).toHaveCount(2);
  await ui.locator('.space-btn').nth(0).click();
  await expect(ui.locator('.tab')).toHaveCount(1);
  await ui.click('#add-space');
  await ui.fill('#space-name-input', 'Study');
  await ui.click('.swatch[data-color="#6d3fb0"]');
  await ui.click('#space-save');
  await expect(ui.locator('.space-btn')).toHaveCount(4);
  await expect(ui.locator('#space-name')).toHaveText('Study');
  expect(await ui.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#6d3fb0');
  await app.close();
});

test('bookmarks: star adds to the bar and "Saved in this space"', async () => {
  const { app, ui } = await launch();
  await app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), `${server.url}/page?title=Keep%20me`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Keep me');
  await ui.click('#star-btn');
  await expect(ui.locator('#star-btn')).toHaveClass(/on/);
  await expect(ui.locator('#bm-items')).toContainText('Keep me');
  await expect(ui.locator('#saved-list')).toContainText('Keep me');
  await ui.locator('.space-btn').nth(1).click();
  await expect(ui.locator('#bm-items')).not.toContainText('Keep me');
  await ui.locator('.space-btn').nth(0).click();
  await ui.click('#star-btn');
  await expect(ui.locator('#bm-items')).not.toContainText('Keep me');
  await app.close();
});

test('tabs and spaces are restored after restart', async () => {
  const first = await launch();
  await first.app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), `${server.url}/page?title=Restored`);
  await expect(first.ui.locator('.tab.active .title')).toHaveText('Restored');
  await first.ui.locator('.space-btn').nth(2).click();
  await first.ui.click('#new-tab');
  await first.app.close();
  const second = await launch({ userData: first.dir });
  await expect(second.ui.locator('#space-name')).toHaveText('Linux');
  await expect(second.ui.locator('.tab')).toHaveCount(2);
  await second.ui.locator('.space-btn').nth(0).click();
  await expect(second.ui.locator('.tab.active .title')).toHaveText('Restored');
  await second.app.close();
});

test('user agent looks like Chrome; web pages get no bridge', async () => {
  const { app } = await launch();
  await app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), `${server.url}/ua`);
  const page = await waitFor(() => app.windows().find((p) => p.url().endsWith('/ua')));
  const ua = await page.evaluate(() => navigator.userAgent);
  expect(ua).toContain('Chrome/');
  expect(ua).not.toMatch(/Electron|opal/i);
  expect(await page.evaluate(() => typeof window.opal)).toBe('undefined');
  expect(await page.evaluate(() => typeof require)).toBe('undefined');
  await app.evaluate(() => [...global.__opal.windows][0].newTab({}));
  const nt = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://newtab')));
  await nt.waitForLoadState();
  expect(await nt.evaluate(() => typeof window.opal.call)).toBe('function');
  await app.close();
});
