'use strict';
// Chrome extensions: electron-chrome-extensions gives each profile session the
// chrome.tabs / action / contextMenus / … APIs, and electron-chrome-web-store lets
// extensions be installed (and updated) from the Chrome Web Store. Unpacked
// extensions can be loaded too. Incognito windows have no extensions (the
// library doesn't support in-memory sessions).
//
// Web Store extensions live in <profile>/Extensions; Opal remembers unpacked
// folders and turned-off extensions in the profile data.

const fs = require('fs');
const path = require('path');
const { dialog, nativeImage } = require('electron');

let ECE = null;
let CWS = null;
function libs() {
  if (!ECE) {
    ECE = require('electron-chrome-extensions');
    CWS = require('electron-chrome-web-store');
  }
  return { ElectronChromeExtensions: ECE.ElectronChromeExtensions, CWS };
}

// The manifest's best icon as a data URL (for the menu and the extensions page).
function iconDataUrl(ext, size = 32) {
  const m = ext.manifest || {};
  const action = m.action || m.browser_action || {};
  const pick = (icons) => {
    if (!icons) return null;
    if (typeof icons === 'string') return icons;
    const sizes = Object.keys(icons).map(Number).sort((a, b) => a - b);
    const best = sizes.find((s) => s >= size) || sizes[sizes.length - 1];
    return best ? icons[best] : null;
  };
  const rel = pick(action.default_icon) || pick(m.icons);
  if (!rel) return null;
  const file = path.join(ext.path, rel.replace(/^\//, ''));
  if (!file.startsWith(ext.path)) return null;
  try {
    const img = nativeImage.createFromPath(file);
    return img.isEmpty() ? null : img.resize({ width: size, height: size }).toDataURL();
  } catch { return null; }
}

// Turns __MSG_name__ into the default-locale text.
function localName(ext) {
  const m = ext.manifest || {};
  const name = ext.name || m.name || ext.id;
  const msg = /^__MSG_(.+)__$/.exec(name);
  if (!msg) return name;
  try {
    const loc = m.default_locale || 'en';
    const file = path.join(ext.path, '_locales', loc, 'messages.json');
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = Object.keys(all).find((k) => k.toLowerCase() === msg[1].toLowerCase());
    return key ? all[key].message : name;
  } catch { return name; }
}

function install(opal) {
  const byProfile = new Map(); // profile id -> { ext, ses, ready }

  const extensionsPath = (profile) => path.join(opal.profileDir(profile.id), 'Extensions');
  const disabledSet = (profile) => new Set(profile.data.get('disabledExtensions') || []);
  const unpackedList = (profile) => profile.data.get('unpackedExtensions') || [];
  const sesExt = (ses) => ses.extensions || ses; // Electron 35+ moved these to session.extensions

  function windowForWc(wc) {
    for (const w of opal.windows) { const f = w.findPaneByContents(wc); if (f) return { w, ...f }; }
    return null;
  }

  function setup(profile, ses) {
    if (profile.incognito || byProfile.has(profile.id)) return;
    const { ElectronChromeExtensions, CWS: cws } = libs();
    const ext = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: ses,
      createTab: async (details) => {
        const w = opal.windowsOf(profile).find((x) => x.win.id === details.windowId) || opal.windowsOf(profile)[0]
          || opal.openWindow(profile);
        const tab = w.newTab({ url: details.url, background: details.active === false });
        const view = w.ensureView(tab.panes[0]);
        return [view.webContents, w.win];
      },
      selectTab: (wc) => { const f = windowForWc(wc); if (f) f.w.activateTab(f.tab.id); },
      removeTab: (wc) => { const f = windowForWc(wc); if (f) f.w.closeTab(f.tab.id, { wholeTab: true }); },
      createWindow: async (details) => {
        const url = Array.isArray(details.url) ? details.url[0] : details.url;
        return opal.openWindow(profile, { url }).win;
      },
      removeWindow: (win) => { if (!win.isDestroyed()) win.close(); },
    });
    const entry = { ext, ses, profile, ready: null, popup: null };
    byProfile.set(profile.id, entry);
    ext.on('browser-action-popup-created', (popup) => { entry.popup = popup; });
    entry.ready = (async () => {
      try {
        await cws.installChromeWebStore({
          session: ses,
          extensionsPath: extensionsPath(profile),
          autoUpdate: process.env.OPAL_NO_EXT_UPDATE !== '1',
          beforeInstall: async (d) => {
            const perms = [...(d.manifest.permissions || []), ...(d.manifest.host_permissions || [])].filter((p) => typeof p === 'string');
            const win = opal.focusedWindow()?.win;
            const r = await dialog.showMessageBox(win, {
              type: 'question',
              buttons: ['Add extension', 'Cancel'],
              defaultId: 0,
              cancelId: 1,
              title: 'Add extension',
              message: `Add "${d.localizedName}" to Opal?`,
              detail: perms.length ? `It can:\n${perms.slice(0, 12).map((p) => '• ' + p).join('\n')}` : 'It asks for no special permissions.',
              icon: d.icon && !d.icon.isEmpty() ? d.icon : undefined,
            });
            return { action: r.response === 0 ? 'allow' : 'deny' };
          },
        });
      } catch (err) {
        console.error('[opal] Chrome Web Store setup failed', err);
      }
      for (const dir of unpackedList(profile)) {
        try { await sesExt(ses).loadExtension(dir, { allowFileAccess: true }); } catch (err) { console.warn('[opal] unpacked extension failed', dir, err.message); }
      }
      const off = disabledSet(profile);
      for (const e of sesExt(ses).getAllExtensions()) if (off.has(e.id)) sesExt(ses).removeExtension(e.id);
      for (const w of opal.windowsOf(profile)) w.pushState();
    })();
    sesExt(ses).on?.('extension-loaded', () => { for (const w of opal.windowsOf(profile)) w.pushState(); });
    sesExt(ses).on?.('extension-unloaded', () => { for (const w of opal.windowsOf(profile)) w.pushState(); });
  }

  opal.on('session', (profile, ses) => setup(profile, ses));

  // Tabs must be known to the extension system.
  opal.on('pane-created', (w, pane) => {
    const e = byProfile.get(w.profile.id);
    if (!e || !pane.view) return;
    e.ext.addTab(pane.view.webContents, w.win);
    if (w.activePane === pane) e.ext.selectTab(pane.view.webContents);
  });
  opal.on('tab-activated', (w, pane) => {
    const e = byProfile.get(w.profile.id);
    if (e && pane?.view && !pane.view.webContents.isDestroyed()) e.ext.selectTab(pane.view.webContents);
  });

  // ---------- listing ----------
  function list(profile) {
    const e = byProfile.get(profile.id);
    if (!e) return [];
    const loaded = sesExt(e.ses).getAllExtensions();
    const off = disabledSet(profile);
    const unpacked = new Set(unpackedList(profile));
    const state = e.ext.api?.browserAction?.getState?.() || { actions: [] };
    const out = loaded.map((x) => {
      const action = state.actions.find((a) => a.id === x.id) || {};
      return {
        id: x.id, name: localName(x), version: x.version, enabled: true, unpacked: unpacked.has(x.path),
        path: x.path, icon: iconDataUrl(x), hasAction: !!(x.manifest.action || x.manifest.browser_action),
        title: action.title || localName(x), badge: action.text || '', badgeColor: action.color || '#5a6170',
        optionsUrl: x.manifest.options_ui?.page || x.manifest.options_page ? `${x.url}${x.manifest.options_ui?.page || x.manifest.options_page}` : null,
        description: x.manifest.description && !/^__MSG_/.test(x.manifest.description) ? x.manifest.description : '',
      };
    });
    // Turned-off extensions are not loaded; list them from disk.
    for (const id of off) {
      if (out.some((x) => x.id === id)) continue;
      const dir = findInstalledDir(profile, id);
      let manifest = {};
      try { manifest = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) : {}; } catch { /* unreadable */ }
      const fake = { id, name: manifest.name || id, manifest, path: dir || '' };
      out.push({ id, name: dir ? localName(fake) : id, version: manifest.version || '', enabled: false, unpacked: unpackedList(profile).includes(dir), path: dir, icon: dir ? iconDataUrl(fake) : null, hasAction: false, title: '', badge: '', description: '' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Web Store extensions sit in Extensions/<id>/<version>; unpacked ones are remembered by folder.
  function findInstalledDir(profile, id) {
    const base = path.join(extensionsPath(profile), id);
    try {
      const versions = fs.readdirSync(base).filter((v) => fs.existsSync(path.join(base, v, 'manifest.json'))).sort();
      if (versions.length) return path.join(base, versions[versions.length - 1]);
    } catch { /* not a web store extension */ }
    const ids = profile.data.get('unpackedIds') || {};
    return ids[id] || null;
  }

  // ---------- actions ----------
  async function loadUnpacked(profile, dir) {
    const e = byProfile.get(profile.id);
    if (!e) throw new Error('Extensions are not available in incognito windows');
    await e.ready;
    const ext = await sesExt(e.ses).loadExtension(dir, { allowFileAccess: true });
    const list = unpackedList(profile).filter((d) => d !== dir);
    profile.data.set('unpackedExtensions', [...list, dir]);
    profile.data.set('unpackedIds', { ...(profile.data.get('unpackedIds') || {}), [ext.id]: dir });
    return ext;
  }

  async function setEnabled(profile, id, enabled) {
    const e = byProfile.get(profile.id);
    if (!e) return;
    const off = disabledSet(profile);
    if (enabled) {
      off.delete(id);
      profile.data.set('disabledExtensions', [...off]);
      const dir = findInstalledDir(profile, id);
      if (dir && !sesExt(e.ses).getExtension(id)) await sesExt(e.ses).loadExtension(dir, { allowFileAccess: true });
    } else {
      const x = sesExt(e.ses).getExtension(id);
      if (x && unpackedList(profile).includes(x.path)) profile.data.set('unpackedIds', { ...(profile.data.get('unpackedIds') || {}), [id]: x.path });
      off.add(id);
      profile.data.set('disabledExtensions', [...off]);
      if (x) sesExt(e.ses).removeExtension(id);
    }
  }

  async function remove(profile, id) {
    const e = byProfile.get(profile.id);
    if (!e) return;
    const x = sesExt(e.ses).getExtension(id);
    const dir = x?.path || findInstalledDir(profile, id);
    if (dir && unpackedList(profile).includes(dir)) {
      if (x) sesExt(e.ses).removeExtension(id);
      profile.data.set('unpackedExtensions', unpackedList(profile).filter((d) => d !== dir));
    } else {
      try { await libs().CWS.uninstallExtension(id, { session: e.ses, extensionsPath: extensionsPath(profile) }); } catch (err) {
        if (x) sesExt(e.ses).removeExtension(id);
        console.warn('[opal] uninstall', err.message);
      }
    }
    const ids = { ...(profile.data.get('unpackedIds') || {}) };
    delete ids[id];
    profile.data.set('unpackedIds', ids);
    profile.data.set('disabledExtensions', [...disabledSet(profile)].filter((d) => d !== id));
  }

  async function reload(profile, id) {
    const e = byProfile.get(profile.id);
    const x = e && sesExt(e.ses).getExtension(id);
    if (!x) return;
    const dir = x.path;
    sesExt(e.ses).removeExtension(id);
    await sesExt(e.ses).loadExtension(dir, { allowFileAccess: true });
  }

  // Clicks an extension's toolbar action: opens its popup under the anchor, or sends onClicked.
  function activate(w, id, anchor) {
    const e = byProfile.get(w.profile.id);
    const pane = w.activePane;
    if (!e || !pane?.view) return;
    const a = anchor || w.popoverAnchor || { x: w.win.getContentBounds().width - 200, y: 50 };
    e.ext.api.browserAction.activateClick({
      extensionId: id,
      tabId: pane.view.webContents.id,
      anchorRect: { x: Math.round(a.x - 28), y: Math.round(a.y - 30), width: 28, height: 28 },
      alignment: 'bottom left',
    });
  }

  // Installs straight from the Web Store (no prompt; used by tests and the compat check).
  async function installFromStore(profile, id) {
    const e = byProfile.get(profile.id);
    if (!e) throw new Error('Extensions are not available in incognito windows');
    await e.ready;
    return libs().CWS.installExtension(id, { session: e.ses, extensionsPath: extensionsPath(profile) });
  }

  opal.extensions = { installFromStore, list, loadUnpacked, setEnabled, remove, reload, activate, byProfile, ready: (p) => byProfile.get(p.id)?.ready };
  opal.extensionsList = () => { const w = opal.focusedWindow(); return w ? list(w.profile) : []; };

  // Context menu items added by extensions (chrome.contextMenus).
  opal.contextMenuExtras = (w, pane, params) => {
    const e = byProfile.get(w.profile.id);
    if (!e) return [];
    try { return e.ext.getContextMenuItems(pane.view.webContents, params); } catch { return []; }
  };

  opal.popoverProviders.extensions = (w) => ({
    incognito: w.incognito,
    items: w.incognito ? [] : list(w.profile).filter((x) => x.enabled),
  });

  opal.stateProviders.push((w) => ({ extensionsCount: w.incognito ? 0 : (byProfile.get(w.profile.id) ? sesExt(byProfile.get(w.profile.id).ses).getAllExtensions().length : 0) }));

  const pageProfile = (ctx) => ctx.window?.profile || opal.focusedWindow()?.profile;
  const after = (p) => { for (const w of opal.windowsOf(p)) w.pushState(); return list(p); };

  opal.addCommands({
    'extension-action': (w, a) => { opal.runCommand(w, 'close-overlay', {}); activate(w, a.id, a.x !== undefined ? { x: a.x, y: a.y } : null); },
    'extension-options': (w, a) => {
      const x = list(w.profile).find((e) => e.id === a.id);
      if (x?.optionsUrl) w.newTab({ url: x.optionsUrl });
    },
    'open-web-store': (w) => w.newTab({ url: 'https://chromewebstore.google.com/category/extensions' }),
  });

  opal.addPageCalls({
    'extensions.list': async (_a, ctx) => {
      const p = pageProfile(ctx);
      if (!p || p.incognito) return { items: [], incognito: true };
      await byProfile.get(p.id)?.ready;
      return { items: list(p), incognito: false };
    },
    'extensions.load': async (_a, ctx) => {
      const p = pageProfile(ctx);
      const r = await dialog.showOpenDialog(ctx.window?.win, { title: 'Load unpacked extension', properties: ['openDirectory'], buttonLabel: 'Load extension' });
      if (r.canceled || !r.filePaths[0]) return { items: list(p) };
      try { await loadUnpacked(p, r.filePaths[0]); } catch (err) { return { items: list(p), error: err.message }; }
      return { items: after(p) };
    },
    'extensions.remove': async (a, ctx) => { const p = pageProfile(ctx); await remove(p, a.id); return { items: after(p) }; },
    'extensions.reload': async (a, ctx) => { const p = pageProfile(ctx); await reload(p, a.id); return { items: after(p) }; },
    'extensions.setEnabled': async (a, ctx) => { const p = pageProfile(ctx); await setEnabled(p, a.id, a.enabled); return { items: after(p) }; },
    'extensions.options': (a, ctx) => { if (ctx.window) opal.runCommand(ctx.window, 'extension-options', { id: a.id }); return true; },
    'extensions.webStore': (_a, ctx) => { if (ctx.window) opal.runCommand(ctx.window, 'open-web-store', {}); return true; },
    'extensions.update': async (_a, ctx) => {
      const p = pageProfile(ctx);
      const e = byProfile.get(p.id);
      if (e) { try { await libs().CWS.updateExtensions(e.ses); } catch (err) { return { items: list(p), error: err.message }; } }
      return { items: after(p) };
    },
  });
}

module.exports = { install, iconDataUrl, localName };
