'use strict';
// Core browser commands: tabs, navigation, spaces, bookmarks and windows.
// Feature modules (downloads, overlay, AI ...) register their own commands.

const { Menu, clipboard } = require('electron');
const { NEW_TAB_URL } = require('./opal-window');

function install(opal) {
  opal.addCommands({
    // ---- tabs ----
    'new-tab': (w, a) => w.newTab({ url: a.url, spaceId: a.spaceId, background: a.background }),
    'close-tab': (w, a) => w.closeTab(a.tabId, { wholeTab: !!a.tabId }),
    'activate-tab': (w, a) => w.activateTab(a.tabId),
    'move-tab': (w, a) => w.moveTab(a.tabId, a.toIndex, a.spaceId),
    'duplicate-tab': (w, a) => w.duplicateTab(a.tabId),
    'mute-tab': (w, a) => w.toggleMute(a.tabId),
    'reopen-closed-tab': (w) => w.reopenClosedTab(),
    'next-tab': (w) => w.cycleTab(1),
    'previous-tab': (w) => w.cycleTab(-1),
    'select-last-tab': (w) => w.selectTabIndex(-1),
    'tab-context-menu': (w, a) => tabContextMenu(opal, w, a),
    'split-view': (w, a) => w.split(a.tabId, a.url),
    'unsplit-tab': (w, a) => w.unsplit(a.tabId),
    'focus-pane': (w, a) => w.focusPane(a.index),

    // ---- navigation ----
    navigate: (w, a) => w.navigate(a.input, { newTab: a.newTab }),
    back: (w) => w.back(),
    forward: (w) => w.forward(),
    reload: (w) => w.reload(false),
    'hard-reload': (w) => w.reload(true),
    stop: (w) => w.stop(),
    home: (w) => w.home(),
    'focus-address': (w) => w.send('focus-address', { select: true }),
    'zoom-in': (w) => w.zoom(1),
    'zoom-out': (w) => w.zoom(-1),
    'zoom-reset': (w) => w.zoom(0),
    'view-source': (w) => { const p = w.activePane; if (p && /^https?:/.test(p.url)) w.newTab({ url: 'view-source:' + p.url, afterTab: p.tab }); },
    devtools: (w) => w.withPane((wc) => wc.toggleDevTools()),

    // ---- spaces ----
    'activate-space': (w, a) => w.activateSpace(a.spaceId),
    'create-space': (w, a) => {
      const space = w.profile.createSpace(a.name, a.color);
      for (const x of opal.windowsOf(w.profile)) x.pushState();
      w.activateSpace(space.id);
    },
    'update-space': (w, a) => {
      w.profile.updateSpace(a.spaceId, a);
      for (const x of opal.windowsOf(w.profile)) x.pushState();
    },
    'delete-space': (w, a) => deleteSpace(opal, w, a.spaceId),
    'space-context-menu': (w, a) => spaceContextMenu(opal, w, a),

    // ---- bookmarks ----
    'bookmark-page': (w) => toggleBookmark(opal, w),
    'open-bookmark': (w, a) => {
      const item = w.profile.findBookmark(a.id);
      if (item?.node.url) w.navigate(item.node.url, { newTab: a.newTab });
    },
    'remove-bookmark': (w, a) => { w.profile.removeBookmark(a.id); refreshBookmarks(opal, w.profile); },
    'bookmark-folder-menu': (w, a) => bookmarkFolderMenu(opal, w, a),
    'bookmark-context-menu': (w, a) => bookmarkContextMenu(opal, w, a),
    'toggle-bookmarks-bar': (w) => {
      w.profile.data.set('showBookmarksBar', w.profile.data.get('showBookmarksBar') === false);
      for (const x of opal.windowsOf(w.profile)) x.pushState();
    },

    // ---- window ----
    'window-control': (w, a) => {
      if (a.action === 'minimize') w.win.minimize();
      else if (a.action === 'maximize') (w.win.isMaximized() ? w.win.unmaximize() : w.win.maximize());
      else w.win.close();
    },
    'new-window': (w) => (w.incognito ? opal.openIncognito() : opal.openWindow(w.profile, { url: NEW_TAB_URL })),
    'new-incognito-window': () => opal.openIncognito(),
    fullscreen: (w) => w.win.setFullScreen(!w.win.isFullScreen()),

    // ---- Opal pages ----
    history: (w) => openPage(w, 'opal://history'),
    downloads: (w) => openPage(w, 'opal://downloads'),
    bookmarks: (w) => openPage(w, 'opal://bookmarks'),
    settings: (w) => openPage(w, 'opal://settings'),
    extensions: (w) => openPage(w, 'opal://extensions'),
    passwords: (w) => openPage(w, 'opal://passwords'),
    about: (w) => openPage(w, 'opal://about'),
    help: (w) => openPage(w, 'opal://help'),
  });
  for (let i = 1; i <= 8; i++) opal.commands['select-tab-' + i] = (w) => w.selectTabIndex(i - 1);

  opal.addPageCalls({
    'page.navigate': (a, ctx) => {
      if (!ctx.window) return;
      const { parseInput } = require('../shared/omnibox');
      const url = parseInput(a.input, opal.engine());
      if (!url) return;
      if (a.newTab) ctx.window.newTab({ url });
      else if (ctx.pane?.view) { ctx.pane.view.webContents.loadURL(url).catch(() => {}); }
    },
    'search.info': () => {
      const { engineOf: eo } = require('../shared/omnibox');
      const e = eo(opal.engine());
      return { id: opal.engine(), name: e.name, action: e.url.split('?')[0] };
    },
    'pinned.list': (_a, ctx) => (ctx.window ? ctx.window.profile.data.get('pinnedSites') : []),
    'pinned.set': (a, ctx) => { ctx.window?.profile.data.set('pinnedSites', a.sites.filter((s) => /^https?:/.test(s.url))); },
  });
}

