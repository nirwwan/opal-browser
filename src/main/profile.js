'use strict';
// A profile: its own session partition, spaces, bookmarks, history, site
// permissions and saved window session. Incognito profiles live only in memory.

const path = require('path');
const crypto = require('crypto');
const { JsonStore } = require('./store');

const DEFAULT_SPACES = [
  { name: 'Personal', color: '#2a4bc7' },
  { name: 'Work', color: '#b44f0c' },
  { name: 'Linux', color: '#0f6b5c' },
];

const DEFAULT_PINNED = [
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com/' },
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: 'Arch Wiki', url: 'https://wiki.archlinux.org/' },
];

const HISTORY_LIMIT = 20000;

function newId(prefix) {
  return prefix + crypto.randomBytes(6).toString('hex');
}

function defaultBookmarks(spaceName) {
  if (spaceName === 'Personal') {
    return [
      { id: newId('b'), title: 'DuckDuckGo', url: 'https://duckduckgo.com/' },
      { id: newId('b'), title: 'Wikipedia', url: 'https://en.wikipedia.org/' },
      { id: newId('b'), title: 'Reading', children: [
        { id: newId('b'), title: 'Hacker News', url: 'https://news.ycombinator.com/' },
        { id: newId('b'), title: 'LWN.net', url: 'https://lwn.net/' },
      ] },
    ];
  }
  if (spaceName === 'Work') {
    return [
      { id: newId('b'), title: 'GitHub', url: 'https://github.com/' },
      { id: newId('b'), title: 'MDN', url: 'https://developer.mozilla.org/' },
    ];
  }
  if (spaceName === 'Linux') {
    return [
      { id: newId('b'), title: 'Arch Wiki', url: 'https://wiki.archlinux.org/' },
      { id: newId('b'), title: 'Electron docs', url: 'https://www.electronjs.org/docs/latest/' },
    ];
  }
  return [];
}

class Profile {
  // meta: { id, name, color }; dir: folder for this profile's files.
  constructor(meta, dir, { incognito = false } = {}) {
    this.id = meta.id;
    this.name = meta.name;
    this.color = meta.color;
    this.incognito = incognito;
    this.partition = incognito ? 'opal-incognito-' + meta.id : 'persist:profile-' + meta.id;
    const memory = incognito;
    this.data = new JsonStore(path.join(dir, 'profile.json'), {
      spaces: [],
      pinnedSites: DEFAULT_PINNED,
      showBookmarksBar: true,
      sitePermissions: {},
    }, { memory });
    this.session = new JsonStore(path.join(dir, 'session.json'), { windows: [] }, { memory, delay: 250 });
    this.history = new JsonStore(path.join(dir, 'history.json'), { entries: [] }, { memory, delay: 1500 });
    if (!this.data.get('spaces').length) this.resetSpaces();
  }

  resetSpaces() {
    const spaces = this.incognito
      ? [{ id: newId('s'), name: 'Incognito', color: '#3d4452', bookmarks: [] }]
      : DEFAULT_SPACES.map((s) => ({ id: newId('s'), ...s, bookmarks: defaultBookmarks(s.name) }));
    this.data.set('spaces', spaces);
  }

  // ---- spaces ----
  get spaces() {
    return this.data.get('spaces');
  }

  space(id) {
    return this.spaces.find((s) => s.id === id);
  }

  createSpace(name, color) {
    const space = { id: newId('s'), name: name.trim() || 'Space', color, bookmarks: [] };
    this.data.set('spaces', [...this.spaces, space]);
    return space;
  }

  updateSpace(id, { name, color }) {
    const s = this.space(id);
    if (!s) return;
    if (name !== undefined && name.trim()) s.name = name.trim();
    if (color !== undefined) s.color = color;
    this.data.save();
  }

  deleteSpace(id) {
    if (this.spaces.length <= 1) return false;
    this.data.set('spaces', this.spaces.filter((s) => s.id !== id));
    return true;
  }

  // ---- bookmarks (a tree per space) ----
  *walkBookmarks() {
    for (const space of this.spaces) {
      const stack = space.bookmarks.map((n) => ({ node: n, list: space.bookmarks, space }));
      while (stack.length) {
        const item = stack.shift();
        yield item;
        if (item.node.children) {
          for (const c of item.node.children) stack.push({ node: c, list: item.node.children, space });
        }
      }
    }
  }

  findBookmark(id) {
    for (const item of this.walkBookmarks()) if (item.node.id === id) return item;
    return null;
  }

  findBookmarkByUrl(spaceId, url) {
    for (const item of this.walkBookmarks()) {
      if (item.space.id === spaceId && item.node.url === url) return item;
    }
    return null;
  }

