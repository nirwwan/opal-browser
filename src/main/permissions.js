'use strict';
// Site permissions: camera, microphone, location and notifications (and a few
// more) ask the user with an infobar above the page; answers are remembered
// per site. Hardware APIs are denied.

const { newId } = require('./profile');

const ASK = {
  geolocation: { key: 'location', text: 'wants to know your location', icon: 'globe' },
  notifications: { key: 'notifications', text: 'wants to show notifications', icon: 'info' },
  midi: { key: 'midi', text: 'wants to use your MIDI devices', icon: 'keyboard' },
  midiSysex: { key: 'midi', text: 'wants full control of your MIDI devices', icon: 'keyboard' },
  'clipboard-read': { key: 'clipboard', text: 'wants to see text and images copied to the clipboard', icon: 'copy' },
  'idle-detection': { key: 'idle', text: 'wants to know when you are actively using this device', icon: 'info' },
  'window-management': { key: 'windows', text: 'wants to manage windows on all your displays', icon: 'square' },
};
const ALLOW = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'keyboardLock', 'speaker-selection', 'persistent-storage', 'storage-access', 'top-level-storage-access']);

const LABELS = { camera: 'Camera', microphone: 'Microphone', location: 'Location', notifications: 'Notifications', midi: 'MIDI devices', clipboard: 'Clipboard', idle: 'Idle detection', windows: 'Window management' };

function originOf(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

// Turns an Electron permission request into the keys we ask about.
function describe(permission, details = {}) {
  if (permission === 'media') {
    const types = details.mediaTypes || [];
    const keys = [];
    if (types.includes('video')) keys.push('camera');
    if (types.includes('audio')) keys.push('microphone');
    if (!keys.length) return null;
    const text = keys.length === 2 ? 'wants to use your camera and microphone' : keys[0] === 'camera' ? 'wants to use your camera' : 'wants to use your microphone';
    return { keys, text, icon: 'user' };
  }
  const a = ASK[permission];
  return a ? { keys: [a.key], text: a.text, icon: a.icon } : null;
}

function install(opal) {
  const pending = new Map(); // id -> { pane, window, callback, origin, keys }

  function decide(id, allow, remember) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (remember) for (const k of p.keys) p.window.profile.setPermission(p.origin, k, allow ? 'allow' : 'block');
    p.callback(allow);
    p.window.pushState();
  }

  function dropFor(pane) {
    for (const [id, p] of pending) if (p.pane === pane) decide(id, false, false);
  }

  opal.on('session', (profile, ses) => {
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (ALLOW.has(permission)) return callback(true);
      const desc = describe(permission, details);
      if (!desc) return callback(false);
      const origin = originOf(details.requestingUrl || wc.getURL());
      if (!origin || origin === 'null') return callback(false);
      const stored = desc.keys.map((k) => profile.getPermission(origin, k));
      if (stored.every((v) => v === 'allow')) return callback(true);
      if (stored.some((v) => v === 'block')) return callback(false);
      const w = opal.windowFor(wc);
      const found = w?.findPaneByContents(wc);
      if (!w || !found) return callback(false);
      const id = newId('q');
      pending.set(id, { pane: found.pane, window: w, callback, origin, keys: desc.keys, text: desc.text, icon: desc.icon });
      w.pushState();
    });
    ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
      if (ALLOW.has(permission)) return true;
      const desc = describe(permission, { mediaTypes: details?.mediaType ? [details.mediaType] : [] });
      if (!desc) return false;
      const origin = originOf(requestingOrigin);
      return desc.keys.every((k) => profile.getPermission(origin, k) === 'allow');
    });
    // Hardware device pickers are not supported: deny.
    ses.setDevicePermissionHandler(() => false);
  });

  opal.on('navigated', (_w, pane) => dropFor(pane));

  opal.stateProviders.push((w) => {
    const pane = w.activePane;
    const bars = [];
    for (const [id, p] of pending) {
      if (p.window !== w || p.pane !== pane) continue;
      let host = p.origin;
      try { host = new URL(p.origin).host; } catch { /* keep origin */ }
      bars.push({
        id,
        icon: p.icon,
        text: `${host} ${p.text}`,
        buttons: [{ label: 'Block', action: 'block' }, { label: 'Allow', action: 'allow', primary: true }],
      });
    }
    return { infobars: bars };
  });

  opal.addCommands({
    'permission-reply': (_w, a) => decide(a.id, a.allow, a.remember !== false),
  });

  // Site settings (used by the site-info popover and settings page).
  opal.addPageCalls({
    'sites.list': (_a, ctx) => {
      const all = ctx.window?.profile.data.get('sitePermissions') || {};
      return Object.entries(all).map(([origin, perms]) => ({ origin, perms: Object.entries(perms).map(([k, v]) => ({ key: k, label: LABELS[k] || k, value: v })) }));
    },
    'sites.reset': (a, ctx) => { ctx.window?.profile.resetPermission(a.origin, a.permission); },
  });

  opal.permissions = { pending, decide, LABELS };
}

module.exports = { install, describe, LABELS };
