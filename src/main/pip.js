'use strict';
// Picture in picture: the tab's own view moves into a small floating,
// always-on-top window and the page's largest video is styled to fill it.
// Closing the mini player (or "Back to tab") moves the view back.

const path = require('path');
const { BrowserWindow } = require('electron');

const UI_PRELOAD = path.join(__dirname, '../preload/ui.js');
const BAR = 30;

const PIP_CSS = `
  .__opal_pip_video { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
    max-width: none !important; max-height: none !important; z-index: 2147483647 !important; background: #000 !important;
    object-fit: contain !important; margin: 0 !important; transform: none !important; }
  html.__opal_pip, html.__opal_pip body { overflow: hidden !important; }`;

// Finds the largest video, marks it and turns on its controls. Returns true if found.
const MARK_VIDEO = `(() => {
  const vids = [...document.querySelectorAll('video')];
  if (!vids.length) return false;
  const v = vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
  v.classList.add('__opal_pip_video');
  v.dataset.opalHadControls = v.controls ? '1' : '0';
  v.controls = true;
  document.documentElement.classList.add('__opal_pip');
  return true;
})()`;

const UNMARK_VIDEO = `(() => {
  for (const v of document.querySelectorAll('.__opal_pip_video')) {
    v.classList.remove('__opal_pip_video');
    v.controls = v.dataset.opalHadControls === '1';
  }
  document.documentElement.classList.remove('__opal_pip');
})()`;

function install(opal) {
  async function open(w) {
    const pane = w.activePane;
    if (!pane?.view || w.pip) return;
    const wc = pane.view.webContents;
    let found = false;
    try { found = await wc.executeJavaScript(MARK_VIDEO, true); } catch { found = false; }
    if (!found) { w.send('toast', { text: 'No video on this page' }); return; }
    const cssKey = await wc.insertCSS(PIP_CSS);
    const [mx, my] = w.win.getPosition();
    const [mw, mh] = w.win.getSize();
    const mini = new BrowserWindow({
      width: 480,
      height: 270 + BAR,
      x: mx + mw - 500,
      y: my + mh - 320,
      minWidth: 260,
      minHeight: 150 + BAR,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: 'Opal picture in picture',
      backgroundColor: '#000000',
      show: false,
      webPreferences: { preload: UI_PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    mini.setAlwaysOnTop(true, 'floating');
    mini.loadFile(path.join(__dirname, '../renderer/mini.html'));
    w.pip = { pane, mini, cssKey };
    pane.inPip = true;
    w.detach(pane.view);
    if (pane.view.setBorderRadius) pane.view.setBorderRadius(0);
    mini.contentView.addChildView(pane.view);
    const fit = () => {
      const [cw, ch] = mini.getContentSize();
      pane.view.setBounds({ x: 0, y: BAR, width: cw, height: Math.max(0, ch - BAR) });
    };
    fit();
    mini.on('resize', fit);
    mini.once('ready-to-show', () => { if (!opal.testHidden) mini.showInactive(); });
    mini.webContents.once('did-finish-load', () => mini.webContents.send('ev:state', { title: pane.title }));
    mini.on('closed', () => restore(w));
    w.layout();
    w.pushState();
  }

  function restore(w) {
    const pip = w.pip;
    if (!pip) return;
    w.pip = null;
    const { pane, mini } = pip;
    pane.inPip = false;
    if (pane.view && !pane.view.webContents.isDestroyed()) {
      try { if (!mini.isDestroyed()) mini.contentView.removeChildView(pane.view); } catch { /* window gone */ }
      pane.view.webContents.removeInsertedCSS(pip.cssKey).catch(() => {});
      pane.view.webContents.executeJavaScript(UNMARK_VIDEO, true).catch(() => {});
      if (!w.win.isDestroyed()) { w.layout(); w.pushState(); }
    }
    if (!mini.isDestroyed()) mini.close();
  }

  opal.pip = { open, restore };

  opal.on('window-closed', (w) => { if (w.pip && !w.pip.mini.isDestroyed()) w.pip.mini.close(); });

  opal.addCommands({
    pip: (w) => (w.pip ? restore(w) : open(w)),
    'pip-return': (w) => {
      const tabId = w.pip?.pane.tab.id;
      restore(w);
      if (tabId) w.activateTab(tabId);
      w.win.focus();
    },
  });
}

module.exports = { install };
