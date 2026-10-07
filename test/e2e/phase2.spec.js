'use strict';
const { test, expect } = require('@playwright/test');
const { launch, snapshot, waitFor, startServer, overlayPage, win, uiPage } = require('./helpers');

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => server.close());

test('⋮ menu lists every item and runs commands', async () => {
  const { app, ui } = await launch();
  await ui.click('#menu-btn');
  const ov = await overlayPage(app);
  await ov.waitForSelector('.menu');
  const labels = await ov.locator('.menu .m-item .label').allTextContents();
  for (const l of ['New tab', 'New window', 'New incognito window', 'Passwords and autofill', 'History', 'Downloads',
    'Bookmarks and lists', 'Spaces and tab groups', 'Extensions', 'Delete browsing data', 'Print…', 'Translate this page',
    'Find and edit', 'Cast, save and share', 'More tools', 'Help', 'Settings', 'About Opal']) {
    expect(labels).toContain(l);
  }
  await expect(ov.locator('.m-head .btn')).toHaveText('Switch');
  await expect(ov.locator('#z-val')).toHaveText('100%');
  await ov.click('.m-item:has-text("New tab")');
  await expect(ui.locator('.tab')).toHaveCount(2);
  expect(await win(app, (w) => w.overlayKind)).toBeFalsy();
  await app.close();
});

test('Ctrl+K command bar finds tabs and runs commands', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Alpha%20page`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Alpha page');
  await win(app, (w) => w.newTab({}));
  await win(app, (w, a, opal) => opal.runCommand(w, 'command-bar', {}));
  const ov = await overlayPage(app);
  await ov.waitForSelector('#cmd-input');
  await ov.fill('#cmd-input', 'alpha');
  await expect(ov.locator('.c-row.sel')).toBeVisible();
  await ov.locator('.c-row:has-text("Alpha page")').first().click();
  await expect(ui.locator('.tab.active .title')).toHaveText('Alpha page');
  await app.close();
});

test('history page lists, searches and deletes visits; address bar suggests them', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Zebra%20facts`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Zebra facts');
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Yak%20facts`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Yak facts');
  // Suggestions
  await ui.click('#address');
  await ui.keyboard.type('zebra');
  const ov = await overlayPage(app);
  await expect(ov.locator('.o-row')).toHaveCount(2);
  await expect(ov.locator('.o-row').nth(1)).toContainText('Zebra facts');
  await ui.keyboard.press('ArrowDown');
  await ui.keyboard.press('ArrowDown');
  await expect(ui.locator('#address')).toHaveValue(/title=Zebra/);
  await ui.keyboard.press('Escape');
  await ui.keyboard.press('Escape');
  // History page
  await win(app, (w, a, opal) => opal.runCommand(w, 'history', {}));
  const page = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://history')));
  await expect(page.locator('.h-row')).toHaveCount(2);
  await page.fill('#q', 'yak');
  await expect(page.locator('.h-row')).toHaveCount(1);
  await page.locator('.h-row .icon-btn').click();
  await expect(page.locator('.h-row')).toHaveCount(0);
  await app.close();
});

test('downloads: saved to the download folder, ring, popover and page', async () => {
  const fs = require('fs');
  const path = require('path');
  const dlDir = require('./helpers').tempDir('opal-dl-');
  const { app, ui } = await launch();
  await app.evaluate((_e, d) => global.__opal.settings.set('downloadDir', d), dlDir);
  await win(app, (w, u) => w.navigate(u), `${server.url}/download`);
  await waitFor(() => fs.existsSync(path.join(dlDir, 'opal-test.bin')) && fs.statSync(path.join(dlDir, 'opal-test.bin')).size === 200000);
  await waitFor(async () => (await snapshot(app)).downloads.recent);
  await ui.click('#downloads-btn');
  const ov = await overlayPage(app);
  await expect(ov.locator('.dl .name')).toHaveText('opal-test.bin');
  await ov.click('#dl-all');
  const page = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://downloads')));
  await expect(page.locator('.d-row .name')).toHaveText('opal-test.bin');
  await expect(page.locator('.d-row[data-state=completed]')).toHaveCount(1);
  // A second download of the same file gets a unique name.
  await win(app, (w, u) => w.newTab({ url: u }), `${server.url}/download`);
  await waitFor(() => fs.existsSync(path.join(dlDir, 'opal-test (1).bin')));
  await app.close();
});

test('bookmark manager: edit, add folder, move between spaces', async () => {
  const { app, ui } = await launch();
  await win(app, (w, a, opal) => opal.runCommand(w, 'bookmarks', {}));
  const page = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://bookmarks')));
  await expect(page.locator('#side button')).toHaveCount(4); // 3 spaces + Reading folder
  await expect(page.locator('.b-row')).toHaveCount(3);
  await page.click('#add-folder');
  await page.locator('.b-row.editing input').first().fill('Recipes');
  await page.click('.b-row.editing .btn.primary');
  await expect(page.locator('.b-row .t', { hasText: 'Recipes' })).toBeVisible();
  await expect(ui.locator('#bm-items')).toContainText('Recipes');
  // Edit Wikipedia and move it to the Work space.
  await page.locator('.b-row', { hasText: 'Wikipedia' }).locator('.icon-btn').first().click();
  await page.locator('.b-row.editing input').first().fill('Wiki');
  await page.locator('.b-row.editing select').selectOption({ label: 'Work' });
  await page.click('.b-row.editing .btn.primary');
  await expect(page.locator('.b-row', { hasText: 'Wiki' })).toHaveCount(0);
  await ui.locator('.space-btn').nth(1).click();
  await expect(ui.locator('#bm-items')).toContainText('Wiki');
  await app.close();
});

test('find in page counts matches; zoom; save as PDF; copy link', async () => {
  const fs = require('fs');
  const path = require('path');
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Find&body=apple%20banana%20apple%20cherry%20apple`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Find');
  await win(app, (w, a, opal) => opal.runCommand(w, 'find', {}));
  await expect(ui.locator('#findbar')).toBeVisible();
  await ui.locator('#find-input').fill('apple');
  await expect(ui.locator('#find-count')).toHaveText('1 of 3');
  await ui.locator('#find-input').press('Enter');
  await expect(ui.locator('#find-count')).toHaveText('2 of 3');
  await ui.locator('#find-input').press('Escape');
  await expect(ui.locator('#findbar')).toBeHidden();
  // Zoom
  await win(app, (w, a, opal) => { opal.runCommand(w, 'zoom-in', {}); opal.runCommand(w, 'zoom-in', {}); });
  await expect(ui.locator('#zoom-chip')).toHaveText('125%');
  await win(app, (w, a, opal) => opal.runCommand(w, 'zoom-reset', {}));
  await expect(ui.locator('#zoom-chip')).toBeHidden();
  // PDF
  const out = path.join(require('./helpers').tempDir('opal-pdf-'), 'page.pdf');
  await app.evaluate(async (_e, f) => global.__opal.tools.savePdf([...global.__opal.windows][0], f), out);
  expect(fs.readFileSync(out).slice(0, 4).toString()).toBe('%PDF');
  // Copy link
  await win(app, (w, a, opal) => opal.runCommand(w, 'copy-link', {}));
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clip).toContain('/page?title=Find');
  await app.close();
});