  addBookmark(spaceId, { title, url, folder, parentId }) {
    const space = this.space(spaceId);
    if (!space) return null;
    const node = folder ? { id: newId('b'), title, children: [] } : { id: newId('b'), title, url };
    let list = space.bookmarks;
    if (parentId) {
      const parent = this.findBookmark(parentId);
      if (parent && parent.node.children) list = parent.node.children;
    }
    list.push(node);
    this.data.save();
    return node;
  }

  updateBookmark(id, { title, url }) {
    const item = this.findBookmark(id);
    if (!item) return;
    if (title !== undefined) item.node.title = title;
    if (url !== undefined && !item.node.children) item.node.url = url;
    this.data.save();
  }

  removeBookmark(id) {
    const item = this.findBookmark(id);
    if (!item) return;
    item.list.splice(item.list.indexOf(item.node), 1);
    this.data.save();
  }

  moveBookmark(id, spaceId, parentId, index) {
    const item = this.findBookmark(id);
    const space = this.space(spaceId);
    if (!item || !space) return;
    let list = space.bookmarks;
    if (parentId) {
      const parent = this.findBookmark(parentId);
      if (!parent || !parent.node.children || parent.node === item.node) return;
      list = parent.node.children;
    }
    item.list.splice(item.list.indexOf(item.node), 1);
    list.splice(index === undefined ? list.length : Math.min(index, list.length), 0, item.node);
    this.data.save();
  }

  // ---- history ----
  addHistory(url, title) {
    if (this.incognito || !/^https?:/.test(url)) return;
    const entries = this.history.get('entries');
    const last = entries[entries.length - 1];
    const now = Date.now();
    if (last && last.url === url && now - last.visitedAt < 30000) {
      if (title) last.title = title;
    } else {
      entries.push({ id: newId('h'), url, title: title || url, visitedAt: now });
      if (entries.length > HISTORY_LIMIT) entries.splice(0, entries.length - HISTORY_LIMIT);
    }
    this.history.save();
  }

  updateHistoryTitle(url, title) {
    const entries = this.history.get('entries');
    for (let i = entries.length - 1; i >= Math.max(0, entries.length - 20); i--) {
      if (entries[i].url === url) {
        entries[i].title = title;
        this.history.save();
        return;
      }
    }
  }

  listHistory({ query, limit = 300, before } = {}) {
    const q = (query || '').toLowerCase();
    const out = [];
    const entries = this.history.get('entries');
    for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
      const e = entries[i];
      if (before && e.visitedAt >= before) continue;
      if (q && !e.url.toLowerCase().includes(q) && !(e.title || '').toLowerCase().includes(q)) continue;
      out.push(e);
    }
    return out;
  }

  removeHistory(ids) {
    const set = new Set(ids);
    this.history.set('entries', this.history.get('entries').filter((e) => !set.has(e.id)));
  }

  clearHistory(since = 0) {
    this.history.set('entries', since ? this.history.get('entries').filter((e) => e.visitedAt < since) : []);
  }

  // Address bar suggestions: bookmarks first, then history by frecency.
  suggest(text, limit = 6) {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set();
    const out = [];
    for (const { node } of this.walkBookmarks()) {
      if (node.url && (node.url.toLowerCase().includes(q) || node.title.toLowerCase().includes(q)) && !seen.has(node.url)) {
        seen.add(node.url);
        out.push({ kind: 'bookmark', title: node.title, url: node.url });
      }
    }
    const scores = new Map();
    const entries = this.history.get('entries');
    for (let i = entries.length - 1; i >= 0 && i > entries.length - 5000; i--) {
      const e = entries[i];
      const u = e.url.toLowerCase();
      if (!u.includes(q) && !(e.title || '').toLowerCase().includes(q)) continue;
      const host = u.replace(/^https?:\/\/(www\.)?/, '');
      const boost = host.startsWith(q) ? 3 : 1;
      const s = scores.get(e.url) || { title: e.title, url: e.url, score: 0 };
      s.score += boost;
      scores.set(e.url, s);
    }
    const hist = [...scores.values()].sort((a, b) => b.score - a.score);
    for (const h of hist) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      out.push({ kind: 'history', title: h.title, url: h.url });
    }
    return out.slice(0, limit);
  }

  // ---- site permissions ----
  getPermission(origin, permission) {
    const site = this.data.get('sitePermissions')[origin];
    return site ? site[permission] : undefined;
  }

  setPermission(origin, permission, value) {
    const all = this.data.get('sitePermissions');
    all[origin] = { ...(all[origin] || {}), [permission]: value };
    this.data.save();
  }

  resetPermission(origin, permission) {
    const all = this.data.get('sitePermissions');
    if (!all[origin]) return;
    if (permission) delete all[origin][permission];
    if (!permission || !Object.keys(all[origin]).length) delete all[origin];
    this.data.save();
  }

  flush() {
    this.data.flush();
    this.session.flush();
    this.history.flush();
    this.chats?.flush();
  }
}

module.exports = { Profile, newId, DEFAULT_SPACES, DEFAULT_PINNED };
