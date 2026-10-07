'use strict';
// Auto-updates for the AppImage, from GitHub Releases (electron-updater reads the
// latest-linux*.yml files attached to each release). Packages from .deb/.rpm are updated by
// the system package manager instead, and the .tar.gz by hand, so nothing runs for them.

const { app } = require('electron');

const SIX_HOURS = 6 * 60 * 60 * 1000;

function install(opal) {
  const enabled = () => !!process.env.APPIMAGE && app.isPackaged && opal.settings.get('autoUpdate') !== false;
  const state = { status: 'idle', version: null, error: null };

  opal.on('init', () => {
    if (!enabled()) return;
    let autoUpdater;
    try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    const toast = (text) => { const w = opal.focusedWindow(); if (w) w.send('toast', { text }); };
    autoUpdater.on('update-available', (i) => { state.status = 'downloading'; state.version = i.version; });
    autoUpdater.on('update-not-available', () => { state.status = 'current'; });
    autoUpdater.on('update-downloaded', (i) => {
      state.status = 'ready';
      state.version = i.version;
      toast(`Opal ${i.version} is ready. It installs when you quit Opal.`);
    });
    autoUpdater.on('error', (err) => { state.status = 'error'; state.error = String(err?.message || err).split('\n')[0]; });
    const check = () => autoUpdater.checkForUpdates().catch(() => {});
    setTimeout(check, 15000).unref?.();
    setInterval(check, SIX_HOURS).unref?.();
  });

  opal.addPageCalls({
    'update.status': () => ({ supported: !!process.env.APPIMAGE && app.isPackaged, enabled: enabled(), ...state }),
  });
}

module.exports = { install };
