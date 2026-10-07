'use strict';
// Opal main process: app lifecycle, profiles, windows, IPC and commands.

const path = require('path');
const EventEmitter = require('events');
const { app, protocol, session, ipcMain, BrowserWindow, nativeTheme } = require('electron');
const identity = require('./identity');
const { DEFAULT_ENGINE, ENGINES, engineOf } = require('../shared/omnibox');
const { UI_COMMANDS, PAGE_CALLS, validate, rect } = require('./schema');
const { JsonStore } = require('./store');
const { Profile, newId } = require('./profile');
const { OpalWindow, NEW_TAB_URL } = require('./opal-window');
const { registerOpalProtocol } = require('./protocol');

// ---- identity and paths (before "ready") ----
app.setName('Opal');
if (process.env.OPAL_USER_DATA) app.setPath('userData', process.env.OPAL_USER_DATA);
else app.setPath('userData', path.join(app.getPath('appData'), 'Opal'));
if (process.platform === 'linux') app.setDesktopName('opal.desktop');
// Wayland when available, X11 otherwise (packaged builds also pass this from the launcher).
if (process.platform === 'linux' && !app.commandLine.hasSwitch('ozone-platform') && !app.commandLine.hasSwitch('ozone-platform-hint')) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
} // the .deb installs /usr/share/applications/opal.desktop
identity.early(); // Chrome user agent; no automation switches
nativeTheme.themeSource = 'light';

