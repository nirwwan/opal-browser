'use strict';
// Opal presents as stable Google Chrome (regression for "This browser or app may not be secure"
// on Google sign-in). navigator.webdriver can't be checked here (Playwright drives Opal, which
// makes it true): scripts/check-identity.js covers that with a normal launch.
const { test, expect } = require('@playwright/test');
const http = require('http');
const path = require('path');
const { launch, win, waitFor, snapshot } = require('./helpers');

test('user agent, Sec-CH-UA headers, userAgentData and window.chrome match Chrome', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(200, { 'content-type': 'text/html', 'accept-ch': 'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch' });
    res.end('<title>Id</title><iframe src="/frame"></iframe>');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const url = `http://localhost:${server.address().port}/`;
  const { app, ui } = await launch();
  await win(app, (w, u) => w.navigate(u), url);
  await expect(ui.locator('.tab.active .title')).toHaveText('Id');
  await win(app, (w) => w.reload());
  // After the first response's Accept-CH, the reload carries the full version list.
  await waitFor(() => seen.some((h) => h['sec-fetch-dest'] === 'document' && h['sec-ch-ua-full-version-list']));
  const chrome = await app.evaluate(() => process.versions.chrome);
  const major = chrome.split('.')[0];
  const doc = seen.find((h) => h['sec-fetch-dest'] === 'document' && h['sec-ch-ua-full-version-list']);
  expect(doc['user-agent']).toBe(`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`);
  for (const h of seen) expect(JSON.stringify(h)).not.toMatch(/Electron|opal-browser/i);
  expect(doc['sec-ch-ua']).toContain(`"Google Chrome";v="${major}"`);
  expect(doc['sec-ch-ua']).toContain(`"Chromium";v="${major}"`);
  expect(doc['sec-ch-ua-platform']).toBe('"Linux"');
  expect(doc['sec-ch-ua-mobile']).toBe('?0');
  expect(doc['sec-ch-ua-full-version-list']).toContain(`"Google Chrome";v="${chrome}"`); // asked for with Accept-CH
  expect(doc['accept-language']).toMatch(/^en-US,en;q=0\.9/);
  const js = await win(app, (w) => w.activePane.view.webContents.executeJavaScript(`(async () => ({
    ua: navigator.userAgent, brands: navigator.userAgentData.brands, json: JSON.stringify(navigator.userAgentData),
    full: (await navigator.userAgentData.getHighEntropyValues(['fullVersionList'])).fullVersionList,
    frameBrands: document.querySelector('iframe').contentWindow.navigator.userAgentData.brands.map((b) => b.brand),
    getter: Object.getOwnPropertyDescriptor(NavigatorUAData.prototype, 'brands').get.toString(),
    app: typeof chrome.app, csi: typeof chrome.csi, loadTimes: typeof chrome.loadTimes, csiStr: chrome.csi.toString(),
    languages: navigator.languages,
  }))()`));
  expect(js.ua).toBe(doc['user-agent']);
  expect(js.brands.map((b) => b.brand)).toEqual(expect.arrayContaining(['Google Chrome', 'Chromium']));
  expect(js.brands.find((b) => b.brand === 'Google Chrome').version).toBe(major);
  expect(js.json).toContain('Google Chrome');
  expect(js.full.find((b) => b.brand === 'Google Chrome').version).toBe(chrome);
  expect(js.frameBrands).toContain('Google Chrome');
  expect(js.getter).toBe('function get brands() { [native code] }');
  expect([js.app, js.csi, js.loadTimes]).toEqual(['object', 'function', 'function']);
  expect(js.csiStr).toBe('function csi() { [native code] }');
  expect(js.languages).not.toContain('c');
  expect(JSON.stringify(js)).not.toMatch(/Electron/);
  await app.close();
  server.close();
});

test('accounts.google.com from an extension popup opens as a normal tab, not inside the popup', async () => {
  const { app } = await launch({ env: { OPAL_NO_EXT_UPDATE: '1' } });
  const id = await app.evaluate(async (_e, dir) => { const w = [...global.__opal.windows][0]; return (await global.__opal.extensions.loadUnpacked(w.profile, dir)).id; }, path.join(__dirname, '../fixtures/hello-ext'));
  await win(app, (w, x, opal) => opal.extensions.activate(w, x, { x: 1200, y: 60 }), id);
  const popup = await waitFor(() => app.windows().find((p) => p.url().startsWith(`chrome-extension://${id}/popup.html`)));
  await popup.evaluate(() => document.getElementById('g').click());
  await waitFor(async () => (await snapshot(app)).space.tabs.some((t) => t.panes[0].url.startsWith('https://accounts.google.com/')));
  expect(popup.url()).toContain('popup.html');
  await app.close();
});