// Opens an Opal page, reusing an open tab with that page in the current space.
function openPage(w, url) {
  const host = new URL(url).host;
  for (const t of w.current.tabs) {
    const p = t.panes[0];
    if (p.url.startsWith('opal://' + host)) { w.activateTab(t.id); return; }
  }
  const pane = w.activePane;
  if (pane && (pane.url === NEW_TAB_URL || pane.url === NEW_TAB_URL + '/') && !pane.loading) w.navigate(url);
  else w.newTab({ url });
}

function refreshBookmarks(opal, profile) {
  for (const x of opal.windowsOf(profile)) x.pushState();
  opal.emit('bookmarks-changed', profile);
}

function toggleBookmark(opal, w) {
  const pane = w.activePane;
  if (!pane) return;
  const url = pane.errorFor?.url || pane.url;
  if (!url || url === NEW_TAB_URL) return;
  const existing = w.profile.findBookmarkByUrl(w.activeSpaceId, url);
  if (existing) w.profile.removeBookmark(existing.node.id);
  else w.profile.addBookmark(w.activeSpaceId, { title: pane.title || url, url });
  refreshBookmarks(opal, w.profile);
}

function deleteSpace(opal, w, spaceId) {
  if (!w.profile.deleteSpace(spaceId)) return;
  for (const x of opal.windowsOf(w.profile)) {
    x.removeSpaceTabs(spaceId);
    x.pushState();
  }
}

function popup(w, template, x, y) {
  Menu.buildFromTemplate(template).popup({ window: w.win, x: Math.round(x), y: Math.round(y) });
}