test('incognito window: separate in-memory session, nothing saved', async () => {
  const fs = require('fs');
  const path = require('path');
  const { app, ui, dir } = await launch();
  await win(app, (w, a, opal) => opal.runCommand(w, 'new-incognito-window', {}));
  await waitFor(() => app.evaluate(() => global.__opal.windows.size === 2));
  const info = await app.evaluate(async (_e, u) => {
    const w = [...global.__opal.windows][1];
    w.navigate(u);
    await new Promise((r) => setTimeout(r, 1500));
    await w.profile.ses.cookies.set({ url: u, name: 'secret', value: '1' });
    return { incognito: w.incognito, partition: w.profile.partition, persistent: w.profile.ses.isPersistent(), history: w.profile.listHistory().length };
  }, `${server.url}/page?title=Private`);
  expect(info).toMatchObject({ incognito: true, persistent: false, history: 0 });
  expect(info.partition.startsWith('persist:')).toBe(false);
  const ui2 = await uiPage(app, 1);
  await expect(ui2.locator('#profile-name')).toHaveText('Incognito');
  await expect(ui2.locator('body')).toHaveClass(/incognito/);
  // The normal profile can't see the incognito cookie.
  const normalCookies = await app.evaluate(async (_e, u) => (await [...global.__opal.windows][0].profile.ses.cookies.get({ url: u })).length, server.url);
  expect(normalCookies).toBe(0);
  await app.evaluate(() => [...global.__opal.windows][1].win.close());
  await waitFor(() => app.evaluate(() => global.__opal.windows.size === 1));
  expect(fs.existsSync(path.join(dir, 'profiles', 'incognito1'))).toBe(false);
  await expect(ui.locator('.tab')).toHaveCount(1);
  await app.close();
});

