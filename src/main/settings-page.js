'use strict';
// opal://settings: reads and writes Opal's settings. Each key is checked here
// (the page can only set what's listed, with a valid value).

const { app, dialog } = require('electron');
const { ENGINES } = require('../shared/omnibox');
const { NEW_TAB_URL } = require('./opal-window');

const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Polish', 'Ukrainian', 'Russian', 'Turkish', 'Arabic', 'Hindi', 'Chinese (Simplified)', 'Japanese', 'Korean'];

// key -> validator returning the cleaned value, or undefined to refuse.
const KEYS = {
  searchEngine: (v) => (ENGINES[v] ? v : undefined),
  homePage: (v) => {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s || s === NEW_TAB_URL || s === 'opal://newtab') return NEW_TAB_URL;
    if (/^https?:\/\/\S+$/i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return 'https://' + s;
    return undefined;
  },
  restoreOnStartup: (v) => (typeof v === 'boolean' ? v : undefined),
  askWhereToSave: (v) => (typeof v === 'boolean' ? v : undefined),
  translateTarget: (v) => (LANGS.includes(v) ? v : undefined),
  onyxUrl: (v) => (typeof v === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}\/?$/.test(v.trim()) ? v.trim().replace(/\/$/, '') : undefined),
  onyxTokenFile: (v) => (typeof v === 'string' && v.length < 1024 && (!v || v.startsWith('/')) ? v.trim() : undefined),
  syncWithOnyx: (v) => (typeof v === 'boolean' ? v : undefined),
  autoUpdate: (v) => (typeof v === 'boolean' ? v : undefined),
  'ai.provider': (v) => (['claude', 'openai', 'both'].includes(v) ? v : undefined),
  aiBackend: (v) => (['auto', 'onyx', 'ollama', 'keys', 'off'].includes(v) ? v : undefined),
  ollamaUrl: (v) => (typeof v === 'string' && /^https?:\/\/[^\s/]+(:\d{1,5})?\/?$/.test(v.trim()) ? v.trim().replace(/\/$/, '') : undefined),
  ollamaModel: (v) => (typeof v === 'string' && /^[\w.:/-]{0,200}$/.test(v) ? v : undefined),
  anthropicModel: (v) => (typeof v === 'string' && /^claude-[a-z0-9.-]{1,80}$/.test(v) ? v : undefined),
  openaiModel: (v) => (typeof v === 'string' && /^[\w.:-]{0,100}$/.test(v) ? v : undefined),
  'ai.oneColorDots': (v) => (typeof v === 'boolean' ? v : undefined),
  'ai.size': (v) => (['S', 'M', 'L'].includes(v) ? v : undefined),
  showBookmarksBar: (v) => (typeof v === 'boolean' ? v : undefined),
};

function cleanSetting(key, value) {
  const fn = KEYS[key];
  return fn ? fn(value) : undefined;
}

function install(opal) {
  const refresh = () => { for (const w of opal.windows) { w.pushState(); opal.ai?.pushPanel(w); } };

  function snapshot(ctx) {
    const s = opal.settings;
    const profile = ctx.window?.profile;
    const ai = opal.ai.get();
    return {
      searchEngine: opal.engine(),
      engines: Object.entries(ENGINES).map(([id, e]) => ({ id, name: e.name })),
      homePage: s.get('homePage') === NEW_TAB_URL ? '' : s.get('homePage'),
      restoreOnStartup: s.get('restoreOnStartup') !== false,
      askWhereToSave: !!s.get('askWhereToSave'),
      downloadDir: s.get('downloadDir') || app.getPath('downloads'),
      translateTarget: s.get('translateTarget') || 'English',
      langs: LANGS,
      onyxUrl: s.get('onyxUrl') || 'http://127.0.0.1:7777',
      onyxTokenFile: s.get('onyxTokenFile') || '',
      syncWithOnyx: s.get('syncWithOnyx') !== false,
      autoUpdate: s.get('autoUpdate') !== false,
      ai: { provider: ai.provider, oneColorDots: !!ai.oneColorDots, width: ai.width },
      showBookmarksBar: profile ? profile.data.get('showBookmarksBar') !== false : true,
      incognito: !!profile?.incognito,
      profileName: profile?.name || '',
      onyx: opal.onyx?.status || { connected: false },
      sync: opal.sync ? { lastSyncAt: opal.sync.state.lastSyncAt, error: opal.sync.state.lastError } : null,
      version: app.getVersion(),
    };
  }

  opal.addPageCalls({
    'settings.get': (_a, ctx) => snapshot(ctx),
    'settings.set': async (a, ctx) => {
      const value = cleanSetting(a.key, a.value);
      if (value === undefined) throw new Error("That value isn't allowed");
      if (a.key.startsWith('ai.')) {
        const k = a.key.slice(3);
        if (k === 'size') opal.ai.set({ width: opal.ai.SIZES[value] });
        else opal.ai.set({ [k]: value });
      } else if (a.key === 'showBookmarksBar') {
        if (ctx.window && !ctx.window.profile.incognito) ctx.window.profile.data.set('showBookmarksBar', value);
        for (const w of opal.windowsOf(ctx.window?.profile)) w.pushState();
      } else {
        opal.settings.set(a.key, value);
      }
      if (a.key === 'onyxUrl' || a.key === 'onyxTokenFile') await opal.onyxReset();
      if (['aiBackend', 'ollamaUrl', 'ollamaModel', 'anthropicModel', 'openaiModel', 'onyxUrl', 'onyxTokenFile'].includes(a.key)) await opal.llm.refresh();
      if (a.key === 'syncWithOnyx' && value) opal.sync?.syncAll({ pull: true });
      refresh();
      return snapshot(ctx);
    },
    'settings.pickDownloadDir': async (_a, ctx) => {
      const r = await dialog.showOpenDialog(ctx.window?.win, { title: 'Download folder', properties: ['openDirectory', 'createDirectory'], defaultPath: opal.settings.get('downloadDir') || app.getPath('downloads') });
      if (!r.canceled && r.filePaths[0]) opal.settings.set('downloadDir', r.filePaths[0]);
      return snapshot(ctx);
    },
    'settings.resetDownloadDir': (_a, ctx) => { opal.settings.set('downloadDir', ''); return snapshot(ctx); },
  });
}

module.exports = { install, cleanSetting, LANGS };
