'use strict';
// Serves Opal's own pages on opal://<page>/ from src/pages, with a strict CSP.
//   opal://history/          -> src/pages/history.html
//   opal://history/x.js      -> src/pages/x.js
//   opal://<any>/fonts/F     -> assets/fonts/F
const path = require('path');
const fs = require('fs');

const PAGES_DIR = path.join(__dirname, '../pages');
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');
const ICONS_DIR = path.join(__dirname, '../../build/icons');
const VENDOR = {
  'readability.js': path.join(__dirname, '../../node_modules/@mozilla/readability/Readability.js'),
  'icons.js': path.join(__dirname, '../renderer/icons.js'),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

// Maps an opal:// URL to a file on disk, or null. Never escapes the allowed folders.
function resolveOpalUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname;
  if (!/^[a-z0-9-]+$/.test(host)) return null;
  const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if (parts.some((p) => p === '..' || p.startsWith('.'))) return null;
  if (!parts.length) {
    const file = path.join(PAGES_DIR, host + '.html');
    return fs.existsSync(file) ? file : path.join(PAGES_DIR, 'notfound.html');
  }
  if (parts[0] === 'fonts' && parts.length === 2) return path.join(FONTS_DIR, parts[1]);
  if (parts[0] === 'icons' && parts.length === 2) return path.join(ICONS_DIR, parts[1]);
  if (parts.length === 1 && /^logo-(light|dark)\.png$/.test(parts[0])) {
    const logo = require('./icons').aboutLogo(parts[0].includes('dark') ? 'dark' : 'light');
    return logo ? logo.file : null;
  }
  if (parts.length === 1 && VENDOR[parts[0]]) return VENDOR[parts[0]];
  if (parts.length === 1) return path.join(PAGES_DIR, parts[0]);
  return null;
}

function registerOpalProtocol(ses) {
  if (ses.protocol.isProtocolHandled('opal')) return;
  ses.protocol.handle('opal', async (req) => {
    const file = resolveOpalUrl(req.url);
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        headers: {
          'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
          'content-security-policy': CSP,
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

module.exports = { registerOpalProtocol, resolveOpalUrl };
