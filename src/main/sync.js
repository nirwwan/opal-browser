'use strict';
// Opal AI chats saved locally, and bookmarks / history / chats / settings synced to
// Onyx storage (GET/PUT /storage/<kind>, backed by SQLite inside Onyx).
//
// Each kind is stored in Onyx as { profiles: { <profileId>: { updatedAt, data } }, app: … }
// so several Opal profiles share one Onyx. Opal pushes when its local copy changes
// (checked every few seconds by hash) and pulls when Onyx has something newer than
// the last sync (at start and whenever Onyx comes back). Incognito never syncs.

const path = require('path');
const crypto = require('crypto');
const { JsonStore } = require('./store');

const KINDS = ['bookmarks', 'history', 'chats', 'settings'];
const CHAT_LIMIT = 100;
const HISTORY_LIMIT = 5000;
const SYNC_EVERY = 5000;
const SYNCED_SETTINGS = ['searchEngine', 'homePage', 'translateTarget', 'restoreOnStartup', 'ai'];

const hash = (v) => crypto.createHash('sha1').update(JSON.stringify(v ?? null)).digest('hex');

// A short title for a chat: its first question.
function chatTitle(chat) {
  const first = chat.messages.find((m) => m.role === 'user');
  const t = (first?.content || 'New chat').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 57) + '…' : t;
}

// Saved form of a chat: no streaming flags, no plan/agent internals.
function serializeChat(chat) {
  return {
    id: chat.id,
    title: chatTitle(chat),
    startedAt: chat.startedAt,
    updatedAt: Date.now(),
    messages: chat.messages.filter((m) => m.content || m.error).slice(-80).map((m) => ({
      id: m.id, role: m.role, content: m.content || '', provider: m.provider, label: m.label || null,
      error: m.error || null, at: m.at || m.startedAt || null, ms: m.ms || null,
    })),
  };
}

// ---- merges (pure, unit-tested) ----
function mergeChats(local, remote) {
  const by = new Map();
  for (const c of [...(remote || []), ...(local || [])]) {
    const cur = by.get(c.id);
    if (!cur || (c.updatedAt || 0) >= (cur.updatedAt || 0)) by.set(c.id, c);
  }
  return [...by.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, CHAT_LIMIT);
}

