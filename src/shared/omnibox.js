'use strict';
// Address bar parsing: decides whether typed text is a URL or a search.
// Pure module, shared by the main process and the unit tests.

// Search engines the user can pick (settings: searchEngine). Google is the default.
const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=', host: 'www.google.com', param: 'q', path: '/search' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', host: 'duckduckgo.com', param: 'q', path: '/' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', host: 'www.bing.com', param: 'q', path: '/search' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search?q=', host: 'search.brave.com', param: 'q', path: '/search' },
};
const DEFAULT_ENGINE = 'google';
const SEARCH_URL = ENGINES[DEFAULT_ENGINE].url;

function engineOf(id) {
  return ENGINES[id] || ENGINES[DEFAULT_ENGINE];
}

// Schemes we load directly when the user types them.
const DIRECT_SCHEMES = ['http:', 'https:', 'file:', 'opal:', 'about:', 'view-source:', 'data:'];

function searchUrl(text, engine = DEFAULT_ENGINE) {
  return engineOf(engine).url + encodeURIComponent(text);
}

function isIPv4(host) {
  const parts = host.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

// A host is "URL-like" if it is localhost, an IPv4 address, a bracketed IPv6
// address, or a dotted name whose last label looks like a TLD.
function looksLikeHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (isIPv4(h)) return true;
  if (/^\[[0-9a-f:.]+\]$/.test(h)) return true;
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes('.')) return false;
  if (h.startsWith('.') || h.endsWith('.') || h.includes('..')) return false;
  const tld = h.split('.').pop();
  return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]+$/.test(tld);
}

// Turns address bar input into a URL to load. Returns null for empty input.
// engine: 'google' | 'duckduckgo' | 'bing' | 'brave'.
function parseInput(raw, engine = DEFAULT_ENGINE) {
  let text = String(raw || '').trim();
  if (!text) return null;
  const search = (t) => searchUrl(t, engine);

  // DuckDuckGo bangs (!w, !yt ...) only mean something on DuckDuckGo; elsewhere
  // a leading "!" is just part of the search.
  if (text.startsWith('!')) {
    if (engine !== 'duckduckgo') text = text.replace(/^!+/, '').trim() || text;
    return search(text);
  }
  if (/\s/.test(text)) return search(text);

  const lower = text.toLowerCase();
  // chrome://settings and friends map to Opal's own pages.
  if (lower.startsWith('chrome://')) return 'opal://' + text.slice('chrome://'.length);
  if (lower === 'about:blank') return 'about:blank';

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text);
  if (scheme && DIRECT_SCHEMES.includes(scheme[1].toLowerCase() + ':')) {
    // "localhost:3000" also matches the scheme regex; only treat it as a scheme
    // when it's one we know.
    if (lower.startsWith('about:') && lower !== 'about:blank') return 'opal://' + text.slice(6);
    return text;
  }

  // Bare host[:port][/path][?query][#hash]
  const m = /^([^/?#:]+|\[[^\]]+\])(:\d{1,5})?([/?#].*)?$/.exec(text);
  if (m && looksLikeHost(m[1])) {
    const local = m[1] === 'localhost' || m[1].endsWith('.localhost') || isIPv4(m[1]) || m[1].startsWith('[');
    return (local ? 'http://' : 'https://') + text;
  }
  return search(text);
}

// What the address bar shows for a URL (the new tab page shows nothing).
function displayUrl(url) {
  if (!url || url === 'opal://newtab' || url === 'opal://newtab/') return '';
  return url;
}

// The security state shown by the lock icon.
function securityState(url) {
  if (!url) return 'none';
  if (url.startsWith('https:')) return 'secure';
  if (url.startsWith('opal:') || url.startsWith('file:') || url.startsWith('about:')) return 'internal';
  if (url.startsWith('http:')) {
    try {
      const h = new URL(url).hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return 'local';
    } catch { /* fall through */ }
    return 'insecure';
  }
  return 'none';
}

// If the URL is a search on one of the known engines, return the query text.
function searchQueryOf(url) {
  try {
    const u = new URL(url);
    for (const e of Object.values(ENGINES)) {
      if (u.hostname === e.host && u.pathname === e.path && u.searchParams.has(e.param)) return u.searchParams.get(e.param);
    }
  } catch { /* not a URL */ }
  return null;
}

module.exports = { parseInput, displayUrl, securityState, searchUrl, searchQueryOf, looksLikeHost, engineOf, ENGINES, DEFAULT_ENGINE, SEARCH_URL };
