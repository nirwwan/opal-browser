'use strict';
// Data for the About, Help (keyboard shortcuts) and Passwords pages, the
// site-info / passwords / translate popovers.

const { app } = require('electron');
const { TABLE, HINTS } = require('../shared/shortcuts');
const { aboutLogo, listIcons } = require('./icons');

const SHORTCUT_LABELS = {
  'new-tab': 'New tab', 'close-tab': 'Close tab (or the focused split pane)', 'reopen-closed-tab': 'Reopen closed tab',
  'focus-address': 'Focus the address bar', reload: 'Reload', 'hard-reload': 'Reload, ignoring the cache',
  'new-window': 'New window', 'new-incognito-window': 'New incognito window', find: 'Find in page',
  'find-next': 'Next match', 'find-previous': 'Previous match', history: 'History', downloads: 'Downloads',
  print: 'Print', 'save-page': 'Save page as', 'view-source': 'View page source', 'bookmark-page': 'Bookmark this page',
  'toggle-bookmarks-bar': 'Show or hide the bookmarks bar', bookmarks: 'Bookmark manager', 'next-tab': 'Next tab',
  'previous-tab': 'Previous tab', back: 'Back', forward: 'Forward', home: 'Home', 'command-bar': 'Command bar',
  'toggle-ai': 'Show or hide Opal AI', 'clear-data': 'Delete browsing data', 'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out',
  'zoom-reset': 'Reset zoom', fullscreen: 'Full screen', devtools: 'Developer tools', 'reader-mode': 'Reader mode',
  'split-view': 'Split view', escape: 'Stop loading / close find or menus', 'select-last-tab': 'Last tab',
};

function keyName(mods, key) {
  const parts = [];
  if (mods.includes('c')) parts.push('Ctrl');
  if (mods.includes('s')) parts.push('Shift');
  if (mods.includes('a')) parts.push('Alt');
  const k = { ArrowLeft: 'Left', ArrowRight: 'Right', PageUp: 'Page Up', PageDown: 'Page Down', Escape: 'Esc', '=': '=', '-': '-' }[key] || (key.length === 1 ? key.toUpperCase() : key);
  parts.push(k);
  return parts.join('+');
}

function install(opal) {
  opal.addPageCalls({
    'about.info': () => {
      const logo = aboutLogo('light');
      return {
        name: 'Opal',
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        v8: process.versions.v8,
        userData: app.getPath('userData'),
        logo: logo ? { wordmark: logo.wordmark } : null,
        iconCount: listIcons().length,
        ai: opal.llm ? (() => { const st = opal.llm.status(); return st.ready ? `Ready (${st.backend === 'keys' ? 'your API key' : st.backend})` : st.setting === 'off' ? 'Off' : 'Not set up'; })() : 'Not set up',
      };
    },
    'shortcuts.list': () => {
      const groups = new Map();
      for (const [mods, key, cmd] of TABLE) {
        if (cmd.startsWith('select-tab-')) continue;
        if (!groups.has(cmd)) groups.set(cmd, []);
        groups.get(cmd).push(keyName(mods, key));
      }
      const out = [...groups].map(([cmd, keys]) => ({ cmd, label: SHORTCUT_LABELS[cmd] || cmd, keys }));
      out.push({ cmd: 'select-tab', label: 'Go to tab 1-8', keys: ['Ctrl+1 … Ctrl+8'] });
      return out;
    },
    'passwords.status': () => ({ supported: false }),
  });

  opal.popoverProviders['site-info'] = (w) => {
    const pane = w.activePane;
    const url = pane ? (pane.errorFor?.url || pane.url) : '';
    let origin = '';
    let host = '';
    try { const u = new URL(url); origin = u.origin; host = u.host; } catch { /* not a URL */ }
    const perms = origin && origin !== 'null' ? Object.entries(w.profile.data.get('sitePermissions')[origin] || {}) : [];
    const LABELS = opal.permissions?.LABELS || {};
    return {
      url, origin, host,
      security: url.startsWith('https:') ? 'secure' : url.startsWith('http:') ? 'insecure' : 'internal',
      perms: perms.map(([k, v]) => ({ key: k, label: LABELS[k] || k, value: v })),
    };
  };
  opal.popoverProviders.passwords = () => ({});
  opal.popoverProviders.translate = () => ({ target: opal.settings.get('translateTarget') || 'English' });
  opal.popoverProviders.extensions = () => ({ items: opal.extensionsList ? opal.extensionsList() : [] });

  opal.addCommands({
    'site-reset-permission': (w, a) => {
      w.profile.resetPermission(a.origin, a.permission);
      opal.runCommand(w, 'open-popover', { kind: 'site-info', ...(w.popoverAnchor || { x: 400, y: 50 }) });
    },
  });
  // Translate runs through Opal AI (Phase 3). Until then, say so clearly.
  if (!opal.commands.translate) {
    opal.addCommands({ translate: (w) => w.send('toast', { text: 'Translate needs Opal AI. Set it up in Settings.' }) });
  }

  opal.HINTS = HINTS;
}

module.exports = { install, keyName };
