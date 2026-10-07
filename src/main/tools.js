'use strict';
// Page tools: find in page, print, save as PDF, save page as, copy link.

const fs = require('fs');
const path = require('path');
const { app, dialog, clipboard } = require('electron');

function safeName(title, ext) {
  const base = (title || 'page').replace(/[/\\?%*:|"<>\0]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'page';
  return base + ext;
}

function install(opal) {
  const lastFind = new WeakMap(); // window -> text

  function find(w, text, { forward = true, next = false } = {}) {
    w.withPane((wc) => {
      if (!text) { wc.stopFindInPage('clearSelection'); w.findResult = null; w.send('find', { result: { active: 0, total: 0 } }); return; }
      wc.findInPage(text, { forward, findNext: !next });
    });
  }

  async function savePdf(w, filePath) {
    const pane = w.activePane;
    if (!pane?.view) return null;
    const data = await pane.view.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    await fs.promises.writeFile(filePath, data);
    return filePath;
  }

  opal.tools = { savePdf, find };


  opal.addCommands({
    find: (w) => {
      w.findOpen = true;
      w.send('find', { open: true, text: lastFind.get(w) || '' });
      w.pushState();
    },
    'find-query': (w, a) => {
      lastFind.set(w, a.text);
      w.findText = a.text;
      w.findRetried = false;
      find(w, a.text, { forward: a.forward !== false, next: !!a.findNext });
    },
    'find-next': (w) => {
      const t = lastFind.get(w);
      if (!w.findOpen) { opal.runCommand(w, 'find', {}); return; }
      if (t) find(w, t, { forward: true, next: true });
    },
    'find-previous': (w) => {
      const t = lastFind.get(w);
      if (w.findOpen && t) find(w, t, { forward: false, next: true });
    },
    'find-close': (w) => {
      w.findOpen = false;
      w.findText = '';
      w.findResult = null;
      w.withPane((wc) => { wc.stopFindInPage('keepSelection'); wc.focus(); });
      w.send('find', { open: false });
      w.pushState();
    },
    print: (w) => w.withPane((wc) => wc.print({ silent: false, printBackground: true }, () => {})),
    'save-pdf': async (w) => {
      const pane = w.activePane;
      if (!pane?.view) return;
      const res = await dialog.showSaveDialog(w.win, {
        title: 'Save as PDF',
        defaultPath: path.join(app.getPath('downloads'), safeName(pane.title, '.pdf')),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return;
      try {
        await savePdf(w, res.filePath);
        w.send('toast', { text: 'Saved ' + path.basename(res.filePath) });
      } catch (err) {
        w.send('toast', { text: 'Could not save PDF: ' + err.message });
      }
    },
    'save-page': async (w) => {
      const pane = w.activePane;
      if (!pane?.view || !/^https?:|^file:/.test(pane.url)) return;
      const res = await dialog.showSaveDialog(w.win, {
        title: 'Save page as',
        defaultPath: path.join(app.getPath('downloads'), safeName(pane.title, '.html')),
        filters: [
          { name: 'Web page, complete', extensions: ['html'] },
          { name: 'Web page, single file (MHTML)', extensions: ['mhtml'] },
        ],
      });
      if (res.canceled || !res.filePath) return;
      const type = res.filePath.endsWith('.mhtml') ? 'MHTML' : 'HTMLComplete';
      try {
        await pane.view.webContents.savePage(res.filePath, type);
        w.send('toast', { text: 'Saved ' + path.basename(res.filePath) });
      } catch (err) {
        w.send('toast', { text: 'Could not save page: ' + err.message });
      }
    },
    'copy-link': (w) => {
      const p = w.activePane;
      if (!p) return;
      clipboard.writeText(p.errorFor?.url || p.url);
      w.send('toast', { text: 'Link copied' });
    },
  });
}

module.exports = { install, safeName };
