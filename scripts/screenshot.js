'use strict';
// Takes a screenshot of the whole Opal window (UI plus web content views),
// composited in the UI page. Usage: xvfb-run -a node scripts/screenshot.js out.png [url]
const fs = require('fs');
const path = require('path');
const { launch } = require('../test/e2e/helpers');

async function shot(app, ui, out) {
  const parts = await app.evaluate(async () => {
    const w = [...global.__opal.windows][0];
    const res = [];
    const ui = await w.ui.capturePage();
    res.push({ png: ui.toDataURL(), x: 0, y: 0 });
    for (const v of w.win.contentView.children) {
      if (!v.getVisible || v.getVisible()) {
        const b = v.getBounds();
        const img = await v.webContents.capturePage();
        res.push({ png: img.toDataURL(), ...b });
      }
    }
    return res;
  });
  const data = await ui.evaluate(async (parts) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const base = await load(parts[0].png);
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const g = c.getContext('2d');
    const scale = base.width / window.innerWidth;
    g.drawImage(base, 0, 0);
    for (const p of parts.slice(1)) {
      const img = await load(p.png);
      g.save();
      g.beginPath();
      g.roundRect(p.x * scale, p.y * scale, p.width * scale, p.height * scale, 12 * scale);
      g.clip();
      g.drawImage(img, p.x * scale, p.y * scale, p.width * scale, p.height * scale);
      g.restore();
    }
    return c.toDataURL('image/png');
  }, parts);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
}

async function main() {
  const out = path.resolve(process.argv[2] || 'screenshot.png');
  const url = process.argv[3];
  const { app, ui } = await launch();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1360, 860); });
  if (url) await app.evaluate((_e, u) => [...global.__opal.windows][0].navigate(u), url);
  await new Promise((r) => setTimeout(r, Number(process.env.SHOT_WAIT || 2500)));
  await shot(app, ui, out);
  await app.close();
  console.log('saved', out);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { shot };