function mergeHistory(local, remote) {
  const seen = new Set();
  const out = [];
  for (const e of [...(local || []), ...(remote || [])]) {
    const key = e.id || `${e.url}@${e.visitedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => a.visitedAt - b.visitedAt);
  return out.slice(-HISTORY_LIMIT);
}

// Remote bookmarks win per space (they are newer); spaces only on one side are kept.
function mergeBookmarks(localSpaces, remoteSpaces) {
  const remote = new Map((remoteSpaces || []).map((s) => [s.id, s]));
  const out = localSpaces.map((s) => (remote.has(s.id) ? { ...s, bookmarks: remote.get(s.id).bookmarks || [] } : s));
  for (const r of remoteSpaces || []) {
    if (!localSpaces.some((s) => s.id === r.id)) out.push({ id: r.id, name: r.name, color: r.color, bookmarks: r.bookmarks || [] });
  }
  return out;
}

function install(opal) {
  const state = { lastError: null, lastSyncAt: 0, busy: false };

  // ---------- local chats ----------
  function chatsStore(profile) {
    if (!profile.chats) {
      profile.chats = new JsonStore(path.join(opal.profileDir(profile.id), 'chats.json'), { chats: [] }, { memory: profile.incognito, delay: 800 });
    }
    return profile.chats;
  }

  function saveChat(w, chat) {
    if (w.incognito || !chat.messages.length) return;
    const store = chatsStore(w.profile);
    const saved = serializeChat(chat);
    const rest = store.get('chats').filter((c) => c.id !== chat.id);
    store.set('chats', [saved, ...rest].slice(0, CHAT_LIMIT));
  }

  opal.on('ai-chat-updated', (w, chat) => saveChat(w, chat));

  opal.chats = {
    list: (profile) => (profile.incognito ? [] : chatsStore(profile).get('chats')),
    remove: (profile, id) => { const s = chatsStore(profile); s.set('chats', s.get('chats').filter((c) => c.id !== id)); },
  };

  opal.addCommands({
    'ai-open-chat': (w, a) => {
      const c = opal.chats.list(w.profile).find((x) => x.id === a.id);
      if (!c) return;
      if (w.aiBusy) return;
      w.aiChat = { id: c.id, startedAt: c.startedAt, messages: c.messages.map((m) => ({ ...m })) };
      w.agent = null;
      opal.ai.pushPanel(w);
    },
    'ai-delete-chat': (w, a) => {
      opal.chats.remove(w.profile, a.id);
      if (w.aiChat?.id === a.id) w.aiChat = null;
      opal.ai.pushPanel(w);
    },
  });

  // ---------- what each kind looks like locally ----------
  const local = {
    bookmarks: (p) => p.spaces.map((s) => ({ id: s.id, name: s.name, color: s.color, bookmarks: s.bookmarks })),
    history: (p) => p.history.get('entries'),
    chats: (p) => chatsStore(p).get('chats'),
    settings: () => Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, opal.settings.get(k)])),
  };

  const apply = {
    bookmarks: (p, data) => { p.data.set('spaces', mergeBookmarks(p.spaces, data)); for (const w of opal.windowsOf(p)) w.pushState(); },
    history: (p, data) => { p.history.set('entries', mergeHistory(p.history.get('entries'), data)); },
    chats: (p, data) => { chatsStore(p).set('chats', mergeChats(chatsStore(p).get('chats'), data)); },
    settings: (_p, data) => {
      for (const k of SYNCED_SETTINGS) if (data && data[k] !== undefined) opal.settings.set(k, data[k]);
      for (const w of opal.windows) { w.pushState(); opal.ai.pushPanel(w); }
    },
  };

  // Per profile: { [kind]: { hash, at } } of the last successful sync.
  const syncMeta = (p) => p.data.get('sync') || {};
  const setMeta = (p, kind, v) => p.data.set('sync', { ...syncMeta(p), [kind]: v });

  const syncedProfiles = () => [...opal.profiles.values()].filter((p) => !p.incognito);
  const enabled = () => opal.settings.get('syncWithOnyx') !== false;

  // Pulls newer data from Onyx, then pushes anything that changed locally.
  async function syncAll({ pull = false } = {}) {
    if (state.busy || !enabled() || !opal.onyx?.status?.connected) return;
    state.busy = true;
    try {
      for (const kind of KINDS) {
        let remote = null;
        const need = pull || syncedProfiles().some((p) => hash(local[kind](p)) !== syncMeta(p)[kind]?.hash);
        if (!need) continue;
        remote = (await opal.onyx.getStorage(kind))?.data || {};
        if (!remote || typeof remote !== 'object' || Array.isArray(remote)) remote = {};
        remote.profiles = remote.profiles || {};
        let changed = false;
        for (const p of syncedProfiles()) {
          const scope = kind === 'settings' ? remote.app : remote.profiles[p.id];
          const meta = syncMeta(p)[kind] || { at: 0 };
          if (scope && scope.updatedAt > (meta.at || 0)) apply[kind](p, scope.data);
          const data = local[kind](p);
          const h = hash(data);
          if (h !== meta.hash || !scope) {
            const entry = { updatedAt: Date.now(), data };
            if (kind === 'settings') remote.app = entry; else remote.profiles[p.id] = entry;
            changed = true;
          }
          setMeta(p, kind, { hash: h, at: (kind === 'settings' ? remote.app : remote.profiles[p.id])?.updatedAt || Date.now() });
        }
        if (changed) await opal.onyx.putStorage(kind, remote);
      }
      state.lastError = null;
      state.lastSyncAt = Date.now();
    } catch (err) {
      state.lastError = err.message;
    } finally {
      state.busy = false;
    }
  }

  let wasConnected = false;
  opal.on('onyx-status', (st) => {
    if (st.connected && !wasConnected) syncAll({ pull: true });
    wasConnected = !!st.connected;
  });
  opal.on('init', () => {
    const t = setInterval(() => syncAll(), SYNC_EVERY);
    t.unref?.();
    // The first health check may already have connected before this listener ran.
    setTimeout(() => { if (opal.onyx?.status?.connected) { wasConnected = true; syncAll({ pull: true }); } }, 1500).unref?.();
  });
  app_quit_hook(opal, () => syncAll());

  opal.sync = { syncAll, state, mergeChats, mergeHistory, mergeBookmarks };
  opal.stateProviders.push(() => ({ sync: { enabled: enabled(), lastSyncAt: state.lastSyncAt, error: state.lastError } }));
  opal.addPageCalls({
    'sync.status': () => ({ enabled: enabled(), lastSyncAt: state.lastSyncAt, error: state.lastError, connected: !!opal.onyx?.status?.connected }),
    'sync.now': async () => { await syncAll({ pull: true }); return { lastSyncAt: state.lastSyncAt, error: state.lastError }; },
  });
}

// A last push when the app quits (best effort; never blocks quitting for long).
function app_quit_hook(opal, fn) {
  const { app } = require('electron');
  let done = false;
  app.on('before-quit', (e) => {
    if (done || !opal.onyx?.status?.connected || opal.settings.get('syncWithOnyx') === false) return;
    e.preventDefault();
    done = true;
    Promise.race([fn(), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.quit());
  });
}

module.exports = { install, serializeChat, chatTitle, mergeChats, mergeHistory, mergeBookmarks };
