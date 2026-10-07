'use strict';
// Handlers for calls made by Opal's own pages (opal://history, bookmarks, settings ...).
// Every call is validated against PAGE_CALLS in schema.js before it gets here.

const { refreshBookmarks } = require('./commands');

function install(opal) {
  const profileOf = (ctx) => ctx.window?.profile;

  opal.addPageCalls({
    // ---- history ----
    'history.list': (a, ctx) => profileOf(ctx)?.listHistory(a) || [],
    'history.remove': (a, ctx) => { profileOf(ctx)?.removeHistory(a.ids); },
    'history.clear': (_a, ctx) => { profileOf(ctx)?.clearHistory(); },

    // ---- bookmarks ----
    'bookmarks.list': (_a, ctx) => {
      const p = profileOf(ctx);
      return p ? p.spaces.map((s) => ({ id: s.id, name: s.name, color: s.color, bookmarks: s.bookmarks })) : [];
    },
    'bookmarks.add': (a, ctx) => {
      const p = profileOf(ctx);
      if (!p) return null;
      if (!a.folder && !/^(https?|file|opal):/.test(a.url || '')) throw new Error('Bookmarks need a web address');
      const node = p.addBookmark(a.spaceId, a);
      refreshBookmarks(opal, p);
      return node;
    },
    'bookmarks.update': (a, ctx) => {
      const p = profileOf(ctx);
      if (!p) return;
      if (a.url !== undefined && !/^(https?|file|opal):/.test(a.url)) throw new Error('Bookmarks need a web address');
      p.updateBookmark(a.id, a);
      refreshBookmarks(opal, p);
    },
    'bookmarks.remove': (a, ctx) => { const p = profileOf(ctx); if (p) { p.removeBookmark(a.id); refreshBookmarks(opal, p); } },
    'bookmarks.move': (a, ctx) => { const p = profileOf(ctx); if (p) { p.moveBookmark(a.id, a.spaceId, a.parentId, a.index); refreshBookmarks(opal, p); } },
    'spaces.list': (_a, ctx) => (profileOf(ctx)?.spaces || []).map((s) => ({ id: s.id, name: s.name, color: s.color })),
  });

  // Tell open bookmark manager pages to refresh.
  opal.on('bookmarks-changed', (profile) => {
    for (const w of opal.windowsOf(profile)) {
      for (const tab of w.allTabs()) {
        for (const p of tab.panes) {
          if (p.view && p.url.startsWith('opal://bookmarks')) p.view.webContents.send('page:bookmarks', {});
        }
      }
    }
  });
}

module.exports = { install };
