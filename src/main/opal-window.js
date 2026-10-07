'use strict';
// One Opal browser window: the frameless BrowserWindow that hosts the Studio UI,
// plus a WebContentsView per tab pane, laid out by the main process.

const path = require('path');
const { BrowserWindow, WebContentsView, Menu, clipboard, shell } = require('electron');
const { parseInput, displayUrl, securityState, engineOf } = require('../shared/omnibox');
const { matchShortcut } = require('../shared/shortcuts');
const { newId } = require('./profile');

const UI_PRELOAD = path.join(__dirname, '../preload/ui.js');
const PAGE_PRELOAD = path.join(__dirname, '../preload/page.js');
const NEW_TAB_URL = 'opal://newtab';
const SPLIT_GAP = 8;
const SPLIT_TOP = 3;

let paneSeq = 0;
let tabSeq = 0;

class OpalWindow {
  constructor(app, profile, { saved = null, incognito = false } = {}) {
    this.app = app;
    this.profile = profile;
    this.incognito = incognito;
    this.id = newId('w');
    this.spaceTabs = new Map(); // spaceId -> { tabs: [], activeTabId }
    this.activeSpaceId = saved?.activeSpaceId && profile.space(saved.activeSpaceId) ? saved.activeSpaceId : profile.spaces[0].id;
    this.contentRect = { x: 0, y: 0, width: 0, height: 0 };
    this.attached = new Set();
    this.closedTabs = [];
    this.htmlFullscreen = false;
    this.findOpen = false;
    this.findResult = null;
    this.stateQueued = false;
    this.closing = false;

    const b = saved?.bounds || {};
    this.win = new BrowserWindow({
      width: b.width || 1360,
      height: b.height || 860,
      x: b.x,
      y: b.y,
      minWidth: 720,
      minHeight: 480,
      frame: false,
      show: false,
      title: incognito ? 'Opal (Incognito)' : 'Opal',
      backgroundColor: '#e6e9ee',
      icon: app.iconPath,
      webPreferences: {
        preload: UI_PRELOAD,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    });
    if (saved?.maximized) this.win.maximize();
    this.ui = this.win.webContents;
    this.ui.on('before-input-event', (e, input) => this.onInput(e, input, null));
    this.ui.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.ui.on('will-navigate', (e) => e.preventDefault());
    this.win.loadFile(path.join(__dirname, '../renderer/index.html'));
    this.win.once('ready-to-show', () => { if (!app.testHidden) this.win.show(); });
    for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur']) {
      this.win.on(ev, () => this.pushState());
    }
    for (const ev of ['resize', 'move']) this.win.on(ev, () => this.saveSession());
    this.win.on('close', () => this.onClose());
    this.win.on('closed', () => app.windowClosed(this));

    this.restore(saved);
  }

  // ---------- sessions ----------
  restore(saved) {
    const spaces = saved?.spaces || {};
    for (const space of this.profile.spaces) {
      const entry = spaces[space.id];
      const tabs = (entry?.tabs || []).filter((t) => t.panes?.length).map((t) => {
        const tab = this.makeTab(t.panes.slice(0, 2).map((p) => ({ url: p.url, title: p.title })), Math.min(t.focused || 0, t.panes.length - 1));
        tab.savedId = t.id;
        return tab;
      });
      const activeIdx = entry ? Math.max(0, tabs.findIndex((t) => t.savedId === entry.activeTabId)) : 0;
      this.spaceTabs.set(space.id, { tabs, activeTabId: tabs[activeIdx]?.id || null });
    }
    if (!this.current.tabs.length) this.newTab({ url: NEW_TAB_URL });
    else this.activateTab(this.current.activeTabId || this.current.tabs[0].id);
  }

  serialize() {
    const spaces = {};
    for (const [spaceId, st] of this.spaceTabs) {
      spaces[spaceId] = {
        activeTabId: st.activeTabId,
        tabs: st.tabs.map((t) => ({
          id: t.id,
          focused: t.focused,
          panes: t.panes.map((p) => ({ url: p.errorFor?.url || p.url, title: p.title })),
        })),
      };
    }
    const bounds = this.win.isDestroyed() ? undefined : this.win.getNormalBounds();
    return { bounds, maximized: !this.win.isDestroyed() && this.win.isMaximized(), activeSpaceId: this.activeSpaceId, spaces };
  }

  saveSession() {
    if (this.closing) return;
    this.app.saveSession(this.profile);
  }

