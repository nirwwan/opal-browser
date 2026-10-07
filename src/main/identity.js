'use strict';
// Makes Opal present as stable Google Chrome on Linux, consistently:
// - the reduced Chrome user agent everywhere (app fallback and every session), no Electron/Opal tokens;
// - Accept-Language like Chrome ("en-US,en;q=0.9"), from the system languages;
// - Sec-CH-UA client hint headers (Electron sends none) with Chrome's brand list, plus the
//   high-entropy hints an origin asks for with Accept-CH / Critical-CH;
// - navigator.userAgentData is patched to the same brands by the page preload (see brandArgs);
// - no automation switches in normal use (navigator.webdriver stays false);
// - accounts.google.com only ever loads as a normal top-level tab, never inside a popup or other view.

const { app } = require('electron');
const { chromeUserAgent, chromeBrands, clientHintHeaders, parseAcceptCH } = require('../shared/chrome-identity');

const CHROME_VERSION = process.versions.chrome;
const USER_AGENT = chromeUserAgent(CHROME_VERSION);
const AUTOMATION_SWITCHES = ['enable-automation', 'remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'headless'];

// Chrome-style accept languages: valid tags only, each region tag followed by its base language.
function acceptLanguages(preferred) {
  const out = [];
  for (const raw of preferred || []) {
    const tag = String(raw).replace('_', '-').replace(/\..*$/, '');
    const m = /^([a-zA-Z]{2,3})(?:-([a-zA-Z]{2}|\d{3}))?$/.exec(tag);
    if (!m) continue;
    const full = m[2] ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : m[1].toLowerCase();
    if (!out.includes(full)) out.push(full);
    if (m[2] && !out.includes(m[1].toLowerCase())) out.push(m[1].toLowerCase());
  }
  if (!out.length) out.push('en-US', 'en');
  if (out.length === 1 && out[0].includes('-')) out.push(out[0].split('-')[0]);
  return out.slice(0, 6);
}

// Arguments handed to the page preload so it can patch navigator.userAgentData.
function brandArgs() {
  return [`--opal-ua-data=${encodeURIComponent(JSON.stringify({
    brands: chromeBrands(CHROME_VERSION),
    fullVersionList: chromeBrands(CHROME_VERSION, { full: true }),
    fullVersion: CHROME_VERSION,
  }))}`];
}

const isSecure = (url) => /^https:|^wss:/.test(url) || /^(http|ws):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url);
const isGoogleAccounts = (url) => { try { return new URL(url).hostname === 'accounts.google.com'; } catch { return false; } };

// Called before "ready": user agent fallback and automation switches.
function early() {
  app.userAgentFallback = USER_AGENT;
  // A bare C/POSIX locale (common in containers) makes Chromium list "c" in navigator.languages;
  // Chrome itself would say en-US, en. Give it a real language list before anything reads it.
  if (!process.env.LANGUAGE && /^(C|POSIX)(\.|$)/i.test(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || 'C')) {
    process.env.LANGUAGE = 'en_US';
  }
  if (process.env.OPAL_ALLOW_AUTOMATION !== '1') {
    for (const s of AUTOMATION_SWITCHES) if (app.commandLine.hasSwitch(s)) app.commandLine.removeSwitch(s);
  }
}

function install(opal) {
  const langs = () => acceptLanguages(app.getPreferredSystemLanguages?.() || [app.getLocale()]);

  opal.on('session', (_profile, ses) => {
    ses.setUserAgent(USER_AGENT, langs().join(','));
    const requested = new Map(); // origin -> Set of high-entropy hint names it asked for
    ses.webRequest.onHeadersReceived((details, cb) => {
      const h = details.responseHeaders || {};
      let names = [];
      for (const [k, v] of Object.entries(h)) {
        if (/^(accept-ch|critical-ch)$/i.test(k)) names = names.concat(parseAcceptCH([].concat(v).join(',')));
      }
      if (names.length && details.resourceType === 'mainFrame') {
        try { requested.set(new URL(details.url).origin, new Set(names)); } catch { /* bad url */ }
      }
      cb({});
    });
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      const headers = {};
      for (const [k, v] of Object.entries(details.requestHeaders)) {
        if (/^sec-ch-ua/i.test(k)) continue; // replaced below
        headers[k] = k.toLowerCase() === 'user-agent' && /Electron|opal-browser/i.test(v) ? USER_AGENT : v;
      }
      if (isSecure(details.url)) {
        let names;
        try { names = requested.get(new URL(details.url).origin); } catch { names = null; }
        Object.assign(headers, clientHintHeaders(CHROME_VERSION, names || new Set()));
      }
      cb({ requestHeaders: headers });
    });
  });

  // Google sign-in must run in a real tab: if any other view (extension popup, AI panel,
  // mini player, overlay) tries to load accounts.google.com, open it as a tab instead.
  app.on('web-contents-created', (_e, wc) => {
    const guard = (e, url) => {
      if (!isGoogleAccounts(url)) return;
      if ([...opal.windows].some((w) => w.findPaneByContents(wc))) return; // already a tab
      e.preventDefault();
      const w = opal.focusedWindow();
      if (w) w.newTab({ url });
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', (e, url, _inPlace, isMainFrame) => { if (isMainFrame) guard(e, url); });
    wc.on('did-create-window', (child) => { // never a separate popup window for Google sign-in
      child.webContents.on('will-navigate', guard);
    });
  });

  opal.identity = { USER_AGENT, CHROME_VERSION, brandArgs, acceptLanguages };
}

module.exports = { install, early, acceptLanguages, brandArgs, USER_AGENT, isGoogleAccounts };
