'use strict';
// Downloads: session "will-download", the toolbar progress ring, the downloads
// popover and opal://downloads.

const path = require('path');
const fs = require('fs');
const { app, shell } = require('electron');
const { newId } = require('./profile');

const LIMIT = 300;

function uniquePath(dir, filename) {
  const safe = filename.replace(/[/\\\0]/g, '_').replace(/^\.+/, '') || 'download';
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let i = 1; fs.existsSync(candidate) || fs.existsSync(candidate + '.part'); i++) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

function install(opal) {
  const live = new Map(); // id -> DownloadItem
  const recentUntil = new Map(); // profile -> timestamp (dot on the toolbar button)

  function records(profile) {
    if (!profile.downloads) profile.downloads = profile.incognito ? [] : (profile.data.get('downloads') || []);
    return profile.downloads;
  }

  function save(profile) {
    if (!profile.incognito) profile.data.set('downloads', records(profile).slice(-LIMIT));
  }

  let pushTimer = null;
  function changed(profile) {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      for (const w of opal.windowsOf(profile)) {
        w.pushState();
        if (w.overlayKind === 'downloads') opal.runCommand(w, 'open-popover', { kind: 'downloads', ...w.popoverAnchor });
      }
      notifyPages(profile);
    }, 150);
  }

  function notifyPages(profile) {
    for (const w of opal.windowsOf(profile)) {
      for (const tab of w.allTabs()) {
        for (const p of tab.panes) {
          if (p.view && p.url.startsWith('opal://downloads')) p.view.webContents.send('page:downloads', {});
        }
      }
    }
  }

  function publicRecord(r) {
    const { profile, ...rest } = r; // eslint-disable-line no-unused-vars
    return { ...rest, exists: r.state === 'completed' ? fs.existsSync(r.path) : undefined };
  }

  opal.on('session', (profile, ses) => {
    ses.on('will-download', (_e, item) => {
      const dir = opal.settings.get('downloadDir') || app.getPath('downloads');
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* reported on failure */ }
      if (!opal.settings.get('askWhereToSave')) item.setSavePath(uniquePath(dir, item.getFilename()));
      const rec = {
        id: newId('d'),
        filename: item.getFilename(),
        url: item.getURL(),
        path: item.getSavePath(),
        mime: item.getMimeType(),
        state: 'progressing',
        received: 0,
        total: item.getTotalBytes(),
        startedAt: Date.now(),
        paused: false,
      };
      live.set(rec.id, item);
      records(profile).push(rec);
      recentUntil.set(profile, Date.now() + 60000);
      item.on('updated', (_ev, state) => {
        rec.state = state;
        rec.received = item.getReceivedBytes();
        rec.total = item.getTotalBytes();
        rec.paused = item.isPaused();
        if (item.getSavePath()) { rec.path = item.getSavePath(); rec.filename = path.basename(rec.path); }
        changed(profile);
      });
      item.once('done', (_ev, state) => {
        rec.state = state;
        rec.received = item.getReceivedBytes();
        rec.total = item.getTotalBytes() || rec.received;
        rec.finishedAt = Date.now();
        if (item.getSavePath()) { rec.path = item.getSavePath(); rec.filename = path.basename(rec.path); }
        live.delete(rec.id);
        recentUntil.set(profile, Date.now() + 60000);
        save(profile);
        changed(profile);
        opal.emit('download-done', profile, rec);
        for (const w of opal.windowsOf(profile)) {
          if (state === 'completed') w.send('toast', { text: `Downloaded ${rec.filename}` });
          else if (state === 'interrupted') w.send('toast', { text: `Download failed: ${rec.filename}` });
        }
      });
      save(profile);
      changed(profile);
    });
  });

  opal.stateProviders.push((w) => {
    const recs = records(w.profile).filter((r) => r.state === 'progressing');
    let rec = 0;
    let tot = 0;
    for (const r of recs) { rec += r.received; tot += r.total || 0; }
    return {
      downloads: {
        active: recs.length,
        progress: tot ? rec / tot : 0,
        recent: (recentUntil.get(w.profile) || 0) > Date.now(),
      },
    };
  });

  function act(profile, id, action) {
    const list = records(profile);
    const rec = list.find((r) => r.id === id);
    if (!rec) return;
    const item = live.get(id);
    switch (action) {
      case 'open': if (rec.state === 'completed') shell.openPath(rec.path); break;
      case 'show': shell.showItemInFolder(rec.path); break;
      case 'cancel': if (item) item.cancel(); break;
      case 'pause': if (item) item.pause(); break;
      case 'resume': if (item && item.canResume()) item.resume(); break;
      case 'retry': profile.ses.downloadURL(rec.url); list.splice(list.indexOf(rec), 1); break;
      case 'remove': if (item) item.cancel(); list.splice(list.indexOf(rec), 1); break;
      default:
    }
    save(profile);
    changed(profile);
  }

  opal.addCommands({
    'download-action': (w, a) => act(w.profile, a.id, a.action),
  });

  opal.popoverProviders.downloads = (w, a) => {
    w.popoverAnchor = { x: a.x, y: a.y };
    recentUntil.delete(w.profile);
    w.pushState();
    return { items: records(w.profile).slice(-6).reverse().map(publicRecord) };
  };

  opal.addPageCalls({
    'downloads.list': (_a, ctx) => (ctx.window ? records(ctx.window.profile).slice().reverse().map(publicRecord) : []),
    'downloads.action': (a, ctx) => { if (ctx.window) act(ctx.window.profile, a.id, a.action); },
    'downloads.clear': (_a, ctx) => {
      if (!ctx.window) return;
      const p = ctx.window.profile;
      p.downloads = records(p).filter((r) => r.state === 'progressing');
      save(p);
      changed(p);
    },
  });
}

module.exports = { install, uniquePath };
