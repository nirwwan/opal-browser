'use strict';
// Desktop integration: "Make Opal the default browser" through xdg-settings.
// Packages (.deb/.rpm) install opal.desktop; the AppImage and the .tar.gz don't, so for
// them Opal writes its own entry to $XDG_DATA_HOME/applications when asked to.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { app } = require('electron');

const DESKTOP_ID = 'opal.desktop';

const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const dataDirs = () => [dataHome(), ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')].filter(Boolean);

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim(), missing: err?.code === 'ENOENT' }));
  });
}

function installedEntry() {
  for (const d of dataDirs()) {
    const f = path.join(d, 'applications', DESKTOP_ID);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// The launcher to put in Exec=: the AppImage file, the packaged launcher, or nothing in dev.
function launcherPath() {
  if (process.env.APPIMAGE) return process.env.APPIMAGE;
  if (!app.isPackaged) return null;
  const dir = path.dirname(process.execPath);
  const wrapper = path.join(dir, 'opal');
  return fs.existsSync(wrapper) ? wrapper : process.execPath;
}

// Writes a user-level opal.desktop (for AppImage / tar.gz installs).
function writeUserEntry(opal) {
  const exec = launcherPath();
  if (!exec) throw new Error('Only the installed app can become the default browser');
  const icon = opal.iconPath;
  const iconDir = path.join(dataHome(), 'icons', 'hicolor', '256x256', 'apps');
  let iconName = 'opal';
  try {
    fs.mkdirSync(iconDir, { recursive: true });
    if (icon) fs.copyFileSync(require('./icons').iconPath(256) || icon, path.join(iconDir, 'opal.png'));
  } catch { iconName = icon || 'web-browser'; }
  const q = (s) => (/[\s"'\\$`]/.test(s) ? `"${s.replace(/(["\\$`])/g, '\\$1')}"` : s);
  const entry = [
    '[Desktop Entry]', 'Name=Opal', 'GenericName=Web Browser', 'Comment=Browse the web with Opal',
    `Exec=${q(exec)} %U`, `Icon=${iconName}`, 'Terminal=false', 'Type=Application', 'StartupWMClass=opal',
    'Categories=Network;WebBrowser;', 'MimeType=text/html;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;', '',
  ].join('\n');
  const dir = path.join(dataHome(), 'applications');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, DESKTOP_ID), entry, { mode: 0o644 });
  run('update-desktop-database', [dir]);
}

function install(opal) {
  async function defaultStatus() {
    if (process.platform !== 'linux') return { supported: false, isDefault: false, reason: 'Only on Linux' };
    if (process.env.FLATPAK_ID) return { supported: false, isDefault: false, reason: "Set the default browser in your system settings (Flatpak apps can't change it themselves)." };
    const r = await run('xdg-settings', ['get', 'default-web-browser']);
    if (r.missing) return { supported: false, isDefault: false, reason: 'Needs xdg-settings (package xdg-utils).' };
    const canInstall = !!installedEntry() || !!launcherPath();
    return { supported: canInstall, isDefault: r.out === DESKTOP_ID, current: r.out, reason: canInstall ? '' : 'Only the installed app can become the default browser.' };
  }

  async function makeDefault() {
    try {
      if (!installedEntry()) writeUserEntry(opal);
      const r = await run('xdg-settings', ['set', 'default-web-browser', DESKTOP_ID]);
      if (!r.ok) return { ok: false, error: r.err || 'xdg-settings failed' };
      for (const mime of ['x-scheme-handler/http', 'x-scheme-handler/https', 'text/html']) await run('xdg-mime', ['default', DESKTOP_ID, mime]);
      const st = await defaultStatus();
      return { ok: st.isDefault, error: st.isDefault ? null : `Your desktop still reports ${st.current || 'another browser'} as the default` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  opal.addPageCalls({
    'browser.defaultStatus': () => defaultStatus(),
    'browser.makeDefault': () => makeDefault(),
  });
}

module.exports = { install, DESKTOP_ID, launcherPath };