  onClose() {
    // The last window of a profile keeps its tabs for next launch; closing one of
    // several windows forgets that window (like Chrome).
    this.app.beforeWindowClose(this);
    this.closing = true;
    for (const tab of this.allTabs()) for (const p of tab.panes) this.destroyPane(p);
  }

  // ---------- model helpers ----------
  get current() {
    if (!this.spaceTabs.has(this.activeSpaceId)) this.spaceTabs.set(this.activeSpaceId, { tabs: [], activeTabId: null });
    return this.spaceTabs.get(this.activeSpaceId);
  }

  get activeTab() {
    const st = this.current;
    return st.tabs.find((t) => t.id === st.activeTabId) || null;
  }

  get activePane() {
    const t = this.activeTab;
    return t ? t.panes[t.focused] || t.panes[0] : null;
  }

  *allTabs() {
    for (const st of this.spaceTabs.values()) yield* st.tabs;
  }

  findTab(tabId) {
    for (const [spaceId, st] of this.spaceTabs) {
      const tab = st.tabs.find((t) => t.id === tabId);
      if (tab) return { tab, spaceId, st };
    }
    return null;
  }

  findPaneByContents(wc) {
    for (const tab of this.allTabs()) {
      const pane = tab.panes.find((p) => p.view && p.view.webContents === wc);
      if (pane) return { tab, pane };
    }
    return null;
  }

  makeTab(paneSpecs, focused = 0) {
    const tab = { id: 't' + (++tabSeq), panes: [], focused };
    tab.savedId = undefined;
    for (const spec of paneSpecs) tab.panes.push(this.makePane(tab, spec));
    return tab;
  }

  makePane(tab, { url, title, webContents }) {
    return {
      id: 'p' + (++paneSeq),
      tab,
      view: null,
      pendingUrl: url || NEW_TAB_URL,
      openerContents: webContents || null,
      url: url || NEW_TAB_URL,
      title: title || '',
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      audible: false,
      muted: false,
      zoom: 1,
      errorFor: null,
      crashed: false,
    };
  }

  // Creates the WebContentsView for a pane the first time it's shown (lazy restore).
  ensureView(pane) {
    if (pane.view) return pane.view;
    const opts = {
      webPreferences: {
        partition: this.profile.partition,
        preload: PAGE_PRELOAD,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        safeDialogs: true,
        spellcheck: true,
        navigateOnDragDrop: false,
        // The page preload also runs in iframes, to give them Chrome's navigator.userAgentData.
        nodeIntegrationInSubFrames: true,
        additionalArguments: this.app.identity ? this.app.identity.brandArgs() : [],
      },
    };
    if (pane.openerContents) opts.webContents = pane.openerContents;
    const view = new WebContentsView(opts);
    view.setBackgroundColor('#ffffff');
    if (view.setBorderRadius) view.setBorderRadius(12);
    pane.view = view;
    this.wirePane(pane);
    if (!pane.openerContents) view.webContents.loadURL(pane.pendingUrl).catch(() => {});
    pane.openerContents = null;
    pane.pendingUrl = null;
    return view;
  }

  destroyPane(pane) {
    if (!pane.view) return;
    if (pane.inPip && this.app.pip) this.app.pip.restore(this);
    this.detach(pane.view);
    const wc = pane.view.webContents;
    pane.view = null;
    if (!wc.isDestroyed()) wc.close();
  }