test('profiles: create one, it opens in its own window and partition', async () => {
  const { app, ui } = await launch();
  await ui.click('#profile-card');
  await ui.click('#pp-add');
  await ui.fill('#profile-name-input', 'Work');
  await ui.click('#np-save');
  await waitFor(() => app.evaluate(() => global.__opal.windows.size === 2));
  const parts = await app.evaluate(() => [...global.__opal.windows].map((w) => ({ name: w.profile.name, partition: w.profile.partition })));
  expect(parts[0].name).toBe('Personal');
  expect(parts[1].name).toBe('Work');
  expect(parts[1].partition).not.toBe(parts[0].partition);
  expect(parts[1].partition.startsWith('persist:profile-')).toBe(true);
  const ui2 = await uiPage(app, 1);
  await expect(ui2.locator('#profile-name')).toHaveText('Work');
  // Switching back to Personal focuses its window instead of opening another.
  await win(app, (w, a, opal) => opal.runCommand(w, 'switch-profile', { profileId: 'default' }));
  expect(await app.evaluate(() => global.__opal.windows.size)).toBe(2);
  await app.close();
});

test('split view: two pages in one tab, focus, separate', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Left`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Left');
  await win(app, (w, u, opal) => opal.runCommand(w, 'split-view', { url: u }), `${server.url}/page?title=Right`);
  await expect(ui.locator('.tab')).toHaveCount(1);
  await expect(ui.locator('.tab.active .title')).toHaveText('Left  |  Right');
  await expect(ui.locator('#split-marker')).toBeVisible();
  const bounds = await win(app, (w) => w.activeTab.panes.map((p) => p.view.getBounds()));
  expect(bounds).toHaveLength(2);
  expect(bounds[0].x + bounds[0].width).toBeLessThan(bounds[1].x);
  expect(bounds[0].y).toBe(bounds[1].y);
  await win(app, (w, a, opal) => opal.runCommand(w, 'focus-pane', { index: 0 }));
  await expect(ui.locator('#address')).toHaveValue(/title=Left/);
  await win(app, (w, a, opal) => opal.runCommand(w, 'unsplit-tab', {}));
  await expect(ui.locator('.tab')).toHaveCount(2);
  await expect(ui.locator('#split-marker')).toHaveCount(0);
  await app.close();
});

test('picture in picture moves the page into a floating mini player and back', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/video`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Video');
  await win(app, (w, a, opal) => opal.runCommand(w, 'pip', {}));
  await waitFor(() => win(app, (w) => !!w.pip));
  const info = await win(app, (w) => ({ onTop: w.pip.mini.isAlwaysOnTop(), inMini: w.pip.mini.contentView.children.includes(w.pip.pane.view), attached: w.attached.has(w.pip.pane.view) }));
  expect(info).toEqual({ onTop: true, inMini: true, attached: false });
  await expect(ui.locator('#content-msg')).toContainText('picture in picture');
  await ui.click('#pip-back');
  await waitFor(() => win(app, (w) => !w.pip && w.attached.has(w.activePane.view)));
  await expect(ui.locator('#content-msg')).toBeHidden();
  await app.close();
});

test('reader mode shows the article without clutter and Back returns', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/article`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Long read');
  await win(app, (w, a, opal) => opal.runCommand(w, 'reader-mode', {}));
  const page = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://reader')));
  await expect(page.locator('#title')).toHaveText('Long read');
  await expect(page.locator('#content')).toContainText('Opal reader mode keeps the article text');
  await expect(page.locator('#content')).not.toContainText('menu menu');
  await page.click('#exit');
  await waitFor(() => win(app, (w) => w.activePane.url.endsWith('/article')));
  await app.close();
});

test('permission prompt: infobar asks, answer is remembered per site', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/perm`);
  const page = await waitFor(() => app.windows().find((p) => p.url().endsWith('/perm')));
  await page.click('#b');
  await expect(ui.locator('.infobar')).toContainText('wants to show notifications');
  await ui.locator('.infobar .btn.primary').click();
  await expect(ui.locator('.infobar')).toHaveCount(0);
  await expect(ui.locator('.tab.active .title')).toHaveText('granted');
  const stored = await win(app, (w, origin) => w.profile.getPermission(origin, 'notifications'), server.url);
  expect(stored).toBe('allow');
  // Asked again: no prompt this time.
  await page.reload();
  await page.click('#b');
  await expect(ui.locator('.tab.active .title')).toHaveText('granted');
  await expect(ui.locator('.infobar')).toHaveCount(0);
  await app.close();
});

