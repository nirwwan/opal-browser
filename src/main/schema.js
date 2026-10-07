'use strict';
// Typed IPC allow-list. Every message from a renderer is checked here before
// the main process acts on it. Unknown commands and malformed arguments are dropped.

const t = {
  str: (max = 4096) => (v) => typeof v === 'string' && v.length <= max,
  id: () => (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v),
  int: (min = -1e9, max = 1e9) => (v) => Number.isInteger(v) && v >= min && v <= max,
  num: (min = -1e9, max = 1e9) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max,
  bool: () => (v) => typeof v === 'boolean',
  oneOf: (...vals) => (v) => vals.includes(v),
  color: () => (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
  arr: (item, max = 1000) => (v) => Array.isArray(v) && v.length <= max && v.every(item),
  obj: (shape) => (v) => checkShape(shape, v),
  any: () => () => true,
  opt: (fn) => { const f = (v) => v === undefined || fn(v); f.optional = true; return f; },
};

function checkShape(shape, v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  for (const k of Object.keys(v)) if (!(k in shape)) return false;
  for (const [k, fn] of Object.entries(shape)) if (!fn(v[k])) return false;
  return true;
}

const rect = t.obj({ x: t.num(), y: t.num(), width: t.num(0, 1e5), height: t.num(0, 1e5) });
const none = {};

// Commands the browser UI (and the overlay / AI panel views) may send.
const UI_COMMANDS = {
  // tabs
  'new-tab': { url: t.opt(t.str()), spaceId: t.opt(t.id()), background: t.opt(t.bool()) },
  'close-tab': { tabId: t.opt(t.id()) },
  'activate-tab': { tabId: t.id() },
  'move-tab': { tabId: t.id(), toIndex: t.int(0, 10000), spaceId: t.opt(t.id()) },
  'duplicate-tab': { tabId: t.opt(t.id()) },
  'mute-tab': { tabId: t.opt(t.id()) },
  'reopen-closed-tab': none,
  'next-tab': none,
  'previous-tab': none,
  'tab-context-menu': { tabId: t.id(), x: t.num(), y: t.num() },
  'unsplit-tab': { tabId: t.opt(t.id()) },
  'focus-pane': { index: t.int(0, 1) },
  // navigation
  navigate: { input: t.str(8192), newTab: t.opt(t.bool()) },
  back: none,
  forward: none,
  reload: none,
  'hard-reload': none,
  stop: none,
  home: none,
  // spaces
  'activate-space': { spaceId: t.id() },
  'create-space': { name: t.str(40), color: t.color() },
  'update-space': { spaceId: t.id(), name: t.opt(t.str(40)), color: t.opt(t.color()) },
  'delete-space': { spaceId: t.id() },
  'space-context-menu': { spaceId: t.id(), x: t.num(), y: t.num() },
  // bookmarks
  'bookmark-page': none,
  'open-bookmark': { id: t.id(), newTab: t.opt(t.bool()) },
  'remove-bookmark': { id: t.id() },
  'bookmark-folder-menu': { id: t.id(), x: t.num(), y: t.num() },
  'bookmark-context-menu': { id: t.id(), x: t.num(), y: t.num() },
  'toggle-bookmarks-bar': none,
  // window
  'window-control': { action: t.oneOf('minimize', 'maximize', 'close') },
  'new-window': none,
  'new-incognito-window': none,
  fullscreen: none,
  // overlays and menus
  'open-menu': { x: t.num(), y: t.num() },
  'open-popover': { kind: t.oneOf('add-space', 'downloads', 'extensions', 'profile', 'site-info', 'translate', 'passwords'), x: t.num(), y: t.num() },
  'close-overlay': none,
  'command-bar': none,
  'omnibox-input': { text: t.str(8192), rect: t.opt(rect) },
  'omnibox-select': { index: t.int(-1, 50) },
  'omnibox-blur': none,
  // pages and tools
  history: none,
  downloads: none,
  bookmarks: none,
  settings: none,
  extensions: none,
  passwords: none,
  about: none,
  help: none,
  'clear-data': none,
  'clear-data-run': { range: t.oneOf('hour', 'day', 'week', 'month', 'all'), history: t.bool(), cookies: t.bool(), cache: t.bool(), downloads: t.bool() },
  find: none,
  'find-query': { text: t.str(1000), forward: t.opt(t.bool()), findNext: t.opt(t.bool()) },
  'find-next': none,
  'find-previous': none,
  'find-close': none,
  'zoom-in': none,
  'zoom-out': none,
  'zoom-reset': none,
  print: none,
  'save-page': none,
  'save-pdf': none,
  'copy-link': none,
  'view-source': none,
  devtools: none,
  'reader-mode': none,
  'split-view': { tabId: t.opt(t.id()) },
  pip: none,
  'pip-return': none,
  translate: { lang: t.opt(t.str(40)) },
  'switch-profile': { profileId: t.id() },
  'create-profile': { name: t.str(40), color: t.color() },
  // permission prompts
  'site-reset-permission': { origin: t.str(2048), permission: t.opt(t.str(64)) },
  'permission-reply': { id: t.id(), allow: t.bool(), remember: t.opt(t.bool()) },
  // downloads
  'download-action': { id: t.id(), action: t.oneOf('open', 'show', 'cancel', 'pause', 'resume', 'retry', 'remove') },
  // AI panel
  'toggle-ai': none,
  'ai-set': { oneColorDots: t.opt(t.bool()), open: t.opt(t.bool()), collapsed: t.opt(t.bool()), width: t.opt(t.num(0, 2000)), size: t.opt(t.oneOf('S', 'M', 'L')), provider: t.opt(t.oneOf('claude', 'openai', 'both')) },
  'ai-ask': { text: t.str(20000), includePage: t.opt(t.bool()), action: t.opt(t.oneOf('summarize', 'compare-tabs', 'sort-tabs')) },
  'ai-stop': none,
  'ai-new-chat': none,
  'ai-apply-sort': { plan: t.arr(t.obj({ tabId: t.id(), spaceId: t.id() }), 500) },
  'ai-retry-connection': none,
  'ai-agent': { goal: t.str(4000) },
  'ai-agent-confirm': { id: t.id(), allow: t.bool() },
  'ai-setup': none,
  'ai-open-chat': { id: t.id() },
  // extensions
  'extension-action': { id: t.str(64), x: t.opt(t.num()), y: t.opt(t.num()) },
  'extension-options': { id: t.str(64) },
  'open-web-store': none,
  'ai-delete-chat': { id: t.id() },
  // generic
  escape: none,
  'select-tab-1': none, 'select-tab-2': none, 'select-tab-3': none, 'select-tab-4': none,
  'select-tab-5': none, 'select-tab-6': none, 'select-tab-7': none, 'select-tab-8': none,
  'select-last-tab': none,
  'focus-address': none,
  'run-command': { id: t.str(80) },
};

// Calls internal opal:// pages may make (history, downloads, settings...).
const PAGE_CALLS = {
  'page.navigate': { input: t.str(8192), newTab: t.opt(t.bool()) },
  'page.info': none,
  'pinned.list': none,
  'search.info': none,
  'pinned.set': { sites: t.arr(t.obj({ title: t.str(80), url: t.str(2048) }), 24) },
  'history.list': { query: t.opt(t.str(200)), limit: t.opt(t.int(1, 5000)), before: t.opt(t.num()) },
  'history.remove': { ids: t.arr(t.id(), 5000) },
  'history.clear': none,
  'downloads.list': none,
  'downloads.action': { id: t.id(), action: t.oneOf('open', 'show', 'cancel', 'pause', 'resume', 'retry', 'remove') },
  'downloads.clear': none,
  'bookmarks.list': none,
  'bookmarks.add': { spaceId: t.id(), title: t.str(300), url: t.opt(t.str(4096)), folder: t.opt(t.bool()), parentId: t.opt(t.id()) },
  'bookmarks.update': { id: t.id(), title: t.opt(t.str(300)), url: t.opt(t.str(4096)) },
  'bookmarks.remove': { id: t.id() },
  'bookmarks.move': { id: t.id(), spaceId: t.id(), parentId: t.opt(t.id()), index: t.opt(t.int(0, 100000)) },
  'settings.get': none,
  'settings.set': { key: t.str(80), value: t.any() },
  'settings.pickDownloadDir': none,
  'settings.resetDownloadDir': none,
  'data.clearDialog': none,
  'data.clear': { range: t.oneOf('hour', 'day', 'week', 'month', 'all'), history: t.bool(), cookies: t.bool(), cache: t.bool(), downloads: t.bool() },
  'profiles.list': none,
  'profiles.create': { name: t.str(40), color: t.color() },
  'profiles.update': { id: t.id(), name: t.opt(t.str(40)), color: t.opt(t.color()) },
  'profiles.open': { id: t.id() },
  'profiles.remove': { id: t.id() },
  'sites.list': none,
  'sites.reset': { origin: t.str(2048), permission: t.opt(t.str(64)) },
  'extensions.list': none,
  'extensions.load': none,
  'extensions.remove': { id: t.str(64) },
  'extensions.reload': { id: t.str(64) },
  'extensions.setEnabled': { id: t.str(64), enabled: t.bool() },
  'extensions.options': { id: t.str(64) },
  'extensions.webStore': none,
  'extensions.update': none,
  'onyx.status': none,
  'onyx.test': none,
  'ai.info': none,
  'browser.defaultStatus': none,
  'browser.makeDefault': none,
  'update.status': none,
  'ai.refresh': none,
  'ai.setKey': { provider: t.oneOf('anthropic', 'openai'), key: t.str(400) },
  'ai.listModels': { provider: t.oneOf('anthropic', 'openai', 'ollama') },
  'sync.status': none,
  'sync.now': none,
  'passwords.status': none,
  'reader.get': none,
  'about.info': none,
  'spaces.list': none,
  'shortcuts.list': none,
};

function validate(table, name, args) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(table, name)) return false;
  return checkShape(table[name], args === undefined ? {} : args);
}

module.exports = { UI_COMMANDS, PAGE_CALLS, validate, rect, t };
