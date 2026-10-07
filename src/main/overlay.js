'use strict';
// The overlay: a transparent WebContentsView laid over the whole window (or a
// region of it) for things that must appear above web pages: the ⋮ menu,
// address-bar suggestions, the Ctrl+K command bar and toolbar popovers.

const path = require('path');
const { WebContentsView } = require('electron');
const { matchShortcut, HINTS } = require('../shared/shortcuts');
const { parseInput, searchQueryOf, engineOf } = require('../shared/omnibox');

const UI_PRELOAD = path.join(__dirname, '../preload/ui.js');

function ensureOverlay(opal, w) {
  if (w.overlayView) return w.overlayView;
  const view = new WebContentsView({
    webPreferences: { preload: UI_PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  view.setBackgroundColor('#00000000');
  w.overlayView = view;
  w.overlayReady = false;
  w.overlayQueue = null;
  const wc = view.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('did-finish-load', () => {
    w.overlayReady = true;
    if (w.overlayQueue) { wc.send('ev:overlay', w.overlayQueue); w.overlayQueue = null; }
  });
  wc.on('before-input-event', (e, input) => {
    const cmd = matchShortcut(input);
    if (!cmd || cmd === 'escape') return; // the overlay handles Esc itself
    if (['find-next', 'find-previous', 'focus-address'].includes(cmd) && w.overlayKind === 'command') return;
    e.preventDefault();
    hideOverlay(opal, w);
    opal.runCommand(w, cmd, {});
  });
  wc.loadFile(path.join(__dirname, '../renderer/overlay.html'));
  w.win.on('resize', () => { if (w.overlayKind && !w.overlayRegion) setOverlayBounds(w); });
  return view;
}

function setOverlayBounds(w) {
  const [width, height] = w.win.getContentSize();
  const r = w.overlayRegion || { x: 0, y: 0, width, height };
  w.overlayView.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
}

function sendOverlay(w, payload) {
  if (w.overlayReady) w.overlayView.webContents.send('ev:overlay', payload);
  else w.overlayQueue = payload;
}

// Shows the overlay with a payload ({ kind, ... }). region limits it to part of
// the window (address-bar suggestions); otherwise it covers the window and a
// click outside the content closes it.
function showOverlay(opal, w, payload, { region = null, focus = true } = {}) {
  const view = ensureOverlay(opal, w);
  w.overlayKind = payload.kind;
  w.overlayRegion = region;
  setOverlayBounds(w);
  w.win.contentView.addChildView(view); // (re)adding puts it on top
  w.attached.add(view);
  sendOverlay(w, { ...payload, accent: w.profile.space(w.activeSpaceId)?.color || '#2a4bc7' });
  if (focus) view.webContents.focus();
}

function hideOverlay(opal, w, { refocus = true } = {}) {
  if (!w.overlayView || !w.overlayKind) return false;
  const wasCommand = w.overlayKind === 'command';
  w.overlayKind = null;
  w.overlayRegion = null;
  sendOverlay(w, { kind: null });
  w.detach(w.overlayView);
  if (refocus && !w.win.isDestroyed()) {
    const pane = w.activePane;
    if (pane?.view && (wasCommand || !w.ui.isFocused())) pane.view.webContents.focus();
  }
  return true;
}

// ---------- the ⋮ menu ----------
function menuData(opal, w) {
  const snap = w.snapshot();
  return {
    profile: snap.profile,
    profiles: opal.meta.get('profiles'),
    incognito: w.incognito,
    zoom: Math.round((w.activePane?.zoom || 1) * 100),
    fullscreen: w.win.isFullScreen(),
    showBookmarksBar: snap.showBookmarksBar,
    spaces: snap.spaces,
    activeSpaceId: w.activeSpaceId,
    activeTabId: w.activeTab?.id,
    isWeb: /^https?:/.test(snap.active?.url || ''),
    split: !!snap.active?.split,
    aiOpen: !!(snap.ai && snap.ai.open && !snap.ai.collapsed),
    onyx: snap.onyx || null,
    llmBackend: snap.llm ? snap.llm.backend : null,
    syncEnabled: snap.sync ? snap.sync.enabled : true,
    hints: HINTS,
  };
}

// ---------- address bar suggestions ----------
function omniboxItems(w, text, engine) {
  const t = text.trim();
  if (!t) return [];
  const target = parseInput(t, engine);
  const q = searchQueryOf(target);
  const first = q !== null
    ? { kind: 'search', title: t, sub: `Search ${engineOf(engine).name}`, url: target }
    : { kind: 'url', title: target, sub: 'Open', url: target };
  const items = [first];
  for (const s of w.profile.suggest(t, 6)) {
    if (s.url === target) continue;
    items.push({ kind: s.kind, title: s.title, sub: s.url, url: s.url });
  }
  return items.slice(0, 7);
}

function install(opal) {
  opal.on('layout', (w) => {
    // Keep the overlay above pane views that were attached after it.
    if (w.overlayKind && w.overlayView) w.win.contentView.addChildView(w.overlayView);
  });
  opal.on('escape', (w) => hideOverlay(opal, w));

  opal.addCommands({
    'open-menu': (w, a) => showOverlay(opal, w, { kind: 'menu', anchor: { x: a.x, y: a.y }, data: menuData(opal, w) }),
    'close-overlay': (w) => hideOverlay(opal, w),
    'open-popover': (w, a) => {
      w.popoverAnchor = { x: a.x, y: a.y };
      const provider = opal.popoverProviders[a.kind];
      const data = provider ? provider(w, a) : {};
      if (data === null) return;
      showOverlay(opal, w, { kind: a.kind, anchor: { x: a.x, y: a.y }, ...data });
    },
    'command-bar': (w) => {
      if (w.overlayKind === 'command') { hideOverlay(opal, w); return; }
      const tabs = [];
      for (const space of w.profile.spaces) {
        for (const t of w.spaceTabs.get(space.id)?.tabs || []) {
          const p = t.panes[t.focused] || t.panes[0];
          tabs.push({ tabId: t.id, title: p.title || p.url, url: p.url, space: space.name, color: space.color });
        }
      }
      const bookmarks = [];
      for (const { node, space } of w.profile.walkBookmarks()) {
        if (node.url) bookmarks.push({ title: node.title, url: node.url, space: space.name });
      }
      showOverlay(opal, w, { kind: 'command', tabs, bookmarks, spaces: w.profile.spaces.map((s) => ({ id: s.id, name: s.name, color: s.color })), hints: HINTS, incognito: w.incognito });
    },
    'omnibox-input': (w, a) => {
      if (w.overlayKind === 'command') {
        const history = w.profile.suggest(a.text, 8).filter((s) => s.kind === 'history');
        sendOverlay(w, { kind: 'command-results', history });
        return;
      }
      const items = omniboxItems(w, a.text, opal.engine());
      w.omnibox = { items, selected: -1 };
      w.send('omnibox', { count: items.length, reset: true });
      if (!items.length || !a.rect) { if (w.overlayKind === 'omnibox') hideOverlay(opal, w, { refocus: false }); return; }
      const height = 12 + items.length * 40;
      showOverlay(opal, w, { kind: 'omnibox', items, selected: -1 }, {
        region: { x: a.rect.x, y: a.rect.y + a.rect.height + 4, width: a.rect.width, height },
        focus: false,
      });
    },
    'omnibox-select': (w, a) => {
      if (!w.omnibox || w.overlayKind !== 'omnibox') return;
      w.omnibox.selected = a.index;
      sendOverlay(w, { kind: 'omnibox', items: w.omnibox.items, selected: a.index });
      const item = w.omnibox.items[a.index];
      if (item) w.send('omnibox', { count: w.omnibox.items.length, fill: item.kind === 'search' ? item.title : item.url });
    },
    'omnibox-blur': (w) => {
      setTimeout(() => { if (w.overlayKind === 'omnibox') hideOverlay(opal, w, { refocus: false }); }, 180);
    },
  });
}

module.exports = { install, showOverlay, hideOverlay, sendOverlay, menuData, omniboxItems };