function tabContextMenu(opal, w, { tabId, x, y }) {
  const found = w.findTab(tabId);
  if (!found) return;
  const { tab } = found;
  const otherSpaces = w.profile.spaces.filter((s) => s.id !== found.spaceId);
  const template = [
    { label: 'New tab below', click: () => w.newTab({ afterTab: tab }) },
    { label: 'Reload', click: () => { w.activateTab(tabId); w.reload(); } },
    { label: 'Duplicate', click: () => w.duplicateTab(tabId) },
    { label: tab.panes.some((p) => p.muted) ? 'Unmute site' : 'Mute site', click: () => w.toggleMute(tabId) },
    { type: 'separator' },
    tab.panes.length > 1
      ? { label: 'Separate split view', click: () => opal.runCommand(w, 'unsplit-tab', { tabId }) }
      : { label: 'Open in split view with a new tab', click: () => opal.runCommand(w, 'split-view', { tabId }) },
    {
      label: 'Move to space',
      enabled: otherSpaces.length > 0,
      submenu: otherSpaces.map((s) => ({ label: s.name, click: () => w.moveTab(tabId, 9999, s.id) })),
    },
    { label: 'Bookmark tab', click: () => { w.activateTab(tabId); toggleBookmark(opal, w); } },
    { type: 'separator' },
    { label: 'Close tab', accelerator: 'Ctrl+W', click: () => w.closeTab(tabId) },
    {
      label: 'Close other tabs',
      click: () => { for (const t of [...found.st.tabs]) if (t.id !== tabId) w.closeTab(t.id); },
    },
  ];
  popup(w, template, x, y);
}

function spaceContextMenu(opal, w, { spaceId, x, y }) {
  const space = w.profile.space(spaceId);
  if (!space) return;
  popup(w, [
    { label: 'Edit space…', click: () => w.send('overlay', { kind: 'edit-space', spaceId }) },
    { type: 'separator' },
    { label: 'Delete space', enabled: w.profile.spaces.length > 1, click: () => deleteSpace(opal, w, spaceId) },
  ], x, y);
}

function bookmarkItems(opal, w, nodes) {
  if (!nodes.length) return [{ label: '(empty)', enabled: false }];
  return nodes.map((n) => (n.children
    ? { label: n.title, submenu: bookmarkItems(opal, w, n.children) }
    : { label: n.title.slice(0, 60) || n.url, click: () => w.navigate(n.url) }));
}

function bookmarkFolderMenu(opal, w, { id, x, y }) {
  if (id === 'all') {
    const template = w.profile.spaces.map((s) => ({ label: s.name, submenu: bookmarkItems(opal, w, s.bookmarks) }));
    template.push({ type: 'separator' }, { label: 'Bookmark manager', accelerator: 'Ctrl+Shift+O', click: () => opal.runCommand(w, 'bookmarks', {}) });
    popup(w, template, x, y);
    return;
  }
  const item = w.profile.findBookmark(id);
  if (!item?.node.children) return;
  const urls = [];
  (function collect(ns) { for (const n of ns) n.children ? collect(n.children) : urls.push(n.url); })(item.node.children);
  const template = bookmarkItems(opal, w, item.node.children);
  template.push({ type: 'separator' }, { label: `Open all (${urls.length})`, enabled: urls.length > 0, click: () => { for (const u of urls) w.newTab({ url: u, background: true }); } });
  popup(w, template, x, y);
}

function bookmarkContextMenu(opal, w, { id, x, y }) {
  const item = w.profile.findBookmark(id);
  if (!item) return;
  const { node } = item;
  const template = [];
  if (node.url) {
    template.push(
      { label: 'Open in new tab', click: () => w.newTab({ url: node.url, background: true }) },
      { label: 'Open in new window', click: () => opal.openWindow(w.profile, { url: node.url }) },
      { label: 'Copy link', click: () => clipboard.writeText(node.url) },
      { type: 'separator' },
    );
  }
  template.push(
    { label: 'Edit in bookmark manager', click: () => w.newTab({ url: 'opal://bookmarks/?edit=' + node.id }) },
    { label: 'Delete', click: () => { w.profile.removeBookmark(id); refreshBookmarks(opal, w.profile); } },
  );
  popup(w, template, x, y);
}

module.exports = { install, refreshBookmarks, toggleBookmark, openPage };