  // ---------- pane events ----------
  wirePane(pane) {
    const wc = pane.view.webContents;
    const update = () => { this.pushState(); this.saveSession(); };
    const syncNav = () => {
      if (wc.isDestroyed()) return;
      pane.canGoBack = wc.navigationHistory.canGoBack();
      pane.canGoForward = wc.navigationHistory.canGoForward();
    };
    wc.on('before-input-event', (e, input) => this.onInput(e, input, pane));
    // Electron has no load-progress event, so progress is estimated from the load milestones
    // (the tab list eases the bar between them).
    const progress = (v) => { if (pane.loading && v > (pane.progress || 0)) { pane.progress = v; this.pushState(); } };
    wc.on('did-start-loading', () => { pane.loading = true; pane.progress = 0.1; this.pushState(); });
    wc.on('did-start-navigation', (_e, _url, _inPlace, isMain) => { if (isMain) progress(0.25); });
    wc.on('did-navigate', () => progress(0.45));
    wc.on('dom-ready', () => progress(0.8));
    wc.on('did-finish-load', () => progress(0.95));
    wc.on('did-stop-loading', () => { pane.loading = false; pane.progress = 1; syncNav(); update(); });
    wc.on('page-title-updated', (_e, title) => {
      pane.title = title;
      if (!this.incognito) this.profile.updateHistoryTitle(pane.url, title);
      update();
    });
    wc.on('page-favicon-updated', (_e, icons) => { pane.favicon = icons[0] || null; this.pushState(); });
    wc.on('did-navigate', (_e, url) => {
      const isError = url.startsWith('opal://error');
      if (!isError) pane.errorFor = null;
      pane.url = url;
      pane.favicon = null;
      pane.crashed = false;
      pane.zoom = wc.getZoomFactor();
      syncNav();
      if (!isError) this.profile.addHistory(url, wc.getTitle());
      this.app.emit('navigated', this, pane, url);
      update();
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      pane.url = url;
      syncNav();
      this.profile.addHistory(url, wc.getTitle());
      update();
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* aborted */) return;
      pane.errorFor = { url, code, desc };
      wc.loadURL('opal://error/?' + new URLSearchParams({ url, code: String(code), desc })).catch(() => {});
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      pane.crashed = true;
      pane.errorFor = { url: pane.url, code: 'crashed', desc: details.reason };
      this.pushState();
    });
    wc.on('audio-state-changed', (e) => { pane.audible = e.audible; this.pushState(); });
    wc.on('zoom-changed', (_e, dir) => this.zoom(dir === 'in' ? 1 : -1, pane));
    wc.on('found-in-page', (_e, result) => {
      if (pane !== this.activePane) return;
      if (!result.finalUpdate && !result.matches) return; // interim update
      // A search that lands while the page is being resized can report nothing; retry once.
      if (!result.matches && this.findText && !this.findRetried) {
        this.findRetried = true;
        setTimeout(() => { if (!wc.isDestroyed() && this.findText) wc.findInPage(this.findText); }, 300);
        return;
      }
      this.findResult = { active: result.activeMatchOrdinal, total: result.matches };
      this.send('find', { result: this.findResult });
    });
    wc.on('enter-html-full-screen', () => { this.htmlFullscreen = true; this.layout(); this.pushState(); });
    wc.on('leave-html-full-screen', () => { this.htmlFullscreen = false; this.layout(); this.pushState(); });
    wc.on('focus', () => {
      const tab = pane.tab;
      const idx = tab.panes.indexOf(pane);
      if (tab.panes.length > 1 && idx !== tab.focused) { tab.focused = idx; this.pushState(); }
    });
    // Web pages may not navigate to Opal's own pages.
    const guard = (e) => {
      const target = e.url || '';
      if (target.startsWith('opal:') && !wc.getURL().startsWith('opal:')) e.preventDefault();
    };
    wc.on('will-navigate', guard);
    wc.on('will-frame-navigate', guard);
    wc.on('context-menu', (_e, params) => this.pageContextMenu(pane, params));
    // window.open and target=_blank become new tabs; the opener link is kept so
    // sign-in popups still work.
    wc.setWindowOpenHandler((details) => {
      const { url, disposition } = details;
      if (url.startsWith('opal:') && !wc.getURL().startsWith('opal:')) return { action: 'deny' };
      if (!/^(https?|opal|about|data|blob):/.test(url) && url !== '') {
        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
      }
      const background = disposition === 'background-tab';
      return {
        action: 'allow',
        outlivesOpener: true,
        createWindow: (options) => {
          const tab = this.newTab({ url, background, webContents: options.webContents, afterTab: pane.tab });
          return tab.panes[0].view.webContents;
        },
      };
    });
    this.app.emit('pane-created', this, pane);
  }

  // ---------- tabs ----------
  newTab({ url, spaceId, background = false, webContents, afterTab } = {}) {
    const sid = spaceId && this.profile.space(spaceId) ? spaceId : this.activeSpaceId;
    if (!this.spaceTabs.has(sid)) this.spaceTabs.set(sid, { tabs: [], activeTabId: null });
    const st = this.spaceTabs.get(sid);
    const tab = this.makeTab([{ url: url || NEW_TAB_URL, webContents }]);
    const at = afterTab ? st.tabs.indexOf(afterTab) : -1;
    if (at >= 0) st.tabs.splice(at + 1, 0, tab); else st.tabs.push(tab);
    if (webContents) this.ensureView(tab.panes[0]);
    if (!background && sid === this.activeSpaceId) {
      this.activateTab(tab.id);
      if (!url || url === NEW_TAB_URL) this.send('focus-address', {});
    } else if (!background) {
      this.activateSpace(sid);
      this.activateTab(tab.id);
    } else {
      this.pushState();
    }
    this.saveSession();
    return tab;
  }

  activateTab(tabId) {
    const found = this.findTab(tabId);
    if (!found) return;
    if (found.spaceId !== this.activeSpaceId) this.activeSpaceId = found.spaceId;
    found.st.activeTabId = tabId;
    for (const p of found.tab.panes) this.ensureView(p);
    this.findResult = null;
    if (this.findOpen) { this.findOpen = false; this.send('find', { open: false }); }
    this.layout();
    const pane = this.activePane;
    if (pane?.view && !this.ui.isFocused()) pane.view.webContents.focus();
    this.app.emit('tab-activated', this, pane);
    this.pushState();
    this.saveSession();
  }

  closeTab(tabId, { wholeTab = false } = {}) {
    const found = this.findTab(tabId || this.activeTab?.id);
    if (!found) return;
    const { tab, st } = found;
    if (!wholeTab && !tabId && tab.panes.length > 1) {
      this.closePane(tab, tab.panes[tab.focused] || tab.panes[1]);
      return;
    }
    const idx = st.tabs.indexOf(tab);
    if (!this.incognito) {
      this.closedTabs.push({ spaceId: found.spaceId, index: idx, panes: tab.panes.map((p) => ({ url: p.url, title: p.title })) });
      if (this.closedTabs.length > 25) this.closedTabs.shift();
    }
    st.tabs.splice(idx, 1);
    for (const p of tab.panes) this.destroyPane(p);
    if (st.activeTabId === tab.id) {
      const next = st.tabs[Math.min(idx, st.tabs.length - 1)];
      st.activeTabId = next ? next.id : null;
    }
    if (found.spaceId === this.activeSpaceId) {
      if (!st.tabs.length) {
        this.newTab({ url: NEW_TAB_URL });
        return;
      }
      this.activateTab(st.activeTabId);
    } else {
      this.pushState();
    }
    this.saveSession();
  }

  reopenClosedTab() {
    const c = this.closedTabs.pop();
    if (!c) return;
    const sid = this.profile.space(c.spaceId) ? c.spaceId : this.activeSpaceId;
    const st = this.spaceTabs.get(sid) || { tabs: [], activeTabId: null };
    this.spaceTabs.set(sid, st);
    const tab = this.makeTab(c.panes);
    st.tabs.splice(Math.min(c.index, st.tabs.length), 0, tab);
    this.activateTab(tab.id);
  }

  moveTab(tabId, toIndex, spaceId) {
    const found = this.findTab(tabId);
    if (!found) return;
    const target = spaceId && this.profile.space(spaceId) ? spaceId : found.spaceId;
    found.st.tabs.splice(found.st.tabs.indexOf(found.tab), 1);
    if (!this.spaceTabs.has(target)) this.spaceTabs.set(target, { tabs: [], activeTabId: null });
    const dest = this.spaceTabs.get(target);
    dest.tabs.splice(Math.min(toIndex, dest.tabs.length), 0, found.tab);
    if (target !== found.spaceId) {
      if (found.st.activeTabId === tabId) found.st.activeTabId = found.st.tabs[0]?.id || null;
      if (!dest.activeTabId) dest.activeTabId = tabId;
      if (found.spaceId === this.activeSpaceId) {
        if (!found.st.tabs.length) { this.newTab({ url: NEW_TAB_URL }); return; }
        this.activateTab(found.st.activeTabId);
        return;
      }
    }
    this.pushState();
    this.saveSession();
  }

  cycleTab(delta) {
    const st = this.current;
    if (!st.tabs.length) return;
    const idx = st.tabs.findIndex((t) => t.id === st.activeTabId);
    const next = st.tabs[(idx + delta + st.tabs.length) % st.tabs.length];
    this.activateTab(next.id);
  }

  selectTabIndex(i) {
    const st = this.current;
    const tab = i < 0 ? st.tabs[st.tabs.length - 1] : st.tabs[i];
    if (tab) this.activateTab(tab.id);
  }

  duplicateTab(tabId) {
    const found = this.findTab(tabId || this.activeTab?.id);
    if (!found) return;
    const pane = found.tab.panes[found.tab.focused] || found.tab.panes[0];
    this.newTab({ url: pane.url, spaceId: found.spaceId, afterTab: found.tab });
  }

  toggleMute(tabId) {
    const found = this.findTab(tabId || this.activeTab?.id);
    if (!found) return;
    for (const p of found.tab.panes) {
      p.muted = !p.muted;
      if (p.view) p.view.webContents.setAudioMuted(p.muted);
    }
    this.pushState();
  }

  // ---------- split view ----------
  // Adds a second pane to a tab (a new tab page, or the given URL).
  split(tabId, url) {
    const found = this.findTab(tabId || this.activeTab?.id);
    if (!found) return;
    const { tab } = found;
    if (tab.panes.length >= 2) { this.focusPane(1, tab); return; }
    const pane = this.makePane(tab, { url: url || NEW_TAB_URL });
    tab.panes.push(pane);
    tab.focused = 1;
    if (found.st.activeTabId !== tab.id || found.spaceId !== this.activeSpaceId) this.activateTab(tab.id);
    else { this.ensureView(pane); this.layout(); this.pushState(); }
    this.saveSession();
    if (!url) this.send('focus-address', {});
    else pane.view?.webContents.focus();
  }

  // Splits a split tab back into two tabs.
  unsplit(tabId) {
    const found = this.findTab(tabId || this.activeTab?.id);
    if (!found || found.tab.panes.length < 2) return;
    const { tab, st } = found;
    const second = tab.panes.pop();
    tab.focused = 0;
    const newTab = { id: 't' + (++tabSeq), panes: [second], focused: 0 };
    second.tab = newTab;
    st.tabs.splice(st.tabs.indexOf(tab) + 1, 0, newTab);
    this.layout();
    this.pushState();
    this.saveSession();
  }

  focusPane(index, tab = this.activeTab) {
    if (!tab || !tab.panes[index]) return;
    tab.focused = index;
    tab.panes[index].view?.webContents.focus();
    this.pushState();
  }

  // Closes only the focused pane of a split tab.
  closePane(tab, pane) {
    const idx = tab.panes.indexOf(pane);
    tab.panes.splice(idx, 1);
    this.destroyPane(pane);
    tab.focused = 0;
    this.layout();
    this.pushState();
    this.saveSession();
  }

  // ---------- spaces ----------
  activateSpace(spaceId) {
    if (!this.profile.space(spaceId)) return;
    this.activeSpaceId = spaceId;
    const st = this.current;
    if (!st.tabs.length) {
      this.newTab({ url: NEW_TAB_URL });
      return;
    }
    this.activateTab(st.activeTabId || st.tabs[0].id);
  }

  removeSpaceTabs(spaceId) {
    const st = this.spaceTabs.get(spaceId);
    if (!st) return;
    for (const tab of st.tabs) for (const p of tab.panes) this.destroyPane(p);
    this.spaceTabs.delete(spaceId);
    if (this.activeSpaceId === spaceId) this.activateSpace(this.profile.spaces[0].id);
  }

  // ---------- navigation ----------
  navigate(input, { newTab = false } = {}) {
    const url = parseInput(input, this.app.engine());
    if (!url) return;
    if (newTab) { this.newTab({ url }); return; }
    const pane = this.activePane;
    if (!pane) { this.newTab({ url }); return; }
    this.ensureView(pane);
    pane.errorFor = null;
    pane.url = url;
    pane.view.webContents.loadURL(url).catch(() => {});
    pane.view.webContents.focus();
    this.pushState();
  }

  withPane(fn) {
    const pane = this.activePane;
    if (pane?.view && !pane.view.webContents.isDestroyed()) fn(pane.view.webContents, pane);
  }

  back() { this.withPane((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()); }
  forward() { this.withPane((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()); }
  stop() { this.withPane((wc) => wc.stop()); }
  home() { this.navigate(this.app.settings.get('homePage') || NEW_TAB_URL); }

  reload(hard = false) {
    this.withPane((wc, pane) => {
      if (pane.errorFor) { const u = pane.errorFor.url; pane.errorFor = null; wc.loadURL(u).catch(() => {}); return; }
      if (hard) wc.reloadIgnoringCache(); else wc.reload();
    });
  }

  zoom(dir, pane = this.activePane) {
    if (!pane?.view) return;
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
    let z = pane.zoom;
    if (dir === 0) z = 1;
    else if (dir > 0) z = steps.find((s) => s > z + 0.001) || z;
    else z = [...steps].reverse().find((s) => s < z - 0.001) || z;
    pane.zoom = z;
    pane.view.webContents.setZoomFactor(z);
    this.pushState();
  }

  // ---------- layout ----------
  setLayout(rects) {
    if (rects?.content) this.contentRect = roundRect(rects.content);
    this.layout();
  }

  attach(view) {
    if (this.attached.has(view)) return;
    this.win.contentView.addChildView(view);
    this.attached.add(view);
  }

  detach(view) {
    if (!this.attached.has(view)) return;
    try { this.win.contentView.removeChildView(view); } catch { /* window gone */ }
    this.attached.delete(view);
  }

  // Shows the active tab's pane views in the content rect and hides the rest.
  layout() {
    if (this.win.isDestroyed()) return;
    const tab = this.activeTab;
    const visible = new Set(tab ? tab.panes.filter((p) => !p.inPip).map((p) => p.view).filter(Boolean) : []);
    for (const v of [...this.attached]) if (!visible.has(v) && v !== this.overlayView && v !== this.aiView) this.detach(v);
    if (!tab) return;
    let r = this.contentRect;
    if (this.htmlFullscreen) {
      const [w, h] = this.win.getContentSize();
      r = { x: 0, y: 0, width: w, height: h };
    }
    const panes = tab.panes.filter((p) => p.view && !p.inPip);
    if (panes.length === 2 && !this.htmlFullscreen) {
      // Leave a 3px strip above the panes: the UI draws the focus marker there.
      const w1 = Math.floor((r.width - SPLIT_GAP) * 0.5);
      const top = r.y + SPLIT_TOP;
      const h = Math.max(0, r.height - SPLIT_TOP);
      panes[0].view.setBounds({ x: r.x, y: top, width: w1, height: h });
      panes[1].view.setBounds({ x: r.x + w1 + SPLIT_GAP, y: top, width: r.width - w1 - SPLIT_GAP, height: h });
    } else if (panes[0]) {
      panes[0].view.setBounds(r);
    }
    for (const p of panes) {
      if (p.view.setBorderRadius) p.view.setBorderRadius(this.htmlFullscreen ? 0 : 12);
      this.attach(p.view);
    }
    this.app.emit('layout', this);
  }

  // ---------- state for the UI ----------
  pushState() {
    if (this.stateQueued) return;
    this.stateQueued = true;
    setImmediate(() => {
      this.stateQueued = false;
      if (!this.win.isDestroyed()) this.send('state', this.snapshot());
    });
  }

  send(event, data) {
    if (!this.win.isDestroyed() && !this.ui.isDestroyed()) this.ui.send('ev:' + event, data);
  }

  paneInfo(p) {
    const url = p.errorFor ? p.errorFor.url : p.url;
    return {
      id: p.id,
      title: p.title || (url === NEW_TAB_URL ? 'New tab' : url),
      url,
      favicon: p.favicon,
      loading: p.loading,
      progress: p.loading ? p.progress || 0.1 : 1,
      audible: p.audible,
      muted: p.muted,
      crashed: p.crashed,
      pip: !!p.inPip,
    };
  }

  snapshot() {
    const space = this.profile.space(this.activeSpaceId) || this.profile.spaces[0];
    const st = this.current;
    const pane = this.activePane;
    const tab = this.activeTab;
    const url = pane ? (pane.errorFor ? pane.errorFor.url : pane.url) : '';
    const bookmark = pane ? this.profile.findBookmarkByUrl(space.id, url) : null;
    return {
      windowId: this.id,
      incognito: this.incognito,
      maximized: this.win.isMaximized(),
      fullscreen: this.win.isFullScreen(),
      htmlFullscreen: this.htmlFullscreen,
      profile: { id: this.profile.id, name: this.profile.name, color: this.profile.color },
      spaces: this.profile.spaces.map((s) => ({
        id: s.id, name: s.name, color: s.color,
        tabCount: this.spaceTabs.get(s.id)?.tabs.length || 0,
      })),
      space: {
        id: space.id,
        name: space.name,
        color: space.color,
        bookmarks: space.bookmarks,
        activeTabId: st.activeTabId,
        tabs: st.tabs.map((t) => ({
          id: t.id,
          focused: t.focused,
          panes: t.panes.map((p) => this.paneInfo(p)),
        })),
      },
      active: pane ? {
        tabId: tab.id,
        url,
        display: displayUrl(url),
        security: securityState(url),
        title: pane.title,
        loading: pane.loading,
        canGoBack: pane.canGoBack,
        canGoForward: pane.canGoForward,
        zoom: pane.zoom,
        bookmarked: !!bookmark,
        split: tab.panes.length > 1,
        focusedPane: tab.focused,
        error: !!pane.errorFor,
      } : null,
      showBookmarksBar: this.profile.data.get('showBookmarksBar') !== false,
      findOpen: this.findOpen,
      ...this.app.extraState(this),
    };
  }

  // ---------- input ----------
  onInput(event, input, pane) {
    const cmd = matchShortcut(input);
    if (!cmd) return;
    if (cmd === 'escape') {
      if (this.app.handleEscape(this, pane)) event.preventDefault();
      return;
    }
    // Inside Opal's own UI, leave editing keys to text fields.
    event.preventDefault();
    this.app.runCommand(this, cmd, {});
  }

  // ---------- context menu for web pages ----------
  pageContextMenu(pane, params) {
    const wc = pane.view.webContents;
    const items = [];
    if (params.linkURL) {
      items.push(
        { label: 'Open link in new tab', click: () => this.newTab({ url: params.linkURL, background: true, afterTab: pane.tab }) },
        { label: 'Open link in split view', click: () => this.app.runCommand(this, 'split-view', { url: params.linkURL }) },
        { label: 'Open link in new window', click: () => this.app.openWindow(this.profile, { url: params.linkURL }) },
        { label: 'Open link in incognito window', click: () => this.app.openIncognito({ url: params.linkURL }) },
        { type: 'separator' },
        { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      );
    }
    if (params.mediaType === 'image' && params.srcURL) {
      items.push(
        { label: 'Open image in new tab', click: () => this.newTab({ url: params.srcURL, background: true }) },
        { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) },
        { label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) },
        { type: 'separator' },
      );
    }
    if (params.mediaType === 'video') {
      items.push({ label: 'Picture in picture', click: () => this.app.runCommand(this, 'pip', {}) }, { type: 'separator' });
    }
    if (params.isEditable) {
      items.push(
        { role: 'undo', label: 'Undo' }, { role: 'redo', label: 'Redo' }, { type: 'separator' },
        { role: 'cut', label: 'Cut' }, { role: 'copy', label: 'Copy' }, { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select all' }, { type: 'separator' },
      );
      for (const s of (params.dictionarySuggestions || []).slice(0, 4)) {
        items.unshift({ label: s, click: () => wc.replaceMisspelling(s) });
      }
    } else if (params.selectionText) {
      const sel = params.selectionText.trim().slice(0, 60);
      items.push(
        { role: 'copy', label: 'Copy' },
        { label: `Search ${engineOf(this.app.engine()).name} for “${sel}”`, click: () => this.newTab({ url: parseInput(sel.includes(' ') ? sel : sel + ' ', this.app.engine()), afterTab: pane.tab }) },
        { label: 'Ask Opal AI about this', click: () => this.app.runCommand(this, 'ai-ask', { text: 'Explain this: ' + params.selectionText.slice(0, 4000) }) },
        { type: 'separator' },
      );
    }
    if (!params.linkURL && !params.isEditable && !params.selectionText) {
      items.push(
        { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Reload', click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Save page as…', click: () => this.app.runCommand(this, 'save-page', {}) },
        { label: 'Print…', click: () => this.app.runCommand(this, 'print', {}) },
        { label: `Translate to ${this.app.settings.get('translateTarget') || 'English'}`, click: () => this.app.runCommand(this, 'translate', {}) },
        { label: 'Reader mode', click: () => this.app.runCommand(this, 'reader-mode', {}) },
        { type: 'separator' },
        { label: 'View page source', click: () => this.app.runCommand(this, 'view-source', {}) },
      );
    }
    const extra = this.app.contextMenuExtras ? this.app.contextMenuExtras(this, pane, params) : [];
    if (extra.length) items.push(...extra, { type: 'separator' });
    items.push({ label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) });
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    Menu.buildFromTemplate(items).popup({ window: this.win });
  }
}

function roundRect(r) {
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) };
}

module.exports = { OpalWindow, NEW_TAB_URL };