test('delete browsing data clears history and cookies', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Visited`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Visited');
  await win(app, async (w, u) => w.profile.ses.cookies.set({ url: u, name: 'c', value: '1' }), server.url);
  await win(app, (w, a, opal) => opal.runCommand(w, 'clear-data', {}));
  const ov = await overlayPage(app);
  await ov.waitForSelector('#cd-go');
  await ov.click('#cd-go');
  await waitFor(() => win(app, (w) => w.profile.listHistory().length === 0));
  const cookies = await win(app, async (w, u) => (await w.profile.ses.cookies.get({ url: u })).length, server.url);
  expect(cookies).toBe(0);
  await app.close();
});

test('every keyboard shortcut maps to a command the app implements', async () => {
  const { TABLE } = require('../../src/shared/shortcuts');
  const { app } = await launch();
  const implemented = await app.evaluate(() => Object.keys(global.__opal.commands));
  const missing = [...new Set(TABLE.map(([, , c]) => c))].filter((c) => c !== 'escape' && !implemented.includes(c));
  expect(missing).toEqual([]);
  await app.close();
});

test('shortcuts work while a web page has focus', async () => {
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Keys`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Keys');
  const press = (keyCode, modifiers) => app.evaluate((_e, [k, m]) => {
    const wc = [...global.__opal.windows][0].activePane.view.webContents;
    wc.focus();
    wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: m });
  }, [keyCode, modifiers]);
  await press('F', ['control']);
  await expect(ui.locator('#findbar')).toBeVisible();
  await press('Escape', []);
  await expect(ui.locator('#findbar')).toBeHidden();
  await press('K', ['control']);
  const ov = await overlayPage(app);
  await expect(ov.locator('#cmd-input')).toBeVisible();
  await ov.keyboard.press('Escape');
  await waitFor(() => win(app, (w) => !w.overlayKind));
  await press('N', ['control', 'shift']);
  await waitFor(() => app.evaluate(() => [...global.__opal.windows].some((w) => w.incognito)));
  await app.close();
});

test('session survives a hard kill (crash recovery)', async () => {
  const first = await launch();
  await win(first.app, (w, u) => w.navigate(u), `${server.url}/page?title=Before%20crash`);
  await expect(first.ui.locator('.tab.active .title')).toHaveText('Before crash');
  await win(first.app, (w, u) => w.newTab({ url: u }), `${server.url}/page?title=Second%20tab`);
  await expect(first.ui.locator('.tab.active .title')).toHaveText('Second tab');
  await new Promise((r) => setTimeout(r, 800)); // debounced save
  first.app.process().kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 500));
  const second = await launch({ userData: first.dir });
  await expect(second.ui.locator('.tab')).toHaveCount(2);
  await expect(second.ui.locator('.tab.active .title')).toHaveText('Second tab');
  await expect(second.ui.locator('.tab').first()).toContainText('Before crash');
  // Reopen closed tab
  await win(second.app, (w, a, opal) => opal.runCommand(w, 'close-tab', {}));
  await expect(second.ui.locator('.tab')).toHaveCount(1);
  await win(second.app, (w, a, opal) => opal.runCommand(w, 'reopen-closed-tab', {}));
  await expect(second.ui.locator('.tab')).toHaveCount(2);
  await second.app.close();
});

test('About, keyboard shortcuts and passwords pages; site info popover', async () => {
  const { app, ui } = await launch();
  await win(app, (w, a, opal) => opal.runCommand(w, 'about', {}));
  const about = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://about')));
  await expect(about.locator('#info')).toContainText('Opal AINot set up');
  await expect(about.locator('#info')).toContainText('Chromium');
  await win(app, (w, a, opal) => opal.runCommand(w, 'help', {}));
  const help = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://help')));
  await expect(help.locator('.row', { hasText: 'Show or hide Opal AI' })).toContainText('Ctrl+Shift+A');
  await win(app, (w, a, opal) => opal.runCommand(w, 'passwords', {}));
  const pw = await waitFor(() => app.windows().find((p) => p.url().startsWith('opal://passwords')));
  await expect(pw.locator('h3')).toContainText("doesn't save passwords");
  await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Site`);
  await expect(ui.locator('.tab.active .title')).toHaveText('Site');
  await ui.click('#site-info');
  const ov = await overlayPage(app);
  await expect(ov.locator('.pop')).toContainText('127.0.0.1');
  await expect(ov.locator('.pop')).toContainText('not secure');
  await app.close();
});
