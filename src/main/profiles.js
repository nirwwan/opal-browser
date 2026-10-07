'use strict';
// Profiles: each has its own persistent partition (cookies, storage, cache),
// spaces, bookmarks, history and windows.

function install(opal) {
  function openProfile(id) {
    const profile = opal.getProfile(id);
    if (!profile) return null;
    const existing = opal.windowsOf(profile)[0];
    if (existing) { existing.win.focus(); return existing; }
    const saved = profile.session.get('windows') || [];
    if (saved.length) {
      let first = null;
      for (const s of saved) { const w = opal.openWindow(profile, { saved: s }); first = first || w; }
      return first;
    }
    return opal.openWindow(profile, {});
  }

  function pushAll() {
    for (const w of opal.windows) w.pushState();
  }

  opal.openProfile = openProfile;

  opal.stateProviders.push(() => ({ profiles: opal.meta.get('profiles') }));

  opal.addCommands({
    'switch-profile': (_w, a) => openProfile(a.profileId),
    'create-profile': (_w, a) => {
      const meta = opal.createProfile(a.name, a.color);
      pushAll();
      openProfile(meta.id);
    },
  });

  opal.addPageCalls({
    'profiles.list': () => opal.meta.get('profiles').map((p) => ({ ...p, open: opal.windowsOf(opal.profiles.get(p.id) || {}).length > 0 })),
    'profiles.create': (a) => { const m = opal.createProfile(a.name, a.color); pushAll(); return m; },
    'profiles.update': (a) => {
      const list = opal.meta.get('profiles');
      const m = list.find((p) => p.id === a.id);
      if (!m) return;
      if (a.name && a.name.trim()) m.name = a.name.trim();
      if (a.color) m.color = a.color;
      opal.meta.set('profiles', list);
      const live = opal.profiles.get(a.id);
      if (live) { live.name = m.name; live.color = m.color; }
      pushAll();
    },
    'profiles.open': (a) => { openProfile(a.id); },
    'profiles.remove': async (a) => {
      const list = opal.meta.get('profiles');
      if (list.length <= 1) throw new Error('Opal needs at least one profile');
      const live = opal.profiles.get(a.id);
      if (live && opal.windowsOf(live).length) throw new Error('Close this profile\'s windows first');
      opal.meta.set('profiles', list.filter((p) => p.id !== a.id));
      if (opal.meta.get('lastProfileId') === a.id) opal.meta.set('lastProfileId', opal.meta.get('profiles')[0].id);
      if (live) {
        await live.ses.clearStorageData().catch(() => {});
        opal.profiles.delete(a.id);
      }
      const fs = require('fs');
      fs.rmSync(opal.profileDir(a.id), { recursive: true, force: true });
      pushAll();
    },
  });
}

module.exports = { install };
