#!/usr/bin/env node
'use strict';
// README screenshots. Always a fresh temporary profile (deleted on exit) with demo content
// only: public pages, Opal's built-in demo spaces and bookmarks, and an Opal AI answer from
// the demo backend (scripts/mock-llm.js in demo mode). Never a real profile.
// Usage: xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/readme-screenshots.js
const fs = require('fs');
const path = require('path');
const { launch, win, waitFor, aiPage } = require('../test/e2e/helpers');
const { shot } = require('./screenshot');
const mockLlm = require('./mock-llm');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const llm = await mockLlm.start({ demo: true, delay: 2 });
  const { app, ui } = await launch({ env: { OPAL_OLLAMA_URL: llm.url, OPAL_NO_EXT_UPDATE: '1' } });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  const settle = (ms = 4000) => new Promise((r) => setTimeout(r, ms));

  // 1. A page with tabs and Opal AI summarizing it.
  await win(app, (w) => w.navigate('https://en.wikipedia.org/wiki/Opal'));
  for (const url of ['https://github.com/electron/electron', 'https://developer.mozilla.org/en-US/', 'https://www.openstreetmap.org/']) {
    await win(app, (w, u) => { w.newTab({ url: u }); }, url);
    await settle(5000);
  }
  await win(app, (w) => { w.activateTab(w.current.tabs[0].id); });
  await settle(8000);
  const ai = await aiPage(app);
  await ai.click('[data-action=summarize]');
  try {
    await waitFor(() => ai.locator('#status-text').textContent().then((t) => /Polished/.test(t)), { timeout: 30000 });
  } catch (err) {
    console.log('panel:', (await ai.locator('#messages').innerText()).slice(0, 400), '| status:', await ai.locator('#status-text').textContent(), '| llm log:', llm.log.map((l) => l.path).join(','));
    throw err;
  }
  await settle(1500);
  await shot(app, ui, path.join(OUT, 'opal.png'));

  // 2. Split view with two public pages.
  await win(app, (w) => { w.newTab({ url: 'https://en.wikipedia.org/wiki/Web_browser' }); });
  await settle(3000);
  await win(app, (w) => { w.split(w.activeTab.id, 'https://developer.mozilla.org/en-US/docs/Web/HTML'); });
  await app.evaluate(() => { global.__opal.ai.set({ open: false }); });
  await settle(12000);
  await shot(app, ui, path.join(OUT, 'split-view.png'));

  // 3. New tab page, and 4. the Opal AI settings.
  await win(app, (w) => { w.newTab({ url: 'opal://newtab' }); });
  await settle(2500);
  await shot(app, ui, path.join(OUT, 'new-tab.png'));
  await win(app, (w) => w.navigate('opal://settings/#ai'));
  await settle(3500);
  await shot(app, ui, path.join(OUT, 'settings-ai.png'));

  await app.close();
  await llm.close();
  for (const f of fs.readdirSync(OUT)) console.log('saved', path.join('docs/screenshots', f), Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' KB');
}

main().catch((e) => { console.error(e); process.exit(1); });
