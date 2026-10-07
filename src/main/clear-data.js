'use strict';
// "Delete browsing data" (Ctrl+Shift+Del).

const { showOverlay } = require('./overlay');

const RANGES = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, all: 0 };

async function clearData(opal, profile, { range, history, cookies, cache, downloads }) {
  const since = RANGES[range] ? Date.now() - RANGES[range] : 0;
  if (history) profile.clearHistory(since);
  if (downloads && profile.downloads) {
    profile.downloads = profile.downloads.filter((d) => d.state === 'progressing' || (since && d.startedAt < since));
    if (!profile.incognito) profile.data.set('downloads', profile.downloads);
  }
  // Electron can only clear site storage for all time.
  if (cookies) await profile.ses.clearStorageData();
  if (cache) {
    await profile.ses.clearCache();
    await profile.ses.clearCodeCaches({}).catch(() => {});
  }
  opal.emit('data-cleared', profile, { range, history, cookies, cache, downloads });
}

function install(opal) {
  const open = (w) => showOverlay(opal, w, { kind: 'clear-data', dim: true });
  opal.addCommands({
    'clear-data': open,
    'clear-data-run': async (w, a) => {
      await clearData(opal, w.profile, a);
      w.send('toast', { text: 'Browsing data deleted' });
      w.pushState();
    },
  });
  opal.addPageCalls({
    'data.clearDialog': (_a, ctx) => { if (ctx.window) open(ctx.window); },
    'data.clear': (a, ctx) => (ctx.window ? clearData(opal, ctx.window.profile, a) : null),
  });
  opal.clearData = (profile, opts) => clearData(opal, profile, opts);
}

module.exports = { install, clearData };
