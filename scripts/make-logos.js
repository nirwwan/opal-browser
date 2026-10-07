'use strict';
// Renders build/opal-logo-light.png and build/opal-logo-dark.png: the app icon plus the
// word "opal" in the bundled Bricolage Grotesque (weight 500), on white and on #141821.
// Usage: xvfb-run -a npx electron scripts/make-logos.js
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const W = 1400;
const H = 480;

function html(bg, fg) {
  const font = 'file://' + path.join(ROOT, 'assets/fonts/BricolageGrotesque-latin.woff2');
  const icon = 'file://' + path.join(ROOT, 'build/icons/1024x1024.png');
  return `<!doctype html><html><head><style>
    @font-face { font-family: 'Bricolage Grotesque'; font-weight: 200 800; font-stretch: 75% 100%; src: url('${font}') format('woff2-variations'); }
    html, body { margin: 0; width: ${W}px; height: ${H}px; background: ${bg}; overflow: hidden; }
    .row { display: flex; align-items: center; justify-content: center; gap: 44px; height: 100%; }
    img { width: 300px; height: 300px; }
    span { font: 500 260px/1 'Bricolage Grotesque'; color: ${fg}; letter-spacing: -0.02em; transform: translateY(-14px); }
  </style></head><body><div class="row"><img src="${icon}"><span>opal</span></div></body></html>`;
}

async function render(win, bg, fg, out) {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html(bg, fg)));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => document.fonts.check("500 260px \\"Bricolage Grotesque\\""))').then((ok) => { if (!ok) throw new Error('font not loaded'); });
  await new Promise((r) => setTimeout(r, 1200));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.resize({ width: W, height: H }).toPNG());
  console.log('wrote', path.relative(ROOT, out));
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: true, frame: false, useContentSize: true, webPreferences: { webSecurity: false } });
  try {
    await render(win, '#ffffff', '#141821', path.join(ROOT, 'build/opal-logo-light.png'));
    await render(win, '#141821', '#ffffff', path.join(ROOT, 'build/opal-logo-dark.png'));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  app.quit();
});