protocol.registerSchemesAsPrivileged([
  { scheme: 'opal', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const DEFAULT_SETTINGS = {
  homePage: NEW_TAB_URL,
  searchEngine: DEFAULT_ENGINE,
  restoreOnStartup: true,
  askWhereToSave: false,
  downloadDir: '',
  onyxUrl: 'http://127.0.0.1:7777',
  onyxTokenFile: '',
  translateTarget: 'English',
  ai: { open: true, collapsed: false, width: 400, provider: 'claude' },
};

class OpalApp extends EventEmitter {
  constructor() {
    super();
    this.windows = new Set();
    this.profiles = new Map();
    this.iconPath = require('./icons').iconPath(256) || undefined;
    this.testHidden = process.env.OPAL_HIDDEN === '1';
    this.quitting = false;
    this.incognitoCount = 0;
  }

  init() {
    const dir = app.getPath('userData');
    this.settings = new JsonStore(path.join(dir, 'settings.json'), { ...DEFAULT_SETTINGS });
    this.meta = new JsonStore(path.join(dir, 'profiles.json'), {
      profiles: [{ id: 'default', name: 'Personal', color: '#2a4bc7' }],
      lastProfileId: 'default',
    });
    this.registerIpc();
    this.emit('init');
  }

  // The selected search engine id (Google unless changed in settings).
  engine() {
    const e = this.settings.get('searchEngine');
    return ENGINES[e] ? e : DEFAULT_ENGINE;
  }

  // ---------- profiles ----------
  profileDir(id) {
    return path.join(app.getPath('userData'), 'profiles', id);
  }

  getProfile(id) {
    if (this.profiles.has(id)) return this.profiles.get(id);
    const meta = this.meta.get('profiles').find((p) => p.id === id);
    if (!meta) return null;
    const profile = new Profile(meta, this.profileDir(id));
    this.setupSession(profile);
    this.profiles.set(id, profile);
    return profile;
  }

  setupSession(profile) {
    const ses = session.fromPartition(profile.partition);
    profile.ses = ses;
    registerOpalProtocol(ses);
    this.emit('session', profile, ses);
  }

  createProfile(name, color) {
    const meta = { id: newId('p'), name: name.trim() || 'Profile', color };
    this.meta.set('profiles', [...this.meta.get('profiles'), meta]);
    return meta;
  }

  // ---------- windows ----------
  openWindow(profile, { url, saved } = {}) {
    const w = new OpalWindow(this, profile, { saved, incognito: profile.incognito });
    this.windows.add(w);
    if (url) w.newTab({ url });
    if (!profile.incognito) this.meta.set('lastProfileId', profile.id);
    this.saveSession(profile);
    return w;
  }

  // All incognito windows share one in-memory profile (like Chrome); it is
  // thrown away when the last incognito window closes.
  openIncognito({ url } = {}) {
    let profile = [...this.profiles.values()].find((p) => p.incognito);
    if (!profile) {
      const id = 'incognito' + (++this.incognitoCount);
      profile = new Profile({ id, name: 'Incognito', color: '#3d4452' }, this.profileDir(id), { incognito: true });
      this.setupSession(profile);
      this.profiles.set(id, profile);
    }
    return this.openWindow(profile, { url });
  }

  windowsOf(profile) {
    return [...this.windows].filter((w) => w.profile === profile);
  }

  beforeWindowClose(w) {
    const others = this.windowsOf(w.profile).filter((x) => x !== w);
    if (w.profile.incognito) return;
    // Remember only the last window of a profile (unless the whole app is quitting).
    if (!this.quitting && others.length) {
      this.windows.delete(w);
      this.saveSession(w.profile);
    } else {
      this.saveSession(w.profile, true);
    }
  }

  windowClosed(w) {
    this.windows.delete(w);
    const profile = w.profile;
    if (profile.incognito && !this.windowsOf(profile).length) {
      // Incognito data lives only in memory; clear it as soon as its last window closes.
      profile.ses.clearStorageData().catch(() => {});
      profile.ses.clearCache().catch(() => {});
      this.profiles.delete(profile.id);
    }
    this.emit('window-closed', w);
  }

  saveSession(profile, now = false) {
    if (profile.incognito) return;
    const wins = this.windowsOf(profile).filter((w) => !w.win.isDestroyed());
    if (!wins.length) return;
    profile.session.set('windows', wins.map((w) => w.serialize()));
    profile.session.set('savedAt', Date.now());
    if (now) profile.session.flush();
  }

  windowFor(wc) {
    for (const w of this.windows) {
      if (w.ui === wc || w.overlayView?.webContents === wc || w.aiView?.webContents === wc) return w;
      if (w.pip && !w.pip.mini.isDestroyed() && w.pip.mini.webContents === wc) return w;
      if (w.findPaneByContents(wc)) return w;
    }
    return null;
  }

  focusedWindow() {
    const bw = BrowserWindow.getFocusedWindow();
    return [...this.windows].find((w) => w.win === bw) || [...this.windows].pop() || null;
  }

  // ---------- IPC ----------
  registerIpc() {
    ipcMain.on('ui:cmd', (e, name, args) => {
      const w = this.windowFor(e.sender);
      if (!w || !this.isUiSender(w, e.sender)) return;
      if (!validate(UI_COMMANDS, name, args)) {
        console.warn('[opal] rejected ui command', name);
        return;
      }
      this.runCommand(w, name, args || {}, e.sender);
    });
    ipcMain.on('ui:layout', (e, rects) => {
      const w = this.windowFor(e.sender);
      if (!w || e.sender !== w.ui || !rects || !rect(rects.content)) return;
      w.setLayout(rects);
      this.emit('ui-layout', w, rects);
    });
    ipcMain.on('ui:ready', (e) => {
      const w = this.windowFor(e.sender);
      if (w) { w.pushState(); this.emit('ui-ready', w, e.sender); }
    });
    ipcMain.handle('page:call', async (e, name, args) => {
      const frameUrl = e.senderFrame?.url || '';
      if (!frameUrl.startsWith('opal://')) throw new Error('Not allowed');
      if (!validate(PAGE_CALLS, name, args)) throw new Error('Invalid call: ' + name);
      const w = this.windowFor(e.sender);
      const found = w?.findPaneByContents(e.sender);
      const handler = this.pageCalls[name];
      if (!handler) throw new Error('Not available: ' + name);
      return handler.call(this, args || {}, { window: w, pane: found?.pane, sender: e.sender, url: frameUrl });
    });
  }

  isUiSender(w, wc) {
    return wc === w.ui || wc === w.overlayView?.webContents || wc === w.aiView?.webContents
      || (w.pip && !w.pip.mini.isDestroyed() && w.pip.mini.webContents === wc);
  }

  // Commands from buttons, menus and shortcuts. Feature modules add more with addCommands().
  runCommand(w, name, args, sender) {
    const fn = this.commands[name];
    if (fn) {
      try { fn.call(this, w, args, sender); } catch (err) { console.error('[opal] command failed', name, err); }
    } else {
      console.warn('[opal] command not implemented yet:', name);
    }
  }

  addCommands(table) {
    Object.assign(this.commands, table);
  }

  addPageCalls(table) {
    Object.assign(this.pageCalls, table);
  }

  // Escape: close find, close overlay, stop loading. Returns true if handled.
  handleEscape(w, pane) {
    const handlers = this.listeners('escape');
    for (const h of handlers) if (h(w, pane)) return true;
    if (w.findOpen) { this.runCommand(w, 'find-close', {}); return true; }
    if (pane && pane.loading) { w.stop(); return false; }
    return false;
  }

  // Feature modules contribute extra fields to the UI state snapshot.
  extraState(w) {
    const out = {};
    for (const fn of this.stateProviders) Object.assign(out, fn(w));
    return out;
  }

  // ---------- startup ----------
  start() {
    const startProfileId = this.meta.get('lastProfileId');
    const profile = this.getProfile(startProfileId) || this.getProfile('default');
    const urlArg = process.argv.slice(1).find((a) => /^(https?|file|opal):/.test(a));
    const saved = this.settings.get('restoreOnStartup') !== false ? profile.session.get('windows') : [];
    if (saved && saved.length && !process.env.OPAL_NO_RESTORE) {
      for (const s of saved) this.openWindow(profile, { saved: s });
      if (urlArg) this.focusedWindow()?.newTab({ url: urlArg });
    } else {
      this.openWindow(profile, { url: urlArg });
    }
  }

  flushAll() {
    for (const p of this.profiles.values()) {
      if (p.incognito) continue;
      this.saveSession(p);
      p.flush();
    }
    this.settings.flush();
    this.meta.flush();
  }
}

const opal = new OpalApp();
opal.commands = {};
opal.pageCalls = {};
opal.stateProviders = [];
opal.stateProviders.push(() => ({ search: { engine: opal.engine(), name: engineOf(opal.engine()).name } }));
global.__opal = opal; // used by the automated tests

opal.popoverProviders = {};
require('./identity').install(opal); // first: sets each session's user agent and client hints
require('./commands').install(opal);
require('./overlay').install(opal);
require('./page-calls').install(opal);
require('./downloads').install(opal);
require('./tools').install(opal);
require('./profiles').install(opal);
require('./pip').install(opal);
require('./reader').install(opal);
require('./permissions').install(opal);
require('./clear-data').install(opal);
require('./onyx-link').install(opal);
require('./llm').install(opal);
require('./ai-panel').install(opal);
require('./ai-actions').install(opal);
require('./agent').install(opal);
require('./sync').install(opal);
require('./info-pages').install(opal);
require('./translate').install(opal);
require('./extensions').install(opal);
require('./settings-page').install(opal);
require('./desktop').install(opal);
require('./updater').install(opal);

const gotLock = process.env.OPAL_MULTI_INSTANCE === '1' || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const w = opal.focusedWindow();
    const url = argv.slice(1).find((a) => /^(https?|file|opal):/.test(a));
    if (w) {
      if (url) w.newTab({ url });
      if (w.win.isMinimized()) w.win.restore();
      w.win.focus();
    } else {
      opal.start();
    }
  });

  app.whenReady().then(() => {
    opal.init();
    opal.start();
    // Development-only self checks that drive Opal from the main process (no debugger,
    // no automation switches), e.g. scripts/google-signin-check.js. Never in packaged builds.
    if (!app.isPackaged && process.env.OPAL_SELFTEST) require(path.resolve(process.env.OPAL_SELFTEST))(opal);
  });

  app.on('before-quit', () => {
    opal.quitting = true;
    opal.flushAll();
  });

  app.on('window-all-closed', () => {
    opal.flushAll();
    app.quit();
  });

  // Unexpected exits still keep the last saved session: writes are debounced
  // and atomic, so at most the last fraction of a second is lost.
  process.on('uncaughtException', (err) => {
    console.error('[opal] uncaught', err);
    try { opal.flushAll(); } catch { /* ignore */ }
  });
}

module.exports = { opal, DEFAULT_SETTINGS };
