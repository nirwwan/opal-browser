'use strict';
// Real Chrome Web Store installs of popular extensions (needs the internet).
// Opt-in: OPAL_EXT_COMPAT=1 npm run test:e2e -- test/e2e/compat.spec.js
// Prints a table used for the works / doesn't work list in PROGRESS.md.
const { test } = require('@playwright/test');
const { launch, startServer, win, waitFor } = require('./helpers');

const EXTS = [
  ['uBlock Origin Lite', 'ddkjiahejlhfcafbddmgiahcphecmpfh'],
  ['Dark Reader', 'eimadpbcbfnmbkopoojfekhnkhdbieeh'],
  ['Bitwarden', 'nngceckbapebfimnlniiiahkandclblb'],
  ['1Password', 'aeblfdkhhhdcdjpifhhbdiojplfjncoa'],
  ['React Developer Tools', 'fmkadmapgofadopljbjfkapdkoienihi'],
  ['Vimium', 'dbepggeogbaibhgnhhndojpepiihcmeb'],
  ['Grammarly', 'kbfnbcaeplbcioakkpcpgfkobkghlhen'],
  ['Google Translate', 'aapbdbdomjkkjkaonfhkkikfgjllcleb'],
  ['SponsorBlock', 'mnjggcdmjocbbbhaepdhchncahnbgone'],
  ['Return YouTube Dislike', 'gebbhagfogifgggkldgodflihgfeippi'],
  ['Privacy Badger', 'pkehgijcmpdhfbdbbnkijodmdjhbjlgp'],
  ['Wappalyzer', 'gppongmhjkpfnbhagpmjfkannfbllamg'],
];

test.skip(process.env.OPAL_EXT_COMPAT !== '1', 'opt-in: needs the internet');
test.setTimeout(15 * 60 * 1000);

test('popular extensions from the Chrome Web Store', async () => {
  const server = await startServer();
  const { app } = await launch({ env: { OPAL_NO_EXT_UPDATE: '1' } });
  const rows = [];
  await app.evaluate(async () => { const w = [...global.__opal.windows][0]; await global.__opal.extensions.ready(w.profile); });
  for (const [name, id] of EXTS) {
    const r = { name, id, install: '', mv: '', bg: '', popup: '', note: '' };
    rows.push(r);
    try {
      const info = await app.evaluate(async (_e, extId) => {
        const w = [...global.__opal.windows][0];
        const x = await global.__opal.extensions.installFromStore(w.profile, extId);
        return { mv: x.manifest.manifest_version, popup: !!(x.manifest.action?.default_popup || x.manifest.browser_action?.default_popup), sw: !!x.manifest.background?.service_worker, bgPage: !!(x.manifest.background?.scripts || x.manifest.background?.page) };
      }, id);
      r.install = 'ok';
      r.mv = 'MV' + info.mv;
      await new Promise((res) => setTimeout(res, 2500));
      r.bg = info.sw ? (await app.evaluate((_e, extId) => { const w = [...global.__opal.windows][0]; return Object.values(w.profile.ses.serviceWorkers.getAllRunning()).some((s) => s.scope.includes(extId)); }, id) ? 'worker running' : 'worker not running')
        : info.bgPage ? 'background page' : 'none';
      if (info.popup) {
        await win(app, (w, u) => w.navigate(u), `${server.url}/page?title=Compat`);
        await app.evaluate((_e, extId) => { const w = [...global.__opal.windows][0]; global.__opal.extensions.activate(w, extId, { x: 1200, y: 60 }); }, id);
        const page = await waitFor(() => app.windows().find((p) => p.url().startsWith(`chrome-extension://${id}/`)), { timeout: 15000 }).catch(() => null);
        if (!page) r.popup = 'did not open';
        else {
          await new Promise((res) => setTimeout(res, 3000));
          const len = await page.evaluate(() => document.body ? document.body.innerText.trim().length : 0).catch(() => -1);
          r.popup = len > 20 ? `ok (${len} chars)` : `empty (${len})`;
          await page.close().catch(() => {});
        }
      } else r.popup = 'no popup';
    } catch (err) {
      r.install = r.install || 'failed';
      r.note = String(err.message || err).split('\n')[0].slice(0, 120);
    }
  }
  // Specific checks on a local page.
  await win(app, (w, u) => w.navigate(u), `${server.url}/article`);
  await new Promise((res) => setTimeout(res, 4000));
  const dom = await win(app, (w) => w.activePane.view.webContents.executeJavaScript(`({
    darkreader: !!document.querySelector('style.darkreader, meta[name=darkreader]'),
    vimium: !!document.querySelector('[class*=vimium], vimium-hint, div.vimium-reset') || [...document.documentElement.children].some((e) => /vimium/i.test(e.className || e.id || '')),
    grammarly: !!document.querySelector('grammarly-desktop-integration, [data-grammarly-shadow-root]'),
  })`));
  const block = await win(app, (w) => w.activePane.view.webContents.executeJavaScript(`fetch('https://googleads.g.doubleclick.net/pagead/id', { mode: 'no-cors' }).then(() => 'loaded', () => 'blocked')`));
  console.log('DOM checks', JSON.stringify(dom), 'ad request:', block);
  console.log('\nRESULTS');
  for (const r of rows) console.log([r.name, r.mv, r.install, r.bg, r.popup, r.note].join(' | '));
  await app.close();
  server.close();
});
